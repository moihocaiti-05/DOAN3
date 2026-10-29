// Thanh công cụ lọc / tìm kiếm / sắp xếp công việc trên Kanban board
// Component này KHÔNG tự lọc dữ liệu: chỉ hiển thị các ô lọc rồi báo ngược lên GroupDetail qua onFilterChange / onReset,
// để GroupDetail là nơi duy nhất quyết định danh sách task nào được hiển thị
// MỚI SỬA: gộp các prop lẻ (searchText, filterAssignee...) thành 1 object "filters" để dễ thêm bộ lọc mới

const STATUS_LABEL = { todo: 'Danh sách công việc', doing: 'Đang làm', redo: 'Làm lại', review: 'Kiểm định', done: 'Hoàn thành' }; // MỚI SỬA (Phiên 12)
const PRIORITY_LABEL = { low: 'Thấp', medium: 'Trung bình', high: 'Cao' };
const DEADLINE_LABEL = { overdue: 'Quá hạn', today: 'Hạn hôm nay', week: 'Trong 7 ngày tới', none: 'Chưa có hạn' };

// filters: { search, assignee, priority, status, deadline, tag, sort }
// onFilterChange(key, value): đổi 1 bộ lọc; onReset(): xóa toàn bộ bộ lọc (giữ nguyên cách sắp xếp)
// tagOptions: danh sách tên nhãn đang có trong nhóm; resultCount / totalCount: số việc đang hiển thị / tổng số việc
export default function TaskFilterBar({ members, tagOptions, filters, onFilterChange, onReset, resultCount, totalCount }) {
  // Gom các bộ lọc đang bật thành danh sách "chip" để hiện tóm tắt, bấm vào chip là bỏ đúng bộ lọc đó
  const chips = [];
  if (filters.search.trim()) chips.push({ key: 'search', label: `Từ khóa: "${filters.search.trim()}"` });
  if (filters.status) chips.push({ key: 'status', label: `Trạng thái: ${STATUS_LABEL[filters.status]}` });
  if (filters.assignee) {
    const member = members.find((m) => m.userId === filters.assignee);
    chips.push({
      key: 'assignee',
      label: filters.assignee === 'unassigned' ? 'Chưa giao cho ai' : `Người làm: ${member ? member.user.fullName : '...'}`,
    });
  }
  if (filters.priority) chips.push({ key: 'priority', label: `Ưu tiên: ${PRIORITY_LABEL[filters.priority]}` });
  if (filters.deadline) chips.push({ key: 'deadline', label: `Hạn chót: ${DEADLINE_LABEL[filters.deadline]}` });
  if (filters.tag) chips.push({ key: 'tag', label: `Nhãn: ${filters.tag}` });

  return (
    <>
      <div className="task-filter-bar">
        <input
          className="task-filter-search"
          placeholder="🔍 Tìm theo tên, mô tả, nhãn, người làm..."
          value={filters.search}
          onChange={(e) => onFilterChange('search', e.target.value)}
        />

        <select value={filters.status} onChange={(e) => onFilterChange('status', e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          <option value="todo">Danh sách công việc</option>
          <option value="doing">Đang làm</option>
          <option value="redo">Làm lại</option>
          <option value="review">Kiểm định</option>
          <option value="done">Hoàn thành</option>
        </select>

        <select value={filters.assignee} onChange={(e) => onFilterChange('assignee', e.target.value)}>
          <option value="">Tất cả người phụ trách</option>
          <option value="unassigned">Chưa giao cho ai</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>{m.user.fullName}</option>
          ))}
        </select>

        <select value={filters.priority} onChange={(e) => onFilterChange('priority', e.target.value)}>
          <option value="">Tất cả độ ưu tiên</option>
          <option value="low">Thấp</option>
          <option value="medium">Trung bình</option>
          <option value="high">Cao</option>
        </select>

        <select value={filters.deadline} onChange={(e) => onFilterChange('deadline', e.target.value)}>
          <option value="">Mọi hạn chót</option>
          <option value="overdue">Quá hạn</option>
          <option value="today">Hạn hôm nay</option>
          <option value="week">Trong 7 ngày tới</option>
          <option value="none">Chưa có hạn</option>
        </select>

        {/* Chỉ hiện ô lọc nhãn khi nhóm đã có ít nhất 1 nhãn */}
        {tagOptions.length > 0 && (
          <select value={filters.tag} onChange={(e) => onFilterChange('tag', e.target.value)}>
            <option value="">Tất cả nhãn</option>
            {tagOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        )}

        <select value={filters.sort} onChange={(e) => onFilterChange('sort', e.target.value)}>
          <option value="">Sắp xếp: mới tạo trước</option>
          <option value="deadline">Sắp xếp: hạn chót gần nhất</option>
          <option value="priority">Sắp xếp: ưu tiên cao trước</option>
          <option value="name">Sắp xếp: tên A → Z</option>
        </select>
      </div>

      {/* Dòng tóm tắt - chỉ hiện khi đang có bộ lọc */}
      {chips.length > 0 && (
        <div className="task-filter-summary">
          <span className="task-filter-count">Hiển thị {resultCount}/{totalCount} công việc</span>
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="task-filter-chip"
              title="Bấm để bỏ bộ lọc này"
              onClick={() => onFilterChange(chip.key, '')}
            >
              {chip.label} ✕
            </button>
          ))}
          <button type="button" className="task-filter-reset" onClick={onReset}>
            Xóa bộ lọc
          </button>
        </div>
      )}
    </>
  );
}