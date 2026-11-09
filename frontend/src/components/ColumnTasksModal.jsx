import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDndMonitor } from '@dnd-kit/core';
import TaskCard from './TaskCard';
import '../styles/kanban-more.css';

// MỚI THÊM: bỏ dấu tiếng Việt + chữ thường để tìm không dấu (gõ "lap ke hoach" vẫn ra "Lập kế hoạch")
const removeAccents = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');

// MỚI THÊM: khung "Xem tất cả việc của 1 cột" (gần full màn hình)
// - Thẻ giống HỆT thẻ trên cột (cùng kích thước, cùng nội dung), xếp lưới đều nhau
// - Có ô tìm kiếm không dấu (tên việc, mô tả, người phụ trách, nhãn)
// - Kéo được thẻ: khi bắt đầu kéo, khung tạm ẩn để thấy bảng phía sau, thả vào cột nào thì chuyển sang cột đó
// - Bấm 1 thẻ (không kéo) -> đóng khung và mở chi tiết việc
export default function ColumnTasksModal({ title, columnId, tasks, onClose, onOpenDetail }) {
  const [keyword, setKeyword] = useState('');
  const [dragging, setDragging] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    searchRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Theo dõi kéo-thả của DndContext bao ngoài (KanbanZone)
  useDndMonitor({
    onDragStart: () => setDragging(true),
    onDragEnd: ({ over }) => {
      setDragging(false);
      if (over && over.id !== columnId) onClose(); // thả sang cột khác -> đóng khung
    },
    onDragCancel: () => setDragging(false),
  });

  const results = useMemo(() => {
    const words = removeAccents(keyword.trim()).split(/\s+/).filter(Boolean);
    if (words.length === 0) return tasks;
    return tasks.filter((t) => {
      const haystack = removeAccents(
        [t.title, t.description, t.assignee?.fullName, ...(t.tags || []).map((g) => g.name)].join(' ')
      );
      return words.every((w) => haystack.includes(w));
    });
  }, [tasks, keyword]);

  const handlePick = (task) => {
    onClose();
    onOpenDetail(task);
  };

  return createPortal(
    <div className="column-modal-overlay" data-dragging={dragging} onClick={onClose}>
      <div className="column-modal" onClick={(e) => e.stopPropagation()}>
        <div className="column-modal-header">
          <span className="column-modal-title">
            {title} <span className="kanban-count">{tasks.length}</span>
          </span>
          <button type="button" className="column-modal-close" onClick={onClose} aria-label="Đóng">✕</button>
        </div>

        <div className="column-modal-search-row">
          <input
            ref={searchRef}
            className="column-modal-search"
            placeholder="Tìm trong cột này..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          {keyword && (
            <button type="button" className="column-modal-clear" onClick={() => setKeyword('')}>✕</button>
          )}
        </div>
        <div className="column-modal-count">
          Hiện {results.length}/{tasks.length} việc · Kéo thẻ ra để chuyển sang cột khác
        </div>

        <div className="column-modal-list">
          {results.length === 0 && (
            <p className="column-modal-empty">Không tìm thấy việc nào khớp.</p>
          )}
          {results.map((task) => (
            <TaskCard key={task.id} task={task} dragId={`modal-${task.id}`} onOpenDetail={handlePick} />
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}