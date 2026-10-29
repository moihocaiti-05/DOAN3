const milestoneService = require('../services/milestone.service');

exports.createMilestone = async (req, res, next) => {
  try {
    const milestone = await milestoneService.createMilestone(req.body, req.user.id);
    res.status(201).json({ success: true, data: milestone });
  } catch (error) {
    next(error);
  }
};

exports.getTimeline = async (req, res, next) => {
  try {
    // MỚI SỬA: truyền thêm req.user.id (người đang đăng nhập) để Service kiểm tra họ có quyền xem nhóm này không
    const timeline = await milestoneService.getTimeline(req.params.groupId, req.user.id);
    res.json({ success: true, data: timeline });
  } catch (error) {
    next(error);
  }
};

exports.deleteMilestone = async (req, res, next) => {
  try {
    await milestoneService.deleteMilestone(req.params.milestoneId, req.user.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};



// MỚI THÊM: PUT /milestones/:milestoneId - sửa tên / mô tả / hạn chót
exports.updateMilestone = async (req, res, next) => {
  try {
    const milestone = await milestoneService.updateMilestone(req.params.milestoneId, req.user.id, req.body);
    res.json({ success: true, data: milestone });
  } catch (error) {
    next(error);
  }
};

// MỚI THÊM: PATCH /milestones/:milestoneId/move - kéo-thả đổi mốc cha và/hoặc vị trí
exports.moveMilestone = async (req, res, next) => {
  try {
    const result = await milestoneService.moveMilestone(req.params.milestoneId, req.user.id, req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};


// MỚI THÊM: GET /milestones/group/:groupId/report - tải báo cáo Excel riêng theo mốc
const reportService = require('../services/report.service');

exports.exportMilestoneReport = async (req, res, next) => {
  try {
    const workbook = await reportService.generateMilestoneReport(req.params.groupId, req.user.id);
    res.setHeader('Content-Disposition', 'attachment; filename=bao-cao-moc.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
};