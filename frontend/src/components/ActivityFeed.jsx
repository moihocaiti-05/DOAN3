import { useState, useEffect, useMemo, useRef } from 'react'; // MỚI SỬA: thêm useRef để bỏ qua kết quả tải cũ khi bấm đổi mốc liên tục
import { groupApi } from '../services/groupApi';
import { useAuth } from '../context/AuthContext'; // biết mình là ai để không đếm hoạt động của chính mình
import socket from '../services/socket'; // nghe sự kiện "activity_new" từ Backend
import '../styles/activity.css';
import '../styles/activity-live.css'; // CSS riêng cho thanh "Có N hoạt động mới"
import '../styles/activity-link.css'; // CSS riêng cho dòng hoạt động bấm được + dòng báo "không mở được" + thanh mốc thời gian

const TZ = 'Asia/Ho_Chi_Minh';

// Hiển thị thời gian đầy đủ theo giờ Việt Nam, VD "11/10/2026 19:28" (dùng làm chú thích khi rê chuột vào giờ)
const formatTime = (value) =>
  new Date(value).toLocaleString('vi-VN', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

// chỉ lấy giờ:phút, VD "17:18"
const formatClock = (value) =>
  new Date(value).toLocaleTimeString('vi-VN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

// khóa ngày theo giờ Việt Nam (dạng "2026-11-06") để gom các hoạt động cùng ngày vào 1 nhóm
const dayKey = (value) => new Date(value).toLocaleDateString('en-CA', { timeZone: TZ });

// tiêu đề nhóm ngày: "Hôm nay", "Hôm qua", hoặc "Thứ Sáu, 06/11/2026"
const dayLabel = (key, sampleDate) => {
  if (key === dayKey(Date.now())) return 'Hôm nay';
  if (key === dayKey(Date.now() - 24 * 60 * 60 * 1000)) return 'Hôm qua';
  return new Date(sampleDate).toLocaleDateString('vi-VN', {
    timeZone: TZ,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

// thời gian tương đối cho hoạt động còn mới ("Vừa xong", "5 phút trước", "2 giờ trước"); cũ hơn 24 giờ thì hiện giờ:phút
const relativeTime = (value) => {
  const diffMin = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  if (diffMin < 24 * 60) return `${Math.floor(diffMin / 60)} giờ trước`;
  return formatClock(value);
};

// avatar chữ viết tắt (chữ đầu của họ + chữ đầu của tên) và màu cố định theo tên
const initials = (name) => {
  const words = (name || '?').trim().split(/\s+/);
  const first = words[0]?.[0] || '?';
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
};
const avatarColor = (name) => {
  let hash = 0;
  for (const ch of name || '') hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${hash} 55% 48%)`;
};

// định danh người thực hiện (ưu tiên id, không có thì dùng actorId hoặc tên) để lọc theo người và gộp dòng
const actorKey = (a) => a.actor?.id ?? a.actorId ?? a.actor?.fullName ?? 'unknown';

// nhóm lọc theo loại hoạt động (dựa trên tiền tố của "type" lưu ở Backend)
const categoryOf = (type = '') => {
  if (type.startsWith('task.')) return 'task';
  if (type.startsWith('milestone.') || type.startsWith('comment.')) return 'milestone';
  return 'member'; // member.*, supervisor.*, group.*...
};
const FILTERS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'task', label: 'Công việc' },
  { id: 'milestone', label: 'Mốc & bình luận' },
  { id: 'member', label: 'Thành viên & nhóm' },
];

// MỚI THÊM: các mốc thời gian để xem lịch sử. Backend lọc trong TOÀN BỘ lịch sử theo giờ Việt Nam (UTC+7)
// ('date' = chọn đúng 1 ngày trên ô lịch, 'all' = không lọc thời gian)
const RANGES = [
  { id: 'today', label: 'Hôm nay' },
  { id: 'yesterday', label: 'Hôm qua' },
  { id: '7days', label: '7 ngày qua' },
  { id: 'date', label: 'Chọn ngày...' },
  { id: 'all', label: 'Tất cả' },
];

// MỚI THÊM: hoạt động này có bấm để mở được không?
// - Hoạt động đã xóa (type kết thúc bằng ".deleted"), import Excel, xóa dữ liệu nhóm: không còn gì để mở
// - task cần có targetId; milestone (kể cả bình luận), member, supervisor: luôn mở được
const isClickable = (a) => {
  const type = a.type || '';
  if (type.endsWith('.deleted') || type === 'group.data_cleared' || type === 'task.imported') return false;
  if (a.targetType === 'task') return !!a.targetId;
  return a.targetType === 'milestone' || a.targetType === 'member' || a.targetType === 'supervisor';
};

// MỚI THÊM: chú thích hiện khi rê chuột vào dòng bấm được
const openHint = (a) => {
  if (a.targetType === 'task') return 'Bấm để mở công việc';
  if (a.targetType === 'milestone') return 'Bấm để xem tab Tiến độ theo mốc';
  return 'Bấm để xem thành viên nhóm';
};

// chọn biểu tượng + tông màu cho từng hoạt động. Ưu tiên đọc từ nội dung (summary) để nhận ra
// các trường hợp đặc biệt (từ chối, chuyển sang Hoàn thành / Kiểm định...), sau đó mới dựa vào "type"
const kindOf = (a) => {
  const type = a.type || '';
  const s = a.summary || '';
  if (type === 'group.data_cleared' || /xóa toàn bộ dữ liệu/.test(s)) return { icon: '🧹', tone: 'danger' };
  if (/từ chối/.test(s)) return { icon: '↩️', tone: 'warning' };
  if (/sang "Hoàn thành"/.test(s)) return { icon: '✅', tone: 'success' };
  if (/sang "Kiểm định"/.test(s)) return { icon: '🔍', tone: 'review' };
  if (/sang "Làm lại"/.test(s)) return { icon: '🔄', tone: 'warning' };
  if (/sang "Đang làm"/.test(s)) return { icon: '▶️', tone: 'info' };
  if (type === 'task.created') return { icon: '➕', tone: 'info' };
  if (type === 'task.assigned') return { icon: '👤', tone: 'info' };
  if (type === 'task.updated') return { icon: '✏️', tone: 'neutral' };
  if (type === 'task.deleted') return { icon: '🗑️', tone: 'danger' };
  if (type === 'task.imported') return { icon: '📥', tone: 'neutral' };
  if (type === 'milestone.deleted') return { icon: '🗑️', tone: 'danger' };
  if (type.startsWith('milestone.')) return { icon: '🚩', tone: 'neutral' };
  if (type.startsWith('comment.')) return { icon: '💬', tone: 'info' };
  if (type === 'member.removed') return { icon: '🚪', tone: 'danger' };
  if (type.startsWith('member.') || type.startsWith('supervisor.')) return { icon: '👥', tone: 'success' };
  return { icon: '•', tone: 'neutral' };
};

// tông màu cho nhãn trạng thái (khớp tên cột trên Kanban)
const STATUS_TONE = {
  'Danh sách công việc': 'todo',
  'Chưa làm': 'todo',
  'Đang làm': 'doing',
  'Làm lại': 'redo',
  'Kiểm định': 'review',
  'Hoàn thành': 'done',
};

// đoạn chữ nằm trong dấu "..." (thường là tên công việc / mốc) hiện thành khối nổi bật
const renderQuoted = (text) =>
  text.split(/("[^"]+")/g).map((part, i) =>
    /^"[^"]+"$/.test(part) ? (
      <span key={i} className="activity-chip">
        {part.slice(1, -1)}
      </span>
    ) : (
      part
    )
  );

// tách nội dung summary thành 3 phần: câu chính, cặp trạng thái (từ "A" sang "B") và lý do từ chối
// Nếu không khớp mẫu nào thì cứ hiện nguyên câu như cũ (an toàn với mọi loại hoạt động, kể cả loại mới sau này)
const parseSummary = (summary = '') => {
  let main = summary;
  let note = null;
  let pills = null;

  const rejected = main.match(/^([\s\S]*?),\s*yêu cầu làm lại:\s*"([\s\S]*)"\s*$/);
  if (rejected) {
    main = rejected[1];
    note = rejected[2];
  }

  const moved = main.match(/^([\s\S]*?)\s+từ\s+"([^"]+)"\s+sang\s+"([^"]+)"\s*$/);
  if (moved) {
    main = moved[1];
    pills = [moved[2], moved[3]];
  }

  return { main, note, pills };
};

// Tab "Hoạt động" - danh sách việc đã xảy ra trong nhóm (mới nhất trước), bấm "Xem thêm" để tải trang tiếp theo
// MỚI SỬA: prop onOpenTarget(activity) - hàm của trang cha mở công việc / mốc / thành viên khi bấm 1 dòng;
// trả về chuỗi báo lỗi nếu không mở được, không trả gì nghĩa là đã mở
export default function ActivityFeed({ groupId, onOpenTarget }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // loại hoạt động đang lọc
  const [actorFilter, setActorFilter] = useState('all'); // người thực hiện đang lọc
  const [newCount, setNewCount] = useState(0); // số hoạt động MỚI của người khác từ lúc tải danh sách lần cuối
  const [notice, setNotice] = useState(''); // dòng báo khi bấm hoạt động mà không mở được (VD công việc đã bị xóa)
  const [range, setRange] = useState('all'); // MỚI THÊM: mốc thời gian đang xem (lọc ở Backend)
  const [pickedDate, setPickedDate] = useState(''); // MỚI THÊM: ngày đã chọn trên ô lịch, dạng "2026-10-01"
  const [total, setTotal] = useState(0); // MỚI THÊM: tổng số hoạt động trong mốc đang xem (do Backend đếm)
  const requestId = useRef(0); // MỚI THÊM: số thứ tự của lần tải mới nhất, để bỏ qua kết quả của lần tải cũ về trễ

  // khóa ngày hôm nay (giờ VN) - dùng làm ngày lớn nhất được chọn trên ô lịch
  const todayKey = dayKey(Date.now());
  // MỚI THÊM: mốc đang xem có chứa hôm nay không? (nếu đang xem "Hôm qua" hay một ngày cũ thì hoạt động mới không thuộc mốc này)
  const showsToday =
    range === 'all' || range === 'today' || range === '7days' || (range === 'date' && pickedDate === todayKey);
  // MỚI THÊM: đã bấm "Chọn ngày..." nhưng chưa có ngày nào
  const needDate = range === 'date' && !pickedDate;

  // Tải 1 trang; reset = true nghĩa là tải lại từ đầu (dùng cho lần vào tab, nút "Tải lại", đổi mốc và thanh "Có N hoạt động mới")
  // MỚI SỬA: rangeArg / dateArg là mốc dùng để tải; không truyền thì lấy mốc đang chọn
  const loadPage = async (targetPage, reset, rangeArg = range, dateArg = pickedDate) => {
    const myRequest = ++requestId.current; // đánh số lần tải này
    setLoading(true);
    setError('');
    if (reset) setNewCount(0); // tải lại từ đầu thì đã thấy hết hoạt động mới, xóa bộ đếm
    try {
      const res = await groupApi.getActivities(groupId, targetPage, 20, rangeArg, dateArg);
      if (myRequest !== requestId.current) return; // đã có lần tải mới hơn (VD đổi mốc) -> bỏ kết quả cũ này
      const data = res.data.data;
      setItems((prev) => (reset ? data.items : [...prev, ...data.items]));
      setPage(data.page);
      setHasMore(data.hasMore);
      setTotal(data.total);
    } catch (err) {
      if (myRequest !== requestId.current) return;
      setError(err.response?.data?.message || 'Không tải được lịch sử hoạt động');
    } finally {
      if (myRequest === requestId.current) setLoading(false);
    }
  };

  // Vào tab hoặc đổi nhóm: về mốc "Tất cả" như trước và tải từ đầu
  useEffect(() => {
    setRange('all');
    setPickedDate('');
    setItems([]);
    setTotal(0);
    loadPage(1, true, 'all', '');
  }, [groupId]);

  // nghe Backend báo có hoạt động mới trong nhóm này. Chỉ đếm hoạt động của NGƯỜI KHÁC
  // (việc do chính mình làm thì mình đã tự thấy). Không tự chèn vào danh sách để khỏi nhảy giao diện khi đang đọc
  useEffect(() => {
    const handleNewActivity = (payload) => {
      if (!payload || payload.groupId !== groupId) return;
      if (payload.actorId === user?.id) return;
      if (!showsToday) return; // MỚI THÊM: đang xem ngày cũ thì hoạt động mới (của hôm nay) không nằm trong mốc này, không đếm
      setNewCount((n) => n + 1);
    };
    socket.on('activity_new', handleNewActivity);
    return () => {
      socket.off('activity_new', handleNewActivity);
    };
  }, [groupId, user?.id, showsToday]);

  // dòng báo tự ẩn sau 4 giây
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  // MỚI THÊM: bấm 1 nút mốc thời gian -> xóa danh sách cũ rồi tải lại từ đầu theo mốc mới
  const changeRange = (id) => {
    if (id === range && id !== 'date') return; // bấm lại đúng mốc đang xem thì thôi
    setRange(id);
    setNotice('');
    setItems([]);
    setHasMore(false);
    setTotal(0);
    if (id === 'date') {
      // Mở ô lịch, mặc định là hôm nay (người dùng chọn lại sang ngày cũ); nhớ ngày đã chọn lần trước nếu có
      const date = pickedDate || todayKey;
      setPickedDate(date);
      loadPage(1, true, 'date', date);
    } else {
      loadPage(1, true, id, '');
    }
  };

  // MỚI THÊM: chọn 1 ngày trên ô lịch -> tải lại từ đầu theo đúng ngày đó
  const changeDate = (value) => {
    setPickedDate(value);
    setItems([]);
    setHasMore(false);
    setTotal(0);
    if (!value) {
      // Xóa trắng ô lịch: hủy lần tải đang chạy và chờ người dùng chọn ngày khác
      requestId.current += 1;
      setLoading(false);
      return;
    }
    loadPage(1, true, 'date', value);
  };

  // bấm 1 dòng hoạt động -> nhờ trang cha mở đúng chỗ; trang cha trả chuỗi báo lỗi thì hiện ra
  const handleOpen = async (activity) => {
    if (!onOpenTarget || !isClickable(activity)) return;
    setNotice('');
    const message = await onOpenTarget(activity);
    if (message) setNotice(message);
  };

  // danh sách người thực hiện (không trùng) lấy từ các hoạt động đã tải, dùng cho ô chọn người
  const actors = useMemo(() => {
    const map = new Map();
    items.forEach((a) => {
      const key = actorKey(a);
      if (!map.has(key)) map.set(key, a.actor?.fullName || 'Không rõ');
    });
    return [...map.entries()];
  }, [items]);

  // lọc theo loại + người, rồi GOM THEO NGÀY.
  // Các dòng liền nhau giống hệt nhau (cùng người, cùng loại, cùng nội dung) được gộp thành 1 dòng kèm "×N"
  const groups = useMemo(() => {
    const result = [];
    items
      .filter((a) => filter === 'all' || categoryOf(a.type) === filter)
      .filter((a) => actorFilter === 'all' || actorKey(a) === actorFilter)
      .forEach((a) => {
        const key = dayKey(a.createdAt);
        let day = result[result.length - 1];
        if (!day || day.key !== key) {
          day = { key, label: dayLabel(key, a.createdAt), rows: [] };
          result.push(day);
        }
        const last = day.rows[day.rows.length - 1];
        if (last && actorKey(last) === actorKey(a) && last.type === a.type && last.summary === a.summary) {
          last.count += 1; // gộp vào dòng trước (dòng trước là hoạt động MỚI hơn nên giữ nguyên giờ của nó)
        } else {
          day.rows.push({ ...a, count: 1 });
        }
      });
    return result;
  }, [items, filter, actorFilter]);

  const noMatch = !loading && !error && items.length > 0 && groups.length === 0;

  return (
    <div className="activity-feed">
      <div className="activity-feed-header">
        <div>
          <h2 className="activity-feed-title">Hoạt động gần đây</h2>
          {/* MỚI SỬA: hiện thêm tổng số hoạt động trong mốc đang xem, VD "Đã tải 20 / 134 hoạt động" */}
          <p className="activity-feed-sub">
            Đã tải {items.length}
            {total > 0 ? ` / ${total}` : ''} hoạt động
          </p>
        </div>
        <button className="btn-secondary" onClick={() => loadPage(1, true)} disabled={loading || needDate}>
          Tải lại
        </button>
      </div>

      {/* thanh báo hoạt động mới, bấm vào thì tải lại từ đầu (và đưa bộ đếm về 0) */}
      {newCount > 0 && (
        <button
          type="button"
          className="activity-new-banner"
          onClick={() => loadPage(1, true)}
          disabled={loading}
          aria-live="polite"
        >
          <span className="activity-new-dot" />
          Có {newCount} hoạt động mới, bấm để xem
        </button>
      )}

      {/* dòng báo khi không mở được công việc / mốc (VD đã bị xóa) */}
      {notice && (
        <p className="activity-notice" role="status">
          {notice}
        </p>
      )}

      {/* MỚI THÊM: thanh chọn mốc thời gian (lọc ở Backend, tìm được trong toàn bộ lịch sử) */}
      <div className="activity-range-bar">
        <div className="activity-filters">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`activity-filter-btn${range === r.id ? ' activity-filter-btn-active' : ''}`}
              onClick={() => changeRange(r.id)}
              aria-pressed={range === r.id}
            >
              {r.label}
            </button>
          ))}
        </div>
        {/* Bấm "Chọn ngày..." thì hiện ô lịch; không cho chọn ngày trong tương lai */}
        {range === 'date' && (
          <input
            type="date"
            className="activity-date-input"
            value={pickedDate}
            max={todayKey}
            onChange={(e) => changeDate(e.target.value)}
            aria-label="Chọn ngày xem hoạt động"
          />
        )}
      </div>

      {/* thanh lọc theo loại + theo người thực hiện (lọc trong các hoạt động của mốc thời gian đang chọn) */}
      <div className="activity-toolbar">
        <div className="activity-filters">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`activity-filter-btn${filter === f.id ? ' activity-filter-btn-active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select className="activity-actor-select" value={actorFilter} onChange={(e) => setActorFilter(e.target.value)}>
          <option value="all">Mọi người</option>
          {actors.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="activity-feed-error">{error}</p>}

      {/* MỚI THÊM: đã bấm "Chọn ngày..." nhưng ô lịch đang trống */}
      {needDate && <p className="activity-feed-empty">Chọn một ngày để xem hoạt động.</p>}

      {/* MỚI SỬA: mốc nào không có hoạt động thì báo riêng; mốc "Tất cả" giữ câu cũ */}
      {!loading && !error && !needDate && items.length === 0 && (
        <p className="activity-feed-empty">
          {range === 'all' ? 'Chưa có hoạt động nào được ghi lại.' : 'Không có hoạt động nào trong khoảng này.'}
        </p>
      )}

      {noMatch && (
        <p className="activity-feed-empty">
          Không có hoạt động nào khớp bộ lọc{hasMore ? ' trong phần đã tải. Bấm "Xem thêm" để tải thêm.' : '.'}
        </p>
      )}

      {groups.map((day) => (
        <section key={day.key} className="activity-day">
          <h3 className="activity-day-title">{day.label}</h3>
          <ul className="activity-list">
            {day.rows.map((a) => {
              const name = a.actor?.fullName || 'Không rõ';
              const { icon, tone } = kindOf(a);
              const { main, note, pills } = parseSummary(a.summary);
              const clickable = !!onOpenTarget && isClickable(a);
              return (
                <li
                  key={a.id}
                  className={`activity-item${clickable ? ' activity-item-clickable' : ''}`}
                  // dòng bấm được - chuột và bàn phím (Enter / Space) đều mở được
                  onClick={clickable ? () => handleOpen(a) : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleOpen(a);
                          }
                        }
                      : undefined
                  }
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  title={clickable ? openHint(a) : undefined}
                >
                  <span className="activity-avatar" style={{ background: avatarColor(name) }}>
                    {initials(name)}
                    <span className={`activity-kind activity-tone-${tone}`}>{icon}</span>
                  </span>

                  <div className="activity-body">
                    <p className="activity-text">
                      <strong>{name}</strong> {renderQuoted(main)}
                      {pills && (
                        <>
                          {' '}
                          <span className={`activity-status activity-status-${STATUS_TONE[pills[0]] || 'todo'}`}>
                            {pills[0]}
                          </span>
                          <span className="activity-arrow">→</span>
                          <span className={`activity-status activity-status-${STATUS_TONE[pills[1]] || 'todo'}`}>
                            {pills[1]}
                          </span>
                        </>
                      )}
                      {a.count > 1 && <span className="activity-count">×{a.count}</span>}
                    </p>
                    {note && <blockquote className="activity-note">{note}</blockquote>}
                  </div>

                  <span className="activity-time" title={formatTime(a.createdAt)}>
                    {relativeTime(a.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {loading && <p className="activity-feed-empty">Đang tải...</p>}

      {/* "Xem thêm" vẫn dùng được trong từng mốc: loadPage lấy mốc đang chọn từ state */}
      {hasMore && !loading && (
        <button className="btn-secondary activity-more" onClick={() => loadPage(page + 1, false)}>
          Xem thêm
        </button>
      )}
    </div>
  );
}