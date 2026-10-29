import { DndContext } from '@dnd-kit/core';
import KanbanColumn from './KanbanColumn';

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
export default function KanbanZone({ title, tasks, allTasks, sensors, onDragEnd, onOpenDetail }) {
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

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="kanban-board">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              id={col.id}
              title={col.title}
              tasks={getTasksByStatus(col.id)}
              onOpenDetail={onOpenDetail}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}