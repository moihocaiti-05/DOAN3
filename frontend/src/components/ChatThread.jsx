import { useState, useEffect, useRef } from 'react';
import socket from '../services/socket';
import { messageApi } from '../services/messageApi';
import { conversationApi } from '../services/conversationApi';
import { useAuth } from '../context/AuthContext';
import '../styles/chat.css';

// "Bộ chuyển đổi" cho 2 loại chat - mỗi loại khác nhau ở: cách tải lịch sử, tên sự kiện realtime,
// cách kiểm tra tin nhắn có thuộc khung này không, và cách gửi file
const ADAPTERS = {
  // Chat cả nhóm đồ án (tin nhắn có groupId)
  group: {
    loadMessages: (id) => messageApi.getByGroup(id),
    event: 'new_message',
    belongsHere: (message, id) => message.groupId === id,
    uploadFile: (id, file, text) => messageApi.uploadFile(id, file, text),
  },
  // Phòng chat riêng / nhóm chat con (tin nhắn có conversationId)
  conversation: {
    loadMessages: (id) => conversationApi.getMessages(id),
    event: 'new_conversation_message',
    belongsHere: (message, id) => message.conversationId === id,
    uploadFile: (id, file, text) => conversationApi.uploadFile(id, file, text),
  },
};

// Khung tin nhắn + ô nhập dùng chung
// mode: 'group' hoặc 'conversation'; id: groupId hoặc conversationId tương ứng
export default function ChatThread({ mode, id }) {
  const { user } = useAuth();
  const adapter = ADAPTERS[mode];

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // state cho việc gửi file và báo lỗi gửi tin
  const [uploading, setUploading] = useState(false);
  const [sendError, setSendError] = useState('');
  const fileInputRef = useRef(null); // dùng để reset input file sau khi chọn xong

  const bottomRef = useRef(null);

  // Bước 1: tải lịch sử chat cũ (qua REST API, chỉ 1 lần mỗi khi mở khung này)
  useEffect(() => {
    let cancelled = false; // tránh cập nhật state khi khung đã bị đóng/chuyển sang phòng khác
    setLoading(true);
    setLoadError('');
    adapter
      .loadMessages(id)
      .then((res) => {
        if (!cancelled) setMessages(res.data.data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.response?.data?.message || 'Không tải được tin nhắn');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, id]);

  // Bước 2: lắng nghe tin nhắn mới theo thời gian thực
  useEffect(() => {
    // Chat cả nhóm: vào phòng Socket.io của nhóm (GroupDetail cũng đã vào, vào lại không sao).
    // KHÔNG thoát phòng khi đóng khung chat - vì GroupDetail còn cần nhận tin để hiện badge tin chưa đọc
    if (mode === 'group') socket.emit('join_group', id);

    const handleNewMessage = (message) => {
      if (!adapter.belongsHere(message, id)) return;
      // Bỏ qua nếu tin này đã có trong danh sách (phòng khi nhận trùng) rồi mới thêm vào cuối
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    };
    socket.on(adapter.event, handleNewMessage);

    // Chat cả nhóm gửi qua Socket.io nên lỗi (VD không có quyền) được báo qua sự kiện "message_error" - hiện ra cho người dùng thấy
    const handleMessageError = (err) => setSendError(err.message || 'Gửi tin nhắn thất bại');
    if (mode === 'group') socket.on('message_error', handleMessageError);

    return () => {
      socket.off(adapter.event, handleNewMessage);
      if (mode === 'group') socket.off('message_error', handleMessageError);
    };
  }, [mode, id]);

  // Bước 3: mỗi khi có tin nhắn mới, tự động cuộn xuống cuối
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Gửi tin nhắn CHỮ
  const handleSend = async (e) => {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setSendError('');
    setText('');

    // Chat cả nhóm: bắn thẳng qua Socket.io như trước
    if (mode === 'group') {
      socket.emit('send_message', { content, groupId: id, senderId: user.id });
      return;
    }

    // Phòng chat: gửi qua REST, Backend tự phát realtime cho mọi thành viên (kể cả mình)
    // nên KHÔNG tự thêm vào danh sách ở đây - tránh hiện trùng 2 lần
    try {
      await conversationApi.sendMessage(id, content);
    } catch (err) {
      setText(content); // gửi lỗi thì trả lại chữ vào ô nhập để người dùng không phải gõ lại
      setSendError(err.response?.data?.message || 'Gửi tin nhắn thất bại');
    }
  };

  // Gửi tin nhắn kèm FILE - sau khi upload xong Backend tự phát realtime cho mọi người nên không tự thêm vào state
  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSendError('');
    setUploading(true);
    try {
      // Gửi kèm luôn phần chữ đang gõ dở trong ô nhập (nếu có), giống kiểu Messenger/Zalo
      await adapter.uploadFile(id, file, text.trim());
      setText('');
    } catch (err) {
      setSendError(err.response?.data?.message || 'Gửi file thất bại');
    } finally {
      setUploading(false);
      e.target.value = ''; // reset input để chọn lại đúng file cũ vẫn kích hoạt được onChange
    }
  };

  // Kiểm tra file có phải ảnh không, dựa theo đuôi file trong tên
  const isImageFile = (fileName) => /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName || '');

  // Định dạng dung lượng file cho dễ đọc
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Tải file về máy khi bấm vào file không phải ảnh (route tải file dùng chung cho cả 2 loại chat)
  const handleDownload = async (message) => {
    const res = await messageApi.download(message.id);
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', message.fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const formatTime = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  // Trả về Fragment (không bọc thêm thẻ div) để 2 khối bên dưới nằm thẳng trong khung panel, giữ nguyên CSS cũ
  return (
    <>
      <div className="chatbox-messages">
        {loading ? (
          <p style={{ fontSize: 13, color: '#9CA0A8', padding: 16 }}>Đang tải...</p>
        ) : loadError ? (
          <p style={{ fontSize: 13, color: '#9CA0A8', padding: 16 }}>{loadError}</p>
        ) : messages.length === 0 ? (
          <p style={{ fontSize: 13, color: '#9CA0A8', padding: 16 }}>
            Chưa có tin nhắn nào. Hãy bắt đầu trò chuyện!
          </p>
        ) : (
          messages.map((m) => {
            const isMine = m.senderId === user.id;
            return (
              <div key={m.id} className={`chat-message ${isMine ? 'chat-mine' : 'chat-other'}`}>
                {!isMine && <div className="chat-sender-name">{m.sender.fullName}</div>}

                {/* Hiển thị file đính kèm nếu tin nhắn này có file (m.fileName tồn tại) */}
                {m.fileName && (
                  isImageFile(m.fileName) ? (
                    <img
                      src={messageApi.getViewUrl(m.id)}
                      alt={m.fileName}
                      className="chat-file-image"
                      onClick={() => window.open(messageApi.getViewUrl(m.id), '_blank')}
                    />
                  ) : (
                    <div className="chat-file-other" onClick={() => handleDownload(m)}>
                      <span className="chat-file-icon">📄</span>
                      <div className="chat-file-info">
                        <div className="chat-file-name">{m.fileName}</div>
                        <div className="chat-file-meta">{formatFileSize(m.fileSize)}</div>
                      </div>
                    </div>
                  )
                )}

                {/* Chỉ hiện bong bóng chữ nếu tin nhắn có content (tránh bong bóng rỗng khi chỉ gửi file) */}
                {m.content && <div className="chat-bubble">{m.content}</div>}

                <div className="chat-time">{formatTime(m.createdAt)}</div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {sendError && <div className="auth-error" style={{ padding: '0 16px' }}>{sendError}</div>}

      <form className="chatbox-input-row" onSubmit={handleSend}>
        {/* Nút đính kèm file - click sẽ mở hộp thoại chọn file của hệ điều hành */}
        <button
          type="button"
          className="chatbox-attach-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Gửi file"
        >
          📎
        </button>
        <input type="file" hidden ref={fileInputRef} onChange={handleFileSelect} />

        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={uploading ? 'Đang gửi file...' : 'Nhập tin nhắn...'}
          disabled={uploading}
        />
        <button type="submit" className="btn-primary" disabled={uploading}>Gửi</button>
      </form>
    </>
  );
}