const conversationRepository = require('../repositories/conversation.repository');
const messageRepository = require('../repositories/message.repository');
const { assertCanChat } = require('./message.service'); // dùng lại hàm kiểm tra "được chat trong nhóm" đã có
const friendshipService = require('./friendship.service'); // MỚI THÊM: để kiểm tra 2 người có phải bạn bè không
const AppError = require('../utils/AppError');
const { decodeFileName } = require('../utils/decodeFileName');

// Kiểm tra user có phải thành viên của phòng chat không - trả về phòng chat (kèm thành viên) nếu hợp lệ
const assertConversationMember = async (conversationId, userId) => {
  const conversation = await conversationRepository.findById(conversationId);
  if (!conversation) {
    throw new AppError('Phòng chat không tồn tại', 404);
  }
  const isMember = conversation.members.some((m) => m.userId === userId);
  if (!isMember) {
    throw new AppError('Bạn không thuộc phòng chat này', 403);
  }
  return conversation;
};

// Danh sách những người user có thể nhắn riêng / thêm vào nhóm chat con trong 1 nhóm đồ án (trừ chính mình)
exports.getPeople = async (groupId, userId) => {
  await assertCanChat(userId, groupId);
  const people = await conversationRepository.findGroupPeople(groupId);
  return people.filter((p) => p.id !== userId);
};

// Danh sách các nhóm chat con của 1 nhóm đồ án mà user đang tham gia
exports.getGroupChats = async (groupId, userId) => {
  await assertCanChat(userId, groupId);
  return conversationRepository.findGroupChats(groupId, userId);
};

// Tạo nhóm chat con - bất kỳ ai được chat trong nhóm đều tạo được
exports.createGroupChat = async (groupId, userId, name, memberIds) => {
  await assertCanChat(userId, groupId);

  const cleanName = (name || '').trim();
  if (!cleanName) {
    throw new AppError('Vui lòng nhập tên nhóm chat', 400);
  }
  if (cleanName.length > 50) {
    throw new AppError('Tên nhóm chat tối đa 50 ký tự', 400);
  }

  // Loại trùng và loại chính mình khỏi danh sách (người tạo luôn được thêm riêng ở dưới)
  const otherIds = [...new Set(Array.isArray(memberIds) ? memberIds : [])].filter((id) => id !== userId);
  if (otherIds.length < 1) {
    throw new AppError('Hãy chọn ít nhất 1 thành viên cho nhóm chat', 400);
  }

  // Mọi người được chọn phải thuộc đúng nhóm đồ án này - chặn việc thêm người lạ bằng cách tự gửi id
  const people = await conversationRepository.findGroupPeople(groupId);
  const allowedIds = new Set(people.map((p) => p.id));
  if (!otherIds.every((id) => allowedIds.has(id))) {
    throw new AppError('Có người không thuộc nhóm đồ án này', 400);
  }

  return conversationRepository.createGroupChat({
    name: cleanName,
    groupId,
    createdBy: userId,
    memberIds: [userId, ...otherIds],
  });
};

// Mở chat riêng với 1 người: đã có phòng thì trả lại phòng cũ, chưa có thì tạo mới
// MỚI SỬA: được nhắn riêng nếu là BẠN BÈ (không cần chung nhóm) HOẶC cùng thuộc 1 nhóm đồ án (khi đó groupId là bắt buộc)
exports.openPrivateChat = async (userId, targetUserId, groupId) => {
  if (!targetUserId) {
    throw new AppError('Thiếu thông tin người nhận', 400);
  }
  if (targetUserId === userId) {
    throw new AppError('Không thể nhắn riêng với chính mình', 400);
  }

  // Cách 1: đã là bạn bè -> được nhắn luôn, không cần quan tâm có chung nhóm hay không
  const isFriend = await friendshipService.areFriends(userId, targetUserId);

  if (!isFriend) {
    // Cách 2: chưa là bạn bè -> phải cùng thuộc 1 nhóm đồ án (giữ nguyên luật cũ của lát B)
    if (!groupId) {
      throw new AppError('Hai bạn chưa là bạn bè và không có nhóm chung', 403);
    }
    await assertCanChat(userId, groupId);

    // Người nhận phải cùng thuộc nhóm đồ án đó
    const people = await conversationRepository.findGroupPeople(groupId);
    if (!people.some((p) => p.id === targetUserId)) {
      throw new AppError('Người này không thuộc nhóm đồ án', 403);
    }
  }

  // privateKey: id 2 người sắp theo thứ tự -> (A,B) và (B,A) ra cùng 1 khóa, nên chỉ có 1 phòng cho mỗi cặp
  const privateKey = [userId, targetUserId].sort().join('_');

  const existing = await conversationRepository.findPrivateByKey(privateKey);
  if (existing) return existing;

  try {
    return await conversationRepository.createPrivate({
      privateKey,
      createdBy: userId,
      userIds: [userId, targetUserId],
    });
  } catch (error) {
    // P2002 = vi phạm unique: 2 người cùng bấm "Nhắn riêng" một lúc nên phòng vừa được người kia tạo xong -> lấy phòng đó
    if (error.code === 'P2002') {
      return conversationRepository.findPrivateByKey(privateKey);
    }
    throw error;
  }
};

// Lịch sử tin nhắn của 1 phòng chat - chỉ thành viên của phòng mới xem được
exports.getMessages = async (conversationId, userId) => {
  await assertConversationMember(conversationId, userId);
  return conversationRepository.findMessages(conversationId);
};

// Gửi tin nhắn CHỮ vào phòng chat - trả về tin vừa lưu, danh sách id thành viên và thông tin phòng (để Controller phát realtime)
exports.sendMessage = async (conversationId, userId, content) => {
  const conversation = await assertConversationMember(conversationId, userId);

  const text = (content || '').trim();
  if (!text) {
    throw new AppError('Tin nhắn không được để trống', 400);
  }

  const message = await messageRepository.create({
    content: text,
    conversationId,
    senderId: userId,
  });
  return { message, memberIds: conversation.members.map((m) => m.userId), conversation };
};

// Gửi tin nhắn kèm FILE vào phòng chat - content (chữ đi kèm) không bắt buộc
exports.sendFileMessage = async (conversationId, userId, file, content) => {
  const conversation = await assertConversationMember(conversationId, userId);

  const message = await messageRepository.create({
    content: content && content.trim() ? content.trim() : null,
    conversationId,
    senderId: userId,
    fileName: decodeFileName(file.originalname), // giải mã tên file tiếng Việt bị vỡ dấu
    filePath: file.path,
    fileSize: file.size,
  });
  return { message, memberIds: conversation.members.map((m) => m.userId), conversation };
};