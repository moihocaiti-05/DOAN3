import NotificationBell from '../components/NotificationBell';
import { useState, useEffect } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom'; // MỚI SỬA: thêm Navigate để chuyển hướng Giảng viên
import { useAuth } from '../context/AuthContext';
import { groupApi } from '../services/groupApi';
import { userApi } from '../services/userApi'; // MỚI THÊM: dùng để dựng URL ảnh đại diện
import CreateGroupModal from '../components/CreateGroupModal';
import JoinGroupModal from '../components/JoinGroupModal';
import '../styles/home.css';

export default function Home() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  // Hàm gọi API lấy danh sách nhóm, tái sử dụng sau khi tạo/tham gia nhóm mới
  const loadGroups = async () => {
    setLoading(true);
    try {
      const res = await groupApi.getMyGroups();
      setGroups(res.data.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // MỚI THÊM: Giảng viên sẽ bị chuyển sang /supervisor nên không cần tải danh sách nhóm ở đây làm gì
    if (user?.role === 'GIANG_VIEN') return;
    loadGroups();
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Tìm vai trò của user hiện tại trong 1 nhóm cụ thể, để hiển thị badge Leader/Member
  const getMyRole = (group) => {
    const membership = group.members.find((m) => m.userId === user.id);
    return membership?.role || 'member';
  };

  // MỚI THÊM: lấy 2 ký tự đầu của tên, dùng làm avatar dự phòng khi user chưa có ảnh đại diện thật
  const getInitials = (name) => name?.slice(0, 2).toUpperCase() || '??';

  // MỚI THÊM: Giảng viên không dùng trang này (trang /home chỉ liệt kê nhóm mà mình là THÀNH VIÊN,
  // còn nhóm Giảng viên phụ trách nằm ở /supervisor) - đặt SAU tất cả hook (useState/useEffect) ở trên
  // vì React yêu cầu hook luôn được gọi đủ số lần ở mỗi lần render
  if (user?.role === 'GIANG_VIEN') {
    return <Navigate to="/supervisor" replace />;
  }

  return (
    <div className="home-page">
      <header className="home-header">
        <div className="home-logo">Quản lý đồ án</div>
        <div className="home-user-info">
            <NotificationBell />
            {/* MỚI SỬA: bọc avatar + tên trong <Link> để bấm vào mở trang Profile, không chuyển thành nút logout nhầm */}
            <Link to="/profile" className="home-user-link">
              {user?.avatar ? (
                <img src={userApi.getAvatarUrl(user.id)} alt="avatar" className="home-user-avatar" />
              ) : (
                <span className="home-user-avatar home-user-avatar-fallback">
                  {getInitials(user?.fullName)}
                </span>
              )}
              <span>{user?.fullName}</span>
            </Link>
              <button className="home-logout-btn" onClick={handleLogout}>
                    Đăng xuất
              </button>
      </div>
      </header>

      <main className="home-content">
        <div className="home-content-header">
          <h1 className="home-title">Nhóm của tôi</h1>
          <div className="home-actions">
            <button className="btn-secondary" onClick={() => setShowJoinModal(true)}>
              Tham gia nhóm
            </button>
            <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
              + Tạo nhóm mới
            </button>
          </div>
        </div>

        {loading ? (
          <p>Đang tải...</p>
        ) : groups.length === 0 ? (
          <div className="empty-state">
            <p>Bạn chưa có nhóm nào. Tạo nhóm mới hoặc tham gia bằng mã mời.</p>
          </div>
        ) : (
          <div className="group-grid">
            {groups.map((group) => (
              <div
                key={group.id}
                className="group-card"
                onClick={() => navigate(`/groups/${group.id}`)}
              >
                <h3 className="group-card-name">{group.name}</h3>
                <p className="group-card-desc">{group.description || 'Chưa có mô tả'}</p>
                <div className="group-card-footer">
                  <span>{group.members.length} thành viên</span>
                  <span className={`role-badge ${getMyRole(group)}`}>
                    {getMyRole(group) === 'leader' ? 'Trưởng nhóm' : 'Thành viên'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <CreateGroupModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={loadGroups}
      />
      <JoinGroupModal
        isOpen={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        onJoined={loadGroups}
      />
    </div>
  );
}