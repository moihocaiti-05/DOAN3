const attachmentService = require('../services/attachment.service');
const path = require('path');

exports.uploadAttachment = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Chưa chọn file' });
    }
    const attachment = await attachmentService.uploadAttachment(
      req.params.taskId,
      req.file,
      req.user.id
    );
    res.status(201).json({ success: true, data: attachment });
  } catch (error) {
    next(error);
  }
};

exports.getTaskAttachments = async (req, res, next) => {
  try {
    const attachments = await attachmentService.getTaskAttachments(req.params.taskId);
    res.json({ success: true, data: attachments });
  } catch (error) {
    next(error);
  }
};

exports.deleteAttachment = async (req, res, next) => {
  try {
    await attachmentService.deleteAttachment(req.params.attachmentId, req.user.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

// Tải file đính kèm về máy - dùng res.download() của Express để trình duyệt tự động tải file
exports.downloadAttachment = async (req, res, next) => {
  try {
    const attachmentService2 = require('../repositories/attachment.repository');
    const attachment = await attachmentService2.findById(req.params.attachmentId);
    if (!attachment) {
      return res.status(404).json({ success: false, message: 'File không tồn tại' });
    }
    // res.download() tự động gửi file về trình duyệt kèm đúng tên file gốc
    res.download(path.resolve(attachment.filePath), attachment.fileName);
  } catch (error) {
    next(error);
  }
};

// Hiển thị file TRỰC TIẾP trên trình duyệt (dùng cho ảnh) thay vì bắt tải về như downloadAttachment
// Route này KHÔNG qua authMiddleware vì thẻ <img> của HTML không gửi kèm được header Authorization
exports.viewAttachment = async (req, res, next) => {
  try {
    const attachmentRepository = require('../repositories/attachment.repository');
    const path = require('path');
    const attachment = await attachmentRepository.findById(req.params.attachmentId);
    if (!attachment) {
      return res.status(404).send('Không tìm thấy file');
    }
    // res.sendFile hiển thị file trực tiếp (inline), khác với res.download() ở chỗ
    // không ép trình duyệt tải về, cho phép hiển thị ngay trong thẻ <img>
    res.sendFile(path.resolve(attachment.filePath));
  } catch (error) {
    next(error);
  }
};

