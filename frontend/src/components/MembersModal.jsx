import { useState, useEffect } from 'react';
import Modal from './Modal';
import { groupApi } from '../services/groupApi';
import { useAuth } from '../context/AuthContext';
import '../styles/members.css';

// onDeleted - hàm được gọi sau khi xóa nhóm THÀNH CÔNG, dùng để component cha điều hướng
// người dùng ra khỏi trang (vì nhóm không còn tồn tại nữa, không thể ở lại trang GroupDetail được)
export default function MembersModal({ isOpen, onClose, groupId, onChanged, onDeleted }) {
  const { user } = useAuth();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(''); // MỚI THÊM: thông báo lỗi khi không tải được danh sách thành viên

  const [supervisors, setSupervisors] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [inviting, setInviting] = useState(false);

  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const myMembership = members.find((m) => m.userId === user.id);
  const isLeader = myMembership?.role === 'leader';

  const loadData = async () => {
    setLoading(true);
    setLoadError('');

    // MỚI SỬA: đổi Promise.all thành Promise.allSettled - 4 lời gọi chạy độc lập, cái nào lỗi cũng không kéo cả modal hỏng.
    // Lý do: Giảng viên không nằm trong danh sách thành viên nên API "chi tiết nhóm" có thể trả 403 cho họ,
    // nhưng họ vẫn cần xem được danh sách thành viên và Giảng viên của nhóm
    const [groupResult, membersResult, warningsResult, supervisorsResult] = await Promise.allSettled([
      groupApi.getGroupDetail(groupId),
      groupApi.getMembers(groupId),
      groupApi.getWorkloadWarnings(groupId),
      groupApi.getSupervisors(groupId),
    ]);

    // Hàm phụ: lấy dữ liệu nếu gọi thành công (status 'fulfilled'), thất bại thì trả giá trị dự phòng
    const pick = (result, fallback) =>
      result.status === 'fulfilled' ? result.value.data.data : fallback;

    setGroup(pick(groupResult, null)); // thất bại -> null, phần giao diện bên dưới đã xử lý trường hợp group = null
    setMembers(pick(membersResult, []));
    setWarnings(pick(warningsResult, []));
    setSupervisors(pick(supervisorsResult, []));

    // Danh sách thành viên là phần quan trọng nhất, không tải được thì báo cho người dùng biết
    if (membersResult.status === 'rejected') {
      setLoadError('Không tải được danh sách thành viên, vui lòng thử lại.');
    }

    setLoading(false); // luôn tắt "Đang tải..." dù có lỗi hay không, tránh treo mãi
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      setDeleteConfirmText('');
      setDeleteError('');
    }
  }, [isOpen, groupId]);

  const handleCopy = () => {
    navigator.clipboard.writeText(group.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTransfer = async (targetUserId, targetName) => {
    if (!window.confirm(`Chuyển quyền trưởng nhóm cho ${targetName}?`)) return;
    await groupApi.transferLeadership(groupId, targetUserId);
    await loadData();
    if (onChanged) onChanged();
  };

  const handleRemove = async (targetUserId, targetName) => {
    if (!window.confirm(`Xóa ${targetName} khỏi nhóm?`)) return;
    await groupApi.removeMember(groupId, targetUserId);
    await loadData();
    if (onChanged) onChanged();
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    setInviting(true);
    try {
      await groupApi.invite(groupId, inviteEmail);
      setInviteSuccess('Đã gửi lời mời thành công! Đang chờ người đó đồng ý.');
      setInviteEmail('');
      await loadData();
    } catch (err) {
      setInviteError(err.response?.data?.message || 'Mời thất bại');
    } finally {
      setInviting(false);
    }
  };

  const handleDeleteGroup = async () => {
    setDeleteError('');
    setDeletingGroup(true);
    try {
      await groupApi.deleteGroup(groupId, deleteConfirmText);
      onClose();
      if (onDeleted) onDeleted();
    } catch (err) {
      setDeleteError(err.response?.data?.message || 'Xóa nhóm thất bại');
    } finally {
      setDeletingGroup(false);
    }
  };

  const getInitials = (name) => name?.slice(0, 2).toUpperCase() || '??';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Thành viên nhóm" className="modal-wide">
      {loading ? (
        <p>Đang tải...</p>
      ) : (
        <>
          {/* MỚI THÊM: hiện lỗi tải (nếu có) ngay đầu modal thay vì để người dùng nhìn màn hình trống */}
          {loadError && <div className="invite-supervisor-error">{loadError}</div>}

          {/* MỚI SỬA: chỉ hiện khung Mã mời khi group có inviteCode.
              Giảng viên không được thấy mã mời (hoặc không tải được chi tiết nhóm) nên khung này tự ẩn,
              tránh hiện 1 ô trống và nút Sao chép vô nghĩa */}
          {group?.inviteCode && (
            <div className="invite-box">
              <div>
                <div className="invite-label">Mã mời (cho Sinh viên tham gia trực tiếp)</div>
                <div className="invite-code">{group.inviteCode}</div>
              </div>
              <button className="btn-secondary" onClick={handleCopy}>
                {copied ? '✓ Đã sao chép' : 'Sao chép'}
              </button>
            </div>
          )}

          {warnings.length > 0 && (
            <div className="workload-warning-box">
              <div className="workload-warning-title">⚠ Cảnh báo khối lượng công việc</div>
              {warnings.map((w) => (
                <div key={w.userId} className="workload-warning-item">
                  <strong>{w.fullName}</strong> đang có {w.activeCount} việc chưa xong
                  (trung bình nhóm: {w.average})
                </div>
              ))}
            </div>
          )}

          {isLeader && (
            <div className="invite-unified-section">
              <div className="member-list-title">Mời bằng email (Sinh viên hoặc Giảng viên)</div>
              <form className="invite-supervisor-form" onSubmit={handleInvite}>
                <input
                  type="email"
                  placeholder="Nhập email..."
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
                <button type="submit" className="btn-secondary" disabled={inviting}>
                  {inviting ? 'Đang mời...' : 'Mời'}
                </button>
              </form>
              {inviteError && <div className="invite-supervisor-error">{inviteError}</div>}
              {inviteSuccess && <div className="invite-supervisor-success">{inviteSuccess}</div>}
            </div>
          )}

          <div className="supervisor-section">
            <div className="member-list-title">
              Giảng viên hướng dẫn {supervisors.length > 0 && `(${supervisors.length})`}
            </div>

            {supervisors.length === 0 ? (
              <div className="supervisor-empty">Chưa có giảng viên hướng dẫn nào</div>
            ) : (
              supervisors.map((s) => (
                <div key={s.id} className="member-row">
                  <div className="member-avatar member-avatar-supervisor">
                    {getInitials(s.user.fullName)}
                  </div>
                  <div className="member-info">
                    <div className="member-name">{s.user.fullName}</div>
                    <div className="member-email">{s.user.email}</div>
                  </div>
                  {s.status === 'PENDING' ? (
                    <span className="role-badge pending">Đang chờ</span>
                  ) : (
                    <span className="role-badge supervisor">Giảng viên</span>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="member-list">
            <div className="member-list-title">{members.length} thành viên</div>
            {members.map((m) => (
              <div key={m.id} className="member-row">
                <div className="member-avatar">{getInitials(m.user.fullName)}</div>
                <div className="member-info">
                  <div className="member-name">{m.user.fullName}</div>
                  <div className="member-email">{m.user.email}</div>
                </div>

                {m.status === 'PENDING' ? (
                  <span className="role-badge pending">Đang chờ</span>
                ) : (
                  <span className={`role-badge ${m.role}`}>
                    {m.role === 'leader' ? 'Trưởng nhóm' : 'Thành viên'}
                  </span>
                )}

                {isLeader && m.userId !== user.id && m.status === 'ACCEPTED' && (
                  <div className="member-actions">
                    <button
                      className="member-action-btn"
                      onClick={() => handleTransfer(m.userId, m.user.fullName)}
                      title="Chuyển quyền trưởng nhóm"
                    >
                      👑
                    </button>
                    <button
                      className="member-action-btn member-action-danger"
                      onClick={() => handleRemove(m.userId, m.user.fullName)}
                      title="Xóa khỏi nhóm"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* MỚI SỬA: thêm điều kiện group (isLeader && group) vì khối này dùng group.name,
              nếu không tải được chi tiết nhóm (group = null) thì ẩn cả khối thay vì làm sập trang */}
          {isLeader && group && (
            <div className="danger-zone">
              <div className="danger-zone-title">⚠ Vùng nguy hiểm</div>
              <p className="danger-zone-desc">
                Xóa nhóm sẽ xóa VĨNH VIỄN toàn bộ Công việc, Mốc, Nhãn, Tin nhắn và File đính kèm bên trong.
                Hành động này không thể hoàn tác.
              </p>
              <p className="danger-zone-hint">
                Gõ lại chính xác tên nhóm <strong>"{group.name}"</strong> để xác nhận:
              </p>
              <input
                className="danger-zone-input"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={group.name}
              />
              {deleteError && <div className="invite-supervisor-error">{deleteError}</div>}
              <button
                type="button"
                className="btn-danger danger-zone-btn"
                disabled={deleteConfirmText !== group.name || deletingGroup}
                onClick={handleDeleteGroup}
              >
                {deletingGroup ? 'Đang xóa...' : '🗑️ Xóa vĩnh viễn nhóm này'}
              </button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}