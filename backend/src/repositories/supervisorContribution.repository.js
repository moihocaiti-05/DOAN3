const prisma = require('../config/prisma');

// MỚI THÊM (tính năng 3 - Bảng đóng góp): tên nhóm
exports.findGroupName = (groupId) =>
  prisma.group.findUnique({ where: { id: groupId }, select: { id: true, name: true } });

// MỚI THÊM (tính năng 3): các thành viên ĐÃ THAM GIA nhóm, kèm vai trò (leader/member) và tên
exports.findAcceptedMembers = (groupId) =>
  prisma.groupMember.findMany({
    where: { groupId, status: 'ACCEPTED' },
    select: {
      userId: true,
      role: true,
      user: { select: { fullName: true } },
    },
  });

// MỚI THÊM (tính năng 3): MỌI task của nhóm (gồm cả việc con), chỉ lấy 3 cột cần để đếm: ai làm, trạng thái, hạn chót
exports.findTasksForContribution = (groupId) =>
  prisma.task.findMany({
    where: { groupId },
    select: { assignedTo: true, status: true, deadline: true },
  });