import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTheme, THEMES } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { userApi } from '../services/userApi';
import { groupApi } from '../services/groupApi';
import { supervisorApi } from '../services/supervisorApi'; // lấy danh sách nhóm đang hướng dẫn của Giảng viên
import '../styles/profile.css'; // GIỮ NGUYÊN import cũ: file này có thể chứa class dùng chung cho trang khác (VD role-badge)
import '../styles/profile-page.css'; // MỚI: kiểu riêng cho giao diện mới, mọi class bắt đầu bằng "pf-"

// Chữ hiển thị cho vai trò của tài khoản (User.role) và vai trò trong từng nhóm
const ROLE_LABEL = { SINH_VIEN: 'Sinh viên', GIANG_VIEN: 'Giảng viên' };
const GROUP_ROLE_LABEL = { leader: 'Trưởng nhóm', supervisor: 'Giảng viên hướng dẫn', member: 'Thành viên' };

// Chữ cái đầu của tên, dùng làm ảnh đại diện khi chưa có ảnh (giữ cách cũ của trang)
const getInitials = (name) => name?.slice(0, 2).toUpperCase() || '??';

// Đổi ngày tạo tài khoản thành "MM/YYYY"; ngày hỏng hoặc thiếu thì trả chuỗi rỗng để ẩn dòng "Tham gia từ"
const formatJoined = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

// Chấm độ mạnh mật khẩu từ 0 đến 4 (chỉ để gợi ý, KHÔNG chặn gì; quy tắc bắt buộc vẫn là tối thiểu 6 ký tự)
const STRENGTH_LABEL = ['Tối thiểu 6 ký tự', 'Yếu', 'Trung bình', 'Khá', 'Mạnh'];
const getPasswordScore = (value) => {
  if (value.length < 6) return 0;
  let score = 1; // đủ 6 ký tự
  if (value.length >= 10) score += 1; // dài từ 10 ký tự
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1; // có cả chữ hoa và chữ thường
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1; // có cả số và ký tự đặc biệt
  return score;
};

// Biểu tượng nhỏ vẽ bằng SVG để khỏi phải cài thêm thư viện
function EyeIcon({ off }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

// 1 ô nhập mật khẩu có nút con mắt để hiện / ẩn (state "visible" riêng cho từng ô)
function PasswordField({ id, label, value, onChange, autoComplete }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="pf-field">
      <label className="pf-label" htmlFor={id}>{label}</label>
      <div className="pf-input-wrap">
        <input
          id={id}
          className="pf-input pf-input-pw"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          required
        />
        <button
          type="button"
          className="pf-eye"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        >
          <EyeIcon off={visible} />
        </button>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  // Chọn giao diện - dùng chung với Header.jsx
  const { theme, setTheme } = useTheme();

  // Xác định vai trò để rẽ nhánh giao diện:
  // - Giảng viên: nút quay lại về /supervisor, danh sách là nhóm đang HƯỚNG DẪN, thống kê là nhóm phụ trách + nhận xét
  // - Sinh viên: về /home, danh sách là nhóm đang THAM GIA, thống kê là số nhóm + số việc đã xong
  const isSupervisor = user.role === 'GIANG_VIEN';
  const backPath = isSupervisor ? '/supervisor' : '/home';

  // State cho khối nhóm
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(true);

  // MỚI THÊM: state cho thống kê nhỏ ở thẻ hồ sơ
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // State cho khối "Tên hiển thị"
  const [fullName, setFullName] = useState(user.fullName);
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState('');

  // State cho ảnh đại diện
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [avatarVersion, setAvatarVersion] = useState(Date.now());

  // State cho khối "Đổi mật khẩu" (MỚI THÊM: ô nhập lại mật khẩu mới)
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  useEffect(() => {
    // Gộp 2 nguồn dữ liệu về cùng 1 dạng { id, name, role } để phần hiển thị bên dưới dùng chung
    if (isSupervisor) {
      // Giảng viên: API trả về các bản ghi GroupSupervisor, thông tin nhóm nằm trong s.group
      supervisorApi
        .getMyGroups()
        .then((res) => {
          setGroups(res.data.data.map((s) => ({ id: s.group.id, name: s.group.name, role: 'supervisor' })));
        })
        .catch(() => setGroups([])) // lỗi thì coi như rỗng, không để trang treo
        .finally(() => setLoadingGroups(false));
    } else {
      // Sinh viên: tìm vai trò của mình (leader/member) trong từng nhóm
      groupApi
        .getMyGroups()
        .then((res) => {
          setGroups(
            res.data.data.map((g) => {
              const myMembership = g.members.find((m) => m.userId === user.id);
              return { id: g.id, name: g.name, role: myMembership?.role || 'member' };
            })
          );
        })
        .catch(() => setGroups([]))
        .finally(() => setLoadingGroups(false));
    }

    // MỚI THÊM: lấy thống kê; lỗi thì để null, các ô thống kê tự hiện "—" (không làm hỏng cả trang)
    userApi
      .getStats()
      .then((res) => setStats(res.data.data))
      .catch(() => setStats(null))
      .finally(() => setLoadingStats(false));
  }, []);

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAvatarError('');
    setUploadingAvatar(true);
    try {
      const res = await userApi.uploadAvatar(file);
      updateUser(res.data.data);
      setAvatarVersion(Date.now());
    } catch (err) {
      setAvatarError(err.response?.data?.message || 'Tải ảnh thất bại');
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  // Chỉ cho bấm Lưu khi tên đã đổi và đủ 2 ký tự trở lên
  const trimmedName = fullName.trim();
  const canSaveName = trimmedName !== user.fullName && trimmedName.length >= 2 && !savingName;

  const handleSaveName = async (e) => {
    e.preventDefault();
    if (!canSaveName) return;
    setNameError('');
    setSavingName(true);
    try {
      const res = await userApi.updateProfile({ fullName: trimmedName });
      updateUser(res.data.data);
      setFullName(res.data.data.fullName);
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 1500);
    } catch (err) {
      setNameError(err.response?.data?.message || 'Lưu thất bại');
    } finally {
      setSavingName(false);
    }
  };

  const passwordScore = getPasswordScore(newPassword);
  const confirmTouched = confirmPassword.length > 0;
  const passwordsMatch = newPassword === confirmPassword;

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    // Kiểm tra ngay ở trình duyệt để báo lỗi nhanh (Backend vẫn kiểm tra lại)
    if (newPassword.length < 6) return setPasswordError('Mật khẩu mới cần tối thiểu 6 ký tự');
    if (newPassword !== confirmPassword) return setPasswordError('Hai mật khẩu mới chưa khớp nhau');
    setChangingPassword(true);
    try {
      await userApi.changePassword(currentPassword, newPassword);
      setPasswordSuccess('Đổi mật khẩu thành công');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err.response?.data?.message || 'Đổi mật khẩu thất bại');
    } finally {
      setChangingPassword(false);
    }
  };

  // Hai ô thống kê theo vai trò; chưa có số liệu thì hiện "—". Số nhóm lấy từ stats, không có thì dùng độ dài danh sách nhóm
  const groupCount = stats?.groupCount ?? (loadingGroups ? undefined : groups.length);
  const statTiles = isSupervisor
    ? [
        { label: 'Nhóm phụ trách', value: groupCount },
        { label: 'Nhận xét đã gửi', value: stats?.commentCount },
      ]
    : [
        { label: 'Nhóm tham gia', value: groupCount },
        { label: 'Việc đã xong', value: stats?.completedTasks },
      ];
  const showStat = (value) =>
    loadingStats && value === undefined ? '—' : value === undefined || value === null ? '—' : Number(value).toLocaleString('vi-VN');

  const joined = formatJoined(stats?.joinedAt || user.createdAt);

  return (
    <div className="pf-page">
      <Link to={backPath} className="pf-back">&larr; Quay lại trang chủ</Link>
      <h1 className="pf-title">Thông tin cá nhân</h1>

      {/* ===== Thẻ hồ sơ: ảnh đại diện, tên, email, vai trò, ngày tham gia, thống kê ===== */}
      <div className="pf-card pf-hero">
        <div className="pf-hero-banner" />
        <div className="pf-hero-body">
          <div className="pf-avatar-wrap">
            {user.avatar ? (
              <img
                key={avatarVersion}
                src={`${userApi.getAvatarUrl(user.id)}?v=${avatarVersion}`}
                alt="Ảnh đại diện"
                className="pf-avatar"
              />
            ) : (
              <div className="pf-avatar">{getInitials(user.fullName)}</div>
            )}
            {/* Nút máy ảnh = thẻ label bọc ô chọn file ẩn: bấm vào là mở hộp chọn ảnh */}
            <label
              className={`pf-avatar-edit ${uploadingAvatar ? 'pf-avatar-edit-busy' : ''}`}
              title={uploadingAvatar ? 'Đang tải lên...' : 'Đổi ảnh đại diện'}
            >
              <CameraIcon />
              <input type="file" accept="image/*" hidden onChange={handleAvatarChange} disabled={uploadingAvatar} />
            </label>
          </div>

          <div className="pf-hero-info">
            <h2 className="pf-hero-name">{user.fullName}</h2>
            <p className="pf-hero-email">{user.email}</p>
            <div className="pf-hero-meta">
              <span className="pf-role-badge">{ROLE_LABEL[user.role] || 'Thành viên'}</span>
              {joined && <span className="pf-joined">Tham gia từ {joined}</span>}
            </div>
          </div>

          <div className="pf-stats">
            {statTiles.map((tile) => (
              <div key={tile.label} className="pf-stat">
                <p className="pf-stat-label">{tile.label}</p>
                <p className="pf-stat-value">{showStat(tile.value)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      {avatarError && <div className="pf-error">{avatarError}</div>}

      <div className="pf-grid">
        {/* ===== Cột trái: Thông tin + Giao diện ===== */}
        <div className="pf-col">
          <div className="pf-card pf-card-body">
            <h3 className="pf-card-title">👤 Thông tin</h3>
            <form onSubmit={handleSaveName}>
              <label className="pf-label" htmlFor="pf-name">Tên hiển thị</label>
              <div className="pf-inline-form">
                <input
                  id="pf-name"
                  className="pf-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
                <button type="submit" className="pf-btn" disabled={!canSaveName}>
                  {savingName ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
            </form>
            {nameSaved && <span className="pf-hint-saved">✓ Đã lưu</span>}
            {nameError && <div className="pf-error" style={{ marginTop: 10, marginBottom: 0 }}>{nameError}</div>}
            <p className="pf-note">📧 {user.email} (không thể đổi email)</p>
          </div>

          <div className="pf-card pf-card-body">
            <h3 className="pf-card-title">🎨 Giao diện</h3>
            <div className="pf-theme-grid" role="radiogroup" aria-label="Chọn giao diện">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={theme === t.id}
                  className={`pf-theme ${theme === t.id ? 'pf-theme-active' : ''}`}
                  onClick={() => setTheme(t.id)}
                >
                  {/* data-theme của chính theme này làm các biến --color-* bên trong đổi sang bảng màu đó => khung xem trước luôn đúng màu thật */}
                  <span className="pf-theme-preview" data-theme={t.id}>
                    <span className="pf-theme-bar" />
                    <span className="pf-theme-card">
                      <span className="pf-theme-line" />
                      <span className="pf-theme-line" />
                    </span>
                  </span>
                  <span className="pf-theme-label">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ===== Cột phải: Đổi mật khẩu ===== */}
        <div className="pf-card pf-card-body">
          <h3 className="pf-card-title">🔒 Đổi mật khẩu</h3>
          <form onSubmit={handleChangePassword}>
            <PasswordField
              id="pf-current-password"
              label="Mật khẩu hiện tại"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
            <PasswordField
              id="pf-new-password"
              label="Mật khẩu mới"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            {/* Thanh độ mạnh: tô số vạch bằng điểm, màu theo mức */}
            <div className="pf-strength-row">
              <div className="pf-strength">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={`pf-strength-bar ${i < passwordScore ? `pf-level-${passwordScore}` : ''}`} />
                ))}
              </div>
              <span className="pf-strength-text">
                {newPassword.length === 0 ? STRENGTH_LABEL[0] : passwordScore === 0 ? 'Chưa đủ 6 ký tự' : STRENGTH_LABEL[passwordScore]}
              </span>
            </div>
            <PasswordField
              id="pf-confirm-password"
              label="Nhập lại mật khẩu mới"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
            {confirmTouched && (
              <p className={`pf-match ${passwordsMatch ? 'pf-match-ok' : 'pf-match-bad'}`}>
                {passwordsMatch ? 'Hai mật khẩu khớp nhau' : 'Hai mật khẩu chưa khớp'}
              </p>
            )}
            {passwordError && <div className="pf-error">{passwordError}</div>}
            {passwordSuccess && <div className="pf-success">{passwordSuccess}</div>}
            <button type="submit" className="pf-btn pf-btn-block" disabled={changingPassword}>
              {changingPassword ? 'Đang đổi...' : 'Đổi mật khẩu'}
            </button>
          </form>
        </div>
      </div>

      {/* ===== Danh sách nhóm (tiêu đề và nội dung đổi theo vai trò) ===== */}
      <div className="pf-card pf-card-body">
        <h3 className="pf-card-title">📂 {isSupervisor ? 'Nhóm đang hướng dẫn' : 'Nhóm đang tham gia'}</h3>
        {loadingGroups ? (
          <p className="pf-empty">Đang tải...</p>
        ) : groups.length === 0 ? (
          <p className="pf-empty">{isSupervisor ? 'Bạn chưa hướng dẫn nhóm nào.' : 'Bạn chưa tham gia nhóm nào.'}</p>
        ) : (
          <div className="pf-group-list">
            {groups.map((g) => (
              <Link key={g.id} to={`/groups/${g.id}`} className="pf-group">
                <span className="pf-group-name">{g.name}</span>
                <span className={`pf-group-role pf-group-role-${g.role}`}>{GROUP_ROLE_LABEL[g.role] || 'Thành viên'}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}