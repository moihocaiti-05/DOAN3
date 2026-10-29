const prisma = require('../config/prisma');

// Các trường thông tin người dùng cần trả về cho Frontend (không bao giờ trả password)
const userSelect = { id: true, fullName: true, avatar: true, role: true };

// Phần "include" dùng chung: kèm danh sách thành viên của phòng (và thông tin từng người)
const withMembers = {
  members: { include: { user: { select: userSelect } } },
};

// Lấy tất cả những người có thể chat trong 1 nhóm đồ án: thành viên đã tham gia + Giảng viên đã đồng ý
// Chỉ lấy ACCEPTED - người còn PENDING (chưa bấm Đồng ý) chưa thực sự thuộc nhóm nên không được chọn
exports.findGroupPeople = async (groupId) => {
  const [members, supervisors] = await Promise.all([
    prisma.groupMember.findMany({
      where: { groupId, status: 'ACCEPTED' },
      include: { user: { select: userSelect } },
    }),
    prisma.groupSupervisor.findMany({
      where: { groupId, status: 'ACCEPTED' },
      include: { user: { select: userSelect } },
    }),
  ]);

  // Gộp 2 danh sách và loại trùng (phòng khi 1 tài khoản vừa là thành viên vừa là Giảng viên của nhóm)
  const byId = new Map();
  [...members, ...supervisors].forEach((row) => byId.set(row.user.id, row.user));
  return [...byId.values()];
};

// Lấy các nhóm chat con của 1 nhóm đồ án mà user này đang là thành viên (mới nhất lên đầu)
exports.findGroupChats = (groupId, userId) =>
  prisma.conversation.findMany({
    where: { type: 'GROUP_CHAT', groupId, members: { some: { userId } } },
    orderBy: { createdAt: 'desc' },
    include: withMembers,
  });

// Tạo 1 nhóm chat con kèm danh sách thành viên trong cùng 1 lần ghi
exports.createGroupChat = ({ name, groupId, createdBy, memberIds }) =>
  prisma.conversation.create({
    data: {
      type: 'GROUP_CHAT',
      name,
      groupId,
      createdBy,
      members: { create: memberIds.map((userId) => ({ userId })) },
    },
    include: withMembers,
  });

// Tìm phòng chat riêng theo "privateKey" (id 2 người ghép lại theo thứ tự) - mỗi cặp chỉ có đúng 1 phòng
exports.findPrivateByKey = (privateKey) =>
  prisma.conversation.findUnique({ where: { privateKey }, include: withMembers });

// Tạo phòng chat riêng giữa 2 người
exports.createPrivate = ({ privateKey, createdBy, userIds }) =>
  prisma.conversation.create({
    data: {
      type: 'PRIVATE',
      privateKey,
      createdBy,
      members: { create: userIds.map((userId) => ({ userId })) },
    },
    include: withMembers,
  });

// Tìm 1 phòng chat theo ID, kèm danh sách thành viên (để kiểm tra quyền và để biết gửi realtime cho ai)
exports.findById = (id) =>
  prisma.conversation.findUnique({ where: { id }, include: withMembers });

// Lịch sử tin nhắn của 1 phòng chat, cũ -> mới (cùng dạng dữ liệu với message.repository.findByGroup)
exports.findMessages = (conversationId) =>
  prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    include: {
      sender: { select: { id: true, fullName: true, avatar: true } },
    },
  });