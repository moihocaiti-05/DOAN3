const express = require('express');
const router = express.Router();
const multer = require('multer');
const messageController = require('../controllers/message.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// Cấu hình multer riêng cho file chat - lưu vào thư mục "uploads/chat/" (tách riêng khỏi attachments/avatars)
const upload = multer({ dest: 'uploads/chat/' });

router.get('/group/:groupId', authMiddleware, messageController.getMessagesByGroup);

// MỚI THÊM: xem file trực tiếp - route CÔNG KHAI (không authMiddleware), dùng cho thẻ <img>
router.get('/:messageId/file/view', messageController.viewFile);

// MỚI THÊM: tải file về máy - cần đăng nhập
router.get('/:messageId/file/download', authMiddleware, messageController.downloadFile);

// MỚI THÊM: gửi tin nhắn kèm file - multipart/form-data, field "file" + field "content" (không bắt buộc)
router.post('/group/:groupId/upload', authMiddleware, upload.single('file'), messageController.uploadFileMessage);

module.exports = router;