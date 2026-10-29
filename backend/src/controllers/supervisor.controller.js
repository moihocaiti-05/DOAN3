const supervisorService = require('../services/supervisor.service');

// Xử lý route POST /groups/:groupId/invite-supervisor
exports.invite = async (req, res, next) => {
  try {
    const { groupId } = req.params; // MỚI SỬA: lấy groupId từ URL thay vì Body, cho khớp quy ước của dự án
    const { email } = req.body;
    const result = await supervisorService.inviteSupervisor(groupId, req.user.id, email);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

// Xử lý route GET /supervisors/my-groups (dành cho Giảng viên xem các nhóm mình phụ trách)
exports.getMyGroups = async (req, res, next) => {
  try {
    const result = await supervisorService.getMySupervisedGroups(req.user.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

// MỚI THÊM (Phiên 7): Xử lý route GET /supervisors/overview (bảng tổng quan các nhóm Giảng viên phụ trách)
exports.getOverview = async (req, res, next) => {
  try {
    const result = await supervisorService.getSupervisorOverview(req.user.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

// Xử lý route GET /groups/:groupId/supervisors (xem danh sách Giảng viên của 1 nhóm cụ thể)
exports.getByGroup = async (req, res, next) => {
  try {
    // MỚI SỬA: truyền thêm req.user.id (người đang đăng nhập) để Service kiểm tra họ có quyền xem nhóm này không
    const result = await supervisorService.getGroupSupervisors(req.params.groupId, req.user.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};