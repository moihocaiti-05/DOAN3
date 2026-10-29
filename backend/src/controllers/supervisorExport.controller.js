const exportService = require('../services/supervisorExport.service');

// MỚI THÊM (tính năng 4): xử lý route GET /supervisors/export - trả về file Excel tổng hợp các nhóm Giảng viên phụ trách
exports.exportAll = async (req, res, next) => {
  try {
    const buffer = await exportService.exportAllGroups(req.user.id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="tong-hop-cac-nhom.xlsx"');
    res.send(Buffer.from(buffer));
  } catch (error) {
    next(error);
  }
};