import ImageLightbox from './ImageLightbox';
import { useState, useEffect } from 'react';
import Modal from './Modal';
import { commentApi } from '../services/commentApi';
import { attachmentApi } from '../services/attachmentApi';
import { taskApi } from '../services/taskApi';
import { useAuth } from '../context/AuthContext';
import TagPicker from './TagPicker'; // component chọn/gõ nhãn dùng chung
import '../styles/comment.css';
import '../styles/tag.css';

// MỚI THÊM: nhãn hiển thị cạnh tên người bình luận, theo giá trị authorRole Backend trả về
const ROLE_LABEL = {
  supervisor: 'Giảng viên',
  leader: 'Trưởng nhóm',
  member: 'Thành viên',
};

// MỚI THÊM: 2 props phân quyền do GroupDetail truyền xuống:
// - isLeader: người đang xem có phải Trưởng nhóm không (mặc định false)
// - isMember: người đang xem có phải thành viên nhóm không (mặc định true để nơi khác gọi modal này không bị ảnh hưởng)
// MỚI THÊM (Phiên 12): canReview = người xem có quyền DUYỆT / TỪ CHỐI ở bước Kiểm định (Trưởng nhóm hoặc Giảng viên)
export default function TaskDetailModal({ isOpen, onClose, task, onUpdated, isLeader = false, isMember = true, canReview = false }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [description, setDescription] = useState('');
  const [savingDesc, setSavingDesc] = useState(false);
  const [descSaved, setDescSaved] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null); // lưu attachment đang được xem phóng to

  // State cho phần Sửa thông tin chung của task (tên, độ ưu tiên, deadline)
  const [editing, setEditing] = useState(false); // true khi đang ở chế độ chỉnh sửa (hiện form thay vì chỉ xem)
  const [editTitle, setEditTitle] = useState('');
  const [editPriority, setEditPriority] = useState('medium');
  const [editDeadline, setEditDeadline] = useState(''); // dạng chuỗi "yyyy-mm-dd" để khớp với input type="date"
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');
  const [deleting, setDeleting] = useState(false); // true khi đang gửi request xóa, dùng để disable nút tránh bấm đúp

  // MỚI THÊM (Phiên 12): phần Kiểm định - ghi chú người duyệt đang gõ, đang gửi, lỗi
  const [reviewNote, setReviewNote] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState('');

  // State cho phần sửa Nhãn (Tag)
  const [tagNames, setTagNames] = useState([]); // danh sách tên nhãn đang được chọn cho task này
  const [savingTags, setSavingTags] = useState(false);
  const [tagsSaved, setTagsSaved] = useState(false);

  // State cho phần Subtask (công việc con)
  const [subtasks, setSubtasks] = useState([]); // danh sách subtask hiện tại của task này
  const [newSubtaskTitle, setNewSubtaskTitle] = useState(''); // ô nhập tên subtask mới
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [subtaskError, setSubtaskError] = useState('');

  // MỚI SỬA: người TẠO task HOẶC Trưởng nhóm đều thấy nút Sửa/Xóa trên giao diện (khớp với canModifyTask ở Backend)
  // Giảng viên không phải người tạo cũng không phải Trưởng nhóm nên không thấy các nút này
  const canManage = task && (user.id === task.createdBy || isLeader);

  // MỚI THÊM: chế độ CHỈ XEM - dành cho người KHÔNG phải thành viên nhóm (VD Giảng viên): chỉ được đọc và bình luận,
  // các nút chỉnh sửa (lưu nội dung, lưu nhãn, thêm/tick/xóa việc con, đính kèm file) bị ẩn hoặc khóa
  const readOnly = !isMember;

  // MỚI THÊM: quyền xóa 1 việc con - chính người tạo việc con đó hoặc Trưởng nhóm (giống canModifyTask ở Backend)
  const canDeleteSubtask = (s) => !readOnly && (s.createdBy === user.id || isLeader);

  useEffect(() => {
    if (isOpen && task) {
      setLoading(true);
      setDescription(task.description || '');
      // Mỗi lần mở modal, đồng bộ lại giá trị form Sửa theo đúng dữ liệu task hiện tại
      setEditing(false);
      setEditTitle(task.title);
      setEditPriority(task.priority);
      // task.deadline là chuỗi ISO đầy đủ (VD "2026-10-01T00:00:00.000Z"), cắt lấy 10 ký tự đầu để ra "2026-10-01"
      setEditDeadline(task.deadline ? task.deadline.slice(0, 10) : '');
      // đồng bộ danh sách nhãn hiện tại của task vào state - task.tags là mảng object {id, name},
      // TagPicker chỉ cần mảng TÊN (string) nên phải map lại
      setTagNames(task.tags ? task.tags.map((t) => t.name) : []);
      // đồng bộ danh sách Subtask - task.subtasks đã được Backend include sẵn từ getByGroup, không cần gọi API riêng
      setSubtasks(task.subtasks || []);
      setNewSubtaskTitle('');
      setSubtaskError('');
      setReviewNote(''); // MỚI THÊM (Phiên 12)
      setReviewError('');
      // MỚI SỬA: đổi Promise.all thành Promise.allSettled - 2 lời gọi chạy độc lập, cái nào lỗi cũng không kéo cái kia lỗi theo
      // (VD Giảng viên có thể không xem được file đính kèm, nhưng vẫn phải xem được bình luận)
      Promise.allSettled([
        commentApi.getByTask(task.id),
        attachmentApi.getByTask(task.id),
      ]).then(([commentsResult, attachmentsResult]) => {
        // status === 'fulfilled' nghĩa là gọi API thành công, thất bại thì cho danh sách rỗng
        setComments(commentsResult.status === 'fulfilled' ? commentsResult.value.data.data : []);
        setAttachments(attachmentsResult.status === 'fulfilled' ? attachmentsResult.value.data.data : []);
        setLoading(false); // luôn tắt "Đang tải..." dù có lỗi hay không
      });
    }
  }, [isOpen, task]);

  const handleSaveDescription = async () => {
    setSavingDesc(true);
    try {
      await taskApi.updateDescription(task.id, description);
      setDescSaved(true);
      setTimeout(() => setDescSaved(false), 1500);
      if (onUpdated) onUpdated();
    } finally {
      setSavingDesc(false);
    }
  };

  // Lưu thông tin chung đã sửa (tên, độ ưu tiên, deadline)
  const handleSaveEdit = async () => {
    setEditError('');
    setSavingEdit(true);
    try {
      await taskApi.update(task.id, {
        title: editTitle,
        priority: editPriority,
        // Nếu ô deadline để trống thì gửi null (xóa deadline cũ), ngược lại gửi đúng ngày đã chọn
        deadline: editDeadline || null,
      });
      setEditing(false);
      if (onUpdated) onUpdated(); // báo cho Kanban board load lại dữ liệu mới
    } catch (err) {
      // Hiện lỗi ngay trong form thay vì alert, để người dùng thấy rõ lý do (VD "Bạn không có quyền sửa task này")
      setEditError(err.response?.data?.message || 'Sửa thất bại');
    } finally {
      setSavingEdit(false);
    }
  };

  // Xóa task - hỏi xác nhận trước, xóa xong thì đóng modal và báo Kanban load lại
  const handleDeleteTask = async () => {
    if (!window.confirm(`Xóa hẳn công việc "${task.title}"? Hành động này không thể hoàn tác.`)) return;
    setDeleting(true);
    try {
      await taskApi.remove(task.id);
      if (onUpdated) onUpdated();
      onClose(); // đóng modal vì task đã không còn tồn tại nữa
    } catch (err) {
      alert(err.response?.data?.message || 'Xóa thất bại');
    } finally {
      setDeleting(false);
    }
  };

  // Lưu lại danh sách nhãn đã sửa - ghi đè TOÀN BỘ nhãn cũ bằng danh sách mới hiện có trong state
  const handleSaveTags = async () => {
    setSavingTags(true);
    try {
      await taskApi.updateTags(task.id, tagNames);
      setTagsSaved(true);
      setTimeout(() => setTagsSaved(false), 1500);
      if (onUpdated) onUpdated(); // báo Kanban board load lại để badge nhãn trên TaskCard cập nhật ngay
    } finally {
      setSavingTags(false);
    }
  };

  // Thêm 1 Subtask mới - chỉ cần nhập tên, các thông tin khác (deadline, người phụ trách...) để trống,
  // có thể sửa sau bằng cách bấm mở chính Subtask đó ra (vì Subtask cũng là 1 Task bình thường)
  const handleAddSubtask = async (e) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;
    setSubtaskError('');
    setAddingSubtask(true);
    try {
      const res = await taskApi.createSubtask(task.id, { title: newSubtaskTitle.trim() });
      setSubtasks((prev) => [...prev, res.data.data]);
      setNewSubtaskTitle('');
      if (onUpdated) onUpdated(); // báo Kanban load lại để badge số lượng subtask trên TaskCard cập nhật
    } catch (err) {
      setSubtaskError(err.response?.data?.message || 'Thêm công việc con thất bại');
    } finally {
      setAddingSubtask(false);
    }
  };

  // Tick / bỏ tick hoàn thành 1 Subtask - đổi qua lại giữa "todo" và "done"
  // (Bỏ qua trạng thái "doing" cho gọn, vì Subtask chỉ cần biết xong hay chưa xong)
  const handleToggleSubtask = async (subtask) => {
    const newStatus = subtask.status === 'done' ? 'todo' : 'done';
    // Cập nhật UI ngay (optimistic update) cho mượt, không cần đợi Backend trả lời
    setSubtasks((prev) => prev.map((s) => (s.id === subtask.id ? { ...s, status: newStatus } : s)));
    try {
      await taskApi.updateStatus(subtask.id, newStatus);
      if (onUpdated) onUpdated();
    } catch (err) {
      // Nếu lỗi thì trả UI về trạng thái cũ
      setSubtasks((prev) => prev.map((s) => (s.id === subtask.id ? { ...s, status: subtask.status } : s)));
      alert('Cập nhật thất bại, thử lại');
    }
  };

  // Xóa 1 Subtask (dùng chung API xóa task, vì Subtask cũng là 1 Task)
  const handleDeleteSubtask = async (subtaskId) => {
    if (!window.confirm('Xóa công việc con này?')) return;
    try {
      await taskApi.remove(subtaskId);
      setSubtasks((prev) => prev.filter((s) => s.id !== subtaskId));
      if (onUpdated) onUpdated();
    } catch (err) {
      alert(err.response?.data?.message || 'Xóa thất bại');
    }
  };

  // MỚI THÊM (Phiên 12): Trưởng nhóm / Giảng viên duyệt hoặc từ chối công việc đang ở "Kiểm định"
  const handleReview = async (decision) => {
    setReviewError('');
    if (decision === 'reject' && !reviewNote.trim()) {
      setReviewError('Hãy nhập ghi chú để người làm biết cần sửa gì.');
      return;
    }
    setReviewing(true);
    try {
      await taskApi.review(task.id, decision, reviewNote.trim());
      if (onUpdated) onUpdated(); // báo Kanban tải lại
      onClose(); // đóng cửa sổ vì trạng thái đã đổi (dữ liệu đang mở không còn đúng nữa)
    } catch (err) {
      setReviewError(err.response?.data?.message || 'Duyệt thất bại, thử lại');
    } finally {
      setReviewing(false);
    }
  };

  // Kiểm tra file có phải ảnh không, dựa theo đuôi file trong tên
  const isImageFile = (fileName) => {
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      const res = await commentApi.create(task.id, text);
      setComments((prev) => [...prev, res.data.data]);
      setText('');
    } catch (err) {
      // MỚI THÊM: báo lỗi cho người dùng thấy (VD bị từ chối quyền) thay vì im lặng
      alert(err.response?.data?.message || 'Gửi bình luận thất bại');
    } finally {
      setSending(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Xóa bình luận này?')) return;
    await commentApi.remove(commentId);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      await attachmentApi.upload(task.id, file);
      const res = await attachmentApi.getByTask(task.id);
      setAttachments(res.data.data);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDownload = async (attachment) => {
    const res = await attachmentApi.download(attachment.id);
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', attachment.fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleDeleteAttachment = async (attachmentId) => {
    if (!window.confirm('Xóa file này?')) return;
    await attachmentApi.remove(attachmentId);
    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTime = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  // MỚI THÊM: hiển thị cả ngày lẫn giờ (có năm) cho các mốc hoàn thành
  const formatDateTime = (isoString) =>
    new Date(isoString).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  if (!task) return null;

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={editing ? 'Sửa công việc' : task.title} className="modal-wide">
        {/* Khối nút Sửa/Xóa - chỉ hiện khi canManage = true và KHÔNG đang ở chế độ sửa */}
        {canManage && !editing && (
          <div className="task-manage-actions">
            <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
              ✏️ Sửa
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={handleDeleteTask}
              disabled={deleting}
            >
              {deleting ? 'Đang xóa...' : '🗑️ Xóa'}
            </button>
          </div>
        )}

        {/* Form Sửa - chỉ hiện khi editing = true, thay thế phần hiển thị meta thông thường */}
        {editing ? (
          <div className="task-edit-form">
            <div className="auth-field">
              <label>Tên công việc</label>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="auth-field">
              <label>Độ ưu tiên</label>
              <select value={editPriority} onChange={(e) => setEditPriority(e.target.value)}>
                <option value="low">Thấp</option>
                <option value="medium">Trung bình</option>
                <option value="high">Cao</option>
              </select>
            </div>
            <div className="auth-field">
              <label>Deadline</label>
              <input
                type="date"
                value={editDeadline}
                onChange={(e) => setEditDeadline(e.target.value)}
              />
            </div>
            {editError && <div className="auth-error">{editError}</div>}
            <div className="task-edit-actions">
              <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>
                Hủy
              </button>
              <button type="button" className="btn-primary" onClick={handleSaveEdit} disabled={savingEdit}>
                {savingEdit ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </div>
        ) : (
          <div className="task-detail-meta">
            {task.assignee && <span>👤 {task.assignee.fullName}</span>}
            {task.deadline && (
              <span>📅 {new Date(task.deadline).toLocaleDateString('vi-VN')}</span>
            )}
          </div>
        )}

        {/* MỚI THÊM: thông tin hoàn thành - chỉ hiện khi task đã từng xong hoặc từng phải làm lại */}
        {!editing && (task.firstCompletedAt || task.reopenCount > 0) && (
          <div
            style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12.5, color: 'var(--color-text-secondary)', margin: '4px 0 12px' }}
          >
            {task.firstCompletedAt && <span>✅ Hoàn thành lần đầu: {formatDateTime(task.firstCompletedAt)}</span>}
            {task.completedAt && task.completedAt !== task.firstCompletedAt && (
              <span>🔁 Hoàn thành gần nhất: {formatDateTime(task.completedAt)}</span>
            )}
            {task.reopenCount > 0 && <span>↻ Đã làm lại {task.reopenCount} lần</span>}
          </div>
        )}

        {/* MỚI THÊM (Phiên 12): khung KIỂM ĐỊNH - chỉ với việc chính đang chờ duyệt */}
        {!editing && !task.parentTaskId && task.status === 'review' && (
          <div className="task-review-box">
            <div className="task-review-title">🔎 Đang chờ Kiểm định</div>
            {canReview ? (
              <>
                <textarea
                  className="content-textarea"
                  rows={3}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Ghi chú (bắt buộc nếu từ chối: nêu rõ cần làm lại điều gì)..."
                />
                {reviewError && <div className="auth-error">{reviewError}</div>}
                <div className="task-review-actions">
                  <button type="button" className="btn-secondary" onClick={() => handleReview('reject')} disabled={reviewing}>
                    ↩ Từ chối, làm lại
                  </button>
                  <button type="button" className="btn-primary" onClick={() => handleReview('approve')} disabled={reviewing}>
                    ✓ Duyệt: Hoàn thành
                  </button>
                </div>
              </>
            ) : (
              <p className="task-review-wait">Công việc này đã được nộp, đang chờ Trưởng nhóm hoặc Giảng viên duyệt.</p>
            )}
          </div>
        )}

        {/* MỚI THÊM (Phiên 12): việc bị từ chối - hiện lý do để người làm biết cần sửa gì */}
        {!editing && task.status === 'redo' && task.reviewNote && (
          <div className="task-review-box task-review-box-rejected">
            <div className="task-review-title">↩ Bị từ chối, cần làm lại</div>
            <p className="task-review-note-text">{task.reviewNote}</p>
            <div className="task-review-meta">
              {task.reviewedByName ? `Bởi ${task.reviewedByName}` : ''}
              {task.reviewedAt ? ` · ${formatDateTime(task.reviewedAt)}` : ''}
            </div>
          </div>
        )}

        <div className="content-section">
          <div className="comment-section-title">📝 Nội dung chi tiết</div>
          <textarea
            className="content-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Gõ hoặc dán (Ctrl+V) nội dung công việc vào đây..."
            rows={5}
            readOnly={readOnly} // MỚI THÊM: chế độ chỉ xem thì không cho gõ vào ô nội dung
          />
          {/* MỚI SỬA: nút Lưu nội dung chỉ hiện với thành viên nhóm, Giảng viên (chỉ xem) không thấy */}
          {!readOnly && (
            <div className="content-actions">
              {descSaved && <span className="content-saved-hint">✓ Đã lưu</span>}
              <button
                type="button"
                className="btn-primary"
                onClick={handleSaveDescription}
                disabled={savingDesc}
              >
                {savingDesc ? 'Đang lưu...' : 'Lưu nội dung'}
              </button>
            </div>
          )}
        </div>

        {/* MỚI SỬA: bọc khối Nhãn + Công việc con vào 1 hàng ngang (task-detail-row) thay vì xếp dọc,
            cho form đỡ dài - 2 khối này đủ ngắn để nằm cạnh nhau */}
        <div className="task-detail-row">
          <div className="content-section">
            <div className="comment-section-title">🏷️ Nhãn</div>
            {/* MỚI SỬA: thành viên nhóm được chọn/lưu nhãn; chế độ chỉ xem thì chỉ hiện tên các nhãn dạng chữ */}
            {readOnly ? (
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                {tagNames.length > 0 ? tagNames.join(', ') : 'Chưa có nhãn nào.'}
              </div>
            ) : (
              <>
                <TagPicker groupId={task.groupId} selectedTags={tagNames} onChange={setTagNames} />
                <div className="content-actions">
                  {tagsSaved && <span className="content-saved-hint">✓ Đã lưu</span>}
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSaveTags}
                    disabled={savingTags}
                  >
                    {savingTags ? 'Đang lưu...' : 'Lưu nhãn'}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Khối Subtask - CHỈ hiện khi task hiện tại KHÔNG PHẢI là 1 Subtask (task.parentTaskId trống),
              vì hệ thống chỉ hỗ trợ Subtask sâu 1 cấp. Nếu task này là 1 Subtask, hàng chỉ còn 1 cột (Nhãn) tự giãn full width */}
          {!task.parentTaskId && (
            <div className="content-section">
              <div className="comment-section-title">
                ☑️ Công việc con
                {subtasks.length > 0 &&
                  ` (${subtasks.filter((s) => s.status === 'done').length}/${subtasks.length})`}
              </div>

              {subtasks.length > 0 && (
                <div className="subtask-list">
                  {subtasks.map((s) => (
                    <div key={s.id} className="subtask-item" data-priority={s.priority}>
                      <input
                        type="checkbox"
                        checked={s.status === 'done'}
                        onChange={() => handleToggleSubtask(s)}
                        disabled={readOnly} // MỚI THÊM: chế độ chỉ xem thì không cho tick
                      />
                      <span className={`subtask-title ${s.status === 'done' ? 'subtask-done' : ''}`}>
                        {s.title}
                      </span>
                      {s.assignee && (
                        <span className="task-mini-avatar">
                          {s.assignee.fullName.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      {/* MỚI SỬA: chỉ hiện nút Xóa việc con với người tạo việc con đó hoặc Trưởng nhóm */}
                      {canDeleteSubtask(s) && (
                        <button
                          type="button"
                          className="comment-delete-btn"
                          onClick={() => handleDeleteSubtask(s.id)}
                        >
                          Xóa
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* MỚI SỬA: ô thêm việc con chỉ hiện với thành viên nhóm, Giảng viên (chỉ xem) không thấy */}
              {!readOnly && (
                <>
                  <form className="comment-input-row" onSubmit={handleAddSubtask}>
                    <input
                      value={newSubtaskTitle}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      placeholder="+ Thêm công việc con..."
                    />
                    <button type="submit" className="btn-primary" disabled={addingSubtask}>
                      {addingSubtask ? 'Đang thêm...' : 'Thêm'}
                    </button>
                  </form>
                  {subtaskError && <div className="auth-error">{subtaskError}</div>}
                </>
              )}
            </div>
          )}
        </div>

        <div className="attachment-section">
          <div className="comment-section-title">
            📎 File đính kèm {attachments.length > 0 && `(${attachments.length})`}
          </div>

          {loading ? (
            <p style={{ fontSize: 13, color: '#9CA0A8' }}>Đang tải...</p>
          ) : (
            <>
              {attachments.length > 0 && (
                <div className="attachment-list">
                  {attachments.map((a) => (
                    <div key={a.id} className="attachment-item">
                      {isImageFile(a.fileName) ? (
                        <img
                          src={attachmentApi.getViewUrl(a.id)}
                          alt={a.fileName}
                          className="attachment-thumbnail"
                          onClick={() => setLightboxImage(a)}
                        />
                      ) : (
                        <span className="attachment-icon" onClick={() => handleDownload(a)}>📄</span>
                      )}

                      <div
                        className="attachment-info"
                        onClick={() => (isImageFile(a.fileName) ? setLightboxImage(a) : handleDownload(a))}
                      >
                        <div className="attachment-name">{a.fileName}</div>
                        <div className="attachment-meta">
                          {formatFileSize(a.fileSize)} · {a.uploader.fullName} · {formatTime(a.createdAt)}
                        </div>
                      </div>
                      {a.uploadedBy === user.id && (
                        <button
                          className="comment-delete-btn"
                          onClick={() => handleDeleteAttachment(a.id)}
                        >
                          Xóa
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* MỚI SỬA: nút đính kèm file chỉ hiện với thành viên nhóm */}
              {!readOnly && (
                <label className="attachment-upload-btn">
                  {uploading ? 'Đang tải lên...' : '+ Đính kèm file'}
                  <input type="file" hidden onChange={handleFileSelect} disabled={uploading} />
                </label>
              )}
            </>
          )}
        </div>

        <div className="comment-section">
          <div className="comment-section-title">💬 Bình luận</div>

          {loading ? (
            <p style={{ fontSize: 13, color: '#9CA0A8' }}>Đang tải...</p>
          ) : comments.length === 0 ? (
            <p style={{ fontSize: 13, color: '#9CA0A8' }}>Chưa có bình luận nào.</p>
          ) : (
            <div className="comment-list">
              {comments.map((c) => (
                <div key={c.id} className="comment-item">
                  <div className="comment-avatar">
                    {c.author.fullName?.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="comment-body">
                    <div className="comment-header-row">
                      <span className="comment-author">{c.author.fullName}</span>
                      {/* MỚI THÊM: nhãn vai trò - màu riêng cho từng vai trò (xem comment.css) */}
                      {c.authorRole && (
                        <span className={`comment-role comment-role-${c.authorRole}`}>
                          {ROLE_LABEL[c.authorRole]}
                        </span>
                      )}
                      <span className="comment-time">{formatTime(c.createdAt)}</span>
                      {c.authorId === user.id && (
                        <button className="comment-delete-btn" onClick={() => handleDeleteComment(c.id)}>
                          Xóa
                        </button>
                      )}
                    </div>
                    <div className="comment-text">{c.content}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form className="comment-input-row" onSubmit={handleSend}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Viết bình luận..."
            />
            <button type="submit" className="btn-primary" disabled={sending}>
              Gửi
            </button>
          </form>
        </div>
      </Modal>

      <ImageLightbox
        imageUrl={lightboxImage ? attachmentApi.getViewUrl(lightboxImage.id) : null}
        fileName={lightboxImage?.fileName}
        onClose={() => setLightboxImage(null)}
        onDownload={() => lightboxImage && handleDownload(lightboxImage)}
      />
    </>
  );
}