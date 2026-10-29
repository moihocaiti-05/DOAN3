import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import socket from '../services/socket';
import { notificationApi } from '../services/notificationApi';
import { friendApi } from '../services/friendApi'; // MỚI THÊM: lời mời kết bạn đi qua API kết bạn
import { useAuth } from '../context/AuthContext';
import '../styles/notification.css';

// Icon nhãn theo từng loại thông báo, để dễ nhận diện nhanh khi nhìn lướt
const TYPE_ICON = {
  task_assigned: '📋',
  promoted_leader: '👑',
  removed_from_group: '🚪',
  deadline_reminder: '⏰',
  group_invite: '✉️', // MỚI THÊM: mời tham gia nhóm
  supervisor_invited: '🎓', // MỚI THÊM: mời làm giảng viên hướng dẫn
  friend_request: '🤝', // MỚI THÊM: có người gửi lời mời kết bạn
  friend_accepted: '✅', // MỚI THÊM: có người đồng ý kết bạn
};

// MỚI SỬA: danh sách loại thông báo là "lời mời" cần hiện nút Đồng ý/Từ chối - thêm lời mời kết bạn
const INVITE_TYPES = ['group_invite', 'supervisor_invited', 'friend_request'];

// Chuông thông báo - đặt ở header, dùng chung cho MỌI trang (không chỉ trang nhóm)
export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  // lưu id thông báo đang gửi request Đồng ý/Từ chối, để disable đúng 2 nút của thông báo đó (tránh bấm đúp)
  const [respondingId, setRespondingId] = useState(null);
  const dropdownRef = useRef(null);
  // MỚI THÊM: ref phản ánh dropdown đang mở hay đóng, để handler socket (tạo 1 lần) đọc được giá trị mới nhất
  const showDropdownRef = useRef(false);

  useEffect(() => {
    showDropdownRef.current = showDropdown;
  }, [showDropdown]);

  useEffect(() => {
    if (!user) return;
    notificationApi.getUnreadCount().then((res) => setUnreadCount(res.data.data.count));
  }, [user]);

  useEffect(() => {
    if (!user) return;

    socket.emit('join_notifications', user.id);

    const handleNewNotification = (notification) => {
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((prev) => prev + 1);
    };
    socket.on('new_notification', handleNewNotification);

    // MỚI THÊM: dữ liệu kết bạn vừa thay đổi (VD lời mời đã được đồng ý / từ chối / hủy ở chỗ khác như khung chat)
    // -> tải lại số chưa đọc, và nếu dropdown đang mở thì tải lại cả danh sách để thông báo lỗi thời biến mất
    const handleFriendUpdated = async () => {
      try {
        const countRes = await notificationApi.getUnreadCount();
        setUnreadCount(countRes.data.data.count);
        if (showDropdownRef.current) {
          const listRes = await notificationApi.getMy();
          setNotifications(listRes.data.data);
        }
      } catch (err) {
        // lỗi mạng thì bỏ qua, lần mở chuông sau sẽ tải lại
      }
    };
    socket.on('friend_updated', handleFriendUpdated);

    return () => {
      socket.off('new_notification', handleNewNotification);
      socket.off('friend_updated', handleFriendUpdated); // MỚI THÊM: gỡ bộ lắng nghe khi rời trang
    };
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = async () => {
    const opening = !showDropdown;
    setShowDropdown(opening);

    if (opening) {
      const res = await notificationApi.getMy();
      setNotifications(res.data.data);

      if (unreadCount > 0) {
        await notificationApi.markAllAsRead();
        setUnreadCount(0);
      }
    }
  };

  const handleClickItem = (notification) => {
    // nếu là loại "lời mời", bấm vào phần chữ không điều hướng đi đâu cả
    // (bắt buộc phải bấm đúng nút Đồng ý/Từ chối), tránh người dùng bấm nhầm rồi rời khỏi trang
    if (INVITE_TYPES.includes(notification.type)) return;

    setShowDropdown(false);
    if (notification.groupId) {
      navigate(`/groups/${notification.groupId}`);
    }
  };

  // MỚI SỬA: xử lý khi bấm nút Đồng ý hoặc Từ chối - giờ nhận cả đối tượng thông báo (không chỉ id) để biết loại nào
  const handleRespond = async (e, notification, action) => {
    e.stopPropagation(); // chặn không cho nổi bọt lên handleClickItem của thẻ cha
    setRespondingId(notification.id);
    try {
      if (notification.type === 'friend_request') {
        // MỚI THÊM: lời mời kết bạn -> gọi thẳng API kết bạn (referenceId chính là id lời mời).
        // Backend tự xóa thông báo và báo "friend_updated" cho mục "Lời mời kết bạn" trong khung chat cùng cập nhật
        if (action === 'accept') {
          await friendApi.accept(notification.referenceId);
        } else {
          await friendApi.remove(notification.referenceId);
        }
      } else {
        // Lời mời vào nhóm / làm Giảng viên: giữ nguyên cách cũ
        await notificationApi.respond(notification.id, action);
      }
      // Xóa thông báo này khỏi danh sách hiển thị ngay (Backend cũng đã xóa nó sau khi xử lý xong)
      setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
    } catch (err) {
      alert(err.response?.data?.message || 'Có lỗi xảy ra, thử lại sau');
      // MỚI THÊM: lời mời có thể đã được xử lý ở nơi khác (VD bên khung chat) -> tải lại danh sách để thông báo cũ biến mất
      try {
        const res = await notificationApi.getMy();
        setNotifications(res.data.data);
      } catch (reloadErr) {
        // bỏ qua nếu tải lại cũng lỗi
      }
    } finally {
      setRespondingId(null);
    }
  };

  const formatTime = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="notification-bell-wrapper" ref={dropdownRef}>
      <button className="notification-bell-btn" onClick={handleToggle}>
        🔔
        {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
      </button>

      {showDropdown && (
        <div className="notification-dropdown">
          <div className="notification-dropdown-title">Thông báo</div>
          {notifications.length === 0 ? (
            <p className="notification-empty">Chưa có thông báo nào.</p>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className="notification-item"
                onClick={() => handleClickItem(n)}
              >
                <span className="notification-icon">{TYPE_ICON[n.type] || '🔔'}</span>
                <div className="notification-content">
                  <div className="notification-text">{n.content}</div>
                  <div className="notification-time">{formatTime(n.createdAt)}</div>

                  {/* chỉ hiện 2 nút này với thông báo thuộc loại "lời mời" (gồm cả lời mời kết bạn) */}
                  {INVITE_TYPES.includes(n.type) && (
                    <div className="notification-invite-actions">
                      <button
                        className="notification-btn-accept"
                        disabled={respondingId === n.id}
                        onClick={(e) => handleRespond(e, n, 'accept')}
                      >
                        Đồng ý
                      </button>
                      <button
                        className="notification-btn-decline"
                        disabled={respondingId === n.id}
                        onClick={(e) => handleRespond(e, n, 'decline')}
                      >
                        Từ chối
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}