const userStatsService = require('../services/userStats.service'); // Controller chỉ gọi Service, không tự viết logic nghiệp vụ

// Xử lý route GET /users/me/stats - thống kê nhỏ của chính người đang đăng nhập
exports.getMyStats = async (req, res, next) => {
  try {
    const stats = await userStatsService.getMyStats(req.user.id); // id lấy từ token, không nhận từ client
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error); // đẩy lỗi qua error.middleware.js xử lý tập trung
  }
};