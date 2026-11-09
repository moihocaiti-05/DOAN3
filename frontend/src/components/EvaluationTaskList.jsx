import { useState } from 'react';
import '../styles/supervisor-eval-tasks.css'; // CSS RIÊNG (tiền tố evt-) cho thẻ tab và danh sách việc trong hộp thoại đánh giá

// Nhãn trạng thái: khớp với Kanban của nhóm (todo đổi tên thành "Danh sách công việc")
const STATUS_LABEL = {
  todo: 'Danh sách công việc',
  doing: 'Đang làm',
  review: 'Kiểm định',
  redo: 'Làm lại',
  done: 'Hoàn thành',
};
const PRIORITY_LABEL = { low: 'Thấp', medium: 'Trung bình', high: 'Cao' };

// Ngày hôm nay dạng YYYY-MM-DD theo giờ máy, để so với deadline (cùng cách so với TaskCard: lấy 10 ký tự đầu của deadline)
const todayString = () => {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
};

// 2026-11-05T00:00:00.000Z -> 05/11/2026
const formatDeadline = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : null);

// Ngày + giờ theo giờ Việt Nam (dùng cho "hoàn thành lúc ...")
const formatDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

// Việc trễ hạn = chưa hoàn thành và deadline đã qua (so theo ngày)
const isOverdue = (task) => task.status !== 'done' && !!task.deadline && task.deadline.slice(0, 10) < todayString();

// 1 dòng việc: bấm để mở xem nội dung đầy đủ; việc chính còn liệt kê việc con bên trong (mỗi việc con cũng bấm mở được)
function TaskRow({ task, isSub }) {
  const [open, setOpen] = useState(false);
  const subs = task.subtasks || [];
  const subDone = subs.filter((s) => s.status === 'done').length;
  const overdue = isOverdue(task);

  return (
    <li className={`evt-task ${isSub ? 'evt-task-sub' : ''}`}>
      <button className="evt-task-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="evt-caret">{open ? '▾' : '▸'}</span>
        <span className={`evt-status evt-status-${task.status}`}>{STATUS_LABEL[task.status] || task.status}</span>
        <span className="evt-task-title">{task.title}</span>
        {subs.length > 0 && (
          <span className="evt-sub-count">
            {subDone}/{subs.length} việc con
          </span>
        )}
        {task.assigneeName && <span className="evt-assignee">{task.assigneeName}</span>}
        {task.deadline && (
          <span className={`evt-deadline ${overdue ? 'evt-deadline-late' : ''}`}>
            {formatDeadline(task.deadline)}
            {overdue ? ' · trễ' : ''}
          </span>
        )}
      </button>

      {open && (
        <div className="evt-task-body">
          {/* Mô tả nguyên văn, giữ xuống dòng */}
          {task.description ? (
            <p className="evt-desc">{task.description}</p>
          ) : (
            <p className="evt-desc evt-desc-empty">Không có mô tả.</p>
          )}

          <div className="evt-meta">
            <span>Phụ trách: {task.assigneeName || 'Chưa giao'}</span>
            <span>Ưu tiên: {PRIORITY_LABEL[task.priority] || task.priority}</span>
            {task.completedAt && <span>Hoàn thành lúc {formatDateTime(task.completedAt)}</span>}
            {task.reopenCount > 0 && <span>Đã làm lại {task.reopenCount} lần</span>}
          </div>

          {task.tags && task.tags.length > 0 && (
            <div className="evt-tags">
              {task.tags.map((name) => (
                <span key={name} className="evt-tag">
                  {name}
                </span>
              ))}
            </div>
          )}

          {subs.length > 0 && (
            <>
              <p className="evt-sub-title">Việc con ({subs.length})</p>
              <ul className="evt-list evt-sublist">
                {subs.map((s) => (
                  <TaskRow key={s.id} task={s} isSub />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </li>
  );
}

// Danh sách việc của 1 mốc (chỉ những việc gắn TRỰC TIẾP vào mốc đó), hiện trong tab "Công việc" của hộp thoại đánh giá
// Props: tasks = mảng việc (mỗi việc có subtasks), hasChildren = mốc này có mốc con hay không (để gợi ý khi danh sách rỗng)
export default function EvaluationTaskList({ tasks, hasChildren }) {
  if (tasks.length === 0) {
    return (
      <div className="evt-empty">
        <p>Mốc này chưa có công việc nào gắn trực tiếp.</p>
        {hasChildren && <p className="evt-empty-hint">Công việc có thể nằm trong các mốc con, hãy chọn mốc con ở cây bên trái.</p>}
      </div>
    );
  }

  const done = tasks.filter((t) => t.status === 'done').length;
  const late = tasks.filter(isOverdue).length;
  const subTotal = tasks.reduce((n, t) => n + (t.subtasks || []).length, 0);

  return (
    <>
      <p className="evt-summary">
        {tasks.length} việc · {done} hoàn thành
        {late > 0 ? ` · ${late} trễ hạn` : ''}
        {subTotal > 0 ? ` · ${subTotal} việc con` : ''}
      </p>
      <ul className="evt-list">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
      </ul>
    </>
  );
}