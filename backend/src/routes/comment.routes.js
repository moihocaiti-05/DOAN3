const express = require('express');
const router = express.Router();
const commentController = require('../controllers/comment.controller');
const authMiddleware = require('../middlewares/auth.middleware');

router.post('/tasks/:taskId', authMiddleware, commentController.createTaskComment);
router.get('/tasks/:taskId', authMiddleware, commentController.getTaskComments);

// MỚI THÊM: nhận xét theo mốc (đặt trước route '/:commentId' cho dễ đọc, các route tĩnh khai báo trước route động)
router.get('/milestones/:milestoneId', authMiddleware, commentController.getMilestoneComments);
router.post('/milestones/:milestoneId', authMiddleware, commentController.createMilestoneComment);

router.delete('/:commentId', authMiddleware, commentController.deleteComment);

module.exports = router;