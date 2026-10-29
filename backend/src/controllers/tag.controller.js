const tagService = require('../services/tag.service');

// Xử lý route GET /groups/:groupId/tags
exports.getByGroup = async (req, res, next) => {
  try {
    const tags = await tagService.getGroupTags(req.params.groupId);
    res.json({ success: true, data: tags });
  } catch (error) {
    next(error);
  }
};