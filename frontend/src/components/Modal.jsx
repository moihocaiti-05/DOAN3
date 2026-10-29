// Component Modal dùng chung cho mọi popup trong app (tạo nhóm, tham gia nhóm, sau này có thể dùng cho tạo task...)
// Nhận vào: isOpen (có hiện hay không), onClose (hàm đóng modal), title (tiêu đề), children (nội dung bên trong)
// MỚI THÊM: className (không bắt buộc) - cho phép từng modal cụ thể (VD TaskDetailModal) xin thêm class riêng
// để nới rộng/tùy chỉnh mà KHÔNG ảnh hưởng tới các modal khác đang dùng chung component này (mặc định rỗng, giữ nguyên hành vi cũ)
export default function Modal({ isOpen, onClose, title, children, className = '' }) {
  if (!isOpen) return null; // không hiện gì nếu isOpen = false

  return (
    <div className="modal-overlay" onClick={onClose}>
      {/* stopPropagation để bấm vào trong modal không bị đóng modal */}
      <div className={`modal-box ${className}`.trim()} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}