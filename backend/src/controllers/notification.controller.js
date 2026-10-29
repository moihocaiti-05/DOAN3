const notificationService = require('../services/notification.service');

exports.getMyNotifications = async (req, res, next) => {
  try {
    const notifications = await notificationService.getMyNotifications(req.user.id);
    res.json({ success: true, data: notifications });
  } catch (error) {
    next(error);
  }
};

exports.getUnreadCount = async (req, res, next) => {
  try {
    const count = await notificationService.getUnreadCount(req.user.id);
    res.json({ success: true, data: { count } });
  } catch (error) {
    next(error);
  }
};

exports.markAllAsRead = async (req, res, next) => {
  try {
    await notificationService.markAllAsRead(req.user.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

// MỚI THÊM: Xử lý route PATCH /notifications/:notificationId/respond - Đồng ý/Từ chối lời mời
exports.respondToInvite = async (req, res, next) => {
  try {
    await notificationService.respondToInvite(req.params.notificationId, req.user.id, req.body.action);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};