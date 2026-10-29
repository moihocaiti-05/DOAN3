import { useState, useEffect, useMemo } from 'react';
import { milestoneApi } from '../services/milestoneApi';
import { groupApi } from '../services/groupApi'; // MỚI THÊM: lấy tên dự án (tên nhóm) để hiện làm GỐC của cây
import { taskApi } from '../services/taskApi'; // MỚI THÊM: để bấm ô vuông ngay trong cây là đổi trạng thái việc
import AddMilestoneModal from './AddMilestoneModal';
import EditMilestoneModal from './EditMilestoneModal'; // MỚI THÊM: hộp sửa tên/mô tả/hạn chót của mốc
import CreateTaskModal from './CreateTaskModal'; // MỚI THÊM: hộp thêm công việc / việc con ngay trong tab Mốc
import MilestoneComments from './MilestoneComments'; // khung nhận xét của Giảng viên/Trưởng nhóm dưới mỗi mốc
import ConfirmDialog from './ConfirmDialog'; // hộp xác nhận tự làm thay cho window.confirm (đổi màu theo theme)
import '../styles/timeline.css';

// Nhãn + class màu cho trạng thái từng công việc (khớp 4 cột Kanban)
const TASK_STATUS = {
  todo: { label: 'Chưa làm', cls: 'todo' },
  doing: { label: 'Đang làm', cls: 'doing' },
  redo: { label: 'Làm lại', cls: 'redo' },
  done: { label: 'Hoàn thành', cls: 'done' },
};

// Chuyển 1 đối tượng Date thành chuỗi YYYY-MM-DD theo giờ máy (so sánh theo NGÀY, thống nhất với Kanban và Excel)
const toDateString = (d) => {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};
const getTodayString = () => toDateString(new Date());

// MỚI THÊM: ngày hôm nay + n ngày (dùng cho "sắp đến hạn trong 7 ngày")
const getDayOffsetString = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toDateString(d);
};

const formatDate = (isoString) => {
  if (!isoString) return null;
  return new Date(isoString).toLocaleDateString('vi-VN');
};

// MỚI THÊM: hiện hạn chót của việc dạng ngắn dd/mm (lấy từ chuỗi ISO, không bị lệch múi giờ)
const formatShortDate = (isoString) => {
  if (!isoString) return '';
  return `${isoString.slice(8, 10)}/${isoString.slice(5, 7)}`;
};

// MỚI THÊM: mỗi nhãn (tag) được gán 1 màu cố định theo tên (băm tên thành góc màu 0-359),
// nên cùng tên nhãn thì luôn cùng màu ở mọi nơi, không cần lưu màu trong Database
const tagHue = (name) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
};

// MỚI THÊM: chữ cái đầu của người phụ trách (chữ đầu họ + chữ đầu tên) để vẽ avatar tròn nhỏ
const getInitials = (fullName) => {
  const parts = (fullName || '?').trim().split(/\s+/);
  const first = parts[0][0] || '?';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
};

// MỚI THÊM: khi bấm ô vuông của việc ĐÃ XONG thì mở lại sang trạng thái này (đổi thành 'doing' nếu muốn về "Đang làm")
const REOPEN_STATUS = 'redo';

// MỚI THÊM: bỏ dấu + chữ thường để tìm kiếm "khao sat" vẫn ra "Khảo sát"
const normalize = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');

// MỚI THÊM: việc trễ hạn = chưa xong và hạn chót (theo NGÀY) đã qua
const isTaskOverdue = (t, today) =>
  t.status !== 'done' && !!t.deadline && t.deadline.slice(0, 10) < today;

// MỚI THÊM: 1 việc có khớp bộ lọc không (f = { q, status, assignee, tag }); msMatch = tên mốc chứa từ khóa thì mọi việc trong mốc đều qua phần tìm chữ
const taskMatches = (t, f, today, msMatch) => {
  if (f.q && !msMatch) {
    const hay = normalize([t.title, t.assignee ? t.assignee.fullName : '', ...(t.tags || []).map((g) => g.name)].join(' '));
    if (!hay.includes(f.q)) return false;
  }
  if (f.assignee === '__none' && t.assignee) return false;
  if (f.assignee !== 'all' && f.assignee !== '__none') {
    if (!t.assignee || String(t.assignee.id) !== f.assignee) return false;
  }
  if (f.tag !== 'all' && !(t.tags || []).some((g) => g.name === f.tag)) return false;
  if (f.status === 'overdue') return isTaskOverdue(t, today);
  if (f.status !== 'all') return t.status === f.status;
  return true;
};

// MỚI THÊM: lọc cả cây - giữ mốc nếu bản thân có việc khớp, có mốc con còn lại, hoặc tên mốc khớp từ khóa
const filterTree = (nodes, f, today) =>
  nodes.flatMap((n) => {
    const children = filterTree(n.children || [], f, today);
    const msMatch = !!f.q && normalize(n.title).includes(f.q);
    const tasks = (n.tasks || []).filter((t) => taskMatches(t, f, today, msMatch));
    const onlyText = f.status === 'all' && f.assignee === 'all' && f.tag === 'all';
    if (tasks.length > 0 || children.length > 0 || (msMatch && onlyText)) {
      return [{ ...n, tasks, children }];
    }
    return [];
  });

// MỚI THÊM: trải phẳng cây mốc thành 1 mảng (dùng cho bảng tổng quan bên phải)
const flattenNodes = (nodes) => nodes.flatMap((n) => [n, ...flattenNodes(n.children || [])]);

// ===== MỚI THÊM: 1 dòng công việc. Việc CHA: biểu tượng ô vuông, chữ đậm. Việc CON: biểu tượng tròn nhỏ, thụt vào, có đường nối.
// "subs" là danh sách việc con của việc này (chỉ việc cha mới có); "orphan" = việc con nhưng việc cha nằm ở mốc khác
function TaskRow({ task, subs, isChild, orphan, onToggle, busyId, onAddSub }) {
  const st = TASK_STATUS[task.status] || TASK_STATUS.todo;
  const overdue =
    task.status !== 'done' && !!task.deadline && task.deadline.slice(0, 10) < getTodayString();
  const subDone = subs ? subs.filter((s) => s.status === 'done').length : 0;
  const tags = task.tags || [];

  return (
    <li className={`ms-task ${isChild ? 'ms-task-child' : 'ms-task-parent'}`}>
      <div className="ms-task-row">
        {/* BÊN TRÁI: biểu tượng - tên việc - bộ đếm việc con - các tag (tất cả cùng 1 hàng với tên việc) */}
        <div className="ms-task-main">
          {/* MỚI SỬA: ô vuông giờ là NÚT - bấm để đánh dấu xong, bấm lại để mở lại */}
          <button
            type="button"
            className={`ms-task-icon ms-task-icon-btn ms-task-icon-${st.cls} ${isChild ? 'ms-task-icon-child' : ''}`}
            title={task.status === 'done' ? 'Bấm để mở lại việc này' : 'Bấm để đánh dấu hoàn thành'}
            disabled={busyId === task.id}
            onClick={() => onToggle(task)}
          >
            {task.status === 'done' ? '✓' : ''}
          </button>
          <span className={`ms-task-title ${task.status === 'done' ? 'ms-task-title-done' : ''}`}>
            {task.title}
          </span>
          {subs && subs.length > 0 && (
            <span className="ms-sub-count" title="Số việc con đã xong / tổng số việc con">
              {subDone}/{subs.length} việc con
            </span>
          )}
          {tags.map((tag) => (
            <span key={tag.id} className="ms-tag" style={{ '--tag-hue': tagHue(tag.name) }}>
              {tag.name}
            </span>
          ))}
          {/* MỚI THÊM: chỉ việc CHÍNH mới thêm được việc con (hệ thống chỉ cho 1 cấp) */}
          {!isChild && !task.parentTaskId && onAddSub && (
            <button
              type="button"
              className="milestone-add-child-btn ms-add-sub"
              onClick={() => onAddSub(task)}
            >
              + Việc con
            </button>
          )}
        </div>

        {/* BÊN PHẢI: người phụ trách - hạn chót - trạng thái */}
        <div className="ms-task-side">
          {task.assignee ? (
            <span className="ms-assignee" title={task.assignee.fullName}>
              <span className="ms-avatar">{getInitials(task.assignee.fullName)}</span>
              <span className="ms-assignee-name">{task.assignee.fullName}</span>
            </span>
          ) : (
            <span className="ms-unassigned">Chưa giao</span>
          )}
          {task.deadline && (
            <span className={`ms-task-deadline ${overdue ? 'ms-task-deadline-overdue' : ''}`}>
              {formatShortDate(task.deadline)}
            </span>
          )}
          <span className={`ms-task-status ms-task-status-${st.cls}`}>{st.label}</span>
        </div>
      </div>

      {/* Việc con mà việc cha thuộc mốc khác: ghi rõ là con của việc nào để không bị hiểu nhầm là việc chính */}
      {orphan && task.parentTitle && (
        <div className="ms-orphan-note">↳ Việc con của "{task.parentTitle}"</div>
      )}

      {/* Danh sách việc con: nằm ngay dưới việc cha, thụt vào, có đường nối */}
      {subs && subs.length > 0 && (
        <ul className="ms-subtasks">
          {subs.map((s) => (
            <TaskRow key={s.id} task={s} isChild onToggle={onToggle} busyId={busyId} />
          ))}
        </ul>
      )}
    </li>
  );
}

// ===== MỚI SỬA: mỗi mốc là 1 DÒNG của cây (giống cây thư mục). Bấm dòng để mở/đóng; mở ra thì thấy mô tả, công việc, nhận xét, rồi các mốc con thụt vào có đường kẻ dọc.
// treeCmd = { type: 'open' | 'close', n } - lệnh "Mở rộng tất cả / Thu gọn tất cả" từ nút ở đầu trang (n tăng mỗi lần bấm để mọi nút nhận được)
// dnd = bộ điều khiển kéo-thả do TimelineView truyền xuống (enabled, dragId, hint, các hàm onDragStart/onDragOver/onDrop/onDragEnd)
function MilestoneNode({ node, depth, onDelete, onAddChild, onEdit, treeCmd, onToggleTask, busyTaskId, onAddTask, dnd }) {
  const tasks = node.tasks || [];
  const children = node.children || [];

  // Gom việc con vào đúng việc cha (trong cùng mốc). Việc con mà cha không nằm trong mốc này thì xếp như việc chính + ghi chú
  const { topTasks, childMap, subCount } = useMemo(() => {
    const ids = new Set(tasks.map((t) => t.id));
    const map = {};
    let count = 0;
    tasks.forEach((t) => {
      if (t.parentTaskId && ids.has(t.parentTaskId)) {
        (map[t.parentTaskId] = map[t.parentTaskId] || []).push(t);
        count += 1;
      }
    });
    const top = tasks.filter((t) => !(t.parentTaskId && ids.has(t.parentTaskId)));
    return { topTasks: top, childMap: map, subCount: count };
  }, [tasks]);

  // Mốc gốc mặc định MỞ, mốc con mặc định ĐÓNG (dòng đóng vẫn hiện đủ tiến độ, hạn, trạng thái nên xem tổng quan rất gọn)
  const [open, setOpen] = useState(depth === 0);

  // Nhận lệnh "Mở rộng tất cả / Thu gọn tất cả"
  useEffect(() => {
    if (treeCmd.n > 0) setOpen(treeCmd.type === 'open');
  }, [treeCmd.n]);

  // Trễ hạn tính theo NGÀY (cắt 10 ký tự đầu của chuỗi ISO), không dùng giờ
  const isOverdue =
    !!node.dueDate && node.percent !== 100 && node.dueDate.slice(0, 10) < getTodayString();
  const isDone = node.percent === 100 && node.taskCount > 0;

  // Huy hiệu trạng thái của mốc (ưu tiên: Hoàn thành > Trễ hạn > Đang thực hiện > Chưa bắt đầu)
  let badge = { text: 'Chưa bắt đầu', cls: 'idle' };
  if (isDone) badge = { text: 'Hoàn thành', cls: 'done' };
  else if (isOverdue) badge = { text: 'Trễ hạn', cls: 'overdue' };
  else if (node.percent > 0) badge = { text: 'Đang thực hiện', cls: 'doing' };

  return (
    // id để bảng tổng quan bên phải bấm vào là cuộn tới đúng mốc này
    <div
      id={`ms-${node.id}`}
      className={`tr-node tr-depth-${Math.min(depth, 2)} ${dnd.dragId === node.id ? 'tr-node-dragging' : ''}`}
    >
      {/* ===== DÒNG CỦA MỐC: mũi tên - chấm trạng thái - tên - tiến độ - số việc - hạn - huy hiệu - nút =====
          MỚI THÊM: cả dòng KÉO được (khi không đang lọc). Thả vào GIỮA dòng khác = thành mốc con của nó; thả vào mép TRÊN/DƯỚI = đứng trước/sau nó */}
      <div
        className={`tr-row ${dnd.hint && dnd.hint.id === node.id ? `dnd-${dnd.hint.pos}` : ''}`}
        draggable={dnd.enabled}
        onDragStart={(e) => dnd.onDragStart(e, node)}
        onDragOver={(e) => dnd.onDragOver(e, node)}
        onDrop={(e) => dnd.onDrop(e, node)}
        onDragEnd={dnd.onDragEnd}
        onClick={() => setOpen(!open)}
      >
        {dnd.enabled && (
          <span className="tr-grip" title="Kéo để di chuyển mốc">
            ⋮⋮
          </span>
        )}
        <span className={`tr-chevron ${open ? 'tr-chevron-open' : ''}`}>›</span>
        <span className={`tr-dot tr-dot-${badge.cls}`} />
        <span className="tr-title">{node.title}</span>

        <div className="tr-cols">
          <div className="tr-progress">
            <div className="tr-progress-track">
              <div
                className={`tr-progress-fill ${isDone ? 'tr-progress-fill-done' : ''}`}
                style={{ width: `${node.percent}%` }}
              />
            </div>
            <span className="tr-percent">{node.percent}%</span>
          </div>
          <span className="tr-count">
            {node.taskCount === 0 ? 'Chưa có việc' : `${node.doneCount}/${node.taskCount} việc`}
          </span>
          <span className={`tr-due ${isOverdue ? 'tr-due-overdue' : ''}`}>
            {node.dueDate ? `${isOverdue ? '⚠ ' : ''}${formatDate(node.dueDate)}` : ''}
          </span>
          <span className={`ms-badge ms-badge-${badge.cls}`}>{badge.text}</span>
        </div>

        {/* Nút thao tác: bấm vào đây KHÔNG làm mở/đóng dòng (stopPropagation) */}
        <div className="tr-actions" onClick={(e) => e.stopPropagation()}>
          <button className="milestone-add-child-btn" onClick={() => onAddChild(node)}>
            + Mốc con
          </button>
          <button className="ms-edit-btn" onClick={() => onEdit(node)}>
            Sửa
          </button>
          <button className="ms-delete-btn" onClick={() => onDelete(node)}>
            Xóa
          </button>
        </div>
      </div>

      {/* ===== PHẦN MỞ RỘNG: mô tả, công việc, nhận xét, mốc con ===== */}
      {open && (
        <div className="tr-body">
          {node.description && <p className="tr-desc">{node.description}</p>}

          {/* MỚI SỬA: dòng tiêu đề danh sách việc luôn hiện, kèm nút "+ Công việc" (cả khi mốc chưa có việc nào) */}
          <div className="tr-task-head">
            <div className="tr-task-caption">
              {tasks.length === 0
                ? 'Chưa có công việc'
                : `${tasks.length} công việc${subCount > 0 ? ` (gồm ${subCount} việc con)` : ''}`}
            </div>
            <button
              type="button"
              className="milestone-add-child-btn"
              onClick={() => onAddTask(node, null)}
            >
              + Công việc
            </button>
          </div>

          {tasks.length > 0 && (
            <>
              <ul className="ms-task-list">
                {topTasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    subs={childMap[t.id]}
                    orphan={!!t.parentTaskId}
                    onToggle={onToggleTask}
                    busyId={busyTaskId}
                    onAddSub={(parent) => onAddTask(node, parent)}
                  />
                ))}
              </ul>
            </>
          )}

          <MilestoneComments milestoneId={node.id} />

          {children.length > 0 && (
            <div className="tr-children">
              {children.map((child) => (
                <MilestoneNode
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  onDelete={onDelete}
                  onAddChild={onAddChild}
                  onEdit={onEdit}
                  treeCmd={treeCmd}
                  onToggleTask={onToggleTask}
                  busyTaskId={busyTaskId}
                  onAddTask={onAddTask}
                  dnd={dnd}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ===== MỚI THÊM: bảng TỔNG QUAN cố định bên phải (lấp chỗ trống, cho thầy cô nhìn nhanh dự án đang ở đâu) =====
function SummaryPanel({ milestones, onJump }) {
  const today = getTodayString();
  const weekEnd = getDayOffsetString(6); // "sắp đến hạn" = từ hôm nay tới 6 ngày sau (khớp bộ lọc "tuần này")

  const data = useMemo(() => {
    const nodes = flattenNodes(milestones);
    // Mỗi task nằm đúng 1 mốc (gán trực tiếp) nên gộp tasks của mọi node không bị đếm trùng
    const all = nodes.flatMap((n) => n.tasks || []);
    const count = { todo: 0, doing: 0, redo: 0, done: 0 };
    all.forEach((t) => {
      if (count[t.status] !== undefined) count[t.status] += 1;
    });
    const total = all.length;
    const percent = total > 0 ? Math.round((count.done / total) * 100) : 0;
    const overdueTasks = all.filter(
      (t) => t.status !== 'done' && t.deadline && t.deadline.slice(0, 10) < today
    ).length;
    const open = nodes.filter((n) => n.dueDate && n.percent !== 100);
    const overdueMs = open.filter((n) => n.dueDate.slice(0, 10) < today);
    const upcomingMs = open
      .filter((n) => n.dueDate.slice(0, 10) >= today && n.dueDate.slice(0, 10) <= weekEnd)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    // MỚI THÊM: tiến độ THEO THÀNH VIÊN - gom việc theo người phụ trách ("Chưa giao" xếp cuối)
    const byPerson = new Map();
    all.forEach((t) => {
      const key = t.assignee ? String(t.assignee.id) : '__none';
      if (!byPerson.has(key)) {
        byPerson.set(key, { key, name: t.assignee ? t.assignee.fullName : 'Chưa giao', total: 0, done: 0 });
      }
      const p = byPerson.get(key);
      p.total += 1;
      if (t.status === 'done') p.done += 1;
    });
    const people = [...byPerson.values()].sort(
      (a, b) => (a.key === '__none') - (b.key === '__none') || b.total - a.total
    );

    // MỚI THÊM: số việc HOÀN THÀNH theo từng tuần (6 tuần gần nhất, tuần bắt đầu từ thứ Hai). Tính theo ngày hoàn thành gần nhất (completedAt)
    const mondayOf = (d) => {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
      return x;
    };
    const thisMonday = mondayOf(new Date());
    const weeks = [];
    for (let i = 5; i >= 0; i--) {
      const start = new Date(thisMonday);
      start.setDate(start.getDate() - 7 * i);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const label = `${String(start.getDate()).padStart(2, '0')}/${String(start.getMonth() + 1).padStart(2, '0')}`;
      weeks.push({ start, end, label, count: 0 });
    }
    all.forEach((t) => {
      if (t.status === 'done' && t.completedAt) {
        const c = new Date(t.completedAt);
        const w = weeks.find((x) => c >= x.start && c < x.end);
        if (w) w.count += 1;
      }
    });
    const weekMax = Math.max(1, ...weeks.map((w) => w.count));
    const weekTotal = weeks.reduce((sum, w) => sum + w.count, 0);

    return {
      count, total, percent, overdueTasks, overdueMs, upcomingMs, msTotal: nodes.length,
      people, weeks, weekMax, weekTotal,
    };
  }, [milestones, today, weekEnd]);

  return (
    <aside className="ms-panel">
      <div className="ms-panel-card">
        <div className="ms-panel-title">Tổng quan dự án</div>
        <div className="ms-panel-big">
          {data.percent}
          <span>%</span>
        </div>
        <div className="ms-panel-sub">
          {data.count.done}/{data.total} công việc hoàn thành · {data.msTotal} mốc
        </div>

        {/* Thanh nhiều đoạn: mỗi đoạn là 1 trạng thái, độ dài theo số việc */}
        {data.total > 0 && (
          <div className="ms-stack">
            {['done', 'doing', 'redo', 'todo'].map(
              (k) =>
                data.count[k] > 0 && (
                  <div
                    key={k}
                    className={`ms-stack-seg ms-stack-${k}`}
                    style={{ width: `${(data.count[k] / data.total) * 100}%` }}
                    title={`${TASK_STATUS[k].label}: ${data.count[k]}`}
                  />
                )
            )}
          </div>
        )}
        <ul className="ms-legend">
          {['todo', 'doing', 'redo', 'done'].map((k) => (
            <li key={k}>
              <span className={`ms-legend-dot ms-stack-${k}`} />
              <span className="ms-legend-label">{TASK_STATUS[k].label}</span>
              <span className="ms-legend-count">{data.count[k]}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="ms-panel-card">
        <div className="ms-panel-title">Cần chú ý</div>

        {data.overdueTasks === 0 && data.overdueMs.length === 0 && data.upcomingMs.length === 0 && (
          <p className="ms-panel-empty">Không có mốc trễ hạn hay sắp đến hạn.</p>
        )}

        {data.overdueTasks > 0 && (
          <div className="ms-alert ms-alert-danger">⚠ {data.overdueTasks} công việc trễ hạn</div>
        )}

        {data.overdueMs.length > 0 && (
          <>
            <div className="ms-panel-group">Mốc trễ hạn</div>
            <ul className="ms-panel-list">
              {data.overdueMs.slice(0, 5).map((n) => (
                <li key={n.id}>
                  <button className="ms-panel-link" onClick={() => onJump(n.id)}>
                    <span className="ms-panel-link-title">{n.title}</span>
                    <span className="ms-panel-link-date ms-panel-link-date-danger">
                      {formatShortDate(n.dueDate)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {data.upcomingMs.length > 0 && (
          <>
            <div className="ms-panel-group">Sắp đến hạn (7 ngày tới)</div>
            <ul className="ms-panel-list">
              {data.upcomingMs.slice(0, 5).map((n) => (
                <li key={n.id}>
                  <button className="ms-panel-link" onClick={() => onJump(n.id)}>
                    <span className="ms-panel-link-title">{n.title}</span>
                    <span className="ms-panel-link-date">{formatShortDate(n.dueDate)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* MỚI THÊM: tiến độ từng thành viên (số việc xong / số việc được giao) */}
      <div className="ms-panel-card">
        <div className="ms-panel-title">Theo thành viên</div>
        {data.people.length === 0 ? (
          <p className="ms-panel-empty">Chưa có công việc nào.</p>
        ) : (
          <ul className="ms-people">
            {data.people.map((p) => {
              const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
              return (
                <li key={p.key} className="ms-person">
                  <div className="ms-person-top">
                    <span className="ms-person-name">{p.name}</span>
                    <span className="ms-person-count">
                      {p.done}/{p.total} · {pct}%
                    </span>
                  </div>
                  <div className="ms-person-track">
                    <div className="ms-person-fill" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* MỚI THÊM: biểu đồ cột số việc hoàn thành theo tuần */}
      <div className="ms-panel-card">
        <div className="ms-panel-title">Hoàn thành theo tuần</div>
        {data.weekTotal === 0 ? (
          <p className="ms-panel-empty">Chưa có việc nào hoàn thành trong 6 tuần gần đây.</p>
        ) : (
          <>
            <div className="ms-weeks">
              {data.weeks.map((w) => (
                <div
                  key={w.label}
                  className="ms-week"
                  title={`Tuần bắt đầu ${w.label}: ${w.count} việc hoàn thành`}
                >
                  <span className="ms-week-count">{w.count}</span>
                  <div className="ms-week-bar" style={{ height: `${Math.max(4, (w.count / data.weekMax) * 70)}px` }} />
                  <span className="ms-week-label">{w.label}</span>
                </div>
              ))}
            </div>
            <div className="ms-panel-sub">6 tuần gần nhất, mỗi cột là 1 tuần (bắt đầu từ thứ Hai)</div>
          </>
        )}
      </div>
    </aside>
  );
}

export default function TimelineView({ groupId }) {
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addParent, setAddParent] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // mốc đang chờ xác nhận xóa
  const [errorMsg, setErrorMsg] = useState(''); // thông báo lỗi hiện ngay trên trang, thay cho alert
  // MỚI THÊM: lệnh mở/đóng cả cây (n tăng mỗi lần bấm để mọi mốc nhận được lệnh)
  const [treeCmd, setTreeCmd] = useState({ type: 'open', n: 0 });
  // MỚI THÊM: bộ lọc/tìm kiếm + id việc đang được đổi trạng thái (để khóa nút tránh bấm 2 lần)
  const [filters, setFilters] = useState({ q: '', status: 'all', assignee: 'all', tag: 'all' });
  const [busyTaskId, setBusyTaskId] = useState(null);
  // MỚI THÊM: hộp thêm công việc - { milestone, parentTask } khi đang mở, null khi đóng
  const [taskModal, setTaskModal] = useState(null);
  // MỚI THÊM: tên dự án - lấy từ thông tin nhóm, hiện ở GỐC của cây (lỗi mạng thì để trống, hiện chữ "Dự án")
  const [projectName, setProjectName] = useState('');
  // MỚI THÊM: mốc đang được sửa (null = đóng hộp sửa)
  const [editTarget, setEditTarget] = useState(null);
  // MỚI THÊM: trạng thái kéo-thả - drag = { id mốc đang kéo, blocked = các mốc KHÔNG được thả vào (chính nó và con cháu của nó) }; hint = { id mốc đang rê tới, pos: 'before' | 'after' | 'into' }
  const [drag, setDrag] = useState(null);
  const [hint, setHint] = useState(null);
  // MỚI THÊM: đang tải file báo cáo (khóa nút để không bấm 2 lần)
  const [exporting, setExporting] = useState(false);

  // silent = true: tải lại ngầm, KHÔNG hiện "Đang tải..." (để cây không bị đóng lại sau khi đổi trạng thái 1 việc)
  const loadTimeline = async (silent = false) => {
    if (silent !== true) setLoading(true);
    try {
      const res = await milestoneApi.getTimeline(groupId);
      setMilestones(res.data.data);
    } finally {
      if (silent !== true) setLoading(false);
    }
  };

  useEffect(() => {
    loadTimeline();
  }, [groupId]);

  useEffect(() => {
    let cancelled = false;
    groupApi
      .getGroupDetail(groupId)
      .then((res) => {
        if (!cancelled) setProjectName(res.data.data?.name || '');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  // Bấm "Xóa" chỉ mở hộp xác nhận, việc xóa thật nằm ở handleConfirmDelete
  const handleDelete = (node) => {
    setErrorMsg('');
    setDeleteTarget(node);
  };

  const handleConfirmDelete = async () => {
    const node = deleteTarget;
    setDeleteTarget(null);
    if (!node) return;
    try {
      await milestoneApi.remove(node.id);
      loadTimeline();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Xóa thất bại');
    }
  };

  const handleOpenAdd = (parentNode = null) => {
    setAddParent(parentNode);
    setShowAddModal(true);
  };

  // parentTask = null: thêm việc mới vào mốc; có giá trị: thêm việc con vào việc đó
  const handleOpenAddTask = (milestone, parentTask = null) => setTaskModal({ milestone, parentTask });

  const sendTreeCmd = (type) => setTreeCmd((prev) => ({ type, n: prev.n + 1 }));

  // MỚI THÊM: bấm ô vuông của việc -> chưa xong thì thành "done", đã xong thì mở lại
  const handleToggleTask = async (task) => {
    if (busyTaskId) return;
    setErrorMsg('');
    setBusyTaskId(task.id);
    try {
      await taskApi.updateStatus(task.id, task.status === 'done' ? REOPEN_STATUS : 'done');
      await loadTimeline(true);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Đổi trạng thái thất bại');
    } finally {
      setBusyTaskId(null);
    }
  };

  // MỚI THÊM: dữ liệu cho bộ lọc - danh sách người phụ trách / tag lấy từ chính các việc đang có
  const today = getTodayString();
  const allTasks = useMemo(() => flattenNodes(milestones).flatMap((n) => n.tasks || []), [milestones]);
  const assigneeOptions = useMemo(() => {
    const map = new Map();
    allTasks.forEach((t) => {
      if (t.assignee) map.set(String(t.assignee.id), t.assignee.fullName);
    });
    return [...map.entries()];
  }, [allTasks]);
  const tagOptions = useMemo(() => {
    const set = new Set();
    allTasks.forEach((t) => (t.tags || []).forEach((g) => set.add(g.name)));
    return [...set].sort();
  }, [allTasks]);

  // Số liệu toàn dự án cho dòng GỐC của cây (luôn tính trên dữ liệu đầy đủ, không bị bộ lọc ảnh hưởng)
  const projectDone = useMemo(() => allTasks.filter((t) => t.status === 'done').length, [allTasks]);
  const projectPercent = allTasks.length > 0 ? Math.round((projectDone / allTasks.length) * 100) : 0;
  const milestoneCount = useMemo(() => flattenNodes(milestones).length, [milestones]);

  const f = useMemo(() => ({ ...filters, q: normalize(filters.q.trim()) }), [filters]);
  const isFiltering = !!f.q || f.status !== 'all' || f.assignee !== 'all' || f.tag !== 'all';
  const visibleMilestones = useMemo(
    () => (isFiltering ? filterTree(milestones, f, today) : milestones),
    [milestones, f, isFiltering, today]
  );
  const shownTaskCount = useMemo(
    () => flattenNodes(visibleMilestones).reduce((sum, n) => sum + (n.tasks || []).length, 0),
    [visibleMilestones]
  );

  // Đang lọc thì tự MỞ hết cây để thấy ngay kết quả
  useEffect(() => {
    if (isFiltering) sendTreeCmd('open');
  }, [filters.q, filters.status, filters.assignee, filters.tag]);

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const clearFilters = () => setFilters({ q: '', status: 'all', assignee: 'all', tag: 'all' });

  // MỚI THÊM: tải báo cáo Excel riêng theo mốc (Backend trả file nhị phân, trình duyệt tự lưu thành file)
  const handleExport = async () => {
    setErrorMsg('');
    setExporting(true);
    try {
      const res = await milestoneApi.exportReport(groupId);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `bao-cao-moc-${getTodayString()}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      // Khi lỗi, nội dung trả về cũng là Blob nên phải đọc ra chữ mới thấy được lời báo lỗi của Backend
      let msg = 'Xuất báo cáo thất bại';
      try {
        const text = await err.response?.data?.text?.();
        if (text) msg = JSON.parse(text).message || msg;
      } catch {
        /* giữ lời báo mặc định */
      }
      setErrorMsg(msg);
    } finally {
      setExporting(false);
    }
  };

  // Cuộn tới đúng mốc và nháy sáng 1 lần (dùng cho bảng tổng quan và cho sau khi kéo-thả xong)
  const flashNode = (id) => {
    const el = document.getElementById(`ms-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('tr-flash');
    setTimeout(() => el.classList.remove('tr-flash'), 1400);
  };

  // MỚI SỬA: bấm 1 mốc trong bảng tổng quan thì MỞ HẾT cây (để mốc con đang đóng cũng hiện ra) rồi cuộn tới đúng dòng và nháy sáng
  const handleJump = (id) => {
    sendTreeCmd('open');
    setTimeout(() => flashNode(id), 80);
  };

  // ===== MỚI THÊM: KÉO-THẢ MỐC (HTML5 có sẵn của trình duyệt, không cần thư viện) =====
  // Đang lọc thì tắt kéo-thả (cây đang bị ẩn bớt nên vị trí thả sẽ không đúng)
  const clearDrag = () => {
    setDrag(null);
    setHint(null);
  };

  const handleDragStart = (e, node) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', node.id); // Firefox bắt buộc phải có dữ liệu thì mới cho kéo
    setDrag({ id: node.id, blocked: new Set(flattenNodes([node]).map((n) => n.id)) });
  };

  const handleDragOver = (e, node) => {
    // Không phải đang kéo mốc, hoặc rê vào chính nó / con cháu của nó: không cho thả (không gọi preventDefault)
    if (!drag || drag.blocked.has(node.id)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    // Chia chiều cao dòng làm 3 vùng: 25% trên = đứng TRƯỚC, 50% giữa = vào BÊN TRONG (thành mốc con), 25% dưới = đứng SAU
    const rect = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - rect.top) / rect.height;
    const pos = y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'into';
    setHint((prev) => (prev && prev.id === node.id && prev.pos === pos ? prev : { id: node.id, pos }));
  };

  const handleDrop = async (e, node) => {
    e.preventDefault();
    if (!drag || !hint || hint.id !== node.id) {
      clearDrag();
      return;
    }
    const movingId = drag.id;
    const pos = hint.pos;
    clearDrag();

    // Tính mốc cha mới + vị trí mới (vị trí tính trong danh sách anh em KHÔNG gồm mốc đang kéo - khớp với Backend)
    let parentId;
    let index;
    if (pos === 'into') {
      parentId = node.id;
      index = (node.children || []).filter((c) => c.id !== movingId).length; // xuống cuối danh sách con
    } else {
      parentId = node.parentId || null;
      const siblings = parentId
        ? flattenNodes(milestones).find((n) => n.id === parentId)?.children || []
        : milestones;
      const list = siblings.filter((s) => s.id !== movingId);
      const at = list.findIndex((s) => s.id === node.id);
      index = pos === 'before' ? at : at + 1;
    }

    setErrorMsg('');
    try {
      await milestoneApi.move(movingId, { parentId, index });
      await loadTimeline(true);
      if (pos === 'into') sendTreeCmd('open'); // mở cây để thấy mốc vừa được đưa vào bên trong
      setTimeout(() => flashNode(movingId), 120);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Di chuyển mốc thất bại');
    }
  };

  const dnd = {
    enabled: !isFiltering,
    dragId: drag ? drag.id : null,
    hint,
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
    onDragEnd: clearDrag,
  };

  return (
    <div className="timeline-view">
      {/* Chia 2 cột - trái là cây mốc, phải là bảng tổng quan (xuống dưới cây mốc khi màn hình hẹp) */}
      <div className="ms-layout">
        <div className="ms-main">
          <div className="timeline-header-row">
            <h2 className="timeline-title">Tiến độ theo mốc</h2>
            <div className="tr-header-actions">
              <button className="tr-link-btn" onClick={() => sendTreeCmd('open')}>
                Mở rộng tất cả
              </button>
              <button className="tr-link-btn" onClick={() => sendTreeCmd('close')}>
                Thu gọn tất cả
              </button>
              <button className="tr-link-btn" onClick={handleExport} disabled={exporting}>
                {exporting ? 'Đang xuất...' : 'Xuất Excel'}
              </button>
              <button className="btn-primary" onClick={() => handleOpenAdd(null)}>
                + Thêm mốc
              </button>
            </div>
          </div>

          {/* MỚI THÊM: thanh tìm kiếm + lọc (chỉ hiện khi đã có mốc) */}
          {!loading && milestones.length > 0 && (
            <div className="ms-filter">
              <div className="ms-filter-search">
                <span className="ms-filter-icon">🔍</span>
                <input
                  type="text"
                  value={filters.q}
                  onChange={(e) => setFilter('q', e.target.value)}
                  placeholder="Tìm mốc, việc, người, tag..."
                />
              </div>
              <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
                <option value="all">Mọi trạng thái</option>
                <option value="todo">Chưa làm</option>
                <option value="doing">Đang làm</option>
                <option value="redo">Làm lại</option>
                <option value="done">Hoàn thành</option>
                <option value="overdue">Trễ hạn</option>
              </select>
              <select value={filters.assignee} onChange={(e) => setFilter('assignee', e.target.value)}>
                <option value="all">Mọi người</option>
                <option value="__none">Chưa giao</option>
                {assigneeOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
              <select value={filters.tag} onChange={(e) => setFilter('tag', e.target.value)}>
                <option value="all">Mọi tag</option>
                {tagOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              {isFiltering && (
                <>
                  <button type="button" className="tr-link-btn" onClick={clearFilters}>
                    Xóa lọc
                  </button>
                  <span className="ms-filter-count">
                    Hiện {shownTaskCount}/{allTasks.length} công việc
                  </span>
                </>
              )}
            </div>
          )}

          {errorMsg && <div className="ms-error">{errorMsg}</div>}

          {loading ? (
            <p>Đang tải...</p>
          ) : milestones.length === 0 ? (
            <div className="empty-state">
              <p>Chưa có mốc nào. Thêm mốc đầu tiên để bắt đầu theo dõi tiến độ theo giai đoạn.</p>
            </div>
          ) : visibleMilestones.length === 0 ? (
            <div className="empty-state">
              <p>Không có mốc hay công việc nào khớp bộ lọc.</p>
            </div>
          ) : (
            <div className="pj-root">
              {/* MỚI THÊM: GỐC của cây = tên dự án; các mốc lớn treo bên dưới, nối với nhau bằng 1 đường kẻ dọc */}
              <div className="pj-head">
                <span className="pj-mark">◆</span>
                <div className="pj-text">
                  <div className="pj-name">{projectName || 'Dự án'}</div>
                  <div className="pj-meta">
                    {milestoneCount} mốc · {projectDone}/{allTasks.length} công việc hoàn thành
                  </div>
                </div>
                <div className="pj-progress">
                  <div className="tr-progress-track">
                    <div
                      className={`tr-progress-fill ${projectPercent === 100 ? 'tr-progress-fill-done' : ''}`}
                      style={{ width: `${projectPercent}%` }}
                    />
                  </div>
                  <span className="tr-percent">{projectPercent}%</span>
                </div>
              </div>

              <div className="timeline-list">
                {visibleMilestones.map((m) => (
                  <MilestoneNode
                    key={m.id}
                    node={m}
                    depth={0}
                    onDelete={handleDelete}
                    onAddChild={handleOpenAdd}
                    onEdit={setEditTarget}
                    treeCmd={treeCmd}
                    onToggleTask={handleToggleTask}
                    busyTaskId={busyTaskId}
                    onAddTask={handleOpenAddTask}
                    dnd={dnd}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {!loading && milestones.length > 0 && (
          <SummaryPanel milestones={milestones} onJump={handleJump} />
        )}
      </div>

      <AddMilestoneModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={loadTimeline}
        groupId={groupId}
        parentId={addParent?.id || null}
        parentTitle={addParent?.title || null}
      />

      <EditMilestoneModal
        isOpen={!!editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => loadTimeline(true)}
        milestone={editTarget}
      />

      <CreateTaskModal
        isOpen={!!taskModal}
        onClose={() => setTaskModal(null)}
        onCreated={() => loadTimeline(true)}
        groupId={groupId}
        milestone={taskModal ? taskModal.milestone : null}
        parentTask={taskModal ? taskModal.parentTask : null}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Xóa mốc này?"
        message={
          deleteTarget
            ? `Mốc "${deleteTarget.title}" sẽ bị xóa cùng các nhận xét của nó. Các công việc đã gắn vào không bị xóa, chỉ được gỡ khỏi mốc.`
            : ''
        }
        confirmText="Xóa mốc"
        cancelText="Giữ lại"
        danger
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}