const chartService = require('../services/supervisorChart.service');

// GET /supervisors/groups/:groupId/charts?weeks=8
// Controller chỉ gọi Service rồi trả { success, data }; mọi lỗi (AppError) chuyển cho middleware lỗi xử lý
exports.getCharts = async (req, res, next) => {
  try {
    // Lấy id người đăng nhập do authMiddleware gắn vào req.user (đọc cả 2 tên phổ biến cho chắc)
    const actorId = req.user?.id || req.user?.userId;
    const data = await chartService.getGroupCharts(req.params.groupId, actorId, req.query.weeks);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};