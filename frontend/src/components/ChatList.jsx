import { useState, useEffect } from 'react';
import socket from '../services/socket';
import { conversationApi } from '../services/conversationApi';
import { friendApi } from '../services/friendApi';
import ConfirmDialog from './ConfirmDialog'; // MỚI THÊM: hộp xác nhận tự làm, thay cho window.confirm
import '../styles/chat-rooms.css';
import '../styles/chat-friends.css'; // kiểu giao diện cho phần kết bạn

// Lấy chữ cái đầu của tên để làm ảnh đại diện tròn (tránh phụ thuộc cách dựng đường dẫn avatar)
const initialOf = (name) => (name || '?').trim().charAt(0).toUpperCase();

// Chấm số tin chưa đọc bên phải mỗi dòng - không hiện gì nếu số là 0
function UnreadBadge({ count }) {
  if (!count || count <= 0) return null;
  return <span className="chatlist-badge">{count > 9 ? '9+' : count}</span>;
}

// Danh sách các cuộc trò chuyện + bạn bè của 1 nhóm đồ án
// unreadByConv: { [conversationId]: số tin chưa đọc } - cho các nhóm chat chung
// unreadByPerson: { [userId]: số tin chưa đọc } - cho chat riêng (khóa theo id người gửi), dùng cho cả thành viên nhóm lẫn bạn bè
// onOpenGroupChat(): mở chat cả nhóm; onOpenConversation(conversation, title): mở 1 phòng chat
export default function ChatList({
  groupId,
  unreadByConv,
  unreadByPerson,
  onOpenGroupChat,
  onOpenConversation,
}) {
  const [people, setPeople] = useState([]);         // những người cùng nhóm đồ án (trừ mình)
  const [groupChats, setGroupChats] = useState([]); // các nhóm chat con mình đang tham gia
  // dữ liệu bạn bè - friends: đã là bạn; incoming: lời mời mình nhận; outgoing: lời mời mình đã gửi
  const [friendData, setFriendData] = useState({ friends: [], incoming: [], outgoing: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');          // thông báo thành công (VD "Đã gửi lời mời kết bạn")
  const [openingId, setOpeningId] = useState('');    // id người đang được mở chat riêng - chặn bấm 2 lần liên tiếp

  // State của màn hình "Tạo nhóm chat mới"
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // State của màn hình "Thêm bạn bằng email"
  const [addingFriend, setAddingFriend] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [friendSubmitting, setFriendSubmitting] = useState(false);

  // MỚI THÊM: người bạn đang chờ xác nhận hủy kết bạn (null = hộp xác nhận đang đóng)
  const [unfriendTarget, setUnfriendTarget] = useState(null);

  // tải lại riêng dữ liệu bạn bè (sau mỗi thao tác kết bạn, hoặc khi có người khác thay đổi)
  const loadFriends = async () => {
    try {
      const res = await friendApi.getAll();
      setFriendData(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Không tải được danh sách bạn bè');
    }
  };

  // Tải người cùng nhóm, nhóm chat con và bạn bè cùng lúc khi màn hình này hiện ra
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      conversationApi.getPeople(groupId),
      conversationApi.getGroupChats(groupId),
      friendApi.getAll(),
    ])
      .then(([peopleRes, chatsRes, friendRes]) => {
        if (cancelled) return;
        setPeople(peopleRes.data.data);
        setGroupChats(chatsRes.data.data);
        setFriendData(friendRes.data.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || 'Không tải được danh sách trò chuyện');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  // khi người khác mời / đồng ý / từ chối / hủy kết bạn với mình, Backend báo "friend_updated" -> tải lại danh sách ngay
  useEffect(() => {
    const handleFriendUpdated = () => {
      loadFriends();
    };
    socket.on('friend_updated', handleFriendUpdated);
    return () => {
      socket.off('friend_updated', handleFriendUpdated);
    };
  }, []);

  // Bấm vào 1 người (thành viên nhóm hoặc bạn bè) -> mở (hoặc tạo) chat riêng với người đó
  const handleOpenPrivate = async (person) => {
    if (openingId) return;
    setError('');
    setNotice('');
    setOpeningId(person.id);
    try {
      const res = await conversationApi.openPrivate(person.id, groupId);
      onOpenConversation(res.data.data, person.fullName);
    } catch (err) {
      setError(err.response?.data?.message || 'Không mở được cuộc trò chuyện');
    } finally {
      setOpeningId('');
    }
  };

  // chạy 1 thao tác kết bạn rồi tải lại danh sách bạn bè
  // action() có thể trả về 1 chuỗi để hiện làm thông báo thành công
  const runFriendAction = async (action) => {
    setError('');
    setNotice('');
    try {
      const message = await action();
      if (message) setNotice(message);
      await loadFriends();
    } catch (err) {
      setError(err.response?.data?.message || 'Thao tác thất bại');
    }
  };

  // bấm "+ Kết bạn" cạnh 1 thành viên trong nhóm
  const handleAddFromGroup = (person) =>
    runFriendAction(async () => {
      const res = await friendApi.requestInGroup(person.id, groupId);
      // autoAccepted = người kia đã mời mình từ trước nên 2 bên thành bạn bè ngay
      return res.data.data.autoAccepted ? 'Hai bạn đã trở thành bạn bè' : 'Đã gửi lời mời kết bạn';
    });

  // Đồng ý 1 lời mời
  const handleAccept = (request) =>
    runFriendAction(async () => {
      await friendApi.accept(request.id);
      return 'Đã đồng ý kết bạn';
    });

  // Từ chối lời mời đã nhận / hủy lời mời đã gửi (cùng gọi API xóa)
  const handleRemoveRequest = (request) =>
    runFriendAction(async () => {
      await friendApi.remove(request.id);
    });

  // MỚI SỬA: bấm ✕ cạnh 1 người bạn -> chỉ MỞ hộp xác nhận (trước đây gọi window.confirm của trình duyệt)
  const handleAskUnfriend = (friend) => {
    setUnfriendTarget(friend);
  };

  // MỚI THÊM: bấm nút "Hủy kết bạn" trong hộp xác nhận -> đóng hộp rồi mới thực hiện hủy kết bạn
  const handleConfirmUnfriend = async () => {
    const target = unfriendTarget;
    setUnfriendTarget(null); // đóng hộp ngay, không chờ Backend trả lời
    if (!target) return;
    await runFriendAction(async () => {
      await friendApi.remove(target.friendshipId);
    });
  };

  // gửi lời mời bằng email từ màn hình "Thêm bạn"
  const handleSendEmail = async () => {
    const email = emailInput.trim();
    if (!email) {
      setError('Vui lòng nhập email');
      return;
    }
    setError('');
    setNotice('');
    setFriendSubmitting(true);
    try {
      const res = await friendApi.requestByEmail(email);
      setNotice(res.data.data.autoAccepted ? 'Hai bạn đã trở thành bạn bè' : 'Đã gửi lời mời kết bạn');
      setEmailInput('');
      setAddingFriend(false); // gửi xong quay về danh sách
      await loadFriends();
    } catch (err) {
      setError(err.response?.data?.message || 'Gửi lời mời thất bại');
    } finally {
      setFriendSubmitting(false);
    }
  };

  // Tick / bỏ tick 1 người trong màn hình tạo nhóm chat
  const handleToggleSelect = (userId) => {
    setSelectedIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  // Bấm "Tạo nhóm" -> kiểm tra nhanh ở Frontend rồi gọi API, tạo xong vào luôn phòng vừa tạo
  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      setError('Vui lòng nhập tên nhóm chat');
      return;
    }
    if (selectedIds.length < 1) {
      setError('Hãy chọn ít nhất 1 thành viên');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const res = await conversationApi.createGroupChat(groupId, name, selectedIds);
      onOpenConversation(res.data.data, `👥 ${name}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Tạo nhóm chat thất bại');
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="chatlist"><p className="chatlist-empty">Đang tải...</p></div>;
  }

  // ===== Màn hình "Tạo nhóm chat mới" =====
  if (creating) {
    return (
      <div className="chatlist">
        <div className="chatlist-form-title">Tạo nhóm chat mới</div>

        <input
          className="chatlist-input"
          placeholder="Tên nhóm chat (VD: Làm Backend)"
          value={newName}
          maxLength={50}
          onChange={(e) => setNewName(e.target.value)}
        />

        <div className="chatlist-picker">
          {people.map((p) => (
            <label key={p.id} className="chatlist-pick-row">
              <input
                type="checkbox"
                checked={selectedIds.includes(p.id)}
                onChange={() => handleToggleSelect(p.id)}
              />
              <span>{p.fullName}</span>
              {p.role === 'GIANG_VIEN' && <span className="chatlist-tag">Giảng viên</span>}
            </label>
          ))}
        </div>

        {error && <div className="auth-error">{error}</div>}

        <div className="chatlist-form-actions">
          <button
            className="btn-secondary"
            disabled={submitting}
            onClick={() => {
              setCreating(false);
              setError('');
            }}
          >
            Hủy
          </button>
          <button className="btn-primary" disabled={submitting} onClick={handleCreate}>
            {submitting ? 'Đang tạo...' : 'Tạo nhóm'}
          </button>
        </div>
      </div>
    );
  }

  // ===== Màn hình "Thêm bạn bằng email" =====
  if (addingFriend) {
    return (
      <div className="chatlist">
        <div className="chatlist-form-title">Thêm bạn bằng email</div>

        {/* Dùng form để bấm Enter cũng gửi được */}
        <form
          className="chatlist-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleSendEmail();
          }}
        >
          <input
            className="chatlist-input"
            type="email"
            placeholder="Email của người bạn muốn kết bạn"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            autoFocus
          />

          {error && <div className="auth-error">{error}</div>}

          <div className="chatlist-form-actions">
            <button
              type="button"
              className="btn-secondary"
              disabled={friendSubmitting}
              onClick={() => {
                setAddingFriend(false);
                setError('');
              }}
            >
              Hủy
            </button>
            <button type="submit" className="btn-primary" disabled={friendSubmitting}>
              {friendSubmitting ? 'Đang gửi...' : 'Gửi lời mời'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // các tập tra cứu nhanh để biết 1 người trong nhóm đang có quan hệ kết bạn thế nào với mình
  const friendIds = new Set(friendData.friends.map((f) => f.user.id));
  const outgoingIds = new Set(friendData.outgoing.map((o) => o.user.id));
  const incomingByUser = new Map(friendData.incoming.map((i) => [i.user.id, i]));

  // nút / chữ bên phải mỗi thành viên nhóm, tùy quan hệ kết bạn hiện tại
  const renderFriendAction = (person) => {
    if (friendIds.has(person.id)) return null; // đã là bạn bè: không cần nút (nhãn "Bạn bè" hiện ở dưới tên)
    if (outgoingIds.has(person.id)) return <span className="chatlist-state">Đã mời</span>;
    const incoming = incomingByUser.get(person.id);
    if (incoming) {
      // Người này đã mời mình -> cho Đồng ý ngay tại đây
      return (
        <button className="chatlist-mini-btn chatlist-mini-primary" onClick={() => handleAccept(incoming)}>
          Đồng ý
        </button>
      );
    }
    return (
      <button className="chatlist-mini-btn" onClick={() => handleAddFromGroup(person)}>
        + Kết bạn
      </button>
    );
  };

  // ===== Màn hình danh sách chính =====
  return (
    <>
      <div className="chatlist">
        {error && <div className="auth-error">{error}</div>}
        {notice && <div className="chatlist-notice">{notice}</div>}

        {/* Dòng đầu: chat cả nhóm đồ án (tin nhắn chưa đọc của mục này hiện ở nút 💬 ngoài trang nhóm) */}
        <button className="chatlist-row" onClick={onOpenGroupChat}>
          <div className="chatlist-avatar chatlist-avatar-group">👥</div>
          <div className="chatlist-info">
            <div className="chatlist-name">Cả nhóm đồ án</div>
            <div className="chatlist-sub">Tất cả thành viên và Giảng viên</div>
          </div>
        </button>

        {/* Mục lời mời kết bạn - chỉ hiện khi có người đang mời mình */}
        {friendData.incoming.length > 0 && (
          <>
            <div className="chatlist-section-head">
              <span>Lời mời kết bạn</span>
            </div>
            {friendData.incoming.map((req) => (
              <div key={req.id} className="chatlist-item">
                <div className="chatlist-row chatlist-row-static">
                  <div className="chatlist-avatar">{initialOf(req.user.fullName)}</div>
                  <div className="chatlist-info">
                    <div className="chatlist-name">{req.user.fullName}</div>
                    {req.user.role === 'GIANG_VIEN' && <div className="chatlist-sub">Giảng viên</div>}
                  </div>
                </div>
                <button className="chatlist-mini-btn chatlist-mini-primary" onClick={() => handleAccept(req)}>
                  Đồng ý
                </button>
                <button className="chatlist-mini-btn" onClick={() => handleRemoveRequest(req)}>
                  Từ chối
                </button>
              </div>
            ))}
          </>
        )}

        {/* Mục nhóm chat con */}
        <div className="chatlist-section-head">
          <span>Nhóm chat</span>
          <button className="chatlist-add-btn" onClick={() => setCreating(true)}>+ Tạo nhóm</button>
        </div>
        {groupChats.length === 0 ? (
          <p className="chatlist-empty">Chưa có nhóm chat nào.</p>
        ) : (
          groupChats.map((chat) => (
            <button
              key={chat.id}
              className="chatlist-row"
              onClick={() => onOpenConversation(chat, `👥 ${chat.name}`)}
            >
              <div className="chatlist-avatar chatlist-avatar-group">{initialOf(chat.name)}</div>
              <div className="chatlist-info">
                <div className="chatlist-name">{chat.name}</div>
                <div className="chatlist-sub">{chat.members.length} thành viên</div>
              </div>
              <UnreadBadge count={unreadByConv[chat.id]} />
            </button>
          ))
        )}

        {/* Mục thành viên cùng nhóm đồ án: bấm để nhắn riêng, nút bên phải để kết bạn */}
        <div className="chatlist-section-head">
          <span>Thành viên nhóm</span>
        </div>
        {people.length === 0 ? (
          <p className="chatlist-empty">Chưa có ai khác trong nhóm.</p>
        ) : (
          people.map((p) => {
            // Dòng phụ dưới tên: "Giảng viên" và/hoặc "Bạn bè"
            const subText = [p.role === 'GIANG_VIEN' && 'Giảng viên', friendIds.has(p.id) && 'Bạn bè']
              .filter(Boolean)
              .join(' · ');
            return (
              <div key={p.id} className="chatlist-item">
                <button
                  className="chatlist-row"
                  disabled={!!openingId}
                  onClick={() => handleOpenPrivate(p)}
                >
                  <div className="chatlist-avatar">{initialOf(p.fullName)}</div>
                  <div className="chatlist-info">
                    <div className="chatlist-name">{p.fullName}</div>
                    {subText && <div className="chatlist-sub">{subText}</div>}
                  </div>
                  <UnreadBadge count={unreadByPerson[p.id]} />
                </button>
                {renderFriendAction(p)}
              </div>
            );
          })
        )}

        {/* Mục bạn bè - gồm cả bạn ở nhóm đồ án khác */}
        <div className="chatlist-section-head">
          <span>Bạn bè</span>
          <button className="chatlist-add-btn" onClick={() => setAddingFriend(true)}>+ Thêm bạn</button>
        </div>
        {friendData.friends.length === 0 && friendData.outgoing.length === 0 ? (
          <p className="chatlist-empty">Chưa có bạn bè nào.</p>
        ) : (
          friendData.friends.map((f) => (
            <div key={f.friendshipId} className="chatlist-item">
              <button
                className="chatlist-row"
                disabled={!!openingId}
                onClick={() => handleOpenPrivate(f.user)}
              >
                <div className="chatlist-avatar">{initialOf(f.user.fullName)}</div>
                <div className="chatlist-info">
                  <div className="chatlist-name">{f.user.fullName}</div>
                  {f.user.role === 'GIANG_VIEN' && <div className="chatlist-sub">Giảng viên</div>}
                </div>
                <UnreadBadge count={unreadByPerson[f.user.id]} />
              </button>
              {/* MỚI SỬA: bấm ✕ chỉ mở hộp xác nhận tự làm (handleAskUnfriend), không còn dùng window.confirm */}
              <button
                className="chatlist-mini-btn"
                title="Hủy kết bạn"
                onClick={() => handleAskUnfriend(f)}
              >
                ✕
              </button>
            </div>
          ))
        )}

        {/* Lời mời mình đã gửi và đang chờ người kia trả lời - có thể hủy */}
        {friendData.outgoing.length > 0 && (
          <>
            <div className="chatlist-subhead">Đã gửi lời mời</div>
            {friendData.outgoing.map((req) => (
              <div key={req.id} className="chatlist-item">
                <div className="chatlist-row chatlist-row-static">
                  <div className="chatlist-avatar">{initialOf(req.user.fullName)}</div>
                  <div className="chatlist-info">
                    <div className="chatlist-name">{req.user.fullName}</div>
                    <div className="chatlist-sub">Đang chờ đồng ý</div>
                  </div>
                </div>
                <button className="chatlist-mini-btn" onClick={() => handleRemoveRequest(req)}>
                  Hủy
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      {/* MỚI THÊM: hộp xác nhận hủy kết bạn - nằm ngoài khung cuộn .chatlist nhưng vẫn trong khung chat,
          để bấm vào hộp không bị tính là "bấm ra ngoài khung chat" (ChatBox sẽ đóng khung nếu tính vậy) */}
      <ConfirmDialog
        isOpen={!!unfriendTarget}
        title="Hủy kết bạn"
        message={
          unfriendTarget
            ? `Bạn có chắc muốn hủy kết bạn với ${unfriendTarget.user.fullName}? Hai bạn vẫn có thể kết bạn lại sau.`
            : ''
        }
        confirmText="Hủy kết bạn"
        cancelText="Giữ lại"
        danger
        onConfirm={handleConfirmUnfriend}
        onCancel={() => setUnfriendTarget(null)}
      />
    </>
  );
}