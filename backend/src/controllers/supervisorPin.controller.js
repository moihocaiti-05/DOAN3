const pinService = require('../services/supervisorPin.service');

// MỚI THÊM (GV6): PATCH /api/supervisors/groups/:groupId/pin  - Body: { pinned: true | false }
exports.setPin = async (req, res, next) => {
  try {
    const data = await pinService.setPin(req.user.id, req.params.groupId, req.body.pinned);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};