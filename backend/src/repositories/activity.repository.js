const prisma = require('../config/prisma');

// Chỉ lấy vài thông tin cần thiết của người thực hiện (không lấy email, mật khẩu...)
const actorInclude = { actor: { select: { id: true, fullName: true, avatar: true } } };

// MỚI THÊM: dựng điều kiện lọc của Prisma từ nhóm + khoảng thời gian.
// range = { from: Date, to: Date } nghĩa là lấy các dòng có from <= createdAt < to; range = null thì không lọc theo thời gian
const buildWhere = (groupId, range) => {
  const where = { groupId };
  if (range && (range.from || range.to)) {
    where.createdAt = {};
    if (range.from) where.createdAt.gte = range.from; // gte: lớn hơn hoặc bằng
    if (range.to) where.createdAt.lt = range.to; // lt: nhỏ hơn (không lấy đúng mốc kết thúc)
  }
  return where;
};

// Ghi 1 dòng lịch sử hoạt động
exports.create = (data) => prisma.activityLog.create({ data });

// Lấy 1 trang lịch sử của nhóm, MỚI NHẤT trước - skip/take dùng để phân trang
// MỚI SỬA: nhận thêm range (không bắt buộc) để lọc theo thời gian ngay trong database
exports.findByGroup = (groupId, skip, take, range = null) =>
  prisma.activityLog.findMany({
    where: buildWhere(groupId, range),
    orderBy: { createdAt: 'desc' },
    skip,
    take,
    include: actorInclude,
  });

// Đếm tổng số dòng lịch sử của nhóm - để biết còn trang tiếp theo hay không
// MỚI SỬA: đếm theo cùng khoảng thời gian với danh sách, nên tổng số và nút "Xem thêm" luôn khớp mốc đang chọn
exports.countByGroup = (groupId, range = null) =>
  prisma.activityLog.count({ where: buildWhere(groupId, range) });

// Lấy lịch sử để đưa vào báo cáo Excel - giới hạn số dòng để file không quá nặng (giữ nguyên, không lọc thời gian)
exports.findRecentByGroup = (groupId, limit = 2000) =>
  prisma.activityLog.findMany({
    where: { groupId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: actorInclude,
  });