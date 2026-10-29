// Component hiển thị avatar thành viên xếp chồng lên nhau (kiểu Asana)
// Nếu quá nhiều người, chỉ hiện tối đa "maxShow" avatar, còn lại gộp thành "+N"
export default function AvatarStack({ members, maxShow = 4, onClick }) {
  const getInitials = (name) => name?.slice(0, 2).toUpperCase() || '??';
  const visibleMembers = members.slice(0, maxShow);
  const remaining = members.length - maxShow;

  return (
    <div className="avatar-stack" onClick={onClick}>
      {visibleMembers.map((m, index) => (
        <div
          key={m.id}
          className="avatar-stack-item"
          style={{ zIndex: visibleMembers.length - index }}
          title={m.user.fullName}
        >
          {getInitials(m.user.fullName)}
        </div>
      ))}
      {remaining > 0 && (
        <div className="avatar-stack-item avatar-stack-more">+{remaining}</div>
      )}
    </div>
  );
}