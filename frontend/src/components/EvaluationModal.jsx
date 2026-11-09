import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; // để nút "Mở trang nhóm" chuyển sang trang nhóm
import { supervisorApi } from '../services/supervisorApi';
import EvaluationTaskList from './EvaluationTaskList'; // MỚI THÊM: tab "Công việc" - xem nội dung việc và việc con của mốc
import '../styles/supervisor-eval.css'; // CSS RIÊNG của hộp thoại đánh giá (tiền tố ev-)

// 3 mức xếp loại: value khớp với Backend (pass | improve | fail)
const RATING_OPTIONS = [
  { value: 'pass', label: 'Đạt' },
  { value: 'improve', label: 'Cần cải thiện' },
  { value: 'fail', label: 'Chưa đạt' },
];
const RATING_LABEL = { pass: 'Đạt', improve: 'Cần cải thiện', fail: 'Chưa đạt' };

// Hạn chót hiển thị theo giờ Việt Nam; không có hạn thì trả null
const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : null;

// Ngày + giờ theo giờ Việt Nam, dùng cho dòng "cập nhật lúc ..." của đánh giá
const formatDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

// Điểm trung bình của 1 danh sách số (làm tròn 1 chữ số thập phân); rỗng thì trả null
const average = (numbers) =>
  numbers.length ? Math.round((numbers.reduce((a, b) => a + b, 0) / numbers.length) * 10) / 10 : null;

// Hộp thoại "Đánh giá theo mốc" - MỚI SỬA: bố cục 2 cột
// Cột trái: cây mốc gọn (chấm tròn màu = đã chấm chưa, kết quả gì). Cột phải: chi tiết + đánh giá + form của mốc đang chọn
// Props: group = nhóm đang chọn ({ id, name, ... }), onClose = hàm đóng hộp thoại
export default function EvaluationModal({ group, onClose }) {
  const navigate = useNavigate();

  const [items, setItems] = useState([]); // danh sách mốc (phẳng, đã sắp theo thứ tự cây, có depth)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'todo' (chỉ mốc chưa đánh giá)
  const [selectedId, setSelectedId] = useState(null); // mốc đang xem ở cột phải
  const [tab, setTab] = useState('eval'); // MỚI THÊM: thẻ đang mở ở cột phải: 'eval' (Đánh giá) | 'tasks' (Công việc)

  const [editing, setEditing] = useState(false); // đang mở form chấm cho mốc đang chọn
  const [form, setForm] = useState({ rating: '', score: '', note: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false); // đang hỏi lại "chắc chắn xóa đánh giá?"

  // Tải danh sách mốc + đánh giá khi mở hộp thoại; mặc định chọn mốc chưa chấm đầu tiên (không có thì mốc đầu)
  useEffect(() => {
    supervisorApi
      .getEvaluations(group.id)
      .then((res) => {
        const list = res.data.data.milestones;
        setItems(list);
        const first = list.find((i) => !i.evaluation) || list[0];
        if (first) setSelectedId(first.id);
      })
      .catch((err) => setError(err.response?.data?.message || 'Không tải được danh sách mốc. Hãy thử lại.'))
      .finally(() => setLoading(false));
  }, [group.id]);

  // Bấm phím Esc để đóng hộp thoại
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Mốc đang chọn đổi (kể cả bấm "Lưu & tiếp") thì cuộn cây bên trái để dòng đó luôn nằm trong tầm nhìn
  useEffect(() => {
    if (!selectedId) return;
    const el = document.getElementById(`ev-node-${selectedId}`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  // Chọn 1 mốc ở cây: đóng form đang mở (nội dung chưa lưu sẽ bỏ)
  const selectItem = (id) => {
    setSelectedId(id);
    setEditing(false);
    setFormError('');
    setConfirmingDelete(false);
  };

  // ===== Tính toán dựa trên danh sách phẳng (con cháu của 1 mốc nằm ngay sau nó và có depth lớn hơn) =====
  const selectedIndex = items.findIndex((i) => i.id === selectedId);
  const selected = selectedIndex >= 0 ? items[selectedIndex] : null;

  // Các mốc con cháu của mốc ở vị trí index
  const getDescendants = (index) => {
    const base = items[index].depth;
    const result = [];
    for (let i = index + 1; i < items.length && items[i].depth > base; i++) result.push(items[i]);
    return result;
  };

  // Chuỗi mốc cha (từ gốc xuống) của mốc ở vị trí index, dùng làm đường dẫn "Giai đoạn 1 › Khảo sát"
  const getAncestors = (index) => {
    const chain = [];
    let depth = items[index].depth;
    for (let i = index - 1; i >= 0 && depth > 0; i--) {
      if (items[i].depth < depth) {
        chain.unshift(items[i]);
        depth = items[i].depth;
      }
    }
    return chain;
  };

  // Mở form chấm: nếu đã có đánh giá thì điền sẵn để sửa
  const openForm = () => {
    const ev = selected.evaluation;
    setForm({
      rating: ev ? ev.rating : '',
      score: ev && ev.score !== null && ev.score !== undefined ? String(ev.score) : '',
      note: ev?.note || '',
    });
    setFormError('');
    setConfirmingDelete(false);
    setEditing(true);
  };

  const closeForm = () => {
    setEditing(false);
    setFormError('');
    setConfirmingDelete(false);
  };

  // Lưu đánh giá; goNext = true thì xong chuyển luôn sang mốc CHƯA CHẤM kế tiếp
  // Kiểm tra nhanh ở Frontend, Backend kiểm tra lại lần nữa
  const handleSave = async (goNext) => {
    if (!form.rating) {
      setFormError('Hãy chọn một xếp loại.');
      return;
    }
    if (form.score !== '') {
      const n = Number(form.score);
      if (!Number.isFinite(n) || n < 0 || n > 10) {
        setFormError('Điểm phải từ 0 đến 10.');
        return;
      }
    }
    setSaving(true);
    setFormError('');
    try {
      const res = await supervisorApi.saveEvaluation(selectedId, {
        rating: form.rating,
        score: form.score === '' ? null : Number(form.score),
        note: form.note,
      });
      const saved = res.data.data;
      const updated = items.map((i) => (i.id === selectedId ? { ...i, evaluation: saved } : i));
      setItems(updated);
      closeForm();
      if (goNext) {
        const index = updated.findIndex((i) => i.id === selectedId);
        const next = updated.slice(index + 1).find((i) => !i.evaluation);
        if (next) setSelectedId(next.id);
      }
    } catch (err) {
      setFormError(err.response?.data?.message || 'Lưu đánh giá thất bại, hãy thử lại.');
    } finally {
      setSaving(false);
    }
  };

  // Xóa đánh giá của mốc đang chọn (đã qua bước hỏi lại)
  const handleDelete = async () => {
    setSaving(true);
    setFormError('');
    try {
      await supervisorApi.deleteEvaluation(selectedId);
      setItems((list) => list.map((i) => (i.id === selectedId ? { ...i, evaluation: null } : i)));
      closeForm();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Xóa đánh giá thất bại, hãy thử lại.');
      setConfirmingDelete(false);
    } finally {
      setSaving(false);
    }
  };

  // Số liệu tổng hợp cho thanh thống kê ở đầu hộp thoại
  const evaluated = items.filter((i) => i.evaluation);
  const countBy = (rating) => evaluated.filter((i) => i.evaluation.rating === rating).length;
  const avgScore = average(
    evaluated.map((i) => i.evaluation.score).filter((s) => s !== null && s !== undefined)
  );

  // Lọc "Chưa đánh giá" ở cây trái (vẫn giữ mốc đang chọn để không biến mất khi vừa chấm xong)
  const shown = filter === 'todo' ? items.filter((i) => !i.evaluation || i.id === selectedId) : items;

  // Dữ liệu riêng cho mốc đang chọn (cột phải)
  const ev = selected ? selected.evaluation : null;
  const ancestors = selected ? getAncestors(selectedIndex) : [];
  const descendants = selected && selected.hasChildren ? getDescendants(selectedIndex) : [];
  const descEvaluated = descendants.filter((d) => d.evaluation);
  const descAvg = average(
    descEvaluated.map((d) => d.evaluation.score).filter((s) => s !== null && s !== undefined)
  );
  const percent =
    selected && selected.totalTasks > 0 ? Math.round((selected.doneTasks / selected.totalTasks) * 100) : 0;
  const hasUnevaluatedAfter = selected ? items.slice(selectedIndex + 1).some((i) => !i.evaluation) : false;

  return (
    // Bấm vùng tối bên ngoài thì đóng (chỉ khi bấm đúng vùng tối, không phải bấm bên trong hộp)
    <div className="ev-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ev-modal" role="dialog" aria-modal="true">
        <div className="ev-header">
          <div>
            <h2 className="ev-title">Đánh giá theo mốc</h2>
            <p className="ev-subtitle">
              {group.name}
              {!loading && !error && items.length > 0 && ` · Đã đánh giá ${evaluated.length}/${items.length} mốc`}
            </p>
          </div>
          <div className="ev-header-actions">
            {/* Sang trang nhóm để xem cây mốc chính và từng việc */}
            <button className="ev-link-btn" onClick={() => navigate(`/groups/${group.id}`)}>
              Mở trang nhóm
            </button>
            <button className="ev-close" onClick={onClose} aria-label="Đóng">
              ✕
            </button>
          </div>
        </div>

        {/* Thanh thống kê + bộ lọc, chỉ hiện khi đã có mốc */}
        {!loading && !error && items.length > 0 && (
          <div className="ev-summary">
            <div className="ev-summary-stats">
              <span className="ev-stat ev-stat-pass">
                <b>{countBy('pass')}</b> Đạt
              </span>
              <span className="ev-stat ev-stat-improve">
                <b>{countBy('improve')}</b> Cần cải thiện
              </span>
              <span className="ev-stat ev-stat-fail">
                <b>{countBy('fail')}</b> Chưa đạt
              </span>
              <span className="ev-stat">
                <b>{items.length - evaluated.length}</b> Chưa chấm
              </span>
              {avgScore !== null && (
                <span className="ev-stat ev-stat-avg">
                  Điểm TB: <b>{avgScore}</b>/10
                </span>
              )}
            </div>
            <div className="ev-filter">
              <button className={`ev-chip ${filter === 'all' ? 'ev-chip-active' : ''}`} onClick={() => setFilter('all')}>
                Tất cả
              </button>
              <button className={`ev-chip ${filter === 'todo' ? 'ev-chip-active' : ''}`} onClick={() => setFilter('todo')}>
                Chưa đánh giá
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="ev-muted ev-pad">Đang tải...</p>
        ) : error ? (
          <p className="ev-error ev-pad">{error}</p>
        ) : items.length === 0 ? (
          <p className="ev-muted ev-pad">Nhóm này chưa có mốc nào để đánh giá.</p>
        ) : (
          <div className="ev-split">
            {/* ===== CỘT TRÁI: cây mốc gọn ===== */}
            <ul className="ev-tree">
              {shown.length === 0 ? (
                <li className="ev-muted ev-pad">Tất cả các mốc đã được đánh giá.</li>
              ) : (
                shown.map((item) => {
                  const itemEv = item.evaluation;
                  // Mốc cha: hiện "số mốc con đã chấm / tổng mốc con"
                  let rollup = null;
                  if (item.hasChildren) {
                    const desc = getDescendants(items.indexOf(item));
                    rollup = `${desc.filter((d) => d.evaluation).length}/${desc.length}`;
                  }
                  return (
                    <li key={item.id}>
                      <button
                        id={`ev-node-${item.id}`}
                        className={`ev-node ${selectedId === item.id ? 'ev-node-active' : ''}`}
                        style={{ paddingLeft: 12 + item.depth * 18 }}
                        onClick={() => selectItem(item.id)}
                      >
                        {/* Chấm tròn: xám = chưa chấm; xanh / vàng / đỏ = Đạt / Cần cải thiện / Chưa đạt */}
                        <span className={`ev-dot ${itemEv ? `ev-dot-${itemEv.rating}` : ''}`} />
                        <span className={`ev-node-title ${item.depth === 0 ? 'ev-node-root' : ''}`}>{item.title}</span>
                        {rollup && <span className="ev-node-count">{rollup}</span>}
                        {itemEv && itemEv.score !== null && itemEv.score !== undefined && (
                          <span className="ev-node-score">{itemEv.score}</span>
                        )}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>

            {/* ===== CỘT PHẢI: chi tiết mốc đang chọn ===== */}
            <div className="ev-detail">
              {!selected ? (
                <p className="ev-muted">Chọn một mốc ở bên trái để xem và đánh giá.</p>
              ) : (
                <>
                  {ancestors.length > 0 && <p className="ev-crumb">{ancestors.map((a) => a.title).join(' › ')}</p>}
                  <h3 className="ev-detail-title">{selected.title}</h3>
                  <div className="ev-detail-meta">
                    {selected.dueDate && <span>Hạn {formatDate(selected.dueDate)}</span>}
                    <span>
                      {selected.doneTasks}/{selected.totalTasks} việc xong
                    </span>
                  </div>
                  <div className="ev-prog">
                    <div className="ev-prog-fill" style={{ width: `${percent}%` }} />
                  </div>

                  {/* Mốc cha: tổng hợp kết quả các mốc con để Giảng viên đánh giá mốc cha có căn cứ */}
                  {descendants.length > 0 && (
                    <div className="ev-rollup">
                      <p className="ev-rollup-title">
                        Các mốc con: đã đánh giá {descEvaluated.length}/{descendants.length}
                        {descAvg !== null && ` · Điểm TB ${descAvg}/10`}
                      </p>
                      <div className="ev-rollup-chips">
                        <span className="ev-stat ev-stat-pass">
                          <b>{descEvaluated.filter((d) => d.evaluation.rating === 'pass').length}</b> Đạt
                        </span>
                        <span className="ev-stat ev-stat-improve">
                          <b>{descEvaluated.filter((d) => d.evaluation.rating === 'improve').length}</b> Cần cải thiện
                        </span>
                        <span className="ev-stat ev-stat-fail">
                          <b>{descEvaluated.filter((d) => d.evaluation.rating === 'fail').length}</b> Chưa đạt
                        </span>
                      </div>
                    </div>
                  )}

                  {/* MỚI THÊM: 2 thẻ tab - "Đánh giá" (form + kết quả) và "Công việc" (nội dung việc, việc con của mốc) */}
                  <div className="evt-tabs">
                    <button
                      className={`evt-tab ${tab === 'eval' ? 'evt-tab-active' : ''}`}
                      onClick={() => setTab('eval')}
                    >
                      Đánh giá
                    </button>
                    <button
                      className={`evt-tab ${tab === 'tasks' ? 'evt-tab-active' : ''}`}
                      onClick={() => setTab('tasks')}
                    >
                      Công việc ({(selected.tasks || []).length})
                    </button>
                  </div>

                  {tab === 'tasks' ? (
                    <EvaluationTaskList tasks={selected.tasks || []} hasChildren={selected.hasChildren} />
                  ) : editing ? (
                    /* ----- Form chấm ----- */
                    <div className="ev-form">
                      <p className="ev-label">Xếp loại</p>
                      <div className="ev-rating-group">
                        {RATING_OPTIONS.map((o) => (
                          <button
                            key={o.value}
                            type="button"
                            className={`ev-rating-btn ev-rating-${o.value} ${form.rating === o.value ? 'ev-rating-active' : ''}`}
                            onClick={() => setForm((f) => ({ ...f, rating: o.value }))}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>

                      <p className="ev-label">Điểm (0 đến 10, có thể bỏ trống)</p>
                      <input
                        type="number"
                        className="ev-input"
                        min="0"
                        max="10"
                        step="0.5"
                        value={form.score}
                        onChange={(e) => setForm((f) => ({ ...f, score: e.target.value }))}
                        placeholder="VD: 8.5"
                      />

                      <p className="ev-label">Ghi chú</p>
                      <textarea
                        className="ev-textarea"
                        rows={5}
                        maxLength={1000}
                        value={form.note}
                        onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                        placeholder="Nhận xét cho nhóm về mốc này..."
                      />
                      <p className="ev-counter">{form.note.length}/1000</p>

                      {formError && <p className="ev-error">{formError}</p>}

                      <div className="ev-form-actions">
                        {confirmingDelete ? (
                          <>
                            <span className="ev-confirm-text">Xóa đánh giá này?</span>
                            <button className="ev-btn ev-btn-danger" onClick={handleDelete} disabled={saving}>
                              {saving ? 'Đang xóa...' : 'Xóa'}
                            </button>
                            <button className="ev-btn" onClick={() => setConfirmingDelete(false)} disabled={saving}>
                              Giữ lại
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="ev-btn ev-btn-primary" onClick={() => handleSave(false)} disabled={saving}>
                              {saving ? 'Đang lưu...' : 'Lưu'}
                            </button>
                            {/* Chỉ hiện khi phía sau còn mốc chưa chấm */}
                            {hasUnevaluatedAfter && (
                              <button className="ev-btn" onClick={() => handleSave(true)} disabled={saving}>
                                Lưu & tiếp
                              </button>
                            )}
                            <button className="ev-btn" onClick={closeForm} disabled={saving}>
                              Hủy
                            </button>
                            {/* Chỉ có nút xóa khi mốc này ĐÃ có đánh giá */}
                            {ev && (
                              <button
                                className="ev-btn ev-btn-link-danger"
                                onClick={() => setConfirmingDelete(true)}
                                disabled={saving}
                              >
                                Xóa đánh giá
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ) : ev ? (
                    /* ----- Đã đánh giá: kết quả đầy đủ ----- */
                    <div className={`ev-result ev-result-${ev.rating}`}>
                      <div className="ev-result-top">
                        <span className={`ev-badge ev-badge-${ev.rating}`}>{RATING_LABEL[ev.rating]}</span>
                        {ev.score !== null && ev.score !== undefined && (
                          <span className="ev-score">
                            {ev.score}
                            <small>/10</small>
                          </span>
                        )}
                        <span className="ev-updated">Cập nhật {formatDateTime(ev.updatedAt)}</span>
                      </div>
                      {ev.note ? <p className="ev-note-text">{ev.note}</p> : <p className="ev-note-empty">Không có ghi chú.</p>}
                      <button className="ev-btn ev-result-edit" onClick={openForm}>
                        Sửa đánh giá
                      </button>
                    </div>
                  ) : (
                    /* ----- Chưa đánh giá ----- */
                    <div className="ev-empty">
                      <p>Mốc này chưa được đánh giá.</p>
                      <button className="ev-btn ev-btn-primary" onClick={openForm}>
                        Đánh giá mốc này
                      </button>
                    </div>
                  )}

                  {/* Chuyển nhanh giữa các mốc theo thứ tự cây */}
                  <div className="ev-pager">
                    <button
                      className="ev-btn"
                      disabled={selectedIndex <= 0}
                      onClick={() => selectItem(items[selectedIndex - 1].id)}
                    >
                      ← Mốc trước
                    </button>
                    <button
                      className="ev-btn"
                      disabled={selectedIndex >= items.length - 1}
                      onClick={() => selectItem(items[selectedIndex + 1].id)}
                    >
                      Mốc sau →
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}