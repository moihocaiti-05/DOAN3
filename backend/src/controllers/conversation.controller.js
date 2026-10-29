const conversationService = require('../services/conversation.service');
const { getIO } = require('../sockets/socketInstance'); // lấy instance Socket.io dùng chung để phát tin nhắn

// Phát tin nhắn mới tới "phòng thông báo riêng" của từng thành viên trong phòng chat (kể cả người gửi)
// Dùng phòng thông báo (notification_<userId>) vì mọi người đã đăng nhập đều đã vào phòng này,
// nên người nhận biết có tin mới dù chưa mở đúng cuộc chat đó
// MỚI SỬA: gắn thêm thông tin phòng (id, loại, tên) vào gói tin để Frontend biết đây là chat riêng hay nhóm chat con
const emitNewMessage = (memberIds, message, conversation) => {
  const io = getIO();
  if (!io) return;
  const payload = {
    ...message,
    conversation: { id: conversation.id, type: conversation.type, name: conversation.name },
  };
  memberIds.forEach((id) => {
    io.to(`notification_${id}`).emit('new_conversation_message', payload);
  });
};

// GET /conversations/group/:groupId/people - những người có thể nhắn riêng / thêm vào nhóm chat con
exports.getPeople = async (req, res, next) => {
  try {
    const people = await conversationService.getPeople(req.params.groupId, req.user.id);
    res.json({ success: true, data: people });
  } catch (error) {
    next(error);
  }
};

// GET /conversations/group/:groupId - các nhóm chat con của nhóm đồ án mà mình đang tham gia
exports.getGroupChats = async (req, res, next) => {
  try {
    const chats = await conversationService.getGroupChats(req.params.groupId, req.user.id);
    res.json({ success: true, data: chats });
  } catch (error) {
    next(error);
  }
};

// POST /conversations/group/:groupId - tạo nhóm chat con, body: { name, memberIds: [...] }
exports.createGroupChat = async (req, res, next) => {
  try {
    const chat = await conversationService.createGroupChat(
      req.params.groupId,
      req.user.id,
      req.body.name,
      req.body.memberIds
    );
    res.status(201).json({ success: true, data: chat });
  } catch (error) {
    next(error);
  }
};

// POST /conversations/private - mở (hoặc tạo) chat riêng, body: { userId, groupId }
exports.openPrivateChat = async (req, res, next) => {
  try {
    const chat = await conversationService.openPrivateChat(
      req.user.id,
      req.body.userId,
      req.body.groupId
    );
    res.json({ success: true, data: chat });
  } catch (error) {
    next(error);
  }
};

// GET /conversations/:conversationId/messages - lịch sử tin nhắn của 1 phòng chat
exports.getMessages = async (req, res, next) => {
  try {
    const messages = await conversationService.getMessages(req.params.conversationId, req.user.id);
    res.json({ success: true, data: messages });
  } catch (error) {
    next(error);
  }
};

// POST /conversations/:conversationId/messages - gửi tin nhắn chữ, body: { content }
exports.sendMessage = async (req, res, next) => {
  try {
    const { message, memberIds, conversation } = await conversationService.sendMessage(
      req.params.conversationId,
      req.user.id,
      req.body.content
    );
    emitNewMessage(memberIds, message, conversation);
    res.status(201).json({ success: true, data: message });
  } catch (error) {
    next(error);
  }
};

// POST /conversations/:conversationId/messages/upload - gửi tin nhắn kèm file (multipart: field "file" + "content" không bắt buộc)
exports.uploadFileMessage = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Chưa chọn file' });
    }
    const { message, memberIds, conversation } = await conversationService.sendFileMessage(
      req.params.conversationId,
      req.user.id,
      req.file,
      req.body.content
    );
    emitNewMessage(memberIds, message, conversation);
    res.status(201).json({ success: true, data: message });
  } catch (error) {
    next(error);
  }
};