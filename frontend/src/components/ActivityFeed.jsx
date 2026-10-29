import { useState, useEffect } from 'react';
import { groupApi } from '../services/groupApi';
import '../styles/activity.css';

// Hiển thị thời gian theo giờ Việt Nam, VD "11/10/2026 19:28"
const formatTime = (value) =>
  new Date(value).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

// Tab "Hoạt động" - danh sách việc đã xảy ra trong nhóm (mới nhất trước), bấm "Xem thêm" để tải trang tiếp theo
export default function ActivityFeed({ groupId }) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Tải 1 trang; reset = true nghĩa là tải lại từ đầu (dùng cho lần vào tab và nút "Tải lại")
  const loadPage = async (targetPage, reset) => {
    setLoading(true);
    setError('');
    try {
      const res = await groupApi.getActivities(groupId, targetPage, 20);
      const data = res.data.data;
      setItems((prev) => (reset ? data.items : [...prev, ...data.items]));
      setPage(data.page);
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err.response?.data?.message || 'Không tải được lịch sử hoạt động');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPage(1, true);
  }, [groupId]);

  return (
    <div className="activity-feed">
      <div className="activity-feed-header">
        <h2 className="activity-feed-title">Hoạt động gần đây</h2>
        <button className="btn-secondary" onClick={() => loadPage(1, true)} disabled={loading}>
          Tải lại
        </button>
      </div>

      {error && <p className="activity-feed-error">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <p className="activity-feed-empty">Chưa có hoạt động nào được ghi lại.</p>
      )}

      <ul className="activity-list">
        {items.map((a) => (
          <li key={a.id} className="activity-item">
            <span className="activity-text">
              <strong>{a.actor?.fullName || 'Không rõ'}</strong> {a.summary}
            </span>
            <span className="activity-time">{formatTime(a.createdAt)}</span>
          </li>
        ))}
      </ul>

      {loading && <p className="activity-feed-empty">Đang tải...</p>}

      {hasMore && !loading && (
        <button className="btn-secondary activity-more" onClick={() => loadPage(page + 1, false)}>
          Xem thêm
        </button>
      )}
    </div>
  );
}