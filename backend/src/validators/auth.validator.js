const Joi = require('joi'); // thư viện dùng để kiểm tra dữ liệu đầu vào (validate)

// Schema kiểm tra dữ liệu khi người dùng gửi request Đăng ký
exports.registerSchema = Joi.object({
  email: Joi.string().email().required(),        // bắt buộc, phải đúng định dạng email
  password: Joi.string().min(6).required(),      // bắt buộc, tối thiểu 6 ký tự
  fullName: Joi.string().min(2).max(100).required(), // bắt buộc, họ tên từ 2-100 ký tự
  // MỚI THÊM: chọn vai trò lúc đăng ký (Sinh viên hoặc Giảng viên)
  // .valid(...) chỉ cho phép đúng 2 giá trị này, gửi giá trị khác sẽ bị Joi chặn và báo lỗi
  // .default('SINH_VIEN') nghĩa là nếu Frontend không gửi field role lên thì tự hiểu là Sinh viên
  role: Joi.string().valid('SINH_VIEN', 'GIANG_VIEN').default('SINH_VIEN'),
});

// Schema kiểm tra dữ liệu khi người dùng gửi request Đăng nhập
exports.loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(), // lúc đăng nhập không cần kiểm tra độ dài, chỉ cần có giá trị
});

// MỚI THÊM: kiểm tra request xác nhận email (nhập mã 6 số)
exports.verifyEmailSchema = Joi.object({
  email: Joi.string().email().required(),
  // đúng 6 chữ số: ^ là đầu chuỗi, \d{6} là 6 chữ số, $ là cuối chuỗi
  code: Joi.string()
    .pattern(/^\d{6}$/)
    .required()
    .messages({
      'string.pattern.base': 'Mã xác nhận gồm đúng 6 chữ số',
      'string.empty': 'Vui lòng nhập mã xác nhận',
      'any.required': 'Vui lòng nhập mã xác nhận',
    }),
});

// MỚI THÊM: kiểm tra request gửi lại mã (chỉ cần email)
exports.resendCodeSchema = Joi.object({
  email: Joi.string().email().required(),
});