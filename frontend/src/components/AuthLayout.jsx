import '../styles/auth.css';

export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="auth-page">
      <div className="auth-brand">
        <div className="auth-brand-content">
          <h1 className="auth-brand-title">Quản lý đồ án nhóm, gọn trong một nơi</h1>
          <p className="auth-brand-text">
            Theo dõi tiến độ, phân công công việc và trao đổi với nhóm — mọi thứ bạn cần để hoàn thành đồ án đúng hạn.
          </p>
          <div className="auth-checklist">
            <div className="auth-checklist-item">
              <span className="auth-checklist-dot">✓</span>
              Phân công việc rõ ràng cho từng thành viên
            </div>
            <div className="auth-checklist-item">
              <span className="auth-checklist-dot">✓</span>
              Theo dõi tiến độ theo từng mốc nộp bài
            </div>
            <div className="auth-checklist-item">
              <span className="auth-checklist-dot">✓</span>
              Trao đổi nhóm ngay trong ứng dụng
            </div>
          </div>
        </div>
      </div>

      <div className="auth-form-side">
        <div className="auth-form-box">
          <h2 className="auth-form-title">{title}</h2>
          <p className="auth-form-subtitle">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}