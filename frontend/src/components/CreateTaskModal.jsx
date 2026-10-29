import { useState, useEffect } from 'react';
import Modal from './Modal';
import { taskApi } from '../services/taskApi';

// Hộp thêm công việc NGAY TRONG tab Mốc.
//  - parentTask = null  -> tạo công việc mới và gắn thẳng vào mốc "milestone"
//  - parentTask có giá trị -> tạo VIỆC CON của việc đó (Backend tự kế thừa mốc + nhóm từ việc cha)
export default function CreateTaskModal({ isOpen, onClose, onCreated, groupId, milestone, parentTask }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [deadline, setDeadline] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Mỗi lần mở lại hộp thì xóa form + lỗi cũ
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription('');
      setPriority('medium');
      setDeadline('');
      setTags('');
      setError('');
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        priority,
        deadline: deadline || null,
        // "Tài liệu, Khẩn" -> ['Tài liệu', 'Khẩn']
        tagNames: tags
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0),
      };
      if (parentTask) {
        await taskApi.createSubtask(parentTask.id, payload);
      } else {
        await taskApi.create({ ...payload, groupId, milestoneId: milestone.id });
      }
      onCreated(); // báo trang cha tải lại cây
      onClose();
    } catch (err) {
      // Joi trả message tiếng Anh nếu tên < 3 ký tự... nên có sẵn lời nhắc ở ô tên
      setError(err.response?.data?.message || 'Tạo công việc thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        parentTask
          ? `Thêm việc con vào "${parentTask.title}"`
          : `Thêm công việc vào "${milestone ? milestone.title : ''}"`
      }
    >
      <form onSubmit={handleSubmit} className="ct-form">
        <div className="milestone-add-hint">
          {parentTask ? (
            <>
              Việc con tự nằm cùng mốc với việc cha <strong>{parentTask.title}</strong>
            </>
          ) : (
            <>
              Công việc này sẽ nằm trong mốc <strong>{milestone ? milestone.title : ''}</strong>
            </>
          )}
        </div>

        <div className="auth-field">
          <label>Tên công việc (ít nhất 3 ký tự)</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="VD: Viết báo cáo chương 2"
            required
            minLength={3}
            maxLength={200}
            autoFocus
          />
        </div>

        <div className="auth-field">
          <label>Mô tả (không bắt buộc)</label>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="ct-row">
          <div className="auth-field">
            <label>Độ ưu tiên</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Thấp</option>
              <option value="medium">Trung bình</option>
              <option value="high">Cao</option>
            </select>
          </div>
          <div className="auth-field">
            <label>Hạn chót (không bắt buộc)</label>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
        </div>

        <div className="auth-field">
          <label>Nhãn (không bắt buộc, cách nhau bằng dấu phẩy)</label>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="VD: Tài liệu, Khẩn" />
        </div>

        {error && <div className="auth-error">{error}</div>}
        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? 'Đang thêm...' : parentTask ? 'Thêm việc con' : 'Thêm công việc'}
        </button>
      </form>
    </Modal>
  );
}