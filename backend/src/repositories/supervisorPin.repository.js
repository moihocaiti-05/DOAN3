const prisma = require('../config/prisma');

// MỚI THÊM (GV6): đổi trạng thái ghim của 1 bản ghi GroupSupervisor theo ID riêng của nó
exports.updatePinned = (id, pinned) =>
  prisma.groupSupervisor.update({ where: { id }, data: { pinned } });