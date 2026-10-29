const prisma = require('../config/prisma');

// MỚI THÊM (tính năng 4 - Xuất Excel): lấy MỌI task (gồm cả việc con) của nhiều nhóm cùng lúc, kèm các cột cần cho sheet chi tiết
exports.findTasksDetail = (groupIds) =>
  prisma.task.findMany({
    where: { groupId: { in: groupIds } },
    select: {
      id: true,
      groupId: true,
      title: true,
      status: true,
      priority: true,
      deadline: true,
      completedAt: true,
      reopenCount: true,
      createdAt: true,
      parentTaskId: true,
      parentTask: { select: { title: true } },
      milestone: { select: { title: true } },
      assignee: { select: { fullName: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

// MỚI THÊM (tính năng 4): lấy tên Giảng viên để ghi vào dòng đầu của file ("Giảng viên: ...")
exports.findUserName = (userId) =>
  prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });