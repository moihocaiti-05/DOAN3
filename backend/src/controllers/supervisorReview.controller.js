const reviewService = require('../services/supervisorReview.service');

// MỚI THÊM (Phiên 7 - tính năng 1): xử lý route GET /supervisors/pending-review
exports.getPendingReview = async (req, res, next) => {
  try {
    const result = await reviewService.getPendingReviewTasks(req.user.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};