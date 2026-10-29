import { useEffect } from 'react';
import '../styles/confirm-dialog.css';

// Hộp xác nhận tự làm - thay cho window.confirm của trình duyệt (hộp mặc định không đổi được giao diện)
// isOpen: có hiện hay không
// title / message: tiêu đề và nội dung câu hỏi
// confirmText / cancelText: chữ trên 2 nút
// danger: true -> nút xác nhận màu đỏ (cho việc xóa/hủy); false -> nút màu chủ đạo
// onConfirm / onCancel: gọi khi bấm nút xác nhận / khi hủy (nút Hủy, phím Esc, hoặc bấm ra vùng tối bên ngoài)
export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy',
  danger = true,
  onConfirm,
  onCancel,
}) {
  // Nhấn phím Esc thì hủy - chỉ lắng nghe khi hộp đang mở
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    // Dọn dẹp: gỡ bộ lắng nghe khi hộp đóng lại
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    // Bấm vào lớp nền tối (ngoài hộp) = hủy
    <div className="confirm-overlay" onClick={onCancel}>
      {/* stopPropagation: bấm bên trong hộp thì không tính là bấm ra ngoài */}
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-title">{title}</div>
        <div className="confirm-message">{message}</div>

        <div className="confirm-actions">
          {/* autoFocus ở nút Hủy: lỡ nhấn Enter ngay khi hộp hiện ra thì chỉ đóng hộp, không thực hiện việc nguy hiểm */}
          <button className="btn-secondary" onClick={onCancel} autoFocus>
            {cancelText}
          </button>
          <button className={danger ? 'confirm-btn-danger' : 'btn-primary'} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}