import { useEffect, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import TaskCard from './TaskCard';
import ColumnTasksModal from './ColumnTasksModal';
import '../styles/kanban-more.css';

const PAGE_SIZE = 5; // MỚI THÊM: mỗi trang của cột hiện 5 thẻ, bấm ‹ › để sang 5 thẻ kế

// 1 cột trong Kanban board
// onOpenDetail được nhận từ GroupDetail, truyền xuống tiếp cho từng TaskCard bên trong
// MỚI THÊM: showAll = true khi đang lọc/tìm kiếm -> hiện hết kết quả khớp, không chia trang
export default function KanbanColumn({ id, title, tasks, onOpenDetail, showAll = false }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const [openList, setOpenList] = useState(false); // khung "Xem tất cả"
  const [page, setPage] = useState(0);
  const prevIdsRef = useRef(null); // danh sách id của lần render trước, để biết thẻ nào vừa được thả/thêm vào cột
  const wheelLockRef = useRef(false); // chặn lướt ngang nhảy nhiều trang một lúc

  const totalPages = Math.max(1, Math.ceil(tasks.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1); // cột vơi bớt thẻ thì tự lùi về trang cuối còn tồn tại
  const visibleTasks = showAll
    ? tasks
    : tasks.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  // Thẻ mới xuất hiện trong cột (vừa kéo thả vào, hoặc vừa tạo) -> nhảy tới trang chứa thẻ đó để người dùng thấy ngay
  useEffect(() => {
    if (prevIdsRef.current) {
      const newIndex = tasks.findIndex((t) => !prevIdsRef.current.has(t.id));
      if (newIndex >= 0) setPage(Math.floor(newIndex / PAGE_SIZE));
    }
    prevIdsRef.current = new Set(tasks.map((t) => t.id));
  }, [tasks]);

  const goPage = (delta) => setPage(Math.min(Math.max(currentPage + delta, 0), totalPages - 1));

  // Lướt ngang bằng trackpad/chuột ngang cũng chuyển trang (phụ, nút ‹ › vẫn là cách chính)
  const handleWheel = (e) => {
    if (showAll || totalPages <= 1) return;
    if (Math.abs(e.deltaX) < 30 || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
    if (wheelLockRef.current) return;
    wheelLockRef.current = true;
    setTimeout(() => { wheelLockRef.current = false; }, 450);
    goPage(e.deltaX > 0 ? 1 : -1);
  };

  const showPager = !showAll && tasks.length > PAGE_SIZE;

  return (
    <div ref={setNodeRef} className="kanban-column" data-over={isOver} data-status={id}>{/* MỚI SỬA: thêm data-status để tô màu riêng cột "Làm lại" */}
      <div className="kanban-column-header">
        <span>{title}</span>
        <span className="kanban-count">{tasks.length}</span>
      </div>
      <div className="kanban-column-body" onWheel={handleWheel}>
        {visibleTasks.map((task) => (
          <TaskCard key={task.id} task={task} onOpenDetail={onOpenDetail} />
        ))}
      </div>

      {showPager && (
        <div className="kanban-pager">
          <div className="kanban-pager-nav">
            <button type="button" className="kanban-pager-btn" onClick={() => goPage(-1)} disabled={currentPage === 0} aria-label="Trang trước">‹</button>
            <span className="kanban-pager-text">{currentPage + 1}/{totalPages}</span>
            <button type="button" className="kanban-pager-btn" onClick={() => goPage(1)} disabled={currentPage >= totalPages - 1} aria-label="Trang sau">›</button>
          </div>
          <button type="button" className="kanban-viewall-btn" onClick={() => setOpenList(true)}>
            Xem tất cả
          </button>
        </div>
      )}

      {openList && (
        <ColumnTasksModal
          title={title}
          columnId={id}
          tasks={tasks}
          onClose={() => setOpenList(false)}
          onOpenDetail={onOpenDetail}
        />
      )}
    </div>
  );
}