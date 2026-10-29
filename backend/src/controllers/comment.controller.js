const commentService = require('../services/comment.service');

exports.createTaskComment = async (req, res, next) => {
  try {
    const comment = await commentService.createTaskComment(
      req.params.taskId,
      req.body.content,
      req.user.id
    );
    res.status(201).json({ success: true, data: comment });
  } catch (error) {
    next(error);
  }
};

exports.getTaskComments = async (req, res, next) => {
  try {
    // MỚI SỬA: truyền thêm req.user.id để Service kiểm tra người xem có thuộc nhóm không + gắn nhãn vai trò
    const comments = await commentService.getTaskComments(req.params.taskId, req.user.id);
    res.json({ success: true, data: comments });
  } catch (error) {
    next(error);
  }
};

exports.deleteComment = async (req, res, next) => {
  try {
    await commentService.deleteComment(req.params.commentId, req.user.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

// Lấy nhận xét của 1 mốc (trả { comments, canWrite })
exports.getMilestoneComments = async (req, res, next) => {
  try {
    const data = await commentService.getMilestoneComments(req.params.milestoneId, req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// Viết nhận xét mới cho 1 mốc (chỉ Giảng viên / Trưởng nhóm)
exports.createMilestoneComment = async (req, res, next) => {
  try {
    const comment = await commentService.createMilestoneComment(
      req.params.milestoneId,
      req.body.content,
      req.user.id
    );
    res.status(201).json({ success: true, data: comment });
  } catch (error) {
    next(error);
  }
};