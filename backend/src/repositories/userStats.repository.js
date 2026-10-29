const prisma = require('../config/prisma'); // PrismaClient đã có adapter (giống các repository khác)

// Số nhóm mà user đang là THÀNH VIÊN ĐÃ ĐỒNG Ý (Sinh viên / Trưởng nhóm)
exports.countMemberGroups = (userId) =>
  prisma.groupMember.count({ where: { userId, status: 'ACCEPTED' } });

// Số nhóm mà user đang là GIẢNG VIÊN HƯỚNG DẪN đã đồng ý (bảng GroupSupervisor, tách riêng khỏi GroupMember)
exports.countSupervisedGroups = (userId) =>
  prisma.groupSupervisor.count({ where: { userId, status: 'ACCEPTED' } });

// Số việc được giao cho user mà đã ở trạng thái "done" (tính cả việc con vì không lọc theo parentTaskId)
exports.countCompletedTasks = (userId) =>
  prisma.task.count({ where: { assignedTo: userId, status: 'done' } });

// Số bình luận / nhận xét mà user đã viết (Giảng viên dùng để biết mình đã nhận xét bao nhiêu lần)
exports.countComments = (userId) =>
  prisma.comment.count({ where: { authorId: userId } });