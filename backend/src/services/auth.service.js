const bcrypt = require('bcryptjs'); // dùng để mã hoá mật khẩu (và cả mã xác nhận), không lưu dạng chữ thường vào database
const crypto = require('crypto'); // có sẵn trong Node, dùng để sinh mã 6 số NGẪU NHIÊN an toàn (và chuỗi ngẫu nhiên cho tài khoản Google)
const jwt = require('jsonwebtoken'); // dùng để tạo token đăng nhập (JWT)
const { OAuth2Client } = require('google-auth-library'); // MỚI THÊM: thư viện chính thức của Google để kiểm tra "credential" Frontend gửi lên có thật hay không
const userRepository = require('../repositories/user.repository'); // lớp Repository, chỉ để truy vấn Prisma
const emailVerificationRepository = require('../repositories/emailVerification.repository'); // lưu mã xác nhận email
const { sendVerificationCode } = require('../utils/mail'); // gửi mail chứa mã
const AppError = require('../utils/AppError'); // class lỗi tuỳ chỉnh, ném ra khi có lỗi nghiệp vụ

// MỚI THÊM: tạo 1 đối tượng kiểm tra token Google dùng chung (Client ID sẽ truyền lúc kiểm tra để chắc đã đọc xong file .env)
const googleClient = new OAuth2Client();

// các hằng số của cơ chế xác nhận email (muốn đổi thời gian/số lần thì sửa ở đây)
const CODE_EXPIRE_MINUTES = 10; // mã hết hạn sau 10 phút
const RESEND_COOLDOWN_SECONDS = 60; // phải chờ 60 giây mới được gửi lại mã
const MAX_ATTEMPTS = 5; // nhập sai tối đa 5 lần, quá thì phải gửi lại mã mới

// tạo token đăng nhập + bỏ password khỏi user (dùng chung cho login, verifyEmail và googleLogin để không viết lặp)
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

// sinh mã 6 chữ số ngẫu nhiên, luôn đủ 6 ký tự (VD 000123 vẫn giữ số 0 ở đầu)
const generateCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

// MỚI THÊM: sinh 1 mật khẩu NGẪU NHIÊN rồi băm sẵn, dành cho tài khoản đăng nhập bằng Google
// (cột password trong database bắt buộc có giá trị; mật khẩu này không ai biết nên không thể dùng để đăng nhập thường)
const generateRandomPasswordHash = () =>
  bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

// kiểm tra còn đang trong thời gian chờ gửi lại không; còn thì ném lỗi 429 (gửi quá nhanh)
const assertCooldown = async (userId) => {
  const record = await emailVerificationRepository.findByUserId(userId);
  if (!record) return; // chưa từng gửi mã -> được gửi ngay
  const secondsPassed = (Date.now() - record.lastSentAt.getTime()) / 1000;
  const secondsLeft = Math.ceil(RESEND_COOLDOWN_SECONDS - secondsPassed);
  if (secondsLeft > 0) {
    throw new AppError(`Vui lòng đợi ${secondsLeft} giây để gửi lại mã`, 429);
  }
};

// tạo mã mới, lưu bản băm vào database rồi gửi mail cho user
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
// Đăng ký xong CHƯA được đăng nhập, phải nhập mã 6 số gửi qua mail
exports.register = async ({ email, password, fullName, role }) => {
  // Bước 1: kiểm tra email đã tồn tại trong hệ thống chưa
  const existingUser = await userRepository.findByEmail(email);

  // chỉ báo "đã được sử dụng" khi tài khoản đó ĐÃ xác nhận email
  if (existingUser && existingUser.emailVerified) {
    throw new AppError('Email này đã được sử dụng', 400); // 400 = lỗi do người dùng nhập sai
  }

  // Bước 2: mã hoá mật khẩu trước khi lưu (số 10 là độ phức tạp mã hoá, càng cao càng chậm nhưng càng an toàn)
  const hashedPassword = await bcrypt.hash(password, 10);
  // Kiểm tra lại 1 lần nữa cho chắc (dù Joi đã chặn ở Validator) — nếu không phải GIANG_VIEN thì luôn là SINH_VIEN
  const safeRole = role === 'GIANG_VIEN' ? 'GIANG_VIEN' : 'SINH_VIEN';

  let user;
  if (existingUser) {
    // email này đã đăng ký NHƯNG chưa xác nhận (VD đóng trang giữa chừng, hoặc mất mã)
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

  // gửi mã xác nhận về mail
  await issueAndSendCode(user);

  // không trả user và token nữa; chỉ báo cho Frontend biết cần chuyển sang màn hình nhập mã
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

  // mật khẩu đúng nhưng email chưa xác nhận -> chặn đăng nhập bằng 403
  // (kiểm tra SAU mật khẩu để người lạ không dò được email nào đang chờ xác nhận)
  // Frontend dựa vào mã 403 này để chuyển sang màn hình nhập mã
  if (!user.emailVerified) {
    throw new AppError('Email chưa được xác nhận. Hãy nhập mã xác nhận đã gửi về email của bạn', 403);
  }

  // Bước 3 + 4: tạo JWT token và bỏ password khỏi kết quả trả về (gom vào hàm dùng chung buildAuthResult)
  return buildAuthResult(user);
};

// Xác nhận email bằng mã 6 số; đúng thì đánh dấu đã xác nhận và đăng nhập luôn
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

// Gửi lại mã xác nhận mới
exports.resendCode = async ({ email }) => {
  const user = await userRepository.findByEmail(email);
  // Email không tồn tại hoặc đã xác nhận rồi -> làm như đã gửi (không báo lỗi) để không lộ thông tin
  if (!user || user.emailVerified) return;
  await issueAndSendCode(user); // có thể ném lỗi 429 (gửi quá nhanh) hoặc 502 (mail lỗi)
};

// MỚI THÊM: kiểm tra "credential" (ID token) do Google trả về cho Frontend, rồi lấy thông tin người dùng trong đó
const verifyGoogleCredential = async (credential) => {
  // nếu quên đặt GOOGLE_CLIENT_ID trong backend/.env thì báo lỗi rõ ràng thay vì lỗi khó hiểu
  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new AppError('Máy chủ chưa cấu hình đăng nhập Google', 500);
  }

  let payload;
  try {
    // audience: chỉ chấp nhận token được cấp cho ĐÚNG Client ID của ứng dụng này (chặn token từ app khác)
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload(); // thông tin trong token: email, name, picture, email_verified...
  } catch (err) {
    console.error('Xác thực Google thất bại:', err.message); // in ra terminal Backend để biết nguyên nhân thật
    throw new AppError('Phiên đăng nhập Google không hợp lệ hoặc đã hết hạn. Vui lòng thử lại', 401);
  }

  // chỉ tin email mà chính Google đã xác minh
  if (!payload || !payload.email || !payload.email_verified) {
    throw new AppError('Tài khoản Google này chưa xác minh email', 401);
  }
  return payload;
};

// MỚI THÊM: Đăng nhập bằng Google
// - Email đã có tài khoản -> đăng nhập luôn
// - Email chưa có tài khoản + chưa gửi role -> báo Frontend hiện bước chọn vai trò (chưa tạo gì)
// - Email chưa có tài khoản + đã gửi role -> tạo tài khoản mới rồi đăng nhập luôn
exports.googleLogin = async ({ credential, role }) => {
  const payload = await verifyGoogleCredential(credential);
  const email = payload.email;

  let user = await userRepository.findByEmail(email);

  // TRƯỜNG HỢP 1: email đã có trong hệ thống
  if (user) {
    // Tài khoản đăng ký thường nhưng chưa nhập mã xác nhận: Google đã xác minh email nên coi như đã xác nhận.
    // ĐỒNG THỜI đổi mật khẩu thành ngẫu nhiên, để người đã đăng ký trước (nếu là kẻ mạo danh) không còn dùng được mật khẩu cũ
    if (!user.emailVerified) {
      user = await userRepository.update(user.id, {
        emailVerified: true,
        password: await generateRandomPasswordHash(),
      });
      // xóa mã xác nhận còn dang dở (bỏ qua lỗi nếu không có bản ghi nào để xóa)
      await emailVerificationRepository.deleteByUserId(user.id).catch(() => {});
    }
    return buildAuthResult(user);
  }

  // TRƯỜNG HỢP 2: email mới, Frontend chưa cho người dùng chọn vai trò -> trả thông tin để hiện bước chọn
  if (!role) {
    return {
      needsRole: true,
      profile: { email, fullName: payload.name || email.split('@')[0] },
    };
  }

  // TRƯỜNG HỢP 3: email mới và đã có vai trò -> tạo tài khoản
  const safeRole = role === 'GIANG_VIEN' ? 'GIANG_VIEN' : 'SINH_VIEN'; // chỉ chấp nhận 2 giá trị, còn lại là Sinh viên
  user = await userRepository.create({
    email,
    password: await generateRandomPasswordHash(), // mật khẩu ngẫu nhiên, không ai đăng nhập bằng mật khẩu được
    fullName: (payload.name || email.split('@')[0]).slice(0, 100), // tên lấy từ Google, cắt tối đa 100 ký tự như quy định lúc đăng ký
    role: safeRole,
    emailVerified: true, // Google đã xác minh email nên không cần gửi mã nữa
  });
  return buildAuthResult(user);
};