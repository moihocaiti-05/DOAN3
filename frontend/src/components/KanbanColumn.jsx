import { useDroppable } from '@dnd-kit/core';
import TaskCard from './TaskCard';

// 1 cột trong Kanban board
// onOpenDetail được nhận từ GroupDetail, truyền xuống tiếp cho từng TaskCard bên trong
export default function KanbanColumn({ id, title, tasks, onOpenDetail }) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div ref={setNodeRef} className="kanban-column" data-over={isOver} data-status={id}>{/* MỚI SỬA: thêm data-status để tô màu riêng cột "Làm lại" */}
      <div className="kanban-column-header">
        <span>{title}</span>
        <span className="kanban-count">{tasks.length}</span>
      </div>
      <div className="kanban-column-body">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onOpenDetail={onOpenDetail} />
        ))}
      </div>
    </div>
  );
}