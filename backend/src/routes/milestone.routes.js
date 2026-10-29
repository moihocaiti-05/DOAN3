const express = require('express');
const router = express.Router();
const milestoneController = require('../controllers/milestone.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const {
  createMilestoneSchema,
  updateMilestoneSchema,
  moveMilestoneSchema,
} = require('../validators/milestone.validator');

router.post('/', authMiddleware, validate(createMilestoneSchema), milestoneController.createMilestone);
router.get('/group/:groupId', authMiddleware, milestoneController.getTimeline);
// MỚI THÊM: tải báo cáo Excel riêng theo mốc
router.get('/group/:groupId/report', authMiddleware, milestoneController.exportMilestoneReport);
// MỚI THÊM: sửa tên / mô tả / hạn chót của mốc
router.put('/:milestoneId', authMiddleware, validate(updateMilestoneSchema), milestoneController.updateMilestone);
// MỚI THÊM: di chuyển mốc (kéo-thả): đổi mốc cha và/hoặc vị trí
router.patch('/:milestoneId/move', authMiddleware, validate(moveMilestoneSchema), milestoneController.moveMilestone);
router.delete('/:milestoneId', authMiddleware, milestoneController.deleteMilestone);

module.exports = router;