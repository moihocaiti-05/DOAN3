const express = require('express');
const router = express.Router();
const friendshipController = require('../controllers/friendship.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// Lấy danh sách bạn bè + lời mời đã nhận + lời mời đã gửi
router.get('/', authMiddleware, friendshipController.getAll);

// Gửi lời mời kết bạn (bằng email, hoặc bằng id người trong nhóm + groupId)
router.post('/request', authMiddleware, friendshipController.sendRequest);

// Đồng ý 1 lời mời
router.post('/:friendshipId/accept', authMiddleware, friendshipController.accept);

// Từ chối lời mời / hủy lời mời đã gửi / hủy kết bạn
router.delete('/:friendshipId', authMiddleware, friendshipController.remove);

module.exports = router;