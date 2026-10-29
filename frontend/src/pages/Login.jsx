import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../services/authApi';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authApi.login({ email, password });
      const { user, token } = res.data.data;
      login(user, token);
      // MỚI SỬA: nếu tài khoản là Giảng viên, điều hướng sang Dashboard riêng thay vì trang chủ của Sinh viên
      // (trang chủ Sinh viên có nút Tạo nhóm/Tham gia nhóm không có ý nghĩa gì với Giảng viên)
      if (user.role === 'GIANG_VIEN') {
        navigate('/supervisor');
      } else {
        navigate('/home');
      }
    } catch (err) {
      // MỚI THÊM: Backend trả 403 khi mật khẩu đúng nhưng email chưa xác nhận -> chuyển sang màn hình nhập mã
      // fromLogin: true để trang đó hiện lời nhắc phù hợp (không đếm ngược vì chưa chắc vừa gửi mail)
      if (err.response?.status === 403) {
        navigate('/verify-email', { state: { email, fromLogin: true } });
        return;
      }
      setError(err.response?.data?.message || 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Đăng nhập" subtitle="Chào mừng quay lại, tiếp tục công việc của nhóm bạn">
      <form onSubmit={handleSubmit}>
        <div className="auth-field">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ban@email.com"
            required
          />
        </div>
        <div className="auth-field">
          <label>Mật khẩu</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>
        {error && <div className="auth-error">{error}</div>}
        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>
      <p className="auth-switch">
        Chưa có tài khoản? <Link to="/register">Đăng ký ngay</Link>
      </p>
    </AuthLayout>
  );
}