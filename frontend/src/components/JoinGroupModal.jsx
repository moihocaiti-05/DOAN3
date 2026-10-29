import { useState } from 'react';
import Modal from './Modal';
import { groupApi } from '../services/groupApi';

// Modal tham gia nhóm bằng mã mời
export default function JoinGroupModal({ isOpen, onClose, onJoined }) {
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await groupApi.joinGroup(inviteCode);
      setInviteCode('');
      onJoined();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Mã mời không hợp lệ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Tham gia nhóm">
      <form onSubmit={handleSubmit}>
        <div className="auth-field">
          <label>Mã mời</label>
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="Dán mã mời trưởng nhóm đã gửi"
            required
          />
        </div>
        {error && <div className="auth-error">{error}</div>}
        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? 'Đang tham gia...' : 'Tham gia nhóm'}
        </button>
      </form>
    </Modal>
  );
}