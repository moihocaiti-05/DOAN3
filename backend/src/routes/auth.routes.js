const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const validate = require('../middlewares/validate.middleware');
// MỚI SỬA: lấy thêm 2 schema mới cho xác nhận email và gửi lại mã
const {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendCodeSchema,
} = require('../validators/auth.validator');

router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
// MỚI THÊM: 2 route công khai (người dùng chưa đăng nhập nên không gắn authMiddleware)
router.post('/verify-email', validate(verifyEmailSchema), authController.verifyEmail);
router.post('/resend-code', validate(resendCodeSchema), authController.resendCode);

module.exports = router;