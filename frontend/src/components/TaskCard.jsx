import { useDraggable } from '@dnd-kit/core';
import '../styles/tag.css'; // cần style cho badge nhãn hiển thị trên card

// MỚI SỬA: tách phần "mặt thẻ" ra dùng chung cho 3 nơi: thẻ trên cột Kanban, thẻ trong khung "Xem tất cả",
// và bản "bóng" (DragOverlay) hiện theo con trỏ khi kéo thẻ từ khung "Xem tất cả" ra ngoài
function TaskCardFace({ task, innerRef, style, dragging, onClick, extraProps }) {
  const getInitials = (name) => name?.slice(0, 2).toUpperCase() || '??';

  // MỚI SỬA: so sánh theo NGÀY (bỏ giờ) để khớp với bộ lọc "Quá hạn" và báo cáo Excel:
  // việc có hạn chót là hôm nay chưa bị tính là quá hạn. deadline lưu dạng "2026-10-20T00:00:00.000Z" nên cắt 10 ký tự đầu là ngày đã chọn
  const todayStr = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  })();
  const isOverdue = !!task.deadline && task.status !== 'done' && task.deadline.slice(0, 10) < todayStr;

  const formatDeadline = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  };

  return (
    <div
      ref={innerRef}
      style={style}
      {...extraProps}
      className="task-card"
      data-dragging={dragging}
      data-priority={task.priority}
      onClick={onClick}
    >
      <div className="task-card-title">{task.title}</div>
      {task.description && <div className="task-card-desc">{task.description}</div>}

      {/* hiển thị badge nhãn nếu task có gắn nhãn (task.tags là mảng object {id, name, ...}) */}
      {task.tags && task.tags.length > 0 && (
        <div className="task-tag-list">
          {task.tags.map((tag) => (
            <span key={tag.id} className="task-tag-badge">{tag.name}</span>
          ))}
        </div>
      )}

      {/* MỚI THÊM: hiển thị tiến độ Subtask nếu task này có công việc con (task.subtasks do Backend include sẵn) */}
      {task.subtasks && task.subtasks.length > 0 && (
        <div className="task-subtask-count">
          ☑️ {task.subtasks.filter((s) => s.status === 'done').length}/{task.subtasks.length} công việc con
        </div>
      )}

      {/* MỚI THÊM: nếu task từng bị kéo ra khỏi "Hoàn thành" thì ghi số lần làm lại (task.reopenCount do Backend trả về) */}
      {task.reopenCount > 0 && (
        <div className="task-reopen-badge">↻ Đã làm lại {task.reopenCount} lần</div>
      )}

      <div className="task-card-footer">
        <div className="task-assignee-group">
          {task.assignee && (
            <>
              <span className="task-mini-avatar">{getInitials(task.assignee.fullName)}</span>
              <span className="task-assignee">{task.assignee.fullName}</span>
            </>
          )}
        </div>

        {task.deadline && (
          <span className={`task-deadline-badge ${isOverdue ? 'overdue' : ''}`}>
            {isOverdue ? '⚠ ' : ''}{formatDeadline(task.deadline)}
          </span>
        )}
      </div>
    </div>
  );
}

// MỚI THÊM: bản "bóng" của thẻ, KanbanZone đặt trong DragOverlay để thẻ kéo từ khung "Xem tất cả" không bị cắt/ẩn
export function TaskCardOverlay({ task }) {
  return (
    <TaskCardFace
      task={task}
      dragging={false}
      style={{ cursor: 'grabbing', boxShadow: '0 10px 28px rgba(0,0,0,0.22)' }}
    />
  );
}

// 1 thẻ task trên Kanban board, có thể kéo-thả (dùng thư viện @dnd-kit)
// onOpenDetail: hàm được gọi khi bấm vào card (không phải lúc đang kéo) để mở modal chi tiết
// MỚI THÊM: dragId - chỉ truyền cho thẻ trong khung "Xem tất cả". Thẻ đó cùng task với thẻ trên cột nên PHẢI dùng id kéo-thả khác
// (tránh trùng id), và id thật của task được gửi kèm trong data để KanbanZone đổi lại cho đúng
export default function TaskCard({ task, onOpenDetail, dragId }) {
  const fromModal = dragId != null;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId ?? task.id,
    data: { taskId: task.id, fromModal },
  });

  // Thẻ trong khung "Xem tất cả" đứng yên, thẻ "bóng" ở DragOverlay mới di chuyển theo con trỏ
  const style = transform && !fromModal
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 10 }
    : undefined;

  const handleClick = () => {
    if (!isDragging) {
      onOpenDetail(task);
    }
  };

  return (
    <TaskCardFace
      task={task}
      innerRef={setNodeRef}
      style={style}
      dragging={isDragging}
      onClick={handleClick}
      extraProps={{ ...listeners, ...attributes }}
    />
  );
}