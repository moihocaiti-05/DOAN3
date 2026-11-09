import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google'; // MỚI THÊM: nút "Đăng nhập với Google" có sẵn của thư viện
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

  // MỚI THÊM: các state cho luồng đăng nhập Google
  const [googleCredential, setGoogleCredential] = useState(null); // credential Google trả về, giữ lại để gửi kèm vai trò ở bước 2
  const [googleProfile, setGoogleProfile] = useState(null); // { email, fullName } của tài khoản Google mới (để hiển thị)
  const [googleRole, setGoogleRole] = useState('SINH_VIEN'); // vai trò người dùng chọn ở bước chọn vai trò

  // MỚI THÊM: hàm dùng chung sau khi đăng nhập thành công (cả đăng nhập thường lẫn Google)
  // lưu user + token vào AuthContext, rồi điều hướng theo vai trò
  const finishLogin = (data) => {
    const { user, token } = data;
    login(user, token);
    // nếu tài khoản là Giảng viên, điều hướng sang Dashboard riêng thay vì trang chủ của Sinh viên
    // (trang chủ Sinh viên có nút Tạo nhóm/Tham gia nhóm không có ý nghĩa gì với Giảng viên)
    if (user.role === 'GIANG_VIEN') {
      navigate('/supervisor');
    } else {
      navigate('/home');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authApi.login({ email, password });
      finishLogin(res.data.data); // MỚI SỬA: gom phần lưu + điều hướng vào finishLogin
    } catch (err) {
      // Backend trả 403 khi mật khẩu đúng nhưng email chưa xác nhận -> chuyển sang màn hình nhập mã
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

  // MỚI THÊM: chạy khi người dùng chọn xong tài khoản Google trong cửa sổ của Google
  const handleGoogleSuccess = async (credentialResponse) => {
    setError('');
    setLoading(true);
    try {
      const credential = credentialResponse.credential; // chuỗi ID token do Google cấp
      const res = await authApi.googleLogin({ credential });
      const data = res.data.data;
      if (data.needsRole) {
        // email Google này chưa có tài khoản -> giữ credential lại và chuyển sang bước chọn vai trò
        setGoogleCredential(credential);
        setGoogleProfile(data.profile);
      } else {
        finishLogin(data); // đã có tài khoản -> vào thẳng
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Đăng nhập bằng Google thất bại');
    } finally {
      setLoading(false);
    }
  };

  // MỚI THÊM: chạy khi người dùng bấm "Tiếp tục" ở bước chọn vai trò -> gửi lại credential kèm vai trò để tạo tài khoản
  const handleConfirmRole = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await authApi.googleLogin({ credential: googleCredential, role: googleRole });
      finishLogin(res.data.data);
    } catch (err) {
      // credential của Google chỉ sống khoảng 1 giờ; hết hạn (401) thì bắt người dùng bấm lại nút Google từ đầu
      if (err.response?.status === 401) {
        cancelGoogle();
      }
      setError(err.response?.data?.message || 'Đăng nhập bằng Google thất bại');
    } finally {
      setLoading(false);
    }
  };

  // MỚI THÊM: huỷ bước chọn vai trò, quay lại form đăng nhập bình thường
  const cancelGoogle = () => {
    setGoogleCredential(null);
    setGoogleProfile(null);
    setGoogleRole('SINH_VIEN');
  };

  // MỚI THÊM: màn hình CHỌN VAI TRÒ (chỉ hiện khi email Google chưa có tài khoản)
  if (googleCredential) {
    return (
      <AuthLayout
        title="Chọn vai trò"
        subtitle={`Tài khoản Google ${googleProfile?.email || ''} chưa có trong hệ thống. Bạn là ai?`}
      >
        <div className="auth-field">
          <label>Bạn là</label>
          <div className="auth-role-group">
            {/* Radio 1: Sinh viên — dùng lại class CSS của trang Đăng ký */}
            <label className="auth-role-option">
              <input
                type="radio"
                name="googleRole"
                value="SINH_VIEN"
                checked={googleRole === 'SINH_VIEN'}
                onChange={(e) => setGoogleRole(e.target.value)}
              />
              Sinh viên
            </label>
            {/* Radio 2: Giảng viên hướng dẫn */}
            <label className="auth-role-option">
              <input
                type="radio"
                name="googleRole"
                value="GIANG_VIEN"
                checked={googleRole === 'GIANG_VIEN'}
                onChange={(e) => setGoogleRole(e.target.value)}
              />
              Giảng viên hướng dẫn
            </label>
          </div>
        </div>
        {error && <div className="auth-error">{error}</div>}
        <button type="button" className="auth-submit" onClick={handleConfirmRole} disabled={loading}>
          {loading ? 'Đang tạo tài khoản...' : 'Tiếp tục'}
        </button>
        <p className="auth-switch">
          {/* nút quay lại: chặn hành vi nhảy trang của thẻ a, chỉ huỷ bước chọn vai trò */}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              cancelGoogle();
            }}
          >
            Quay lại
          </a>
        </p>
      </AuthLayout>
    );
  }

  // Màn hình ĐĂNG NHẬP bình thường (có thêm nút Google ở dưới form)
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

      {/* MỚI THÊM: đường kẻ ngăn cách "hoặc" giữa form và nút Google (dùng style trực tiếp nên không cần sửa file CSS) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          margin: '20px 0',
          fontSize: 13,
          opacity: 0.7,
        }}
      >
        <span style={{ flex: 1, height: 1, background: 'currentColor', opacity: 0.3 }} />
        hoặc
        <span style={{ flex: 1, height: 1, background: 'currentColor', opacity: 0.3 }} />
      </div>

      {/* MỚI THÊM: nút Đăng nhập với Google; nếu trình duyệt đang đăng nhập Google sẵn thì nút sẽ gợi ý tài khoản đó */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <GoogleLogin
          onSuccess={handleGoogleSuccess}
          onError={() => setError('Đăng nhập bằng Google thất bại')}
          text="signin_with"
          locale="vi"
        />
      </div>

      <p className="auth-switch">
        Chưa có tài khoản? <Link to="/register">Đăng ký ngay</Link>
      </p>
    </AuthLayout>
  );
}