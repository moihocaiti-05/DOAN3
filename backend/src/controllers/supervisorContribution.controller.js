const contributionService = require('../services/supervisorContribution.service');

// MỚI THÊM (tính năng 3): xử lý route GET /supervisors/groups/:groupId/contributions
exports.getContributions = async (req, res, next) => {
  try {
    const result = await contributionService.getGroupContributions(req.params.groupId, req.user.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};