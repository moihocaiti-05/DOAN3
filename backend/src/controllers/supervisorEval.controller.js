const evalService = require('../services/supervisorEval.service');

// GET /supervisors/groups/:groupId/evaluations - danh sách mốc của nhóm kèm đánh giá của Giảng viên đang đăng nhập
exports.getByGroup = async (req, res, next) => {
  try {
    const data = await evalService.getGroupEvaluations(req.user.id, req.params.groupId);
    res.json({ success: true, data });
  } catch (err) {
    next(err); // để middleware lỗi chung trả đúng mã 400 / 403 / 404
  }
};

// PUT /supervisors/milestones/:milestoneId/evaluation - lưu đánh giá; Body: { rating, score, note }
exports.save = async (req, res, next) => {
  try {
    const data = await evalService.saveEvaluation(req.user.id, req.params.milestoneId, req.body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// DELETE /supervisors/milestones/:milestoneId/evaluation - xóa đánh giá của mình
exports.remove = async (req, res, next) => {
  try {
    await evalService.removeEvaluation(req.user.id, req.params.milestoneId);
    res.json({ success: true, message: 'Đã xóa đánh giá' });
  } catch (err) {
    next(err);
  }
};