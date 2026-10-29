import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { authApi } from '../services/authApi';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';

const RESEND_SECONDS = 60; // phải khớp RESEND_COOLDOWN_SECONDS ở Backend (auth.service.js)

export default function VerifyEmail() {
  const navigate = useNavigate();
  const location = useLocation(); // đọc dữ liệu do trang Đăng ký / Đăng nhập gửi sang qua navigate(..., { state })
  const { login } = useAuth();

  // Email được truyền từ trang trước; nếu người dùng tải lại trang thì trình duyệt vẫn giữ state này
  const [email, setEmail] = useState(location.state?.email || '');
  const [code, setCode] = useState(''); // mã 6 số người dùng đang gõ
  const [error, setError] = useState('');
  // Thông báo nhẹ nhàng (không phải lỗi): tuỳ nơi đến mà nội dung khác nhau
  const [info, setInfo] = useState(
    location.state?.justSent
      ? 'Mã xác nhận gồm 6 số đã được gửi tới email của bạn. Nếu chưa thấy, hãy kiểm tra cả mục Spam.'
      : location.state?.fromLogin
      ? 'Email này chưa được xác nhận. Hãy nhập mã đã gửi, hoặc bấm "Gửi lại mã" để nhận mã mới.'
      : ''
  );
  const [loading, setLoading] = useState(false); // đang gửi mã lên Backend để kiểm tra
  const [resending, setResending] = useState(false); // đang gửi yêu cầu "Gửi lại mã"
  // Đếm ngược chờ gửi lại: vừa đăng ký xong thì mail vừa được gửi nên bắt đầu đếm ngay 60 giây
  const [countdown, setCountdown] = useState(location.state?.justSent ? RESEND_SECONDS : 0);

  // Mỗi giây giảm bộ đếm đi 1 cho tới khi về 0; cleanup để không chạy timer thừa khi rời trang
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // Chỉ cho gõ chữ số và tối đa 6 ký tự (\D = mọi ký tự KHÔNG phải số)
  const handleCodeChange = (e) => {
    setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
  };

  // Bấm "Xác nhận": gửi email + mã lên Backend
  const handleSubmit = async (e) => {
    e.preventDefault(); // chặn reload trang mặc định của form
    setError('');
    if (!email) return setError('Vui lòng nhập email');
    if (code.length !== 6) return setError('Mã xác nhận gồm đúng 6 chữ số');

    setLoading(true);
    try {
      const res = await authApi.verifyEmail({ email, code });
      // Mã đúng -> Backend trả luôn user + token, đăng nhập giống như trang Login
      const { user, token } = res.data.data;
      login(user, token);
      // Giảng viên vào Dashboard riêng, Sinh viên vào trang chủ (giống Login.jsx)
      navigate(user.role === 'GIANG_VIEN' ? '/supervisor' : '/home');
    } catch (err) {
      setError(err.response?.data?.message || 'Xác nhận thất bại');
    } finally {
      setLoading(false);
    }
  };

  // Bấm "Gửi lại mã"
  const handleResend = async () => {
    if (countdown > 0 || resending) return; // đang chờ hoặc đang gửi thì bỏ qua
    if (!email) return setError('Vui lòng nhập email');
    setError('');
    setResending(true);
    try {
      await authApi.resendCode({ email });
      setInfo('Đã gửi mã mới. Mã cũ không còn dùng được nữa.');
      setCode(''); // xoá mã cũ đang gõ dở
      setCountdown(RESEND_SECONDS); // bắt đầu đếm ngược lại
    } catch (err) {
      // Backend báo 429 kèm số giây còn phải chờ, hiển thị nguyên văn
      setError(err.response?.data?.message || 'Gửi lại mã thất bại');
    } finally {
      setResending(false);
    }
  };

  // Kiểu cho nút chữ "Gửi lại mã" (dùng inline vì chưa có class riêng trong CSS của trang Auth)
  const resendButtonStyle = {
    background: 'none',
    border: 'none',
    padding: 0,
    fontWeight: 600,
    cursor: countdown > 0 || resending ? 'not-allowed' : 'pointer',
    color: countdown > 0 || resending ? 'var(--color-text-secondary, #6B7280)' : 'var(--color-accent, #FC636B)',
  };

  return (
    <AuthLayout title="Xác nhận email" subtitle="Nhập mã 6 số đã gửi tới email của bạn">
      <form onSubmit={handleSubmit}>
        {/* Không có email từ trang trước (VD mở thẳng /verify-email) thì cho tự nhập; có rồi thì chỉ hiển thị */}
        {location.state?.email ? (
          <p style={{ marginBottom: 16 }}>
            Mã đã được gửi tới <b>{email}</b>
          </p>
        ) : (
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
        )}

        <div className="auth-field">
          <label>Mã xác nhận</label>
          <input
            value={code}
            onChange={handleCodeChange}
            inputMode="numeric" // bật bàn phím số trên điện thoại
            autoComplete="one-time-code" // cho trình duyệt gợi ý điền mã
            maxLength={6}
            placeholder="______"
            style={{ textAlign: 'center', fontSize: 22, letterSpacing: 8 }}
            required
          />
        </div>

        {info && !error && (
          <div style={{ color: 'var(--color-text-secondary, #6B7280)', fontSize: 14, marginBottom: 12 }}>
            {info}
          </div>
        )}
        {error && <div className="auth-error">{error}</div>}

        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? 'Đang xác nhận...' : 'Xác nhận'}
        </button>
      </form>

      <p className="auth-switch">
        Chưa nhận được mã?{' '}
        <button type="button" onClick={handleResend} disabled={countdown > 0 || resending} style={resendButtonStyle}>
          {resending ? 'Đang gửi...' : countdown > 0 ? `Gửi lại mã (${countdown}s)` : 'Gửi lại mã'}
        </button>
      </p>
      <p className="auth-switch">
        <Link to="/login">Quay lại đăng nhập</Link>
      </p>
    </AuthLayout>
  );
}