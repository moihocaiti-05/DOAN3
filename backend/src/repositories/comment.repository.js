const prisma = require('../config/prisma');

// Tạo 1 comment mới - data sẽ chứa content, authorId, và MỘT TRONG HAI: taskId hoặc milestoneId
// MỚI SỬA: thêm include author để comment vừa tạo trả về luôn tên người viết
// (dùng cho nhận xét mốc - cần tên Giảng viên để soạn nội dung thông báo; luồng comment Task không bị ảnh hưởng)
exports.create = (data) =>
  prisma.comment.create({
    data,
    include: {
      author: { select: { id: true, fullName: true, avatar: true } },
    },
  });

// Lấy tất cả comment của 1 task cụ thể, kèm tên người viết, cũ -> mới
exports.findByTask = (taskId) =>
  prisma.comment.findMany({
    where: { taskId },
    orderBy: { createdAt: 'asc' },
    include: {
      author: { select: { id: true, fullName: true, avatar: true } },
    },
  });

// MỚI THÊM (dùng sau cho Giảng viên): Lấy tất cả comment của 1 milestone cụ thể
exports.findByMilestone = (milestoneId) =>
  prisma.comment.findMany({
    where: { milestoneId },
    orderBy: { createdAt: 'asc' },
    include: {
      author: { select: { id: true, fullName: true, avatar: true } },
    },
  });

exports.findById = (id) => prisma.comment.findUnique({ where: { id } });

exports.remove = (id) => prisma.comment.delete({ where: { id } });