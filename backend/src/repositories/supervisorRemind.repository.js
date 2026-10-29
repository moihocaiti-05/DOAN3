const prisma = require('../config/prisma');

// MỚI THÊM (tính năng 2 - Nhắc nhóm): lấy tên nhóm (để ghi vào nội dung thông báo)
exports.findGroupName = (groupId) =>
  prisma.group.findUnique({ where: { id: groupId }, select: { id: true, name: true } });

// MỚI THÊM (tính năng 2): lấy mã người dùng của các thành viên ĐÃ THAM GIA nhóm (bỏ qua người còn đang chờ đồng ý lời mời)
exports.findAcceptedMemberIds = (groupId) =>
  prisma.groupMember.findMany({
    where: { groupId, status: 'ACCEPTED' },
    select: { userId: true },
  });

// MỚI THÊM (tính năng 2): lấy tên Giảng viên để ghi "Giảng viên X nhắc nhóm ..." vào thông báo
exports.findUserName = (userId) =>
  prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });