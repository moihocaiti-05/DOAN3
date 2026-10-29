import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { taskApi } from '../services/taskApi';
import '../styles/send-mail.css';

// Giới hạn mỗi lần gửi - phải khớp với Backend (task.validator.js và taskMail.service.js)
const MAX_RECIPIENTS = 20; // tối đa 20 người nhận mỗi lần
const MAX_TASKS_PER_PERSON = 30; // tối đa 30 công việc trong mail của mỗi người
const MAX_MESSAGE = 500; // độ dài tối đa lời nhắn

const PRIORITY_TEXT = { low: 'Thấp', medium: 'Trung bình', high: 'Cao' };
const STATUS_TEXT = { todo: 'Chưa làm', doing: 'Đang làm', redo: 'Làm lại', done: 'Hoàn thành' };

// Đổi "2026-10-20T00:00:00.000Z" thành "20/10/2026" bằng cách cắt chuỗi (không đổi múi giờ nên không bị lệch ngày)
const formatDeadline = (deadline) => {
  if (!deadline) return 'Chưa có hạn';
  const [year, month, day] = deadline.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
};

// Chữ cái đầu của TÊN (từ cuối trong họ tên tiếng Việt), dùng làm ảnh đại diện chữ
const getInitial = (fullName) => {
  const lastWord = String(fullName || '?').trim().split(/\s+/).pop();
  return lastWord.charAt(0).toUpperCase();
};

// Hộp thoại "Gửi mail công việc" - khung riêng, rộng, chia 2 cột:
//   Trái  = 1. Chọn công việc (có tìm kiếm; danh sách đổi theo "cách gửi" đang chọn ở cột phải)
//   Phải  = 2. Gửi cho ai (chọn người nhận + chọn cách gửi)
// MỚI SỬA: có 3 cách gửi, mỗi cách cột trái hiện một danh sách việc khác nhau:
//   'own'        = chỉ hiện việc ĐÃ GIAO cho những người đang tích ở cột phải; mỗi người chỉ nhận việc của chính họ
//   'all'        = hiện TẤT CẢ việc của mọi người; mỗi người nhận mọi việc đã tích
//   'unassigned' = chỉ hiện việc CHƯA GIAO cho ai; mỗi người đã tích nhận mọi việc đã tích
// Backend gửi MỖI NGƯỜI 1 MAIL GỘP.
// Props: tasks = danh sách công việc cấp cao của nhóm; members = thành viên nhóm;
// isLeader = Trưởng nhóm gửi được mọi việc, thành viên thường chỉ gửi được việc do chính mình tạo
export default function SendTaskMailModal({ isOpen, onClose, groupId, tasks, members, currentUserId, isLeader }) {
  const [selectedTaskIds, setSelectedTaskIds] = useState([]); // id các công việc đã tích
  const [selectedUserIds, setSelectedUserIds] = useState([]); // id các người nhận đã tích
  // MỚI SỬA: thêm chế độ 'unassigned'. 'own' = chỉ việc giao cho người đã tích; 'all' = mọi việc; 'unassigned' = chỉ việc chưa giao
  const [mode, setMode] = useState('own');
  const [taskSearch, setTaskSearch] = useState(''); // chữ đang gõ trong ô tìm công việc
  const [hideDone, setHideDone] = useState(false); // ẩn các việc đã hoàn thành khỏi danh sách
  const [message, setMessage] = useState(''); // lời nhắn thêm (không bắt buộc)
  const [sending, setSending] = useState(false); // đang gửi (khóa nút, tránh bấm nhiều lần)
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // kết quả sau khi gửi: { sentCount, failedNames }

  // Mỗi lần mở hộp thoại: xóa sạch lựa chọn và kết quả của lần trước
  useEffect(() => {
    if (isOpen) {
      setSelectedTaskIds([]);
      setSelectedUserIds([]);
      setMode('own');
      setTaskSearch('');
      setHideDone(false);
      setMessage('');
      setError('');
      setResult(null);
    }
  }, [isOpen]);

  // Khung riêng nên tự lo 2 việc mà Modal chung vẫn làm: bấm phím Esc để đóng, và khóa cuộn trang phía sau khi đang mở
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Trưởng nhóm gửi được mọi công việc; thành viên thường chỉ gửi được việc do chính mình tạo (Backend cũng kiểm tra lại)
  const eligibleTasks = isLeader ? tasks : tasks.filter((t) => t.createdBy === currentUserId);
  const taskById = new Map(eligibleTasks.map((t) => [t.id, t]));

  // Chỉ thành viên ĐÃ ĐỒNG Ý mới nhận được mail
  const acceptedMembers = members.filter((m) => m.status === 'ACCEPTED');
  const memberById = new Map(acceptedMembers.map((m) => [m.userId, m]));

  // Người phụ trách của 1 việc (null nếu chưa giao hoặc người đó không còn là thành viên đã đồng ý)
  const assigneeOf = (t) => (t.assignedTo ? memberById.get(t.assignedTo) || null : null);

  // MỚI THÊM: danh sách việc được phép hiện ở cột trái theo từng cách gửi (nextUserIds = những người đang được tích ở cột phải)
  //   'all'        -> mọi việc
  //   'unassigned' -> chỉ việc chưa giao cho ai (hoặc người phụ trách không còn là thành viên đã đồng ý, đúng như dòng đang hiện "Chưa giao")
  //   'own'        -> chỉ việc đã giao cho 1 trong những người đang tích; chưa tích ai thì danh sách rỗng
  const tasksForMode = (nextMode, nextUserIds) => {
    if (nextMode === 'all') return eligibleTasks;
    if (nextMode === 'unassigned') return eligibleTasks.filter((t) => !assigneeOf(t));
    return eligibleTasks.filter((t) => assigneeOf(t) && nextUserIds.includes(t.assignedTo));
  };
  const modeTasks = tasksForMode(mode, selectedUserIds);

  // Lọc tiếp danh sách theo chữ đang gõ (tên việc, người phụ trách, nhãn) và theo ô "Ẩn việc đã xong"
  const keyword = taskSearch.trim().toLowerCase();
  const visibleTasks = modeTasks.filter((t) => { // MỚI SỬA: lọc từ modeTasks thay vì eligibleTasks
    if (hideDone && t.status === 'done') return false;
    if (!keyword) return true;
    const text = [t.title, t.assignee?.fullName, ...(t.tags || []).map((tag) => tag.name)].join(' ').toLowerCase();
    return text.includes(keyword);
  });

  // ----- Chọn công việc (KHÔNG đụng tới danh sách người nhận) -----
  const toggleTask = (t) => {
    setSelectedTaskIds((prev) => (prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id]));
  };
  // "Chọn tất cả": chỉ tích các việc đang hiện trong danh sách (sau khi lọc)
  const selectAllVisibleTasks = () => {
    setSelectedTaskIds((prev) => [...new Set([...prev, ...visibleTasks.map((t) => t.id)])]);
  };
  const clearTasks = () => setSelectedTaskIds([]);

  // ----- Chọn người nhận (KHÔNG đụng tới danh sách công việc) -----
  // MỚI THÊM: bỏ tích những việc không còn nằm trong danh sách của cách gửi / danh sách người nhận mới,
  // để không gửi nhầm một việc đang bị ẩn khỏi cột trái
  const pruneSelectedTasks = (nextMode, nextUserIds) => {
    const allowed = new Set(tasksForMode(nextMode, nextUserIds).map((t) => t.id));
    setSelectedTaskIds((prev) => prev.filter((id) => allowed.has(id)));
  };

  // MỚI SỬA: đổi người nhận thì ở chế độ 'own' danh sách việc bên trái đổi theo, nên phải bỏ tích việc không còn hiện
  const updateSelectedUsers = (nextUserIds) => {
    setSelectedUserIds(nextUserIds);
    pruneSelectedTasks(mode, nextUserIds);
  };
  const toggleUser = (userId) => {
    updateSelectedUsers(
      selectedUserIds.includes(userId) ? selectedUserIds.filter((id) => id !== userId) : [...selectedUserIds, userId]
    );
  };
  const selectAllUsers = () => updateSelectedUsers(acceptedMembers.map((m) => m.userId));
  const clearUsers = () => updateSelectedUsers([]);

  // MỚI SỬA: đổi cách gửi thì cột trái đổi danh sách, các việc đã tích mà không còn hiện sẽ tự bỏ tích
  const changeMode = (nextMode) => {
    setMode(nextMode);
    pruneSelectedTasks(nextMode, selectedUserIds);
  };

  // Các việc mà MỘT người sẽ nhận: 'own' = chỉ việc đã tích được giao cho chính người đó;
  // 'all' và 'unassigned' = mọi việc đã tích (MỚI SỬA: thêm 'unassigned', việc chưa giao thì ai nhận cũng là nhận tất cả việc đã tích)
  const taskIdsFor = (userId) =>
    mode === 'own'
      ? selectedTaskIds.filter((id) => taskById.get(id)?.assignedTo === userId)
      : selectedTaskIds;

  // Dữ liệu gửi lên Backend: người không có việc nào thì bỏ qua
  const selectedMembers = acceptedMembers.filter((m) => selectedUserIds.includes(m.userId));
  const recipientsPayload = selectedMembers
    .map((m) => ({ userId: m.userId, taskIds: taskIdsFor(m.userId) }))
    .filter((r) => r.taskIds.length > 0);

  const skippedPeople = selectedMembers.length - recipientsPayload.length; // người đã chọn nhưng không có việc nào để nhận
  const sentTaskCount = new Set(recipientsPayload.flatMap((r) => r.taskIds)).size; // số việc thật sự được gửi đi
  const unsentTaskCount = selectedTaskIds.length - sentTaskCount; // việc đã tích nhưng người phụ trách chưa được chọn (chế độ 'own')
  const tooManyUsers = selectedUserIds.length > MAX_RECIPIENTS;
  const tooManyTasks = recipientsPayload.some((r) => r.taskIds.length > MAX_TASKS_PER_PERSON);
  const canSend = recipientsPayload.length > 0 && !tooManyUsers && !tooManyTasks && !sending;

  // Kiểu viên thuốc đếm: đỏ khi vượt giới hạn, màu chủ đạo khi đã chọn, xám khi chưa chọn gì
  const countPillClass = (count, over) =>
    `send-mail-count-pill ${over ? 'send-mail-count-pill-over' : count > 0 ? 'send-mail-count-pill-active' : ''}`;

  // Câu tóm tắt ở chân hộp thoại: nói rõ sẽ gửi gì, hoặc còn thiếu gì
  const summary = (() => {
    if (tooManyUsers) return { text: `Chỉ được chọn tối đa ${MAX_RECIPIENTS} người nhận mỗi lần gửi`, warn: true };
    if (tooManyTasks) return { text: `Mỗi người chỉ nhận tối đa ${MAX_TASKS_PER_PERSON} công việc mỗi lần gửi`, warn: true };
    if (selectedTaskIds.length === 0 && selectedUserIds.length === 0) return { text: 'Chọn công việc ở cột trái, rồi chọn người nhận ở cột phải' };
    if (selectedTaskIds.length === 0) return { text: 'Chọn ít nhất 1 công việc' };
    if (selectedUserIds.length === 0) return { text: 'Chọn ít nhất 1 người nhận' };
    if (recipientsPayload.length === 0) return { text: 'Người đã chọn chưa có việc nào được tích (đang ở chế độ “Chỉ việc của họ”)', warn: true };
    const notes = [];
    if (skippedPeople > 0) notes.push(`bỏ qua ${skippedPeople} người chưa có việc`);
    if (unsentTaskCount > 0) notes.push(`${unsentTaskCount} việc chưa gửi vì người phụ trách chưa được chọn`);
    return {
      text: `Gửi ${sentTaskCount} công việc cho ${recipientsPayload.length} người (mỗi người 1 mail${notes.length ? '; ' + notes.join('; ') : ''})`,
    };
  })();

  const handleSend = async () => {
    setError('');
    setSending(true);
    try {
      const res = await taskApi.sendMail(groupId, { recipients: recipientsPayload, message });
      setResult(res.data.data); // hiện màn hình kết quả thay cho form
    } catch (err) {
      setError(err.response?.data?.message || 'Gửi mail thất bại');
    } finally {
      setSending(false);
    }
  };

  // Chữ hướng dẫn dưới nút chuyển cách gửi
  // MỚI SỬA: có thêm lời giải thích cho chế độ 'unassigned' và nói rõ cột trái đang hiện gì
  const MODE_HINTS = {
    own: 'Cột trái chỉ hiện việc đã giao cho người bạn tích ở cột phải. Mỗi người chỉ nhận việc của chính họ.',
    all: 'Cột trái hiện mọi công việc của mọi người. Mỗi người nhận TẤT CẢ các việc đã tích, kể cả việc của người khác.',
    unassigned: 'Cột trái chỉ hiện việc chưa giao cho ai. Mỗi người bạn tích sẽ nhận tất cả các việc đã tích.',
  };
  const modeHint = MODE_HINTS[mode];

  // MỚI THÊM: nội dung hiện ở cột trái khi danh sách trống, nói rõ vì sao trống
  const emptyState = (() => {
    if (eligibleTasks.length === 0) {
      return {
        title: isLeader ? 'Nhóm chưa có công việc nào' : 'Bạn chưa tạo công việc nào để gửi',
        sub: isLeader ? '' : 'Trưởng nhóm có thể gửi mọi công việc trong nhóm.',
      };
    }
    if (mode === 'own' && selectedUserIds.length === 0) {
      return { title: 'Chọn người nhận ở cột phải', sub: 'Các việc được giao cho họ sẽ hiện ở đây.' };
    }
    if (modeTasks.length === 0) {
      if (mode === 'own') return { title: 'Người đã chọn chưa được giao việc nào', sub: '' };
      if (mode === 'unassigned') return { title: 'Không có công việc nào chưa giao cho ai', sub: '' };
    }
    return { title: 'Không có công việc nào khớp', sub: '' };
  })();

  // Nhấn ra vùng tối bên ngoài thì đóng (không đóng khi đang gửi)
  const handleOverlayMouseDown = (e) => {
    if (e.target === e.currentTarget && !sending) onClose();
  };

  return createPortal(
    <div className="send-mail-overlay" onMouseDown={handleOverlayMouseDown}>
      <div className="send-mail-dialog" role="dialog" aria-modal="true" aria-labelledby="send-mail-title">
        {/* Thanh tiêu đề */}
        <div className="send-mail-dialog-head">
          <h2 id="send-mail-title" className="send-mail-dialog-title">Gửi mail công việc</h2>
          <button type="button" className="send-mail-close" onClick={onClose} aria-label="Đóng">×</button>
        </div>

        {result ? (
          /* ===== Màn hình sau khi gửi xong ===== */
          <>
            <div className="send-mail-dialog-body">
              <div className="send-mail-result">
                <div className="send-mail-result-icon">✅</div>
                <p className="send-mail-result-title">Đã gửi mail cho {result.sentCount} người</p>
                <p className="send-mail-result-sub">Mỗi người nhận 1 mail gộp các công việc bạn đã chọn.</p>
                {result.failedNames.length > 0 && (
                  <p className="send-mail-warning" style={{ marginTop: 10, fontSize: 13 }}>
                    Gửi lỗi cho {result.failedNames.length} người: {result.failedNames.join(', ')}. Bạn có thể thử gửi lại riêng cho họ.
                  </p>
                )}
              </div>
            </div>
            <div className="send-mail-dialog-foot">
              <span />
              <div className="send-mail-actions">
                <button type="button" className="btn-primary" onClick={onClose}>Đóng</button>
              </div>
            </div>
          </>
        ) : (
          /* ===== Màn hình chọn công việc + người nhận ===== */
          <>
            <div className="send-mail-dialog-body">
              <div className="send-mail-grid">
                {/* Cột trái: chọn công việc */}
                <section className="send-mail-panel">
                  <div className="send-mail-panel-head">
                    <span className="send-mail-step">
                      <span className="send-mail-step-num">1</span>
                      Chọn công việc
                      <span className={countPillClass(selectedTaskIds.length, false)}>{selectedTaskIds.length}</span>
                    </span>
                    <span className="send-mail-links">
                      <button type="button" className="send-mail-link-btn" onClick={selectAllVisibleTasks}>Chọn tất cả</button>
                      <button type="button" className="send-mail-link-btn" onClick={clearTasks}>Bỏ chọn</button>
                    </span>
                  </div>
                  {!isLeader && <p className="send-mail-note">Bạn chỉ gửi được công việc do chính mình tạo.</p>}

                  <div className="send-mail-filters">
                    <div className="send-mail-search-wrap">
                      <span className="send-mail-search-icon">🔍</span>
                      <input
                        className="send-mail-search"
                        value={taskSearch}
                        onChange={(e) => setTaskSearch(e.target.value)}
                        placeholder="Tìm theo tên việc, người phụ trách, nhãn..."
                      />
                    </div>
                    <label className="send-mail-check">
                      <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
                      Ẩn việc đã xong
                    </label>
                  </div>

                  <div className="send-mail-list">
                    {visibleTasks.length === 0 ? (
                      <div className="send-mail-empty">
                        <div className="send-mail-empty-icon">📭</div>
                        <p className="send-mail-empty-title">{emptyState.title}</p>
                        {emptyState.sub && <p className="send-mail-empty-sub">{emptyState.sub}</p>}
                      </div>
                    ) : (
                      visibleTasks.map((t) => {
                        const assignee = assigneeOf(t);
                        return (
                          <label
                            key={t.id}
                            className={`send-mail-row ${selectedTaskIds.includes(t.id) ? 'send-mail-row-selected' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedTaskIds.includes(t.id)}
                              onChange={() => toggleTask(t)}
                            />
                            <div className="send-mail-row-body">
                              <div className={`send-mail-row-title ${t.status === 'done' ? 'send-mail-row-title-done' : ''}`}>{t.title}</div>
                              <div className="send-mail-meta">
                                <span className={`send-mail-pill send-mail-pill-${t.priority}`}>{PRIORITY_TEXT[t.priority] || t.priority}</span>
                                <span className="send-mail-meta-text">{STATUS_TEXT[t.status] || t.status}</span>
                                <span className="send-mail-meta-text">📅 {formatDeadline(t.deadline)}</span>
                              </div>
                            </div>
                            {/* Người phụ trách nằm bên phải mỗi dòng */}
                            <span className="send-mail-assignee">
                              {assignee ? (
                                <>
                                  <span className="send-mail-avatar send-mail-avatar-sm">{getInitial(assignee.user.fullName)}</span>
                                  <span className="send-mail-assignee-name">{assignee.user.fullName}</span>
                                </>
                              ) : (
                                <span className="send-mail-meta-text">Chưa giao</span>
                              )}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </section>

                {/* Cột phải: chọn người nhận */}
                <section className="send-mail-panel">
                  <div className="send-mail-panel-head">
                    <span className="send-mail-step">
                      <span className="send-mail-step-num">2</span>
                      Gửi cho ai
                      <span className={countPillClass(selectedUserIds.length, tooManyUsers)}>
                        {selectedUserIds.length}/{MAX_RECIPIENTS}
                      </span>
                    </span>
                    <span className="send-mail-links">
                      <button type="button" className="send-mail-link-btn" onClick={selectAllUsers}>Chọn tất cả</button>
                      <button type="button" className="send-mail-link-btn" onClick={clearUsers}>Bỏ chọn</button>
                    </span>
                  </div>

                  {/* MỚI SỬA: 3 cách gửi - việc của họ / tất cả việc / việc chưa giao cho ai (mỗi cách đổi danh sách ở cột trái) */}
                  <div className="send-mail-segment" role="group" aria-label="Cách gửi">
                    <button
                      type="button"
                      className={mode === 'own' ? 'send-mail-segment-active' : ''}
                      onClick={() => changeMode('own')}
                    >
                      Chỉ việc của họ
                    </button>
                    <button
                      type="button"
                      className={mode === 'all' ? 'send-mail-segment-active' : ''}
                      onClick={() => changeMode('all')}
                    >
                      Tất cả việc
                    </button>
                    <button
                      type="button"
                      className={mode === 'unassigned' ? 'send-mail-segment-active' : ''}
                      onClick={() => changeMode('unassigned')}
                    >
                      Chưa giao cho ai
                    </button>
                  </div>
                  <p className="send-mail-hint">{modeHint}</p>

                  <div className="send-mail-list">
                    {acceptedMembers.map((m) => {
                      const count = taskIdsFor(m.userId).length; // số việc người này SẼ nhận với các việc đang tích
                      return (
                        <label
                          key={m.userId}
                          className={`send-mail-row ${selectedUserIds.includes(m.userId) ? 'send-mail-row-selected' : ''}`}
                        >
                          <input type="checkbox" checked={selectedUserIds.includes(m.userId)} onChange={() => toggleUser(m.userId)} />
                          <span className="send-mail-avatar">{getInitial(m.user.fullName)}</span>
                          <div className="send-mail-row-body">
                            <div className="send-mail-member-name">
                              {m.user.fullName}
                              {m.role === 'leader' && <span className="send-mail-leader-badge">Trưởng nhóm</span>}
                            </div>
                            <div className="send-mail-member-email">{m.user.email}</div>
                          </div>
                          <span className={`send-mail-row-count ${count > 0 ? 'send-mail-row-count-active' : ''}`}>{count} việc</span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              </div>

              {/* Lời nhắn thêm: nằm dưới cả 2 cột */}
              <div className="send-mail-message">
                <label className="send-mail-label" htmlFor="send-mail-message-input">Lời nhắn (không bắt buộc)</label>
                <textarea
                  id="send-mail-message-input"
                  className="send-mail-textarea"
                  rows={2}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={MAX_MESSAGE}
                  placeholder="VD: Mọi người xem deadline giúp mình nhé"
                />
                <p className="send-mail-char-count">{message.length}/{MAX_MESSAGE}</p>
              </div>

              {error && <div className="send-mail-error">{error}</div>}
            </div>

            {/* Chân hộp thoại: câu tóm tắt + nút Hủy / Gửi mail */}
            <div className="send-mail-dialog-foot">
              <p className={`send-mail-summary ${summary.warn ? 'send-mail-warning' : ''}`}>{summary.text}</p>
              <div className="send-mail-actions">
                <button type="button" className="btn-secondary" onClick={onClose}>Hủy</button>
                <button type="button" className="btn-primary" onClick={handleSend} disabled={!canSend}>
                  {sending ? 'Đang gửi...' : 'Gửi mail'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}