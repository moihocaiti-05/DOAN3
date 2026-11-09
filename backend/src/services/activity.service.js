const activityRepository = require('../repositories/activity.repository');
const groupRepository = require('../repositories/group.repository');
const AppError = require('../utils/AppError');
const { getIO } = require('../sockets/socketInstance'); // MỚI THÊM: lấy io dùng chung để báo "có hoạt động mới" realtime

// ===== MỚI THÊM: tính mốc thời gian theo GIỜ VIỆT NAM (UTC+7, Việt Nam không có giờ mùa hè) =====
// Database lưu giờ UTC, nên phải đổi "đầu ngày giờ Việt Nam" sang UTC để lọc đúng.
// VD: 23h30 ngày 06/11 giờ VN = 16h30 UTC ngày 06/11 -> vẫn thuộc "hôm nay" 06/11, không bị lệch sang ngày sau.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // lệch 7 tiếng so với UTC
const DAY_MS = 24 * 60 * 60 * 1000; // số mili-giây của 1 ngày

// Trả về thời điểm 00:00 giờ Việt Nam của ngày chứa mốc "ms" (kết quả là mili-giây UTC)
const startOfVnDay = (ms) => {
  const vn = new Date(ms + VN_OFFSET_MS); // dịch sang giờ VN rồi đọc năm/tháng/ngày bằng các hàm getUTC*
  return Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - VN_OFFSET_MS;
};

// Đổi mốc client gửi lên (range + date) thành khoảng { from, to } để lọc: from <= createdAt < to.
// Trả về null nghĩa là KHÔNG lọc theo thời gian ("Tất cả"). Tham số lạ thì báo lỗi 400 thay vì đoán bừa.
const resolveRange = (range, date) => {
  const key = typeof range === 'string' && range ? range : 'all';
  const startToday = startOfVnDay(Date.now()); // 00:00 hôm nay (giờ VN)

  switch (key) {
    case 'all':
      return null;
    case 'today': // từ 00:00 hôm nay đến hết hôm nay
      return { from: new Date(startToday), to: new Date(startToday + DAY_MS) };
    case 'yesterday': // cả ngày hôm qua
      return { from: new Date(startToday - DAY_MS), to: new Date(startToday) };
    case '7days': // 7 ngày gần nhất TÍNH CẢ hôm nay (hôm nay và 6 ngày trước đó)
      return { from: new Date(startToday - 6 * DAY_MS), to: new Date(startToday + DAY_MS) };
    case 'date': {
      // Ngày cụ thể: client gửi dạng "2026-10-01" (năm-tháng-ngày, theo lịch giờ VN)
      const match = typeof date === 'string' ? date.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
      if (!match) throw new AppError('Vui lòng chọn một ngày hợp lệ (năm-tháng-ngày)', 400);
      const y = Number(match[1]);
      const m = Number(match[2]);
      const d = Number(match[3]);
      // Chặn ngày không tồn tại như 2026-02-30 (JavaScript sẽ tự nhảy sang tháng sau nên phải kiểm tra lại)
      const check = new Date(Date.UTC(y, m - 1, d));
      if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
        throw new AppError('Ngày không tồn tại', 400);
      }
      const from = Date.UTC(y, m - 1, d) - VN_OFFSET_MS; // 00:00 ngày đó theo giờ VN
      return { from: new Date(from), to: new Date(from + DAY_MS) };
    }
    default:
      throw new AppError('Mốc thời gian không hợp lệ', 400);
  }
};

// Kiểm tra quyền XEM nhóm (thành viên hoặc Giảng viên đã đồng ý) - cùng logic với các service khác
const ensureCanViewGroup = async (userId, groupId) => {
  if (!userId) throw new AppError('Thiếu thông tin người dùng', 401);
  if (!groupId) throw new AppError('Thiếu mã nhóm', 400);

  const supervisorship = await groupRepository.findSupervisorship(userId, groupId);
  if (supervisorship) return;

  const membership = await groupRepository.findMembership(userId, groupId);
  if (membership) return;

  throw new AppError('Bạn không có quyền xem dữ liệu của nhóm này', 403);
};

// Ghi 1 dòng lịch sử. AN TOÀN: nếu ghi lỗi chỉ in ra console, KHÔNG làm hỏng thao tác chính của người dùng
// (giống cách notifySafely). summary là câu mô tả KHÔNG gồm tên người làm, VD: 'đã tạo công việc "Viết báo cáo"'
exports.log = async ({ groupId, actorId, type, targetType, targetId = null, summary }) => {
  try {
    if (!groupId || !actorId) return; // thiếu thông tin thì bỏ qua, không ném lỗi
    const created = await activityRepository.create({ groupId, actorId, type, targetType, targetId, summary });

    // MỚI THÊM: báo realtime cho mọi người đang mở trang nhóm này (phòng "groupId" - chỉ thành viên / Giảng viên
    // đã đồng ý mới vào được phòng, xem chatHandler.js). Chỉ gửi vài thông tin nhỏ, Frontend tự tải lại danh sách khi cần.
    // Nằm trong try nên nếu phát lỗi cũng không làm hỏng thao tác chính
    const io = getIO();
    if (io) {
      io.to(groupId).emit('activity_new', {
        groupId,
        actorId,
        id: created.id,
        type,
        createdAt: created.createdAt,
      });
    }
  } catch (error) {
    console.error('Không ghi được lịch sử hoạt động:', error.message);
  }
};

// Lấy 1 trang lịch sử của nhóm (mới nhất trước) - có kiểm tra quyền xem
// MỚI SỬA: nhận thêm range ('today' | 'yesterday' | '7days' | 'date' | 'all') và date ("năm-tháng-ngày", chỉ dùng khi range = 'date')
exports.getGroupActivities = async (groupId, actorId, page, limit, range, date) => {
  await ensureCanViewGroup(actorId, groupId);

  // MỚI THÊM: đổi mốc thời gian thành khoảng from/to (null = không lọc). Sai tham số thì báo lỗi 400 ngay tại đây
  const timeRange = resolveRange(range, date);

  // Làm sạch tham số phân trang do client gửi lên: trang >= 1, mỗi trang 1..50 dòng (mặc định 20)
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));

  // Danh sách và tổng số đều lọc theo CÙNG khoảng thời gian, nên "Xem thêm" và tổng số luôn khớp với mốc đang chọn
  const [items, total] = await Promise.all([
    activityRepository.findByGroup(groupId, (safePage - 1) * safeLimit, safeLimit, timeRange),
    activityRepository.countByGroup(groupId, timeRange),
  ]);

  return { items, total, page: safePage, limit: safeLimit, hasMore: safePage * safeLimit < total };
};