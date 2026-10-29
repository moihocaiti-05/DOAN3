import { useState, useEffect } from 'react';
import Modal from './Modal';
import { milestoneApi } from '../services/milestoneApi';

// Hộp SỬA 1 mốc: tên, mô tả, hạn chót (điền sẵn giá trị hiện tại)
export default function EditMilestoneModal({ isOpen, onClose, onSaved, milestone }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Mỗi lần mở (hoặc đổi sang mốc khác) thì điền sẵn dữ liệu hiện tại của mốc đó
  useEffect(() => {
    if (isOpen && milestone) {
      setTitle(milestone.title || '');
      setDescription(milestone.description || '');
      // dueDate từ Backend là chuỗi ISO "2026-12-10T00:00:00.000Z" -> lấy 10 ký tự đầu "2026-12-10" cho ô chọn ngày
      setDueDate(milestone.dueDate ? milestone.dueDate.slice(0, 10) : '');
      setError('');
    }
  }, [isOpen, milestone]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await milestoneApi.update(milestone.id, {
        title: title.trim(),
        description: description.trim(),
        dueDate: dueDate || null, // rỗng = xóa hạn chót
      });
      onSaved(); // báo trang cha tải lại cây
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Sửa mốc thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Sửa mốc "${milestone ? milestone.title : ''}"`}>
      <form onSubmit={handleSubmit}>
        <div className="auth-field">
          <label>Tên mốc</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} autoFocus />
        </div>
        <div className="auth-field">
          <label>Mô tả (không bắt buộc)</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="auth-field">
          <label>Hạn chót (xóa trắng nếu không có hạn)</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        {error && <div className="auth-error">{error}</div>}
        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? 'Đang lưu...' : 'Lưu thay đổi'}
        </button>
      </form>
    </Modal>
  );
}