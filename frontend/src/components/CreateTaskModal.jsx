import { useState, useEffect } from 'react';
import Modal from './Modal';
import api from '../services/api';
import { taskApi } from '../services/taskApi';

// Hộp thêm công việc, dùng cho CẢ HAI nơi:
//  - Tab Mốc: truyền milestone (hoặc parentTask) -> mốc đã cố định, không cho chọn lại
//  - Kanban: không truyền milestone -> hiện ô chọn mốc (có thể "Không thuộc mốc nào")
//  - parentTask có giá trị -> tạo VIỆC CON (Backend tự kế thừa mốc + nhóm từ việc cha)
//  - MỚI THÊM: cả hai trường hợp đều có ô "Người phụ trách" (mặc định "Chưa giao")

// Dàn phẳng cây mốc thành danh sách có thụt lề để đưa vào ô chọn
function flattenMilestones(nodes, depth = 0) {
  const result = [];
  (nodes || []).forEach((n) => {
    result.push({ id: n.id, label: `${'— '.repeat(depth)}${n.title}` });
    result.push(...flattenMilestones(n.children, depth + 1));
  });
  return result;
}

export default function CreateTaskModal({ isOpen, onClose, onCreated, groupId, milestone, parentTask }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [deadline, setDeadline] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [milestoneOptions, setMilestoneOptions] = useState([]);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState('');

  // MỚI THÊM: danh sách thành viên đã đồng ý + người phụ trách đang chọn ('' = chưa giao)
  const [memberOptions, setMemberOptions] = useState([]);
  const [selectedAssignee, setSelectedAssignee] = useState('');

  // Chỉ hiện ô chọn mốc khi KHÔNG có mốc cố định và KHÔNG phải việc con
  const needPicker = !milestone && !parentTask;

  // Mỗi lần mở lại hộp thì xóa form + lỗi cũ
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription('');
      setPriority('medium');
      setDeadline('');
      setTags('');
      setError('');
      setSelectedMilestoneId('');
      setSelectedAssignee(''); // MỚI THÊM: về "Chưa giao"
    }
  }, [isOpen]);

  // Mở từ Kanban thì tải danh sách mốc của nhóm
  useEffect(() => {
    if (!isOpen || !needPicker || !groupId) return;
    let cancelled = false;
    api
      .get(`/milestones/group/${groupId}`)
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.data ?? res.data;
        setMilestoneOptions(flattenMilestones(Array.isArray(data) ? data : []));
      })
      .catch(() => {
        if (!cancelled) setMilestoneOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, needPicker, groupId]);

  // MỚI THÊM: mỗi lần mở hộp thì tải thành viên của nhóm (GET /groups/:groupId/members)
  // Chỉ lấy người ĐÃ ĐỒNG Ý (ACCEPTED), bỏ người đang chờ. Tải lỗi thì ô chỉ còn "Chưa giao", vẫn tạo việc được
  useEffect(() => {
    if (!isOpen || !groupId) return;
    let cancelled = false;
    api
      .get(`/groups/${groupId}/members`)
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.data ?? res.data;
        const list = (Array.isArray(data) ? data : [])
          .filter((m) => m.status === 'ACCEPTED')
          .map((m) => ({
            userId: m.userId || m.user?.id,
            name: m.user?.fullName || m.fullName || 'Thành viên',
          }))
          .filter((m) => m.userId);
        setMemberOptions(list);
      })
      .catch(() => {
        if (!cancelled) setMemberOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, groupId]);

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
        tagNames: tags
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0),
      };
      // MỚI THÊM: chỉ gửi assignedTo khi có chọn người (không gửi chuỗi rỗng để khỏi lưu giá trị rác)
      if (selectedAssignee) payload.assignedTo = selectedAssignee;

      if (parentTask) {
        await taskApi.createSubtask(parentTask.id, payload);
      } else {
        const milestoneId = milestone ? milestone.id : selectedMilestoneId;
        const body = { ...payload, groupId };
        if (milestoneId) body.milestoneId = milestoneId;
        await taskApi.create(body);
      }
      onCreated(); // báo trang cha tải lại
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Tạo công việc thất bại');
    } finally {
      setLoading(false);
    }
  };

  const modalTitle = parentTask
    ? `Thêm việc con vào "${parentTask.title}"`
    : milestone
    ? `Thêm công việc vào "${milestone.title}"`
    : 'Thêm công việc mới';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle}>
      <form onSubmit={handleSubmit} className="ct-form">
        {(parentTask || milestone) && (
          <div className="milestone-add-hint">
            {parentTask ? (
              <>
                Việc con tự nằm cùng mốc với việc cha <strong>{parentTask.title}</strong>
              </>
            ) : (
              <>
                Công việc này sẽ nằm trong mốc <strong>{milestone.title}</strong>
              </>
            )}
          </div>
        )}

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

        {needPicker && (
          <div className="auth-field">
            <label>Thuộc mốc (không bắt buộc)</label>
            <select value={selectedMilestoneId} onChange={(e) => setSelectedMilestoneId(e.target.value)}>
              <option value="">Không thuộc mốc nào</option>
              {milestoneOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* MỚI THÊM: ô chọn người phụ trách */}
        <div className="auth-field">
          <label>Người phụ trách (không bắt buộc)</label>
          <select value={selectedAssignee} onChange={(e) => setSelectedAssignee(e.target.value)}>
            <option value="">Chưa giao</option>
            {memberOptions.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
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