import { useState } from 'react';
import { commentApi } from '../services/commentApi';
import '../styles/milestone-comment.css';

// Nhãn hiển thị cạnh tên người viết, theo giá trị authorRole Backend trả về
const ROLE_LABEL = {
  supervisor: 'Giảng viên',
  leader: 'Trưởng nhóm',
  member: 'Thành viên',
};

// Khung nhận xét của 1 mốc - mặc định đóng, chỉ tải dữ liệu khi người dùng bấm mở
// (tránh gọi API hàng loạt khi Timeline có nhiều mốc)
export default function MilestoneComments({ milestoneId }) {
  const [open, setOpen] = useState(false); // khung đang mở hay đóng
  const [loaded, setLoaded] = useState(false); // đã tải dữ liệu lần đầu chưa
  const [loading, setLoading] = useState(false);
  const [comments, setComments] = useState([]);
  const [canWrite, setCanWrite] = useState(false); // Backend cho biết người dùng có được viết không
  const [text, setText] = useState(''); // nội dung đang gõ
  const [sending, setSending] = useState(false);
  const [showForm, setShowForm] = useState(true); // MỚI THÊM: ô nhập đang hiện hay đang tắt (tắt sau khi gửi xong)

  // Tải nhận xét từ Backend
  // MỚI SỬA: thêm tham số "silent" - tải lại âm thầm (không hiện chữ "Đang tải...") dùng cho việc làm mới sau khi gửi
  const loadComments = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await commentApi.getByMilestone(milestoneId);
      setComments(res.data.data.comments);
      setCanWrite(res.data.data.canWrite);
      setLoaded(true);
    } catch (err) {
      alert(err.response?.data?.message || 'Không tải được nhận xét');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Bấm nút "Nhận xét": đảo trạng thái mở/đóng, lần mở đầu tiên thì tải dữ liệu
  const handleToggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded) await loadComments();
  };

  // Gửi nhận xét mới
  const handleSend = async () => {
    if (sending) return; // đang gửi rồi thì bỏ qua, tránh bấm Enter nhiều lần gửi trùng
    if (!text.trim()) return; // không gửi nội dung rỗng
    setSending(true);
    try {
      await commentApi.createOnMilestone(milestoneId, text);
      setText(''); // xóa nội dung đã gõ
      setShowForm(false); // MỚI THÊM: tắt ô nhập sau khi gửi xong
      // MỚI SỬA: tải lại danh sách từ Backend (thay vì tự thêm vào) để chắc chắn hiện đúng
      // tên người viết, nhãn vai trò và nút Xóa như dữ liệu thật trong Database
      await loadComments(true);
    } catch (err) {
      alert(err.response?.data?.message || 'Gửi nhận xét thất bại');
    } finally {
      setSending(false);
    }
  };

  // MỚI THÊM: bắt phím trong ô nhập - Enter để gửi, Shift+Enter để xuống dòng
  const handleKeyDown = (e) => {
    // isComposing = đang gõ dở tiếng Việt (Telex/VNI), lúc này Enter dùng để chốt chữ, KHÔNG được gửi
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault(); // chặn xuống dòng mặc định của Enter
      handleSend();
    }
  };

  // Xóa nhận xét của chính mình
  const handleDelete = async (commentId) => {
    if (!window.confirm('Xóa nhận xét này?')) return;
    try {
      await commentApi.remove(commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId)); // bỏ khỏi danh sách ngay, không cần tải lại
    } catch (err) {
      alert(err.response?.data?.message || 'Xóa thất bại');
    }
  };

  return (
    <div className="ms-comment">
      <button className="ms-comment-toggle" onClick={handleToggle}>
        💬 Nhận xét{loaded ? ` (${comments.length})` : ''}
      </button>

      {open && (
        <div className="ms-comment-box">
          {loading && <p className="ms-comment-empty">Đang tải...</p>}

          {!loading && loaded && comments.length === 0 && (
            <p className="ms-comment-empty">Chưa có nhận xét nào.</p>
          )}

          {comments.map((c) => (
            <div key={c.id} className="ms-comment-item">
              <div className="ms-comment-head">
                {/* MỚI SỬA: thêm dấu ? sau author để lỡ thiếu dữ liệu người viết thì không làm sập cả trang */}
                <span className="ms-comment-author">{c.author?.fullName}</span>
                {/* Nhãn vai trò: mỗi vai trò 1 màu riêng (xem milestone-comment.css) */}
                <span className={`ms-comment-role ms-comment-role-${c.authorRole}`}>
                  {ROLE_LABEL[c.authorRole]}
                </span>
                <span className="ms-comment-time">
                  {new Date(c.createdAt).toLocaleString('vi-VN')}
                </span>
                {/* Nút Xóa chỉ hiện với nhận xét của chính mình */}
                {c.isMine && (
                  <button className="ms-comment-delete" onClick={() => handleDelete(c.id)}>
                    Xóa
                  </button>
                )}
              </div>
              <p className="ms-comment-content">{c.content}</p>
            </div>
          ))}

          {/* Ô nhập chỉ hiện với Giảng viên và Trưởng nhóm (canWrite do Backend quyết định)
              MỚI SỬA: thêm điều kiện showForm - sau khi gửi xong ô nhập tắt đi */}
          {canWrite && showForm && (
            <div className="ms-comment-form">
              <textarea
                className="ms-comment-input"
                rows={2}
                autoFocus // mở ô nhập là con trỏ nằm sẵn trong đó, gõ luôn được
                placeholder="Viết nhận xét... (Enter để gửi, Shift+Enter để xuống dòng)"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                className="btn-primary ms-comment-send"
                onClick={handleSend}
                disabled={sending || !text.trim()}
              >
                {sending ? 'Đang gửi...' : 'Gửi'}
              </button>
            </div>
          )}

          {/* MỚI THÊM: khi ô nhập đang tắt thì hiện nút nhỏ để mở lại viết tiếp
              (dùng lại class của nút "Nhận xét" nên không cần thêm CSS) */}
          {canWrite && !showForm && (
            <button className="ms-comment-toggle" onClick={() => setShowForm(true)}>
              ✏️ Viết nhận xét
            </button>
          )}
        </div>
      )}
    </div>
  );
}