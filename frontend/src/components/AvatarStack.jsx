import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom'; // MỚI THÊM: tự lấy groupId từ địa chỉ trang, khỏi sửa GroupDetail.jsx
import { groupApi } from '../services/groupApi'; // MỚI THÊM: để tải danh sách Giảng viên của nhóm
import '../styles/avatar-presence.css'; // chấm xanh "đang online" (CSS riêng, khớp tên với component)

// Component hiển thị avatar thành viên xếp chồng lên nhau (kiểu Asana)
// Nếu quá nhiều người, chỉ hiện tối đa "maxShow" avatar, còn lại gộp thành "+N"
// prop onlineIds (Set các userId đang mở trang nhóm) - ai có trong Set thì avatar có chấm xanh
// MỚI SỬA: thêm Giảng viên vào dãy avatar, và bấm vào chữ "N online" để xem danh sách từng người
export default function AvatarStack({ members, maxShow = 4, onClick, onlineIds }) {
  const { groupId } = useParams();
  const [supervisors, setSupervisors] = useState([]); // MỚI THÊM: Giảng viên đã đồng ý của nhóm
  const [showList, setShowList] = useState(false); // MỚI THÊM: đang mở hộp danh sách online hay không
  const rootRef = useRef(null);

  // MỚI THÊM: tải Giảng viên (chỉ khi dùng ở trang nhóm, tức là có truyền onlineIds)
  // Tải lại khi số thành viên đổi (có người vừa vào nhóm). Lỗi (vd 403) thì coi như chưa có Giảng viên, không làm hỏng trang
  useEffect(() => {
    if (!onlineIds || !groupId) return;
    let cancelled = false;
    groupApi
      .getSupervisors(groupId)
      .then((res) => {
        if (cancelled) return;
        const list = res.data.data || [];
        setSupervisors(list.filter((s) => s.status !== 'PENDING'));
      })
      .catch(() => {
        if (!cancelled) setSupervisors([]);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, members.length, !!onlineIds]);

  // MỚI THÊM: bấm ra ngoài thì đóng hộp danh sách
  useEffect(() => {
    if (!showList) return;
    const handleClickOutside = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setShowList(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showList]);

  const getInitials = (name) => name?.slice(0, 2).toUpperCase() || '??';

  // MỚI THÊM: gộp thành viên và Giảng viên về cùng một dạng để vẽ chung
  const people = [
    ...members.map((m) => ({
      key: `m-${m.id}`,
      userId: m.userId ?? m.user?.id, // id người dùng có thể nằm ở m.userId hoặc m.user.id
      fullName: m.user?.fullName,
      pending: m.status === 'PENDING',
      kind: m.role === 'leader' ? 'leader' : 'member',
    })),
    ...supervisors.map((s) => ({
      key: `s-${s.id}`,
      userId: s.userId ?? s.user?.id,
      fullName: s.user?.fullName,
      pending: false,
      kind: 'supervisor',
    })),
  ];

  const isOnline = (p) => !!onlineIds && onlineIds.has(p.userId);
  const onlineCount = onlineIds ? onlineIds.size : 0;
  const kindLabel = { leader: 'Trưởng nhóm', member: 'Thành viên', supervisor: 'Giảng viên' };

  const visiblePeople = people.slice(0, maxShow);
  const remaining = people.length - maxShow;

  // MỚI THÊM: danh sách trong hộp online: bỏ người đang chờ, xếp người online lên trên
  const listPeople = people
    .filter((p) => !p.pending)
    .sort((a, b) => Number(isOnline(b)) - Number(isOnline(a)));

  return (
    <div className="avatar-stack" onClick={onClick} ref={rootRef}>
      {visiblePeople.map((p, index) => (
        <div
          key={p.key}
          className={
            'avatar-stack-item' +
            (isOnline(p) ? ' avatar-stack-item-online' : '') +
            (p.kind === 'supervisor' ? ' avatar-stack-item-supervisor' : '')
          }
          style={{ zIndex: visiblePeople.length - index }}
          title={`${p.fullName} (${kindLabel[p.kind]}${isOnline(p) ? ', đang online' : ''})`}
        >
          {getInitials(p.fullName)}
        </div>
      ))}
      {remaining > 0 && (
        <div className="avatar-stack-item avatar-stack-more">+{remaining}</div>
      )}

      {/* MỚI SỬA: chữ "N online" bấm được; stopPropagation để không mở nhầm modal Thành viên */}
      {onlineCount > 0 && (
        <span
          className="avatar-stack-online-count avatar-stack-online-btn"
          title="Xem ai đang online"
          onClick={(e) => {
            e.stopPropagation();
            setShowList((v) => !v);
          }}
        >
          {onlineCount} online
        </span>
      )}

      {/* MỚI THÊM: hộp danh sách từng người, chấm xanh = online, chấm xám = offline */}
      {showList && (
        <div className="presence-popover" onClick={(e) => e.stopPropagation()}>
          <div className="presence-popover-title">Đang online ({onlineCount})</div>
          {listPeople.map((p) => (
            <div key={p.key} className="presence-popover-row">
              <span
                className={`presence-popover-dot${isOnline(p) ? ' presence-popover-dot-on' : ''}`}
              />
              <span className="presence-popover-name">{p.fullName}</span>
              <span className={`presence-popover-role presence-popover-role-${p.kind}`}>
                {kindLabel[p.kind]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}