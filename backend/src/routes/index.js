const express = require('express');
const router = express.Router();
const taskRoutes = require('./task.routes');
const authRoutes = require('./auth.routes');
const groupRoutes = require('./group.routes');
const messageRoutes = require('./message.routes');
const milestoneRoutes = require('./milestone.routes');
const notificationRoutes = require('./notification.routes');
const commentRoutes = require('./comment.routes');
const attachmentRoutes = require('./attachment.routes');
const supervisorRoutes = require('./supervisor.routes'); // MỚI THÊM: dòng này bị thiếu, giờ thêm lại
const conversationRoutes = require('./conversation.routes'); // MỚI THÊM: route phòng chat (nhóm chat con + chat riêng)
const friendRoutes = require('./friend.routes'); // MỚI THÊM: route kết bạn

router.use('/tasks', taskRoutes);
router.use('/auth', authRoutes);
router.use('/groups', groupRoutes);
router.use('/messages', messageRoutes);
router.use('/milestones', milestoneRoutes);
router.use('/notifications', notificationRoutes);
router.use('/comments', commentRoutes);
router.use('/attachments', attachmentRoutes);
router.use('/users', require('./user.routes'));
router.use('/supervisors', supervisorRoutes); // MỚI THÊM: nối route Giảng viên vào
router.use('/conversations', conversationRoutes); // MỚI THÊM: nối route phòng chat vào, đường dẫn đầy đủ là /api/conversations/...
router.use('/friends', friendRoutes); // MỚI THÊM: nối route kết bạn vào, đường dẫn đầy đủ là /api/friends/...

module.exports = router;