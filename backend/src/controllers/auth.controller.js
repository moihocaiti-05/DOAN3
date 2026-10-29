const authService = require('../services/auth.service'); // Controller chỉ được phép gọi Service, không tự viết logic nghiệp vụ ở đây

// Xử lý route POST /auth/register
exports.register = async (req, res, next) => {
  try {
    // req.body đã bao gồm cả field "role" nếu Frontend gửi lên (không cần sửa gì thêm ở đây)
    // MỚI SỬA: Service giờ trả { email, requiresVerification: true } (chưa đăng nhập được, phải nhập mã gửi qua mail)
    const result = await authService.register(req.body);
    res.status(201).json({ success: true, data: result }); // 201 = tạo thành công
  } catch (error) {
    next(error); // đẩy lỗi qua error.middleware.js xử lý tập trung
  }
};

// Xử lý route POST /auth/login
exports.login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

// MỚI THÊM: Xử lý route POST /auth/verify-email - nhập mã 6 số, đúng thì trả luôn { user, token } như đăng nhập
exports.verifyEmail = async (req, res, next) => {
  try {
    const result = await authService.verifyEmail(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

// MỚI THÊM: Xử lý route POST /auth/resend-code - gửi lại mã xác nhận mới
exports.resendCode = async (req, res, next) => {
  try {
    await authService.resendCode(req.body);
    // Luôn trả cùng 1 câu dù email có tồn tại hay không, để người ngoài không dò được email nào đã đăng ký
    res.json({ success: true, message: 'Nếu email hợp lệ, mã xác nhận mới đã được gửi' });
  } catch (error) {
    next(error);
  }
};