import { useState, useEffect } from 'react';
import { supervisorApi } from '../services/supervisorApi';
import '../styles/contribution-modal.css';

// Thanh tiến độ nhỏ + số phần trăm
function Bar({ value }) {
  return (
    <div className="ct-progress">
      <div className="ct-bar">
        <div className="ct-bar-fill" style={{ width: `${value}%` }} />
      </div>
      <span className="ct-percent">{value}%</span>
    </div>
  );
}

// Số việc trễ hạn: tô đỏ khi > 0, còn lại hiện dấu gạch
const lateCell = (n) => (n > 0 ? <span className="ct-late">{n}</span> : '—');

// MỚI THÊM (tính năng 3): hộp thoại "Đóng góp của từng thành viên" - Giảng viên xem ai được giao bao nhiêu việc, xong bao nhiêu, trễ bao nhiêu
// Props: group = { id, name }, onClose = hàm đóng hộp thoại
export default function ContributionModal({ group, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    supervisorApi
      .getContributions(group.id)
      .then((res) => setData(res.data.data))
      .catch((err) => setError(err.response?.data?.message || 'Không tải được dữ liệu đóng góp.'))
      .finally(() => setLoading(false));
  }, [group.id]);

  // Bấm phím Esc để đóng
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    // Bấm ra ngoài hộp thì đóng; bấm trong hộp thì không đóng
    <div className="ct-overlay" onClick={onClose}>
      <div className="ct-box" onClick={(e) => e.stopPropagation()}>
        <div className="ct-header">
          <div>
            <h3 className="ct-title">Đóng góp của từng thành viên</h3>
            <p className="ct-sub">{group.name}</p>
          </div>
          <button className="ct-close" onClick={onClose} aria-label="Đóng">×</button>
        </div>

        {loading ? (
          <p className="ct-message">Đang tải...</p>
        ) : error ? (
          <p className="ct-message ct-error">{error}</p>
        ) : (
          <>
            <div className="ct-table-wrap">
              <table className="ct-table">
                <thead>
                  <tr>
                    <th className="ct-th">Thành viên</th>
                    <th className="ct-th">Được giao</th>
                    <th className="ct-th">Xong</th>
                    <th className="ct-th">Chưa xong</th>
                    <th className="ct-th">Trễ hạn</th>
                    <th className="ct-th">Hoàn thành</th>
                  </tr>
                </thead>
                <tbody>
                  {data.members.map((m) => (
                    <tr key={m.userId}>
                      <td className="ct-td">
                        <span className="ct-name">{m.fullName}</span>
                        {m.role === 'leader' && <span className="ct-role">Trưởng nhóm</span>}
                        {/* Gợi ý nhanh cho Giảng viên: ai chưa có việc, ai có việc mà chưa xong cái nào */}
                        {m.assigned === 0 && <p className="ct-flag">Chưa được giao việc</p>}
                        {m.assigned > 0 && m.done === 0 && <p className="ct-flag">Chưa xong việc nào</p>}
                      </td>
                      <td className="ct-td">{m.assigned}</td>
                      <td className="ct-td">{m.done}</td>
                      <td className="ct-td">{m.pending}</td>
                      <td className="ct-td">{lateCell(m.late)}</td>
                      <td className="ct-td">{m.assigned === 0 ? '—' : <Bar value={m.progress} />}</td>
                    </tr>
                  ))}
                  {/* Việc chưa giao ai (hoặc giao cho người đã rời nhóm): chỉ hiện khi có */}
                  {data.unassigned.assigned > 0 && (
                    <tr className="ct-row-muted">
                      <td className="ct-td">Chưa giao ai (hoặc người đã rời nhóm)</td>
                      <td className="ct-td">{data.unassigned.assigned}</td>
                      <td className="ct-td">{data.unassigned.done}</td>
                      <td className="ct-td">{data.unassigned.pending}</td>
                      <td className="ct-td">{lateCell(data.unassigned.late)}</td>
                      <td className="ct-td">—</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="ct-note">
              Tổng {data.totalTasks} việc (tính cả việc con). Trễ hạn = đã quá hạn chót và chưa hoàn thành.
            </p>
          </>
        )}
      </div>
    </div>
  );
}