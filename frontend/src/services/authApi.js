import api from './api'; // instance axios đã cấu hình sẵn baseURL + interceptor gắn token

// Gom các hàm gọi API liên quan tới Auth vào 1 object cho dễ import và sử dụng
export const authApi = {
  // data ở đây sẽ tự động chứa field "role" nếu form Đăng ký có gửi lên, không cần sửa gì thêm
  // MỚI SỬA: Backend giờ trả { email, requiresVerification: true } thay vì user + token
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  // MỚI THÊM: gửi { email, code } để xác nhận email; đúng mã thì Backend trả { user, token } như đăng nhập
  verifyEmail: (data) => api.post('/auth/verify-email', data),
  // MỚI THÊM: gửi { email } để nhận mã xác nhận mới
  resendCode: (data) => api.post('/auth/resend-code', data),
};