const fs = require('fs');
const attachmentRepository = require('../repositories/attachment.repository');
const taskRepository = require('../repositories/task.repository');
const groupRepository = require('../repositories/group.repository');
const AppError = require('../utils/AppError');
const { decodeFileName } = require('../utils/decodeFileName'); // MỚI THÊM: sửa tên file tiếng Việt bị vỡ dấu

// Lưu thông tin file vào database sau khi multer đã lưu file thật lên ổ đĩa
// file: object do multer cung cấp, chứa path, originalname, size...
exports.uploadAttachment = async (taskId, file, uploaderId) => {
  const task = await taskRepository.findById(taskId);
  if (!task) throw new AppError('Task không tồn tại', 404);

  const membership = await groupRepository.findMembership(uploaderId, task.groupId);
  if (!membership) {
    throw new AppError('Bạn không thuộc nhóm này', 403);
  }

  return attachmentRepository.create({
    // MỚI SỬA: giải mã lại tên file - multer đọc nhầm UTF-8 thành latin1 nên tiếng Việt có dấu bị vỡ
    fileName: decodeFileName(file.originalname),
    filePath: file.path,
    fileSize: file.size,
    taskId,
    uploadedBy: uploaderId,
  });
};

exports.getTaskAttachments = (taskId) => attachmentRepository.findByTask(taskId);

// Xóa file đính kèm - xóa cả bản ghi trong database LẪN file thật trên ổ đĩa
exports.deleteAttachment = async (attachmentId, userId) => {
  const attachment = await attachmentRepository.findById(attachmentId);
  if (!attachment) throw new AppError('File không tồn tại', 404);

  if (attachment.uploadedBy !== userId) {
    throw new AppError('Bạn chỉ có thể xóa file của chính mình', 403);
  }

  // Xóa file thật trên ổ đĩa trước, nếu file không còn tồn tại thì bỏ qua lỗi (tránh crash)
  try {
    fs.unlinkSync(attachment.filePath);
  } catch (err) {
    console.log('File không tồn tại trên ổ đĩa, chỉ xóa bản ghi database');
  }

  return attachmentRepository.remove(attachmentId);
};