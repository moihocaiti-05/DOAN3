const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// GET /api/notifications -> Lấy danh sách thông báo của người đang đăng nhập
router.get('/', authMiddleware, notificationController.getMyNotifications);

// GET /api/notifications/unread-count -> Lấy số lượng thông báo chưa đọc
router.get('/unread-count', authMiddleware, notificationController.getUnreadCount);

// PATCH /api/notifications/mark-all-read -> Đánh dấu tất cả thông báo là đã đọc
router.patch('/mark-all-read', authMiddleware, notificationController.markAllAsRead);

// MỚI THÊM: PATCH /api/notifications/:notificationId/respond -> Đồng ý/Từ chối 1 lời mời (Body: { action: "accept" | "decline" })
router.patch('/:notificationId/respond', authMiddleware, notificationController.respondToInvite);

module.exports = router;