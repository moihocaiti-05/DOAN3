const path = require('path');
const fs = require('fs'); // MỚI THÊM: dùng để xóa file thừa khi gửi file bị từ chối
const messageService = require('../services/message.service');
const messageRepository = require('../repositories/message.repository');
const { getIO } = require('../sockets/socketInstance'); // MỚI THÊM: lấy instance Socket.io dùng chung để phát tin nhắn

// Lấy lịch sử chat của 1 nhóm - gọi 1 lần khi trang chat vừa mở ra
exports.getMessagesByGroup = async (req, res, next) => {
  try {
    // MỚI SỬA: truyền thêm req.user.id (người đang đăng nhập) để Service kiểm tra họ có được chat trong nhóm không
    const messages = await messageService.getMessagesByGroup(req.params.groupId, req.user.id);
    res.json({ success: true, data: messages });
  } catch (error) {
    next(error);
  }
};

// MỚI THÊM: Xử lý route POST /messages/group/:groupId/upload - gửi tin nhắn kèm file
// Đường đi khác với tin nhắn chữ (không qua Socket.io để gửi, vì Socket.io không hợp để tải file nhị phân lên)
// Nhưng sau khi lưu xong, vẫn PHÁT qua Socket.io để mọi người trong nhóm thấy tin nhắn này hiện realtime,
// giống hệt cảm giác với tin nhắn chữ - không ai phải bấm F5 mới thấy file mới
exports.uploadFileMessage = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Chưa chọn file' });
    }
    const message = await messageService.sendFileMessage(
      req.params.groupId,
      req.user.id,
      req.file,
      req.body.content
    );

    const io = getIO();
    if (io) {
      io.to(req.params.groupId).emit('new_message', message);
    }

    res.status(201).json({ success: true, data: message });
  } catch (error) {
    // MỚI THÊM: multer đã lưu file xuống ổ đĩa TRƯỚC khi Service kiểm tra quyền, nên nếu bị từ chối (403) hoặc lỗi
    // thì phải xóa file vừa lưu, nếu không người ngoài nhóm có thể làm đầy thư mục uploads/chat/
    // Lỗi khi xóa (file không còn) được bỏ qua vì không ảnh hưởng kết quả trả về
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, () => {});
    }
    next(error);
  }
};

// MỚI THÊM: Xem file trực tiếp (dùng cho ảnh hiển thị trong khung chat) - KHÔNG có authMiddleware
// vì thẻ <img> không gửi được token, giống hệt cơ chế attachmentController.viewAttachment
exports.viewFile = async (req, res, next) => {
  try {
    const message = await messageRepository.findById(req.params.messageId);
    if (!message || !message.filePath) {
      return res.status(404).json({ success: false, message: 'File không tồn tại' });
    }
    res.sendFile(path.resolve(message.filePath));
  } catch (error) {
    next(error);
  }
};

// MỚI THÊM: Tải file về máy (dùng cho file KHÔNG phải ảnh, VD pdf/docx/zip)
exports.downloadFile = async (req, res, next) => {
  try {
    // MỚI SỬA: lấy tin nhắn qua Service (đã kiểm tra quyền người tải) thay vì đọc thẳng Repository như trước
    // Service tự ném lỗi 404 nếu không có file, 403 nếu người tải không thuộc nhóm
    const message = await messageService.getMessageFileForDownload(req.params.messageId, req.user.id);
    res.download(path.resolve(message.filePath), message.fileName);
  } catch (error) {
    next(error);
  }
};