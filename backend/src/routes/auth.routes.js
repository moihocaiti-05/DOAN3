const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const validate = require('../middlewares/validate.middleware');
// lấy các schema kiểm tra dữ liệu; MỚI THÊM googleSchema cho đăng nhập Google
const {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendCodeSchema,
  googleSchema,
} = require('../validators/auth.validator');

router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
// 2 route công khai (người dùng chưa đăng nhập nên không gắn authMiddleware)
router.post('/verify-email', validate(verifyEmailSchema), authController.verifyEmail);
router.post('/resend-code', validate(resendCodeSchema), authController.resendCode);
// MỚI THÊM: đăng nhập bằng Google, cũng là route công khai
router.post('/google', validate(googleSchema), authController.googleLogin);

module.exports = router;