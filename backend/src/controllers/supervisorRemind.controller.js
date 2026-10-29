const remindService = require('../services/supervisorRemind.service');

// MỚI THÊM (tính năng 2): xử lý route POST /supervisors/groups/:groupId/remind
// Body (không bắt buộc): { message: "lời nhắn riêng của Giảng viên" }
exports.remind = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { message } = req.body || {};
    const result = await remindService.remindGroup(groupId, req.user.id, message);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};