import { useState, useEffect, useRef } from 'react';
import socket from '../services/socket';
import { useAuth } from '../context/AuthContext';
import ChatThread from './ChatThread';
import ChatList from './ChatList';
import '../styles/chat.css';
import '../styles/chat-rooms.css';

// Xóa 1 khóa khỏi object state (dùng để xóa số tin chưa đọc của 1 cuộc trò chuyện khi mở nó ra)
const clearKey = (setter, key) =>
  setter((prev) => {
    const next = { ...prev };
    delete next[key];
    return next;
  });

// Panel chat trượt ra từ bên phải màn hình - có 3 màn hình bên trong:
// 'list' (danh sách trò chuyện), 'group' (chat cả nhóm), 'conversation' (1 nhóm chat con hoặc 1 chat riêng)
export default function ChatBox({ isOpen, onClose, groupId }) {
  const { user } = useAuth();

  // Mặc định mở thẳng chat cả nhóm như trước đây
  const [view, setView] = useState({ type: 'group' });

  // Số tin chưa đọc: nhóm chat con khóa theo conversationId, chat riêng khóa theo id người gửi
  const [unreadByConv, setUnreadByConv] = useState({});
  const [unreadByPerson, setUnreadByPerson] = useState({});

  // MỚI THÊM: ref trỏ tới khung panel, dùng để kiểm tra 1 cú click nằm trong hay ngoài khung chat
  const panelRef = useRef(null);

  // Dùng ref để handler socket (tạo 1 lần) luôn đọc được giá trị mới nhất của isOpen và view
  const isOpenRef = useRef(isOpen);
  const viewRef = useRef(view);
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // MỚI THÊM: bấm ra ngoài khung chat thì đóng khung
  // Chỉ lắng nghe khi khung đang mở. Dùng "mousedown" (xảy ra trước "click") để không bị lỗi khi
  // phần tử vừa bấm bị thay mất trong lúc React vẽ lại (VD bấm "+ Tạo nhóm" làm danh sách đổi sang form)
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      // Bấm bên trong khung chat -> không làm gì
      if (panelRef.current && panelRef.current.contains(e.target)) return;
      // Bấm vào nút "💬 Trò chuyện" ngoài trang nhóm -> bỏ qua, tránh đóng rồi mở lại ngay lập tức
      if (e.target.closest && e.target.closest('.chat-toggle-btn')) return;
      // Bấm ở bất kỳ chỗ nào khác bên ngoài -> đóng khung chat
      onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    // Dọn dẹp: gỡ bộ lắng nghe khi khung đóng lại (hoặc khi component bị hủy)
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Đổi sang nhóm đồ án khác thì quay về màn hình chat cả nhóm
  useEffect(() => {
    setView({ type: 'group' });
  }, [groupId]);

  // Lắng nghe tin mới của các phòng chat - chạy suốt khi đang ở trang nhóm (kể cả lúc panel đóng)
  useEffect(() => {
    // Vào phòng thông báo riêng của mình (vào lại nhiều lần không sao) để nhận tin phòng chat
    socket.emit('join_notifications', user.id);

    const handleConversationMessage = (message) => {
      if (message.senderId === user.id) return; // tin của chính mình không tính là chưa đọc

      // Nếu đang mở đúng phòng đó thì không cần đánh dấu chưa đọc
      const currentView = viewRef.current;
      const isViewingThis =
        isOpenRef.current &&
        currentView.type === 'conversation' &&
        currentView.conversation.id === message.conversationId;
      if (isViewingThis) return;

      if (message.conversation?.type === 'PRIVATE') {
        // Chat riêng: đánh dấu theo người gửi để hiện chấm ở đúng dòng tên người đó
        setUnreadByPerson((prev) => ({ ...prev, [message.senderId]: (prev[message.senderId] || 0) + 1 }));
      } else {
        // Nhóm chat con: đánh dấu theo id phòng
        setUnreadByConv((prev) => ({
          ...prev,
          [message.conversationId]: (prev[message.conversationId] || 0) + 1,
        }));
      }
    };

    socket.on('new_conversation_message', handleConversationMessage);
    return () => {
      socket.off('new_conversation_message', handleConversationMessage);
    };
  }, [user.id]);

  // Khi panel đang mở và đang xem 1 phòng chat -> xóa số chưa đọc của phòng đó
  useEffect(() => {
    if (!isOpen || view.type !== 'conversation') return;
    const conversation = view.conversation;
    if (conversation.type === 'PRIVATE') {
      // Chat riêng: tìm người còn lại trong phòng (khác mình) để xóa chấm trên dòng tên họ
      const other = conversation.members.find((m) => m.userId !== user.id);
      if (other) clearKey(setUnreadByPerson, other.userId);
    } else {
      clearKey(setUnreadByConv, conversation.id);
    }
  }, [isOpen, view, user.id]);

  // Tiêu đề trên đầu panel theo màn hình đang xem
  const title =
    view.type === 'list'
      ? '💬 Trò chuyện'
      : view.type === 'group'
      ? '💬 Trò chuyện nhóm'
      : view.title;

  return (
    // MỚI THÊM: gắn ref={panelRef} vào khung ngoài cùng để biết đâu là "bên trong khung chat"
    <div ref={panelRef} className={`chatbox-panel ${isOpen ? 'chatbox-open' : ''}`}>
      <div className="chatbox-header">
        <div className="chatbox-header-left">
          {/* Nút quay lại danh sách - chỉ hiện khi đang ở trong 1 cuộc trò chuyện */}
          {view.type !== 'list' && (
            <button
              className="chatbox-back-btn"
              onClick={() => setView({ type: 'list' })}
              title="Danh sách trò chuyện"
            >
              ‹
            </button>
          )}
          <span className="chatbox-title">{title}</span>
        </div>
        <button className="modal-close" onClick={onClose}>×</button>
      </div>

      {/* Chỉ dựng nội dung khi panel đang mở: đóng panel thì các khung bên trong tắt hẳn, mở lại sẽ tải mới */}
      {isOpen && view.type === 'list' && (
        <ChatList
          groupId={groupId}
          unreadByConv={unreadByConv}
          unreadByPerson={unreadByPerson}
          onOpenGroupChat={() => setView({ type: 'group' })}
          onOpenConversation={(conversation, convTitle) =>
            setView({ type: 'conversation', conversation, title: convTitle })
          }
        />
      )}

      {/* key để React tạo mới hoàn toàn khung chat mỗi khi đổi sang phòng khác (không lẫn tin nhắn phòng cũ) */}
      {isOpen && view.type === 'group' && (
        <ChatThread key={`group:${groupId}`} mode="group" id={groupId} />
      )}

      {isOpen && view.type === 'conversation' && (
        <ChatThread
          key={`conversation:${view.conversation.id}`}
          mode="conversation"
          id={view.conversation.id}
        />
      )}
    </div>
  );
}