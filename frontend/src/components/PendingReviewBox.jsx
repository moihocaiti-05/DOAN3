import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supervisorApi } from '../services/supervisorApi';
import '../styles/pending-review.css';

// Mặc định chỉ hiện 5 việc đầu, còn lại bấm "Xem thêm" mới mở ra để hộp không quá dài
const SHOW_DEFAULT = 5;

// Số ngày (theo ngày lịch) từ lúc nộp đến hôm nay -> câu chữ ngắn
const submittedText = (iso) => {
  const startOfDay = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const days = Math.max(0, Math.round((startOfDay(new Date()) - startOfDay(iso)) / 86400000));
  return days === 0 ? 'nộp hôm nay' : `nộp ${days} ngày trước`;
};

// MỚI THÊM (tính năng 1): hộp "Việc chờ tôi duyệt" - gom mọi việc đang ở "Kiểm định" của TẤT CẢ nhóm Giảng viên phụ trách
// Bấm vào 1 dòng thì mở trang nhóm đó (Giảng viên duyệt hoặc từ chối ngay trong chi tiết việc, như Phiên 12)
export default function PendingReviewBox() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    supervisorApi
      .getPendingReview()
      .then((res) => setItems(res.data.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null; // đang tải thì không chiếm chỗ, tránh giật layout
  if (error) return <p className="pr-empty">Không tải được danh sách việc chờ duyệt.</p>;
  if (items.length === 0) return <p className="pr-empty">Không có việc nào đang chờ bạn duyệt.</p>;

  const shown = showAll ? items : items.slice(0, SHOW_DEFAULT);

  return (
    <div className="pr-box">
      <div className="pr-header">
        <h2 className="pr-title">Việc chờ tôi duyệt</h2>
        <span className="pr-count">{items.length}</span>
      </div>

      <div className="pr-list">
        {shown.map((t) => (
          <div key={t.id} className="pr-item" onClick={() => navigate(`/groups/${t.groupId}`)}>
            <div className="pr-item-main">
              <p className="pr-item-title">{t.title}</p>
              <p className="pr-item-sub">
                {t.groupName}
                {t.parentTitle ? ` · việc con của "${t.parentTitle}"` : ''}
                {` · ${t.assigneeName ? `người làm: ${t.assigneeName}` : 'chưa giao ai'}`}
                {` · ${submittedText(t.submittedAt)}`}
              </p>
            </div>
            <span className="pr-item-go">Xem ›</span>
          </div>
        ))}
      </div>

      {items.length > SHOW_DEFAULT && (
        <button className="pr-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Thu gọn' : `Xem thêm (${items.length - SHOW_DEFAULT})`}
        </button>
      )}
    </div>
  );
}