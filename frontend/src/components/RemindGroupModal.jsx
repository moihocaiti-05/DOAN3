import { useState, useEffect } from 'react';
import { supervisorApi } from '../services/supervisorApi';
import '../styles/remind-modal.css';

// Câu nhắc mặc định (khớp với câu mặc định ở Backend khi lời nhắn để trống)
const DEFAULT_MESSAGE = 'Hãy cập nhật tiến độ các công việc của nhóm.';
const MAX_LENGTH = 300; // khớp giới hạn ở Backend

// MỚI THÊM (tính năng 2): hộp thoại Giảng viên nhập lời nhắn rồi gửi thông báo chuông cho TẤT CẢ thành viên nhóm
// Props: group = { id, name }, onClose = hàm đóng hộp thoại
export default function RemindGroupModal({ group, onClose }) {
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notified, setNotified] = useState(null); // null = chưa gửi; số = gửi xong, là số người đã nhận

  // Bấm phím Esc để đóng (trừ lúc đang gửi)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !sending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sending, onClose]);

  const handleSend = async () => {
    setSending(true);
    setError('');
    try {
      const res = await supervisorApi.remindGroup(group.id, message);
      setNotified(res.data.data.notified);
    } catch (err) {
      setError(err.response?.data?.message || 'Gửi nhắc nhở thất bại, hãy thử lại.');
    } finally {
      setSending(false);
    }
  };

  return (
    // Bấm ra ngoài hộp thì đóng (trừ lúc đang gửi); bấm trong hộp thì không đóng
    <div className="rm-overlay" onClick={() => !sending && onClose()}>
      <div className="rm-box" onClick={(e) => e.stopPropagation()}>
        <h3 className="rm-title">Nhắc nhóm</h3>
        <p className="rm-sub">{group.name}</p>

        {notified !== null ? (
          <>
            <p className="rm-success">Đã gửi nhắc nhở cho {notified} thành viên.</p>
            <div className="rm-actions">
              <button className="rm-action rm-action-primary" onClick={onClose}>
                Đóng
              </button>
            </div>
          </>
        ) : (
          <>
            <textarea
              className="rm-textarea"
              value={message}
              maxLength={MAX_LENGTH}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Nhập lời nhắn gửi cả nhóm..."
            />
            <p className="rm-counter">{message.length}/{MAX_LENGTH}</p>
            {error && <p className="rm-error">{error}</p>}
            <div className="rm-actions">
              <button className="rm-action rm-action-secondary" onClick={onClose} disabled={sending}>
                Hủy
              </button>
              <button className="rm-action rm-action-primary" onClick={handleSend} disabled={sending}>
                {sending ? 'Đang gửi...' : 'Gửi nhắc nhở'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}