const express = require('express');
const router = express.Router();
const multer = require('multer');
const userController = require('../controllers/user.controller');
const userStatsController = require('../controllers/userStats.controller'); // MỚI THÊM: thống kê nhỏ cho trang Thông tin cá nhân
const authMiddleware = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { updateProfileSchema, changePasswordSchema } = require('../validators/user.validator');

// Cấu hình multer riêng cho avatar - lưu vào thư mục "uploads/avatars/" (tách riêng khỏi "uploads/attachments/")
const upload = multer({ dest: 'uploads/avatars/' });

// GET /api/users/:userId/avatar -> xem ảnh đại diện, route CÔNG KHAI (không authMiddleware)
router.get('/:userId/avatar', userController.viewAvatar);

router.get('/me', authMiddleware, userController.getProfile);
// MỚI THÊM: GET /api/users/me/stats -> số nhóm, số việc xong (hoặc số nhận xét với Giảng viên); đường dẫn 2 đoạn "me/stats" không trùng "/:userId/avatar" nên đặt ở đâu cũng được
router.get('/me/stats', authMiddleware, userStatsController.getMyStats);
router.patch('/me', authMiddleware, validate(updateProfileSchema), userController.updateProfile);
router.post('/me/avatar', authMiddleware, upload.single('avatar'), userController.uploadAvatar);
router.patch('/me/password', authMiddleware, validate(changePasswordSchema), userController.changePassword);

module.exports = router;