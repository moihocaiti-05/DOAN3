const fs = require('fs'); // dự phòng dọn file nếu sau này có tính năng xóa tin nhắn có file
const messageRepository = require('../repositories/message.repository');
const groupRepository = require('../repositories/group.repository');
const conversationRepository = require('../repositories/conversation.repository'); // MỚI THÊM: để kiểm tra người tải file có thuộc phòng chat không (gọi Repository, KHÔNG gọi conversation.service để tránh vòng tròn require)
const AppError = require('../utils/AppError');
const { decodeFileName } = require('../utils/decodeFileName'); // sửa tên file tiếng Việt bị vỡ dấu

// Kiểm tra "người này có được chat trong nhóm không" - dùng chung cho tin nhắn chữ và tin nhắn file
// Giảng viên (nằm ở bảng GroupSupervisor) cũng được chat, miễn là đã bấm Đồng ý lời mời
const assertCanChat = async (userId, groupId) => {
  // Bắt buộc có userId và groupId - nếu undefined thì Prisma sẽ BỎ QUA điều kiện đó
  // và vô tình khớp với bản ghi bất kỳ, làm người không có quyền lọt qua kiểm tra
  if (!userId) throw new AppError('Thiếu thông tin người dùng', 401);
  if (!groupId) throw new AppError('Thiếu mã nhóm', 400);

  // Cách 1: là thành viên của nhóm
  const membership = await groupRepository.findMembership(userId, groupId);
  if (membership) return;

  // Cách 2: là Giảng viên phụ trách nhóm - phải ở trạng thái ACCEPTED (đã bấm Đồng ý lời mời)
  // Giảng viên còn PENDING hoặc DECLINED thì KHÔNG được chat
  const supervisorship = await groupRepository.findSupervisorship(userId, groupId);
  if (supervisorship && supervisorship.status === 'ACCEPTED') return;

  // Không thuộc cả 2 trường hợp trên -> người ngoài nhóm, chặn lại
  throw new AppError('Bạn không thuộc nhóm này', 403);
};

// MỚI THÊM: xuất hàm này ra ngoài để conversation.service.js dùng lại, tránh viết trùng đoạn kiểm tra quyền
exports.assertCanChat = assertCanChat;

// Gửi 1 tin nhắn CHỮ mới - kiểm tra người gửi có được chat trong nhóm không (thành viên HOẶC Giảng viên)
exports.sendMessage = async (content, groupId, senderId) => {
  await assertCanChat(senderId, groupId);

  return messageRepository.create({ content, groupId, senderId });
};

// Gửi 1 tin nhắn có FILE đính kèm - content có thể rỗng/null (chỉ gửi file, không kèm chữ)
// file: object do multer cung cấp qua req.file (chứa originalname, path, size)
exports.sendFileMessage = async (groupId, senderId, file, content) => {
  await assertCanChat(senderId, groupId);

  return messageRepository.create({
    // content rỗng ("") coi như không có chữ - lưu null cho gọn, tránh hiện bong bóng chữ trống trên Frontend
    content: content && content.trim() ? content.trim() : null,
    groupId,
    senderId,
    // giải mã lại tên file - multer đọc nhầm UTF-8 thành latin1 nên tiếng Việt có dấu bị vỡ
    fileName: decodeFileName(file.originalname),
    filePath: file.path,
    fileSize: file.size,
  });
};

// Thêm tham số userId (người gọi API) và kiểm tra quyền chat trong nhóm trước khi trả lịch sử chat
// Trước đây hàm này trả tin nhắn cho bất kỳ ai biết groupId (chỉ cần đăng nhập)
exports.getMessagesByGroup = async (groupId, userId) => {
  await assertCanChat(userId, groupId);
  return messageRepository.findByGroup(groupId);
};

// Lấy tin nhắn có file để TẢI VỀ, kiểm tra quyền trước khi cho tải
// - Tin của chat cả nhóm (có groupId): người tải phải được chat trong nhóm đó (thành viên hoặc Giảng viên ACCEPTED)
// - MỚI SỬA: Tin trong phòng chat riêng / nhóm chat con (groupId = null, có conversationId): người tải phải là THÀNH VIÊN CỦA PHÒNG đó
// KHÔNG được gọi assertCanChat với groupId null vì sẽ chặn nhầm mọi file trong phòng chat
exports.getMessageFileForDownload = async (messageId, userId) => {
  // Bắt buộc có userId: nếu undefined thì các bước kiểm tra phía dưới có thể bị Prisma bỏ qua điều kiện
  if (!userId) throw new AppError('Thiếu thông tin người dùng', 401);

  const message = await messageRepository.findById(messageId);
  if (!message || !message.filePath) {
    throw new AppError('File không tồn tại', 404);
  }

  // Trường hợp 1: tin của chat cả nhóm
  if (message.groupId) {
    await assertCanChat(userId, message.groupId);
    return message;
  }

  // MỚI THÊM - Trường hợp 2: tin trong phòng chat (riêng hoặc nhóm chat con) - kiểm tra người tải có trong danh sách thành viên phòng
  if (message.conversationId) {
    const conversation = await conversationRepository.findById(message.conversationId);
    const isMember = conversation && conversation.members.some((m) => m.userId === userId);
    if (!isMember) {
      throw new AppError('Bạn không thuộc phòng chat này', 403);
    }
    return message;
  }

  // MỚI THÊM - Trường hợp 3: tin không thuộc nhóm nào cũng không thuộc phòng nào (dữ liệu bất thường) -> chặn cho an toàn, không cho qua
  throw new AppError('Bạn không có quyền tải file này', 403);
};