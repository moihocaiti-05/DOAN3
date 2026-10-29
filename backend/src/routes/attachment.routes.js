const express = require('express');
const router = express.Router();
const multer = require('multer');
const attachmentController = require('../controllers/attachment.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// Cấu hình multer riêng cho attachment - lưu vào thư mục "uploads/attachments/"
const upload = multer({ dest: 'uploads/attachments/' });

// MỚI THÊM: route xem ảnh trực tiếp - KHÔNG có authMiddleware vì thẻ <img> không gửi được token
router.get('/:attachmentId/view', attachmentController.viewAttachment);

router.post('/tasks/:taskId', authMiddleware, upload.single('file'), attachmentController.uploadAttachment);
router.get('/tasks/:taskId', authMiddleware, attachmentController.getTaskAttachments);
router.get('/:attachmentId/download', authMiddleware, attachmentController.downloadAttachment);
router.delete('/:attachmentId', authMiddleware, attachmentController.deleteAttachment);

module.exports = router;