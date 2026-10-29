import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../services/authApi';
import AuthLayout from '../components/AuthLayout';

export default function Register() {
  // state lưu toàn bộ dữ liệu của form Đăng ký
  // MỚI THÊM: role mặc định là SINH_VIEN khi mới vào trang
  const [form, setForm] = useState({ email: '', password: '', fullName: '', role: 'SINH_VIEN' });
  const [error, setError] = useState('');   // lưu thông báo lỗi để hiển thị cho người dùng
  const [loading, setLoading] = useState(false); // true khi đang gửi request, dùng để disable nút bấm
  const navigate = useNavigate(); // dùng để chuyển trang sau khi đăng ký xong

  // Hàm chung xử lý mọi thay đổi trên input (text, email, password, radio...)
  // e.target.name phải trùng với tên field trong state (VD name="email" thì cập nhật form.email)
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Hàm xử lý khi bấm nút Đăng ký (submit form)
  const handleSubmit = async (e) => {
    e.preventDefault(); // chặn hành vi reload trang mặc định của form HTML
    setError('');
    setLoading(true);
    try {
      await authApi.register(form); // gửi toàn bộ form (đã có role) lên Backend
      // MỚI SỬA: đăng ký xong CHƯA đăng nhập được; Backend đã gửi mã 6 số về mail nên chuyển sang màn hình nhập mã
      // justSent: true để trang nhập mã biết mail vừa gửi (hiện thông báo và đếm ngược 60 giây cho nút Gửi lại mã)
      navigate('/verify-email', { state: { email: form.email, justSent: true } });
    } catch (err) {
      // Lấy message lỗi từ Backend trả về, nếu không có thì hiện thông báo mặc định
      setError(err.response?.data?.message || 'Đăng ký thất bại');
    } finally {
      setLoading(false); // dù thành công hay lỗi, tắt trạng thái loading
    }
  };

  return (
    <AuthLayout title="Tạo tài khoản" subtitle="Bắt đầu quản lý đồ án nhóm hiệu quả hơn">
      <form onSubmit={handleSubmit}>
        <div className="auth-field">
          <label>Họ và tên</label>
          <input
            name="fullName"
            value={form.fullName}
            onChange={handleChange}
            placeholder="Nguyễn Văn A"
            required
          />
        </div>
        <div className="auth-field">
          <label>Email</label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="ban@email.com"
            required
          />
        </div>
        <div className="auth-field">
          <label>Mật khẩu</label>
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            placeholder="Tối thiểu 6 ký tự"
            required
          />
        </div>

        {/* MỚI THÊM: cho người dùng chọn vai trò tài khoản bằng 2 nút radio */}
        <div className="auth-field">
          <label>Bạn là</label>
          <div className="auth-role-group">
            {/* Radio 1: Sinh viên — checked khi form.role đang là SINH_VIEN */}
            <label className="auth-role-option">
              <input
                type="radio"
                name="role"
                value="SINH_VIEN"
                checked={form.role === 'SINH_VIEN'}
                onChange={handleChange}
              />
              Sinh viên
            </label>
            {/* Radio 2: Giảng viên hướng dẫn */}
            <label className="auth-role-option">
              <input
                type="radio"
                name="role"
                value="GIANG_VIEN"
                checked={form.role === 'GIANG_VIEN'}
                onChange={handleChange}
              />
              Giảng viên hướng dẫn
            </label>
          </div>
        </div>

        {error && <div className="auth-error">{error}</div>}
        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? 'Đang tạo tài khoản...' : 'Đăng ký'}
        </button>
      </form>
      <p className="auth-switch">
        Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
      </p>
    </AuthLayout>
  );
}