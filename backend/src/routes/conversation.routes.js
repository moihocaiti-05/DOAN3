const express = require('express');
const router = express.Router();
const multer = require('multer');
const conversationController = require('../controllers/conversation.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// File gửi trong phòng chat lưu chung thư mục với file chat nhóm: "uploads/chat/"
const upload = multer({ dest: 'uploads/chat/' });

// Những người có thể nhắn riêng / thêm vào nhóm chat con trong 1 nhóm đồ án
router.get('/group/:groupId/people', authMiddleware, conversationController.getPeople);

// Danh sách nhóm chat con của 1 nhóm đồ án (GET) và tạo nhóm chat con mới (POST)
router.get('/group/:groupId', authMiddleware, conversationController.getGroupChats);
router.post('/group/:groupId', authMiddleware, conversationController.createGroupChat);

// Mở hoặc tạo chat riêng 1-1
router.post('/private', authMiddleware, conversationController.openPrivateChat);

// Tin nhắn trong 1 phòng chat: xem lịch sử, gửi chữ, gửi file
router.get('/:conversationId/messages', authMiddleware, conversationController.getMessages);
router.post('/:conversationId/messages', authMiddleware, conversationController.sendMessage);
router.post(
  '/:conversationId/messages/upload',
  authMiddleware,
  upload.single('file'),
  conversationController.uploadFileMessage
);

module.exports = router;