const prisma = require('../config/prisma');

// Điều kiện "nhóm mà Giảng viên này ĐÃ ĐỒNG Ý phụ trách": dùng chung cho cả 3 truy vấn bên dưới
const supervisedBy = (userId) => ({ supervisors: { some: { userId, status: 'ACCEPTED' } } });

// MỚI THÊM (tính năng 5 - Sắp đến hạn): các việc CHƯA xong, có hạn chót sớm hơn mốc "limit" (gồm cả việc đã quá hạn từ trước)
// Gồm cả việc con (số liệu toàn app đều đếm cả việc con)
exports.findOpenTasksDueBefore = (userId, limit) =>
  prisma.task.findMany({
    where: {
      status: { not: 'done' },
      deadline: { not: null, lt: limit },
      group: supervisedBy(userId),
    },
    select: {
      id: true,
      title: true,
      status: true,
      deadline: true,
      groupId: true,
      group: { select: { name: true } },
      assignee: { select: { fullName: true } },
      parentTask: { select: { title: true } },
      milestone: { select: { title: true } },
    },
  });

// MỚI THÊM (tính năng 5): MỌI mốc của các nhóm Giảng viên phụ trách (cần cả mốc không có hạn để dựng cây mốc cha/mốc con)
exports.findMilestones = (userId) =>
  prisma.milestone.findMany({
    where: { group: supervisedBy(userId) },
    select: {
      id: true,
      title: true,
      dueDate: true,
      parentId: true,
      groupId: true,
      group: { select: { name: true } },
    },
  });

// MỚI THÊM (tính năng 5): trạng thái của mọi task đã gắn vào 1 mốc nào đó, để tính mốc đã xong hay chưa
exports.findMilestoneTaskStatuses = (userId) =>
  prisma.task.findMany({
    where: { milestoneId: { not: null }, group: supervisedBy(userId) },
    select: { milestoneId: true, status: true },
  });