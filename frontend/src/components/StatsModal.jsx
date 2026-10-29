import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import Modal from './Modal';
import { taskApi } from '../services/taskApi';
import '../styles/stats.css';

// MỚI SỬA: đổi màu "Chưa làm" từ #E4E4E7 (xám quá nhạt, gần như trùng nền trắng) sang #94A3B8 (xám-xanh) để nhìn rõ
// Muốn đổi màu nào chỉ cần sửa ĐÚNG 1 CHỖ này - biểu đồ tròn, chú thích màu, thanh đóng góp và chấm trạng thái đều dùng chung
const STATUS_COLORS = { todo: '#94A3B8', doing: '#FFB84D', redo: '#F97316', review: '#8B5CF6', done: '#4CAF7D' }; // MỚI SỬA (Phiên 12): thêm màu tím cho "Kiểm định"
const STATUS_LABEL = { todo: 'Danh sách công việc', doing: 'Đang làm', redo: 'Làm lại', review: 'Kiểm định', done: 'Hoàn thành' }; // MỚI SỬA (Phiên 12): đổi tên cột đầu + thêm "Kiểm định"

export default function StatsModal({ isOpen, onClose, groupId, tasks }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Lưu lại đang "đào sâu" xem cái gì: theo trạng thái hay theo 1 thành viên cụ thể
  // null = chưa bấm gì cả, chưa mở rộng
  const [expanded, setExpanded] = useState(null); // { type: 'status'|'member', value: string, label: string }

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setExpanded(null); // reset lại mỗi khi mở modal, tránh giữ trạng thái cũ
      taskApi.getStats(groupId).then((res) => {
        setStats(res.data.data);
        setLoading(false);
      });
    }
  }, [isOpen, groupId]);

  const pieData = stats
    ? [
        { name: 'Danh sách công việc', key: 'todo', value: stats.todo, color: STATUS_COLORS.todo }, // MỚI SỬA (Phiên 12): đổi tên
        { name: 'Đang làm', key: 'doing', value: stats.doing, color: STATUS_COLORS.doing },
        { name: 'Làm lại', key: 'redo', value: stats.redo || 0, color: STATUS_COLORS.redo }, // MỚI THÊM: phần "Làm lại" của biểu đồ tròn
        { name: 'Kiểm định', key: 'review', value: stats.review || 0, color: STATUS_COLORS.review }, // MỚI THÊM (Phiên 12)
        { name: 'Hoàn thành', key: 'done', value: stats.done, color: STATUS_COLORS.done },
      ].filter((d) => d.value > 0)
    : [];

  // Bấm vào 1 phần biểu đồ tròn -> lọc ra task theo đúng trạng thái đó
  const handleClickStatus = (statusKey) => {
    // Nếu đang mở đúng cái này rồi thì bấm lại để đóng (toggle)
    if (expanded?.type === 'status' && expanded.value === statusKey) {
      setExpanded(null);
    } else {
      setExpanded({ type: 'status', value: statusKey, label: STATUS_LABEL[statusKey] });
    }
  };

  // Bấm vào tên 1 thành viên -> lọc ra task của riêng người đó
  const handleClickMember = (userId, fullName) => {
    if (expanded?.type === 'member' && expanded.value === userId) {
      setExpanded(null);
    } else {
      setExpanded({ type: 'member', value: userId, label: fullName });
    }
  };

  // Tính ra danh sách task thật cần hiển thị dựa theo đang "đào sâu" cái gì
  // MỚI THÊM: gộp task cấp cao VÀ Subtask thành 1 mảng - để danh sách khi bấm vào biểu đồ/tên thành viên
  // khớp đúng với con số Backend trả về (Backend giờ cũng đếm cả Subtask)
  // Mỗi Subtask được gắn thêm parentTitle (tên việc cha) để hiển thị cho dễ phân biệt
  const getAllTasks = () =>
    tasks.flatMap((t) => [
      t,
      ...(t.subtasks || []).map((s) => ({ ...s, parentTitle: t.title })),
    ]);

  const getExpandedTasks = () => {
    if (!expanded) return [];
    // MỚI SỬA: lọc trên mảng đã gộp (allTasks) thay vì chỉ mảng tasks cấp cao như trước
    const allTasks = getAllTasks();
    if (expanded.type === 'status') {
      return allTasks.filter((t) => t.status === expanded.value);
    }
    return allTasks.filter((t) => t.assignedTo === expanded.value);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Thống kê tiến độ">
      {loading ? (
        <p>Đang tải...</p>
      ) : stats.total === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13.5 }}>
          Nhóm chưa có công việc nào để thống kê.
        </p>
      ) : (
        <>
          <div className="stats-percent-box">
            <div className="stats-percent-number">{stats.completionPercent}%</div>
            <div className="stats-percent-label">Tiến độ hoàn thành</div>
          </div>

          {/* Biểu đồ tròn - mỗi phần bấm được, con trỏ đổi thành tay khi rê chuột vào */}
          <div style={{ width: '100%', height: 180, cursor: 'pointer' }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={2}
                  onClick={(entry) => handleClickStatus(entry.key)}
                >
                  {pieData.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={entry.color}
                      // MỚI SỬA: viền nổi bật nếu phần này đang được chọn - đổi từ đen sang màu nhấn coral (giống nhau ở mọi theme, không bị chìm trên nền tối)
                      stroke={expanded?.value === entry.key ? '#FC636B' : 'none'}
                      strokeWidth={expanded?.value === entry.key ? 2 : 0}
                    />
                  ))}
                </Pie>
                {/* MỚI SỬA: khung hiện số lượng dùng biến màu theme (nền, viền, chữ) - đổi theme vẫn đọc rõ; trước đây chữ lấy theo màu miếng biểu đồ nên "Chưa làm : 3" gần như không đọc được */}
                <Tooltip
                  contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }}
                  itemStyle={{ color: 'var(--color-text)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Chú thích màu - giờ cũng bấm được, không chỉ trang trí */}
          <div className="stats-legend">
            {pieData.map((d) => (
              <div
                key={d.key}
                className="stats-legend-item"
                onClick={() => handleClickStatus(d.key)}
                style={{
                  cursor: 'pointer',
                  fontWeight: expanded?.value === d.key ? 700 : 400,
                }}
              >
                <span className="stats-dot" style={{ background: d.color }} />
                {d.name} ({d.value})
              </div>
            ))}
          </div>

          <div className="stats-contribution">
            <div className="stats-contribution-title">Đóng góp thành viên</div>
            {stats.contribution.map((c) => (
              <div
                key={c.userId}
                className="contribution-row"
                onClick={() => handleClickMember(c.userId, c.fullName)}
                style={{ cursor: 'pointer' }}
              >
                <span
                  className="contribution-name"
                  style={{ fontWeight: expanded?.value === c.userId ? 700 : 400 }}
                >
                  {c.fullName}
                </span>
                <div className="contribution-bar-track">
                  {/* MỚI SỬA: 4 đoạn màu bên dưới (đã thêm "Làm lại") dùng chung STATUS_COLORS, không gõ cứng mã màu nữa nên luôn khớp với biểu đồ tròn */}
                  {c.total > 0 && (
                    <>
                      <div className="contribution-segment" style={{ width: `${(c.done / c.total) * 100}%`, background: STATUS_COLORS.done }} />
                      <div className="contribution-segment" style={{ width: `${(c.doing / c.total) * 100}%`, background: STATUS_COLORS.doing }} />
                      <div className="contribution-segment" style={{ width: `${((c.redo || 0) / c.total) * 100}%`, background: STATUS_COLORS.redo }} />{/* MỚI THÊM */}
                      <div className="contribution-segment" style={{ width: `${((c.review || 0) / c.total) * 100}%`, background: STATUS_COLORS.review }} />{/* MỚI THÊM (Phiên 12) */}
                      <div className="contribution-segment" style={{ width: `${(c.todo / c.total) * 100}%`, background: STATUS_COLORS.todo }} />
                    </>
                  )}
                </div>
                <span className="contribution-detail">
                  ✓{c.done} · ⋯{c.doing} · ↻{c.redo || 0} · 🔎{c.review || 0} · ○{c.todo}
                </span>
              </div>
            ))}
          </div>

          {/* Phần mở rộng - chỉ hiện khi đã bấm vào 1 chỗ nào đó */}
          {expanded && (
            <div className="stats-expanded">
              <div className="stats-expanded-title">
                {expanded.label} ({getExpandedTasks().length})
              </div>
              {getExpandedTasks().length === 0 ? (
                <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>Không có công việc nào.</p>
              ) : (
                getExpandedTasks().map((t) => (
                  <div key={t.id} className="expanded-task-row">
                    <span
                      className="expanded-task-dot"
                      style={{ background: STATUS_COLORS[t.status] }}
                    />
                    <span className="expanded-task-title">
                      {t.title}
                      {/* MỚI THÊM: nếu là Subtask thì ghi rõ thuộc việc cha nào, task cấp cao thì không hiện gì */}
                      {t.parentTitle && (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
                          {' '}(việc con của "{t.parentTitle}")
                        </span>
                      )}
                    </span>
                    <span className="expanded-task-assignee">
                      {t.assignee?.fullName || 'Chưa gán'}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}