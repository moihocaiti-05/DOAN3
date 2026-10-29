import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom'; // Link để avatar + tên bấm được sang trang cá nhân
import { useAuth } from '../context/AuthContext';
import { supervisorApi } from '../services/supervisorApi';
import { userApi } from '../services/userApi'; // dùng để dựng URL ảnh đại diện thật (giống Home.jsx)
import NotificationBell from '../components/NotificationBell';
import PendingReviewBox from '../components/PendingReviewBox'; // MỚI THÊM (tính năng 1): hộp "Việc chờ tôi duyệt"
import UpcomingDeadlinesBox from '../components/UpcomingDeadlinesBox'; // MỚI THÊM (tính năng 5): hộp "Sắp đến hạn"
import RemindGroupModal from '../components/RemindGroupModal'; // MỚI THÊM (tính năng 2): hộp thoại "Nhắc nhóm"
import ContributionModal from '../components/ContributionModal'; // MỚI THÊM (tính năng 3): hộp thoại "Đóng góp" từng thành viên
import '../styles/supervisor-dashboard.css'; // CSS RIÊNG của Giảng viên, không dùng chung home.css với Sinh viên
import '../styles/supervisor-export.css'; // MỚI THÊM (tính năng 4): nút "Xuất Excel"

// Chữ hiển thị cho 3 trạng thái nhóm (Backend trả về status là 'late' | 'idle' | 'ok')
const STATUS_LABEL = { late: 'Trễ hạn', idle: 'Ít hoạt động', ok: 'Đang ổn' };
// Thứ tự "nặng" -> "nhẹ": dùng để sắp xếp, nhóm có vấn đề nổi lên đầu
const STATUS_RANK = { late: 0, idle: 1, ok: 2 };

// Các cột của bảng: key là khóa sắp xếp, label là tiêu đề cột
const COLUMNS = [
  { key: 'name', label: 'Nhóm' },
  { key: 'progress', label: 'Tiến độ' },
  { key: 'lateTasks', label: 'Trễ hạn' },
  { key: 'idleDays', label: 'Hoạt động' },
  { key: 'status', label: 'Trạng thái' },
];

// Câu mô tả lần hoạt động gần nhất
const activityText = (g) => {
  if (!g.lastActivityAt) return 'Chưa có hoạt động';
  return g.idleDays === 0 ? 'Hôm nay' : `${g.idleDays} ngày trước`;
};

// Lấy giá trị để so sánh theo từng cột
const getSortValue = (g, key) => {
  if (key === 'name') return g.name.toLowerCase();
  if (key === 'status') return STATUS_RANK[g.status];
  return g[key];
};

// Huy hiệu trạng thái (chấm màu + chữ)
function StatusBadge({ status }) {
  return <span className={`sv-status sv-status-${status}`}>{STATUS_LABEL[status]}</span>;
}

// Thanh tiến độ + số phần trăm
function Progress({ value }) {
  return (
    <div className="sv-progress">
      <div className="sv-progress-track">
        <div className="sv-progress-fill" style={{ width: `${value}%` }} />
      </div>
      <span className="sv-progress-text">{value}%</span>
    </div>
  );
}

// Trang chủ RIÊNG cho tài khoản Giảng viên - thay thế hoàn toàn trang Home của Sinh viên
// MỚI SỬA (Phiên 7): từ danh sách thẻ đơn giản thành BẢNG TỔNG QUAN (thẻ số liệu, lọc theo trạng thái, sắp xếp, chuyển Bảng/Thẻ)
export default function SupervisorDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [groups, setGroups] = useState([]); // mỗi phần tử là 1 nhóm đã tính sẵn số liệu (xem getSupervisorOverview ở Backend)
  const [idleDays, setIdleDays] = useState(7); // ngưỡng "ít hoạt động" do Backend trả về
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filter, setFilter] = useState('all'); // 'all' | 'late' | 'idle' | 'ok'
  const [view, setView] = useState('table'); // 'table' | 'card'
  const [sortKey, setSortKey] = useState('status'); // mặc định: nhóm có vấn đề lên đầu
  const [sortDir, setSortDir] = useState(1); // 1 = tăng dần, -1 = giảm dần
  const [remindGroup, setRemindGroup] = useState(null); // MỚI THÊM (tính năng 2): nhóm đang mở hộp thoại "Nhắc nhóm" (null = đóng)
  const [contribGroup, setContribGroup] = useState(null); // MỚI THÊM (tính năng 3): nhóm đang mở hộp thoại "Đóng góp" (null = đóng)
  const [exporting, setExporting] = useState(false); // MỚI THÊM (tính năng 4): đang tải file Excel (khóa nút để không bấm 2 lần)
  const [exportError, setExportError] = useState(''); // MỚI THÊM (tính năng 4): câu báo lỗi khi xuất thất bại

  useEffect(() => {
    supervisorApi
      .getOverview()
      .then((res) => {
        setGroups(res.data.data.groups);
        setIdleDays(res.data.data.idleThresholdDays);
      })
      .catch(() => setError('Không tải được danh sách nhóm. Hãy tải lại trang.'))
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Lấy 2 ký tự đầu của tên, dùng làm avatar dự phòng khi user chưa có ảnh đại diện thật
  const getInitials = (name) => name?.slice(0, 2).toUpperCase() || '??';

  // Bấm tiêu đề cột: cùng cột thì đảo chiều, khác cột thì sắp tăng dần theo cột đó
  const handleSort = (key) => {
    if (key === sortKey) setSortDir((d) => -d);
    else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  // Đếm số nhóm theo trạng thái (dùng cho thẻ số liệu và nút lọc)
  const count = (s) => groups.filter((g) => g.status === s).length;

  // Lọc rồi sắp xếp; cùng giá trị thì xếp theo tên để thứ tự ổn định
  const visible = groups
    .filter((g) => filter === 'all' || g.status === filter)
    .sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      let result = typeof va === 'string' ? va.localeCompare(vb, 'vi') : va - vb;
      if (result === 0) result = a.name.localeCompare(b.name, 'vi');
      return result * sortDir;
    });

  const openGroup = (id) => navigate(`/groups/${id}`);

  // MỚI THÊM (tính năng 2): mở hộp thoại nhắc nhóm; stopPropagation để bấm nút không bị tính là bấm cả dòng/thẻ (mở nhóm)
  const openRemind = (e, group) => {
    e.stopPropagation();
    setRemindGroup(group);
  };

  // MỚI THÊM (tính năng 3): mở hộp thoại đóng góp; cũng stopPropagation vì lý do như trên
  const openContribution = (e, group) => {
    e.stopPropagation();
    setContribGroup(group);
  };

  // MỚI THÊM (tính năng 4): tải file Excel tổng hợp tất cả nhóm
  const handleExport = async () => {
    setExporting(true);
    setExportError('');
    try {
      const res = await supervisorApi.exportAll();
      // Biến dữ liệu nhị phân thành link tải tạm rồi tự bấm để trình duyệt lưu file
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `tong-hop-cac-nhom-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      // Vì responseType là 'blob', câu báo lỗi của Backend cũng nằm trong 1 Blob: phải đọc ra chữ rồi mới lấy được "message"
      let message = 'Xuất Excel thất bại, hãy thử lại.';
      try {
        const blob = err.response?.data;
        if (blob && typeof blob.text === 'function') {
          message = JSON.parse(await blob.text()).message || message;
        }
      } catch {
        // không đọc được thì giữ câu báo lỗi chung
      }
      setExportError(message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="sv-page">
      <header className="sv-header">
        <div className="sv-logo">Quản lý đồ án - Giảng viên hướng dẫn</div>
        <div className="sv-user-info">
          <NotificationBell />
          {/* Bấm vào mở trang cá nhân (đổi giao diện màu, đổi mật khẩu, đổi ảnh đại diện) */}
          <Link to="/profile" className="sv-user-link">
            {/* Có ảnh đại diện thật thì hiện ảnh, chưa có thì hiện 2 chữ cái đầu */}
            {user?.avatar ? (
              <img src={userApi.getAvatarUrl(user.id)} alt="avatar" className="sv-avatar" />
            ) : (
              <span className="sv-avatar sv-avatar-fallback">
                {getInitials(user?.fullName)}
              </span>
            )}
            <span>{user?.fullName}</span>
          </Link>
          <button className="sv-logout-btn" onClick={handleLogout}>
            Đăng xuất
          </button>
        </div>
      </header>

      <main className="sv-content">
        <div className="sv-content-header">
          <h1 className="sv-title">Các nhóm tôi hướng dẫn</h1>
          {/* Không có nút "Tạo nhóm"/"Tham gia nhóm" như Sinh viên - Giảng viên chỉ được nhóm khác MỜI vào, không tự tạo/tham gia */}
        </div>

        {loading ? (
          <p>Đang tải...</p>
        ) : error ? (
          <div className="sv-empty">
            <p>{error}</p>
          </div>
        ) : groups.length === 0 ? (
          <div className="sv-empty">
            <p>Bạn chưa được mời phụ trách nhóm nào. Khi 1 nhóm mời bạn qua email, hãy vào chuông thông báo để Đồng ý.</p>
          </div>
        ) : (
          <>
            {/* MỚI THÊM (tính năng 1): việc đang chờ Giảng viên duyệt, đặt trên cùng vì đây là việc cần hành động */}
            <PendingReviewBox />

            {/* MỚI THÊM (tính năng 5): việc và mốc sắp đến hạn của mọi nhóm, kèm việc đã trễ */}
            <UpcomingDeadlinesBox />

            {/* Hàng thẻ số liệu: nhìn là biết nhóm nào cần chú ý */}
            <div className="sv-stats">
              <div className="sv-stat">
                <p className="sv-stat-label">Nhóm hướng dẫn</p>
                <p className="sv-stat-value">{groups.length}</p>
              </div>
              <div className="sv-stat">
                <p className="sv-stat-label">Có việc trễ hạn</p>
                <p className="sv-stat-value">{count('late')}</p>
              </div>
              <div className="sv-stat">
                <p className="sv-stat-label">Ít hoạt động ({idleDays} ngày)</p>
                <p className="sv-stat-value">{count('idle')}</p>
              </div>
              <div className="sv-stat">
                <p className="sv-stat-label">Đang ổn</p>
                <p className="sv-stat-value">{count('ok')}</p>
              </div>
            </div>

            {/* Thanh công cụ: lọc theo trạng thái (trái), xuất Excel và chuyển Bảng/Thẻ (phải) */}
            <div className="sv-toolbar">
              {[
                ['all', `Tất cả (${groups.length})`],
                ['late', `Trễ hạn (${count('late')})`],
                ['idle', `Ít hoạt động (${count('idle')})`],
                ['ok', `Đang ổn (${count('ok')})`],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={`sv-chip ${filter === key ? 'sv-chip-active' : ''}`}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
              <span className="sv-toolbar-spacer" />
              {/* MỚI THÊM (tính năng 4): xuất Excel tổng hợp (1 sheet tổng hợp + 1 sheet chi tiết cho từng nhóm) */}
              <button className="ex-btn" onClick={handleExport} disabled={exporting}>
                {exporting ? 'Đang xuất...' : 'Xuất Excel'}
              </button>
              <button
                className={`sv-chip ${view === 'table' ? 'sv-chip-active' : ''}`}
                onClick={() => setView('table')}
              >
                Bảng
              </button>
              <button
                className={`sv-chip ${view === 'card' ? 'sv-chip-active' : ''}`}
                onClick={() => setView('card')}
              >
                Thẻ
              </button>
            </div>

            {exportError && <p className="ex-error">{exportError}</p>}

            {visible.length === 0 ? (
              <div className="sv-empty">
                <p>Không có nhóm nào khớp bộ lọc.</p>
              </div>
            ) : view === 'table' ? (
              <div className="sv-table-wrap">
                <table className="sv-table">
                  <thead>
                    <tr>
                      {COLUMNS.map((c) => (
                        <th key={c.key} className="sv-th" onClick={() => handleSort(c.key)}>
                          {c.label}
                          {/* Mũi tên chỉ hiện ở cột đang được sắp xếp */}
                          {sortKey === c.key ? (sortDir === 1 ? ' ▲' : ' ▼') : ''}
                        </th>
                      ))}
                      {/* MỚI THÊM (tính năng 2): cột chứa các nút hành động, không sắp xếp được */}
                      <th className="sv-th" />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((g) => (
                      <tr key={g.id} className="sv-row" onClick={() => openGroup(g.id)}>
                        <td className="sv-td">
                          <div className="sv-cell-name">{g.name}</div>
                          <p className="sv-cell-sub">{g.doneTasks}/{g.totalTasks} việc xong</p>
                        </td>
                        <td className="sv-td"><Progress value={g.progress} /></td>
                        <td className="sv-td">
                          {g.lateTasks > 0 ? (
                            <span className="sv-late-count">{g.lateTasks} việc</span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="sv-td">{activityText(g)}</td>
                        <td className="sv-td"><StatusBadge status={g.status} /></td>
                        <td className="sv-td">
                          <div className="ct-actions">
                            <button className="ct-btn" onClick={(e) => openContribution(e, g)}>Đóng góp</button>
                            <button className="rm-btn" onClick={(e) => openRemind(e, g)}>Nhắc nhóm</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="sv-grid">
                {visible.map((g) => (
                  <div key={g.id} className="sv-card" onClick={() => openGroup(g.id)}>
                    <div className="sv-card-top">
                      <h3 className="sv-card-name">{g.name}</h3>
                      <StatusBadge status={g.status} />
                    </div>
                    <p className="sv-card-desc">{g.description || 'Chưa có mô tả'}</p>
                    <Progress value={g.progress} />
                    <div className="sv-card-meta">
                      <span>{g.doneTasks}/{g.totalTasks} việc xong</span>
                      <span>{g.lateTasks > 0 ? `${g.lateTasks} việc trễ hạn` : 'Không trễ hạn'}</span>
                    </div>
                    <p className="sv-card-time">Hoạt động: {activityText(g)}</p>
                    <div className="ct-actions ct-actions-card">
                      <button className="ct-btn" onClick={(e) => openContribution(e, g)}>Đóng góp</button>
                      <button className="rm-btn" onClick={(e) => openRemind(e, g)}>Nhắc nhóm</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* MỚI THÊM (tính năng 2): hộp thoại nhập lời nhắn, chỉ hiện khi đã chọn 1 nhóm */}
      {remindGroup && <RemindGroupModal group={remindGroup} onClose={() => setRemindGroup(null)} />}

      {/* MỚI THÊM (tính năng 3): hộp thoại bảng đóng góp, chỉ hiện khi đã chọn 1 nhóm */}
      {contribGroup && <ContributionModal group={contribGroup} onClose={() => setContribGroup(null)} />}
    </div>
  );
}