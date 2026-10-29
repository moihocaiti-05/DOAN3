const prisma = require('../config/prisma');

// Chỉ lấy vài thông tin cần thiết của người thực hiện (không lấy email, mật khẩu...)
const actorInclude = { actor: { select: { id: true, fullName: true, avatar: true } } };

// Ghi 1 dòng lịch sử hoạt động
exports.create = (data) => prisma.activityLog.create({ data });

// Lấy 1 trang lịch sử của nhóm, MỚI NHẤT trước - skip/take dùng để phân trang
exports.findByGroup = (groupId, skip, take) =>
  prisma.activityLog.findMany({
    where: { groupId },
    orderBy: { createdAt: 'desc' },
    skip,
    take,
    include: actorInclude,
  });

// Đếm tổng số dòng lịch sử của nhóm - để biết còn trang tiếp theo hay không
exports.countByGroup = (groupId) => prisma.activityLog.count({ where: { groupId } });

// Lấy lịch sử để đưa vào báo cáo Excel - giới hạn số dòng để file không quá nặng
exports.findRecentByGroup = (groupId, limit = 2000) =>
  prisma.activityLog.findMany({
    where: { groupId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: actorInclude,
  });