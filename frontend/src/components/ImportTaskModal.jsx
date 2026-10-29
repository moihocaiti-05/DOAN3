import { useState } from 'react';
import Modal from './Modal';
import { taskApi } from '../services/taskApi';

// Modal cho phép: (1) tải file mẫu, (2) chọn file đã điền, (3) upload để tạo hàng loạt task
export default function ImportTaskModal({ isOpen, onClose, onImported, groupId }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // lưu kết quả sau khi import (created, errors)
  const [error, setError] = useState('');

  // Xử lý khi bấm "Tải file mẫu" - tải file Excel trống về máy người dùng
  const handleDownloadTemplate = async () => {
    try {
      const res = await taskApi.downloadTemplate();
      // Cách tải file trong trình duyệt: tạo 1 link ẩn, tự động bấm vào nó rồi xóa đi
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'mau-import-task.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError('Tải file mẫu thất bại');
    }
  };

  // Xử lý khi bấm "Import" - upload file đã chọn lên Backend
  const handleImport = async () => {
    if (!file) {
      setError('Vui lòng chọn file trước');
      return;
    }
    setError('');
    setLoading(true);
    setResult(null);
    try {
      const res = await taskApi.importTasks(file, groupId);
      setResult(res.data); // lưu lại { created, errors } để hiển thị cho người dùng xem
      onImported(); // báo cho Kanban board load lại danh sách task
    } catch (err) {
      setError(err.response?.data?.message || 'Import thất bại');
    } finally {
      setLoading(false);
    }
  };

  // Đóng modal và reset lại toàn bộ state, tránh giữ dữ liệu cũ cho lần mở sau
  const handleClose = () => {
    setFile(null);
    setResult(null);
    setError('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import công việc từ Excel">
      <p style={{ fontSize: 13.5, color: '#6B7280', marginBottom: 16 }}>
        Tải file mẫu, điền thông tin công việc, rồi tải file đó lên để tạo hàng loạt.
      </p>

      <button
        type="button"
        className="btn-secondary"
        style={{ width: '100%', marginBottom: 20 }}
        onClick={handleDownloadTemplate}
      >
        📥 Tải file mẫu
      </button>

      <div className="auth-field">
        <label>Chọn file đã điền</label>
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => setFile(e.target.files[0])}
        />
      </div>

      {error && <div className="auth-error">{error}</div>}

      {/* Hiển thị kết quả sau khi import xong */}
      {result && (
  <div className="import-result">
    <p>✅ Đã tạo thành công {result.created} công việc.</p>
    {result.createdMilestones && result.createdMilestones.length > 0 && (
      <p>🆕 Đã tự động tạo {result.createdMilestones.length} mốc mới: {result.createdMilestones.join(', ')}</p>
    )}
    {result.errors.length > 0 && (
      <div className="import-errors">
        <p>⚠ Có {result.errors.length} dòng lỗi:</p>
        <ul>
          {result.errors.map((e, i) => (
            <li key={i}>Dòng {e.row}: {e.error}</li>
          ))}
        </ul>
      </div>
    )}
  </div>
)}

      <button
        type="button"
        className="auth-submit"
        onClick={handleImport}
        disabled={loading}
        style={{ marginTop: 16 }}
      >
        {loading ? 'Đang import...' : 'Import'}
      </button>
    </Modal>
  );
}