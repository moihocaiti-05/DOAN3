const upcomingService = require('../services/supervisorUpcoming.service');

// MỚI THÊM (tính năng 5): xử lý route GET /supervisors/upcoming?days=7
// "days" không bắt buộc (mặc định 7), Service kiểm tra phải là số nguyên từ 1 đến 60
exports.getUpcoming = async (req, res, next) => {
  try {
    const result = await upcomingService.getUpcomingDeadlines(req.user.id, req.query.days);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};