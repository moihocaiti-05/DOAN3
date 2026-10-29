import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom'; // vẽ cửa sổ ra ngoài cùng của trang để không bị khung cha che hoặc cắt
import { useNavigate } from 'react-router-dom';
import { supervisorApi } from '../services/supervisorApi';
import '../styles/upcoming-deadlines.css';

// Các khoảng ngày để Giảng viên tự chọn
const RANGES = [3, 7, 14, 30];
const DEFAULT_RANGE = 7;
const SHOW_DEFAULT = 5; // MỚI SỬA: mỗi NHÓM hiện 5 dòng đầu, còn lại bấm "Xem thêm" của nhóm đó
const STORAGE_KEY = 'supervisorUpcomingDays'; // nhớ khoảng ngày đã chọn ở trình duyệt này
const HIDE_KEY = 'supervisorUpcomingHideLate'; // nhớ lựa chọn ẩn việc trễ

// Đọc / ghi localStorage có bọc try/catch (trình duyệt chặn lưu trữ thì vẫn chạy bình thường, chỉ không nhớ được)
const readStored = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeStored = (key, value) => {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // không lưu được thì thôi
  }
};

// Chữ và kiểu huy hiệu "còn bao lâu" theo số ngày còn lại (âm = đã trễ)
const whenOf = (daysLeft) => {
  if (daysLeft < 0) return { text: `Trễ ${-daysLeft} ngày`, kind: 'late' };
  if (daysLeft === 0) return { text: 'Hôm nay', kind: 'today' };
  if (daysLeft === 1) return { text: 'Ngày mai', kind: 'soon' };
  return { text: `Còn ${daysLeft} ngày`, kind: 'ok' };
};

// Ngày hạn dạng "25/10", theo giờ Việt Nam (dùng 'en-GB' vì luôn cho đúng dạng ngày/tháng; 'vi-VN' tùy trình duyệt có thể ra "25-10")
const formatDate = (iso) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' }).format(new Date(iso));

// Thanh gọn một dòng (tiêu đề + tóm tắt + nút "Xem danh sách"); bấm nút mới mở cửa sổ chứa danh sách.
// MỚI SỬA: trong cửa sổ, việc và mốc được CHIA THEO TỪNG NHÓM (mỗi nhóm một tiêu đề).
// Bấm tiêu đề nhóm hoặc một dòng việc thì mở trang nhóm đó.
export default function UpcomingDeadlinesBox() {
  const navigate = useNavigate();

  const [days, setDays] = useState(() => {
    const saved = Number(readStored(STORAGE_KEY));
    return RANGES.includes(saved) ? saved : DEFAULT_RANGE;
  });
  const [hideLate, setHideLate] = useState(() => readStored(HIDE_KEY) === 'true');
  const [data, setData] = useState(null); // null = chưa có dữ liệu lần nào
  const [refreshing, setRefreshing] = useState(false); // đang tải lại khi đổi khoảng ngày
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState({}); // MỚI SỬA: { [groupId]: true } = nhóm đang bấm "Xem thêm"
  const [open, setOpen] = useState(false); // cửa sổ danh sách đang mở hay đóng

  useEffect(() => {
    let cancelled = false; // bấm đổi khoảng ngày liên tiếp thì bỏ kết quả của lần gọi cũ, tránh hiện nhầm
    setRefreshing(true);
    setError('');
    supervisorApi
      .getUpcoming(days)
      .then((res) => {
        if (!cancelled) setData(res.data.data);
      })
      .catch(() => {
        if (!cancelled) setError('Không tải được danh sách việc sắp đến hạn.');
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  // Khi cửa sổ mở thì bấm Esc để đóng và khóa cuộn trang phía sau
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = oldOverflow;
    };
  }, [open]);

  const chooseDays = (value) => {
    setDays(value);
    setExpanded({});
    writeStored(STORAGE_KEY, value);
  };

  const toggleHideLate = (checked) => {
    setHideLate(checked);
    setExpanded({});
    writeStored(HIDE_KEY, checked);
  };

  // Bấm "Xem thêm" / "Thu gọn" của đúng 1 nhóm
  const toggleGroup = (groupId) => setExpanded((prev) => ({ ...prev, [groupId]: !prev[groupId] }));

  if (!data && !error) return null; // lần tải đầu: chưa hiện gì để tránh giật layout

  const items = data ? data.items.filter((i) => !(hideLate && i.daysLeft < 0)) : [];

  // MỚI THÊM: gom các dòng theo nhóm. Backend đã xếp trễ nhiều nhất lên đầu nên nhóm nào có việc trễ nhiều nhất tự nổi lên đầu
  const groupedItems = [];
  const groupIndex = new Map();
  items.forEach((i) => {
    if (!groupIndex.has(i.groupId)) {
      const entry = { groupId: i.groupId, groupName: i.groupName, items: [] };
      groupIndex.set(i.groupId, entry);
      groupedItems.push(entry);
    }
    groupIndex.get(i.groupId).items.push(i);
  });

  return (
    <>
      {/* Thanh gọn một dòng thay cho hộp dài */}
      <div className="ud-bar">
        <h2 className="ud-title">Sắp đến hạn</h2>
        {data && (
          <span className="ud-summary">
            {data.overdueCount > 0 && <span className="ud-summary-late">{data.overdueCount} đã trễ</span>}
            {data.overdueCount > 0 && ' · '}
            {data.upcomingCount} trong {data.days} ngày tới
          </span>
        )}
        {error && <span className="ud-error ud-error-inline">{error}</span>}
        <span className="ud-spacer" />
        {data && (
          <button className="ud-open-btn" onClick={() => setOpen(true)}>
            Xem danh sách
          </button>
        )}
      </div>

      {/* Cửa sổ danh sách, chỉ vẽ khi bấm "Xem danh sách" */}
      {open &&
        data &&
        createPortal(
          <div className="ud-overlay" onClick={() => setOpen(false)}>
            {/* stopPropagation: bấm bên trong cửa sổ không bị tính là bấm nền tối (đóng) */}
            <div className="ud-modal" onClick={(e) => e.stopPropagation()}>
              <div className="ud-modal-header">
                <h2 className="ud-title">Sắp đến hạn</h2>
                <span className="ud-summary">
                  {data.overdueCount > 0 && <span className="ud-summary-late">{data.overdueCount} đã trễ</span>}
                  {data.overdueCount > 0 && ' · '}
                  {data.upcomingCount} trong {data.days} ngày tới
                </span>
                <span className="ud-spacer" />
                <button className="ud-close" onClick={() => setOpen(false)} aria-label="Đóng">
                  ✕
                </button>
              </div>

              <div className="ud-controls">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    className={`ud-chip ${days === r ? 'ud-chip-active' : ''}`}
                    onClick={() => chooseDays(r)}
                  >
                    {r} ngày
                  </button>
                ))}
                <span className="ud-spacer" />
                <label className="ud-check">
                  <input type="checkbox" checked={hideLate} onChange={(e) => toggleHideLate(e.target.checked)} />
                  Ẩn việc đã trễ
                </label>
              </div>

              {error && <p className="ud-error">{error}</p>}

              <div className="ud-modal-body">
                {items.length === 0 && (
                  <p className="ud-empty">
                    {hideLate && data.items.length > 0
                      ? 'Không có việc hay mốc nào sắp đến hạn (đang ẩn các mục đã trễ).'
                      : `Không có việc hay mốc nào sắp đến hạn trong ${data.days} ngày tới.`}
                  </p>
                )}

                {/* MỚI SỬA: mỗi nhóm một khối gồm tiêu đề + danh sách việc của nhóm đó */}
                {groupedItems.map((g) => {
                  const lateCount = g.items.filter((i) => i.daysLeft < 0).length;
                  const soonCount = g.items.length - lateCount;
                  const isExpanded = !!expanded[g.groupId];
                  const shown = isExpanded ? g.items : g.items.slice(0, SHOW_DEFAULT);
                  return (
                    <section key={g.groupId} className="ud-group">
                      <div className="ud-group-head" onClick={() => navigate(`/groups/${g.groupId}`)}>
                        <h3 className="ud-group-name">{g.groupName}</h3>
                        <span className="ud-summary">
                          {lateCount > 0 && <span className="ud-summary-late">{lateCount} đã trễ</span>}
                          {lateCount > 0 && soonCount > 0 && ' · '}
                          {soonCount > 0 && `${soonCount} sắp tới`}
                        </span>
                      </div>

                      <div className={`ud-list ${refreshing ? 'ud-list-loading' : ''}`}>
                        {shown.map((i) => {
                          const when = whenOf(i.daysLeft);
                          return (
                            <div
                              key={`${i.kind}-${i.id}`}
                              className="ud-item"
                              onClick={() => navigate(`/groups/${i.groupId}`)}
                            >
                              <div className="ud-item-main">
                                <div className="ud-item-top">
                                  <span className={`ud-kind ${i.kind === 'milestone' ? 'ud-kind-milestone' : ''}`}>
                                    {i.kind === 'milestone' ? 'Mốc' : 'Việc'}
                                  </span>
                                  <p className="ud-item-title">{i.title}</p>
                                </div>
                                {/* MỚI SỬA: bỏ tên nhóm khỏi dòng nhỏ vì đã có tiêu đề nhóm phía trên */}
                                <p className="ud-item-sub">
                                  {i.kind === 'milestone'
                                    ? `${i.doneTasks}/${i.totalTasks} việc xong`
                                    : i.assigneeName
                                      ? `người làm: ${i.assigneeName}`
                                      : 'chưa giao ai'}
                                  {i.kind === 'task' && i.parentTitle ? ` · việc con của "${i.parentTitle}"` : ''}
                                  {i.kind === 'task' && i.milestoneTitle ? ` · mốc: ${i.milestoneTitle}` : ''}
                                </p>
                              </div>
                              <div className="ud-item-side">
                                <span className={`ud-when ud-when-${when.kind}`}>{when.text}</span>
                                <p className="ud-date">{formatDate(i.deadline)}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {g.items.length > SHOW_DEFAULT && (
                        <button className="ud-more" onClick={() => toggleGroup(g.groupId)}>
                          {isExpanded ? 'Thu gọn' : `Xem thêm (${g.items.length - SHOW_DEFAULT})`}
                        </button>
                      )}
                    </section>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}