import { useState } from 'react';
import Modal from './Modal';
import { groupApi } from '../services/groupApi';

// Modal tạo nhóm mới.
// onCreated: hàm được gọi sau khi tạo thành công, để trang cha (Home) load lại danh sách nhóm
export default function CreateGroupModal({ isOpen, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await groupApi.createGroup({ name, description });
      setName('');
      setDescription('');
      onCreated(); // báo cho Home biết để load lại danh sách
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Tạo nhóm thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Tạo nhóm mới">
      <form onSubmit={handleSubmit}>
        <div className="auth-field">
          <label>Tên nhóm / dự án</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Đồ án 3 - Nhóm A"
            required
          />
        </div>
        <div className="auth-field">
          <label>Mô tả (không bắt buộc)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="VD: Website quản lý công việc nhóm"
          />
        </div>
        {error && <div className="auth-error">{error}</div>}
        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? 'Đang tạo...' : 'Tạo nhóm'}
        </button>
      </form>
    </Modal>
  );
}