import { useState, useEffect } from 'react';
import Modal from './Modal';
import { milestoneApi } from '../services/milestoneApi';

// Modal thêm 1 mốc mới - có thể là mốc GỐC (parentId = null) hoặc mốc CON (parentId = id mốc cha)
export default function AddMilestoneModal({ isOpen, onClose, onCreated, groupId, parentId, parentTitle }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // MỚI THÊM: xóa lỗi cũ mỗi lần mở lại modal (tránh còn sót thông báo lỗi từ lần mở trước đó)
  useEffect(() => {
    if (isOpen) setError('');
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await milestoneApi.create({
        title,
        description,
        groupId,
        dueDate: dueDate || null,
        // MỚI THÊM: gắn vào đúng mốc cha được truyền vào (nếu có), null nghĩa là tạo mốc gốc
        parentId: parentId || null,
      });
      // Reset form sau khi tạo xong
      setTitle('');
      setDescription('');
      setDueDate('');
      onCreated(); // báo cho trang cha load lại timeline
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Tạo mốc thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      // MỚI THÊM: đổi tiêu đề modal tùy theo đang thêm mốc gốc hay mốc con
      title={parentId ? `Thêm mốc con vào "${parentTitle}"` : 'Thêm mốc mới'}
    >
      <form onSubmit={handleSubmit}>
        {/* MỚI THÊM: nhắc rõ mốc này sẽ nằm bên trong mốc nào, tránh nhầm lẫn */}
        {parentId && (
          <div className="milestone-add-hint">
            Mốc này sẽ nằm bên trong mốc <strong>{parentTitle}</strong>
          </div>
        )}
        <div className="auth-field">
          <label>Tên mốc</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="VD: Chương 2 - Phân tích thiết kế"
            required
          />
        </div>
        <div className="auth-field">
          <label>Mô tả (không bắt buộc)</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="auth-field">
          <label>Hạn chót (không bắt buộc)</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        {error && <div className="auth-error">{error}</div>}
        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? 'Đang thêm...' : 'Thêm mốc'}
        </button>
      </form>
    </Modal>
  );
}