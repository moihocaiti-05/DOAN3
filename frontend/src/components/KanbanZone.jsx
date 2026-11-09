import { useState } from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import KanbanColumn from './KanbanColumn';
import { TaskCardOverlay } from './TaskCard';
import '../styles/zone-heading.css'; // MỚI THÊM: tên mốc nổi bật theo cấp (Giai đoạn > mốc con > mốc cấp 3)

const COLUMNS = [
  { id: 'todo', title: 'Danh sách công việc' }, // MỚI SỬA (Phiên 12): đổi tên từ "Chưa làm" (vẫn là trạng thái todo)
  { id: 'doing', title: 'Đang làm' },
  { id: 'redo', title: 'Làm lại' }, // MỚI THÊM: cột "Làm lại" - task đã từng xong nhưng phải làm lại (id khớp trạng thái 'redo' ở Backend)
  { id: 'review', title: 'Kiểm định' }, // MỚI THÊM (Phiên 12): chờ Trưởng nhóm / Giảng viên duyệt rồi mới sang "Hoàn thành"
  { id: 'done', title: 'Hoàn thành' },
];

// MỚI THÊM: 1 "vùng" trong Bảng phân công, ứng với 1 mốc lớn (hoặc "Không thuộc mốc nào")
// Mỗi vùng có DndContext RIÊNG - nhờ vậy kéo-thả CHỈ xảy ra trong phạm vi vùng đó,
// không thể vô tình kéo 1 task từ vùng này sang cột của vùng khác
// MỚI SỬA: thêm prop allTasks = TOÀN BỘ việc của vùng (không bị lọc) - chỉ dùng để tính % tiến độ,
// còn tasks (đã lọc) dùng để vẽ thẻ lên các cột. Không truyền allTasks thì dùng tạm tasks như cũ
// MỚI THÊM: prop hideBoardWhenEmpty - mốc CHA (có mốc con) mà không có việc riêng thì KHÔNG vẽ bảng, chỉ còn tên mốc và % tiến độ
export default function KanbanZone({ title, tasks, allTasks, sensors, onDragEnd, onOpenDetail, hideBoardWhenEmpty = false }) {
  // Tính % hoàn thành của vùng NGAY TẠI FRONTEND (dựa trên đúng danh sách tasks đang có ở state)
  // để luôn cập nhật tức thì khi kéo-thả đổi trạng thái, không cần gọi lại API tính % từ Backend

  // MỚI SỬA: gộp task cấp cao VÀ Subtask (nằm trong t.subtasks) thành 1 mảng để ĐẾM % - khớp với Timeline và Thống kê
  // Lưu ý: mảng "tasks" gốc bên dưới (getTasksByStatus) vẫn giữ nguyên để CHỈ vẽ thẻ task cấp cao lên các cột Kanban,
  // Subtask không hiện thành thẻ riêng
  const countedItems = (allTasks || tasks).flatMap((t) => [t, ...(t.subtasks || [])]);
  const total = countedItems.length;
  const done = countedItems.filter((t) => t.status === 'done').length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  const getTasksByStatus = (status) => tasks.filter((t) => t.status === status);

  // MỚI THÊM: đang lọc/tìm kiếm <=> số việc đã lọc ít hơn toàn bộ việc của vùng -> các cột hiện HẾT kết quả khớp, không cắt còn 5 thẻ
  const isFiltered = !!allTasks && tasks.length !== allTasks.length;

  // MỚI THÊM: kéo thẻ từ khung "Xem tất cả" - thẻ trong khung có id kéo-thả riêng ("modal-<id>") nên
  // (1) hiện thẻ "bóng" qua DragOverlay để không bị cắt, (2) đổi lại id THẬT của task trước khi gọi onDragEnd của GroupDetail
  const [overlayTask, setOverlayTask] = useState(null);
  const realTaskId = (active) => active.data.current?.taskId ?? active.id;

  // MỚI THÊM: vùng KHÔNG có thẻ nào để hiện (mốc cha chưa có việc riêng, hoặc "Việc của tôi" mà mốc không có việc của mình)
  // thì thu gọn thành 1 dòng thay cho 5 cột trống; bấm "Mở bảng" nếu vẫn muốn xem. Có việc là bảng tự hiện đầy đủ
  const [showEmptyBoard, setShowEmptyBoard] = useState(false);
  const isEmptyZone = tasks.length === 0;
  const collapsed = isEmptyZone && !showEmptyBoard;

  // Dòng chữ nhỏ dùng class "kanban-zone-title" để ăn đúng màu chữ của giao diện hiện tại (Sáng/Tối/Kem ấm/Xanh dịu)
  const emptyLineStyle = { display: 'block', margin: '6px 0 0', fontSize: '14px', fontWeight: 400, opacity: 0.75 };

  const linkButtonStyle = {
    background: 'none',
    border: 'none',
    color: 'inherit',
    cursor: 'pointer',
    font: 'inherit',
    textDecoration: 'underline',
    padding: 0,
  };

  const handleDragStart = (event) => {
    if (event.active.data.current?.fromModal) {
      setOverlayTask(tasks.find((t) => t.id === realTaskId(event.active)) || null);
    }
  };

  const handleDragEnd = (event) => {
    setOverlayTask(null);
    onDragEnd({ ...event, active: { ...event.active, id: realTaskId(event.active) } });
  };

  return (
    <div className="kanban-zone">
      <div className="kanban-zone-header">
        <span className="kanban-zone-title">{title}</span>
        {total > 0 && (
          <div className="kanban-zone-progress">
            <div className="kanban-zone-progress-track">
              <div className="kanban-zone-progress-fill" style={{ width: `${percent}%` }} />
            </div>
            <span className="kanban-zone-percent">{done}/{total} · {percent}%</span>
          </div>
        )}
      </div>

      {collapsed ? (
        hideBoardWhenEmpty ? null : (
          <span className="kanban-zone-title" style={emptyLineStyle}>
            Chưa có việc nào ở mốc này.{' '}
            <button type="button" style={linkButtonStyle} onClick={() => setShowEmptyBoard(true)}>
              Mở bảng
            </button>
          </span>
        )
      ) : (
        <>
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setOverlayTask(null)}
          >
            <div className="kanban-board">
              {COLUMNS.map((col) => (
                <KanbanColumn
                  key={col.id}
                  id={col.id}
                  title={col.title}
                  tasks={getTasksByStatus(col.id)}
                  onOpenDetail={onOpenDetail}
                  showAll={isFiltered}
                />
              ))}
            </div>
            {/* MỚI THÊM: thẻ "bóng" theo con trỏ khi kéo từ khung "Xem tất cả" (zIndex cao hơn khung); thả xong không chạy hiệu ứng bay về */}
            <DragOverlay zIndex={2000} dropAnimation={null}>
              {overlayTask ? <TaskCardOverlay task={overlayTask} /> : null}
            </DragOverlay>
          </DndContext>
          {/* MỚI THÊM: vùng trống đã được mở ra thì có nút thu gọn lại */}
          {isEmptyZone && (
            <span className="kanban-zone-title" style={emptyLineStyle}>
              <button type="button" style={linkButtonStyle} onClick={() => setShowEmptyBoard(false)}>
                Thu gọn bảng trống
              </button>
            </span>
          )}
        </>
      )}
    </div>
  );
}