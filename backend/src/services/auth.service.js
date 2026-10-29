const bcrypt = require('bcryptjs'); // dùng để mã hoá mật khẩu (và cả mã xác nhận), không lưu dạng chữ thường vào database
const crypto = require('crypto'); // MỚI THÊM: có sẵn trong Node, dùng để sinh mã 6 số NGẪU NHIÊN an toàn
const jwt = require('jsonwebtoken'); // dùng để tạo token đăng nhập (JWT)
const userRepository = require('../repositories/user.repository'); // lớp Repository, chỉ để truy vấn Prisma
const emailVerificationRepository = require('../repositories/emailVerification.repository'); // MỚI THÊM: lưu mã xác nhận email
const { sendVerificationCode } = require('../utils/mail'); // MỚI THÊM: gửi mail chứa mã
const AppError = require('../utils/AppError'); // class lỗi tuỳ chỉnh, ném ra khi có lỗi nghiệp vụ

// MỚI THÊM: các hằng số của cơ chế xác nhận email (muốn đổi thời gian/số lần thì sửa ở đây)
const CODE_EXPIRE_MINUTES = 10; // mã hết hạn sau 10 phút
const RESEND_COOLDOWN_SECONDS = 60; // phải chờ 60 giây mới được gửi lại mã
const MAX_ATTEMPTS = 5; // nhập sai tối đa 5 lần, quá thì phải gửi lại mã mới

// MỚI THÊM: tạo token đăng nhập + bỏ password khỏi user (dùng chung cho login và verifyEmail để không viết lặp)
const buildAuthResult = (user) => {
  // tạo JWT token, chứa id và email của user, hết hạn sau 7 ngày (giữ nguyên như cũ)
  const token = jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET, // khoá bí mật lấy từ file .env, không hard-code trong code
    { expiresIn: '7d' }
  );
  // KHÔNG được trả password (dù đã mã hoá) ra ngoài cho Frontend
  const { password: _, ...userWithoutPassword } = user;
  return { user: userWithoutPassword, token };
};

// MỚI THÊM: sinh mã 6 chữ số ngẫu nhiên, luôn đủ 6 ký tự (VD 000123 vẫn giữ số 0 ở đầu)
const generateCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

// MỚI THÊM: kiểm tra còn đang trong thời gian chờ gửi lại không; còn thì ném lỗi 429 (gửi quá nhanh)
const assertCooldown = async (userId) => {
  const record = await emailVerificationRepository.findByUserId(userId);
  if (!record) return; // chưa từng gửi mã -> được gửi ngay
  const secondsPassed = (Date.now() - record.lastSentAt.getTime()) / 1000;
  const secondsLeft = Math.ceil(RESEND_COOLDOWN_SECONDS - secondsPassed);
  if (secondsLeft > 0) {
    throw new AppError(`Vui lòng đợi ${secondsLeft} giây để gửi lại mã`, 429);
  }
};

// MỚI THÊM: tạo mã mới, lưu bản băm vào database rồi gửi mail cho user
// Dùng chung cho đăng ký, đăng ký lại và gửi lại mã
const issueAndSendCode = async (user) => {
  await assertCooldown(user.id); // chặn bấm liên tục (nếu gọi từ register đã kiểm tra trước thì kiểm tra lại cũng không sao)

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 8); // băm mã trước khi lưu (số 8 nhẹ hơn mật khẩu vì mã chỉ sống 10 phút)
  const now = new Date();

  // Lưu TRƯỚC khi gửi mail, để lỡ mail đến nhanh hơn thì mã đã sẵn trong database
  await emailVerificationRepository.upsert(user.id, {
    codeHash,
    expiresAt: new Date(now.getTime() + CODE_EXPIRE_MINUTES * 60 * 1000),
    lastSentAt: now,
  });

  try {
    await sendVerificationCode({
      to: user.email,
      fullName: user.fullName,
      code,
      expireMinutes: CODE_EXPIRE_MINUTES,
    });
  } catch (err) {
    console.error('Gửi email xác nhận thất bại:', err.message); // in ra terminal Backend để biết nguyên nhân thật
    // Gửi lỗi thì xóa mã vừa lưu: không bắt người dùng phải chờ 60 giây cho một mail chưa hề được gửi
    await emailVerificationRepository.deleteByUserId(user.id);
    throw new AppError('Không gửi được email xác nhận. Vui lòng kiểm tra lại địa chỉ email hoặc thử lại sau', 502);
  }
};

// Hàm xử lý logic Đăng ký tài khoản mới
// MỚI SỬA: đăng ký xong CHƯA được đăng nhập, phải nhập mã 6 số gửi qua mail
exports.register = async ({ email, password, fullName, role }) => {
  // Bước 1: kiểm tra email đã tồn tại trong hệ thống chưa
  const existingUser = await userRepository.findByEmail(email);

  // MỚI SỬA: chỉ báo "đã được sử dụng" khi tài khoản đó ĐÃ xác nhận email
  if (existingUser && existingUser.emailVerified) {
    throw new AppError('Email này đã được sử dụng', 400); // 400 = lỗi do người dùng nhập sai
  }

  // Bước 2: mã hoá mật khẩu trước khi lưu (số 10 là độ phức tạp mã hoá, càng cao càng chậm nhưng càng an toàn)
  const hashedPassword = await bcrypt.hash(password, 10);
  // Kiểm tra lại 1 lần nữa cho chắc (dù Joi đã chặn ở Validator) — nếu không phải GIANG_VIEN thì luôn là SINH_VIEN
  const safeRole = role === 'GIANG_VIEN' ? 'GIANG_VIEN' : 'SINH_VIEN';

  let user;
  if (existingUser) {
    // MỚI THÊM: email này đã đăng ký NHƯNG chưa xác nhận (VD đóng trang giữa chừng, hoặc mất mã)
    // -> cho đăng ký lại: cập nhật thông tin mới rồi gửi mã mới. An toàn vì ai kiểm soát được hộp thư thì mới nhập đúng mã
    await assertCooldown(existingUser.id); // kiểm tra TRƯỚC khi sửa dữ liệu, tránh sửa xong mới báo "đợi"
    user = await userRepository.update(existingUser.id, {
      password: hashedPassword,
      fullName,
      role: safeRole,
    });
  } else {
    // Bước 3: tạo user mới trong database qua Repository (emailVerified tự là false theo schema)
    user = await userRepository.create({
      email,
      password: hashedPassword,
      fullName,
      // lưu vai trò tài khoản
      role: safeRole,
    });
  }

  // MỚI THÊM: gửi mã xác nhận về mail
  await issueAndSendCode(user);

  // MỚI SỬA: không trả user và token nữa; chỉ báo cho Frontend biết cần chuyển sang màn hình nhập mã
  return { email: user.email, requiresVerification: true };
};

// Hàm xử lý logic Đăng nhập
exports.login = async ({ email, password }) => {
  // Bước 1: tìm user theo email
  const user = await userRepository.findByEmail(email);
  if (!user) {
    // Cố tình báo lỗi chung chung "Email hoặc mật khẩu không đúng" (không nói rõ email không tồn tại)
    // để tránh kẻ xấu dò email nào đã đăng ký trong hệ thống
    throw new AppError('Email hoặc mật khẩu không đúng', 401);
  }

  // Bước 2: so sánh mật khẩu người dùng nhập với mật khẩu đã mã hoá trong database
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new AppError('Email hoặc mật khẩu không đúng', 401);
  }

  // MỚI THÊM: mật khẩu đúng nhưng email chưa xác nhận -> chặn đăng nhập bằng 403
  // (kiểm tra SAU mật khẩu để người lạ không dò được email nào đang chờ xác nhận)
  // Frontend dựa vào mã 403 này để chuyển sang màn hình nhập mã
  if (!user.emailVerified) {
    throw new AppError('Email chưa được xác nhận. Hãy nhập mã xác nhận đã gửi về email của bạn', 403);
  }

  // Bước 3 + 4: tạo JWT token và bỏ password khỏi kết quả trả về (MỚI SỬA: gom vào hàm dùng chung buildAuthResult)
  return buildAuthResult(user);
};

// MỚI THÊM: Xác nhận email bằng mã 6 số; đúng thì đánh dấu đã xác nhận và đăng nhập luôn
exports.verifyEmail = async ({ email, code }) => {
  const user = await userRepository.findByEmail(email);
  // Báo lỗi chung chung cho cả trường hợp email không tồn tại, để không lộ email nào đã đăng ký
  const genericError = new AppError('Mã không đúng hoặc đã hết hạn. Hãy bấm "Gửi lại mã"', 400);
  if (!user) throw genericError;

  if (user.emailVerified) {
    throw new AppError('Email này đã được xác nhận, bạn có thể đăng nhập', 400);
  }

  const record = await emailVerificationRepository.findByUserId(user.id);
  if (!record) throw genericError; // chưa có mã nào (hoặc mã đã bị xóa)

  // Nhập sai quá số lần cho phép -> khóa mã này, buộc gửi mã mới (chống dò mã 000000-999999)
  if (record.attempts >= MAX_ATTEMPTS) {
    throw new AppError('Bạn đã nhập sai quá nhiều lần. Hãy bấm "Gửi lại mã" để nhận mã mới', 429);
  }

  if (record.expiresAt.getTime() < Date.now()) {
    throw new AppError('Mã đã hết hạn. Hãy bấm "Gửi lại mã" để nhận mã mới', 400);
  }

  const isMatch = await bcrypt.compare(code, record.codeHash);
  if (!isMatch) {
    const updated = await emailVerificationRepository.incrementAttempts(user.id);
    const left = Math.max(MAX_ATTEMPTS - updated.attempts, 0);
    throw new AppError(
      left > 0
        ? `Mã không đúng. Bạn còn ${left} lần thử`
        : 'Bạn đã nhập sai quá nhiều lần. Hãy bấm "Gửi lại mã" để nhận mã mới',
      400
    );
  }

  // Mã đúng: đánh dấu đã xác nhận, xóa mã (dùng 1 lần), rồi trả token để đăng nhập luôn
  const verifiedUser = await userRepository.update(user.id, { emailVerified: true });
  await emailVerificationRepository.deleteByUserId(user.id);
  return buildAuthResult(verifiedUser);
};

// MỚI THÊM: Gửi lại mã xác nhận mới
exports.resendCode = async ({ email }) => {
  const user = await userRepository.findByEmail(email);
  // Email không tồn tại hoặc đã xác nhận rồi -> làm như đã gửi (không báo lỗi) để không lộ thông tin
  if (!user || user.emailVerified) return;
  await issueAndSendCode(user); // có thể ném lỗi 429 (gửi quá nhanh) hoặc 502 (mail lỗi)
};