const groupService = require('../services/group.service');
const reportService = require('../services/report.service'); // MỚI THÊM: service dựng báo cáo tiến độ Excel
const activityService = require('../services/activity.service'); // MỚI THÊM: service lịch sử hoạt động của nhóm

exports.createGroup = async (req, res, next) => {
  try {
    const group = await groupService.createGroup(req.body, req.user.id);
    res.status(201).json({ success: true, data: group });
  } catch (error) {
    next(error);
  }
};

exports.getMyGroups = async (req, res, next) => {
  try {
    const groups = await groupService.getMyGroups(req.user.id);
    res.json({ success: true, data: groups });
  } catch (error) {
    next(error);
  }
};

exports.joinGroup = async (req, res, next) => {
  try {
    const group = await groupService.joinGroup(req.body.inviteCode, req.user.id);
    res.json({ success: true, data: group });
  } catch (error) {
    next(error);
  }
};

exports.getMembers = async (req, res, next) => {
  try {
    // MỚI SỬA: đi qua Service (kiểm tra quyền xem nhóm) thay vì gọi thẳng Repository như trước
    const members = await groupService.getMembers(req.params.groupId, req.user.id);
    res.json({ success: true, data: members });
  } catch (error) {
    next(error);
  }
};

exports.getGroupDetail = async (req, res, next) => {
  try {
    const group = await groupService.getGroupDetail(req.params.groupId, req.user.id);
    res.json({ success: true, data: group });
  } catch (error) {
    next(error);
  }
};

exports.transferLeadership = async (req, res, next) => {
  try {
    await groupService.transferLeadership(req.params.groupId, req.user.id, req.body.targetUserId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

exports.removeMember = async (req, res, next) => {
  try {
    await groupService.removeMember(req.params.groupId, req.user.id, req.params.targetUserId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

exports.getWorkloadWarnings = async (req, res, next) => {
  try {
    // MỚI SỬA: truyền thêm req.user.id (người đang đăng nhập) để Service kiểm tra họ có quyền xem nhóm này không
    const warnings = await groupService.getWorkloadWarnings(req.params.groupId, req.user.id);
    res.json({ success: true, data: warnings });
  } catch (error) {
    next(error);
  }
};

exports.inviteMember = async (req, res, next) => {
  try {
    const membership = await groupService.inviteMember(req.params.groupId, req.user.id, req.body.email);
    res.status(201).json({ success: true, data: membership });
  } catch (error) {
    next(error);
  }
};

exports.invite = async (req, res, next) => {
  try {
    const result = await groupService.invite(req.params.groupId, req.user.id, req.body.email);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

// MỚI THÊM: Xử lý route DELETE /groups/:groupId - xóa toàn bộ nhóm
exports.deleteGroup = async (req, res, next) => {
  try {
    await groupService.deleteGroup(req.params.groupId, req.user.id, req.body.confirmName);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

// MỚI THÊM: Xử lý route GET /groups/:groupId/activities - lấy 1 trang lịch sử hoạt động (?page=1&limit=20)
exports.getActivities = async (req, res, next) => {
  try {
    const result = await activityService.getGroupActivities(
      req.params.groupId,
      req.user.id,
      req.query.page,
      req.query.limit
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

// MỚI THÊM: Xử lý route GET /groups/:groupId/report - xuất báo cáo tiến độ của nhóm ra file Excel
exports.exportReport = async (req, res, next) => {
  try {
    // Service kiểm tra quyền xem nhóm (thành viên hoặc Giảng viên đã đồng ý) rồi dựng workbook;
    // nếu bị chặn thì ném lỗi TRƯỚC khi gửi bất kỳ byte nào của file, nên next(error) vẫn trả được JSON lỗi bình thường
    const workbook = await reportService.generateProgressReport(req.params.groupId, req.user.id);

    // Báo cho trình duyệt biết đây là file Excel (.xlsx) và tải về như 1 tệp đính kèm
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="bao-cao-tien-do.xlsx"');

    // Ghi thẳng workbook vào response (không lưu file tạm trên ổ đĩa) rồi kết thúc response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
};