const prisma = require('../config/prisma');

// Lưu thông tin 1 file đính kèm vào database, kèm luôn thông tin người upload trong kết quả trả về
// (giống hệt cấu trúc dữ liệu mà findByTask trả về, để Frontend không bị thiếu field khi hiển thị ngay)
exports.create = (data) =>
  prisma.attachment.create({
    data,
    include: {
      uploader: { select: { id: true, fullName: true } },
    },
  });

exports.findByTask = (taskId) =>
  prisma.attachment.findMany({
    where: { taskId },
    orderBy: { createdAt: 'desc' },
    include: {
      uploader: { select: { id: true, fullName: true } },
    },
  });

exports.findById = (id) => prisma.attachment.findUnique({ where: { id } });

exports.remove = (id) => prisma.attachment.delete({ where: { id } });