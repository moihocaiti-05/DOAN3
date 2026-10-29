const prisma = require('../config/prisma');

// Repository chỉ chứa query Prisma thuần

// Lấy toàn bộ "ngân hàng nhãn" của 1 nhóm - dùng để hiển thị gợi ý (autocomplete) khi tạo task
exports.findByGroup = (groupId) =>
  prisma.tag.findMany({
    where: { groupId },
    orderBy: { name: 'asc' },
  });