import { useEffect, useMemo, useState } from 'react';
import { useLocation, useMatch, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { groupApi } from '../services/groupApi';
import { supervisorApi } from '../services/supervisorApi';
import '../styles/quick-nav.css';

// Menu vòng cung ở mép phải: bấm nút tròn nổi bật thì 3 lối tắt xòe ra theo hình quạt
// (Trang chủ, Nhóm, Cá nhân). Bấm "Nhóm" thì mở thẻ danh sách nhóm để đổi nhóm nhanh.
// Gắn 1 lần trong App.jsx (bên trong BrowserRouter).

const HIDDEN_PATHS = ['/login', '/register', '/verify-email']; // trang chưa đăng nhập thì không hiện
const SEARCH_MIN = 6; // từ ngần này nhóm trở lên mới hiện ô tìm
const ARC_ANGLES = [-52, 0, 52]; // góc (độ) của từng nút, 0 = thẳng sang trái; âm = lên trên, dương = xuống dưới

// Bỏ dấu tiếng Việt để gõ "do an" vẫn tìm ra "Đồ án"
const normalizeText = (text) =>
  (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase();

// Sinh viên và Giảng viên dùng 2 API khác nhau nên đưa về cùng dạng { id, name }
const normalizeGroups = (raw) => {
  const list = Array.isArray(raw) ? raw : raw?.groups || [];
  return list
    .map((item) => {
      const group = item?.group || item;
      return {
        id: group?.id ?? item?.groupId,
        name: group?.name ?? item?.groupName ?? 'Nhóm chưa đặt tên',
      };
    })
    .filter((group) => group.id);
};

// ----- Biểu tượng vẽ bằng SVG (nét đồng đều, không phụ thuộc phông chữ) -----
const svgProps = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

const IconHome = () => (
  <svg {...svgProps}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5.5 9.5V20a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9.5" />
  </svg>
);

const IconGroups = () => (
  <svg {...svgProps}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
    <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6" />
    <path d="M18 14.8c1.9.7 3 2.4 3 5.2" />
  </svg>
);

const IconUser = () => (
  <svg {...svgProps}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
  </svg>
);

const IconPlus = () => (
  <svg {...svgProps} strokeWidth={2.4}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);

export default function QuickNav() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const groupMatch = useMatch('/groups/:groupId');
  const currentGroupId = groupMatch?.params?.groupId;

  const [open, setOpen] = useState(false); // vòng cung đang xòe ra
  const [groupsOpen, setGroupsOpen] = useState(false); // thẻ danh sách nhóm đang mở
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const isSupervisor = user?.role === 'GIANG_VIEN';
  const homePath = isSupervisor ? '/supervisor' : '/home';

  // Mỗi lần mở thẻ danh sách nhóm thì tải lại để luôn mới
  useEffect(() => {
    if (!open || !groupsOpen || !user) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    const request = isSupervisor ? supervisorApi.getMyGroups() : groupApi.getMyGroups();
    request
      .then((res) => {
        if (!cancelled) setGroups(normalizeGroups(res.data.data));
      })
      .catch(() => {
        if (!cancelled) setError('Không tải được danh sách nhóm');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, groupsOpen, user?.id, isSupervisor]);

  // Đóng vòng cung thì đóng luôn thẻ nhóm và xóa ô tìm
  useEffect(() => {
    if (!open) {
      setGroupsOpen(false);
      setSearch('');
    }
  }, [open]);

  // Nhấn Esc để đóng
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Đổi trang thì tự đóng
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const filteredGroups = useMemo(() => {
    const keyword = normalizeText(search.trim());
    if (!keyword) return groups;
    return groups.filter((group) => normalizeText(group.name).includes(keyword));
  }, [groups, search]);

  if (!user || HIDDEN_PATHS.includes(location.pathname)) return null;

  const go = (path) => {
    navigate(path);
    setOpen(false);
  };

  const actions = [
    {
      key: 'home',
      label: 'Trang chủ',
      icon: <IconHome />,
      active: location.pathname === homePath,
      onClick: () => go(homePath),
    },
    {
      key: 'groups',
      label: isSupervisor ? 'Nhóm phụ trách' : 'Nhóm',
      icon: <IconGroups />,
      active: groupsOpen || Boolean(currentGroupId),
      onClick: () => setGroupsOpen((value) => !value),
    },
    {
      key: 'profile',
      label: 'Cá nhân',
      icon: <IconUser />,
      active: location.pathname === '/profile',
      onClick: () => go('/profile'),
    },
  ];

  return (
    <>
      {open && <div className="qn-backdrop" onClick={() => setOpen(false)} />}

      {/* Thẻ danh sách nhóm (nằm trước vòng cung trong DOM để các nút luôn nổi lên trên) */}
      {open && groupsOpen && (
        <section className="qn-groups" aria-label="Danh sách nhóm">
          <p className="qn-groups-title">{isSupervisor ? 'Nhóm tôi phụ trách' : 'Nhóm của tôi'}</p>

          {groups.length >= SEARCH_MIN && (
            <input
              className="qn-search"
              type="text"
              placeholder="Tìm nhóm..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          )}

          <div className="qn-group-list">
            {loading && <p className="qn-empty">Đang tải...</p>}
            {!loading && error && <p className="qn-empty qn-empty-error">{error}</p>}
            {!loading && !error && groups.length === 0 && <p className="qn-empty">Chưa có nhóm nào.</p>}
            {!loading && !error && groups.length > 0 && filteredGroups.length === 0 && (
              <p className="qn-empty">Không có nhóm nào khớp.</p>
            )}
            {!loading &&
              !error &&
              filteredGroups.map((group) => {
                const isCurrent = String(group.id) === String(currentGroupId);
                return (
                  <button
                    key={group.id}
                    type="button"
                    className={`qn-group ${isCurrent ? 'qn-group-active' : ''}`}
                    onClick={() => go(`/groups/${group.id}`)}
                  >
                    <span className="qn-group-dot" />
                    <span className="qn-group-name">{group.name}</span>
                    {isCurrent && <span className="qn-group-now">Đang xem</span>}
                  </button>
                );
              })}
          </div>
        </section>
      )}

      <div className={`qn-root ${open ? 'qn-open' : ''}`}>
        {actions.map((action, index) => {
          const angle = (ARC_ANGLES[index] * Math.PI) / 180;
          return (
            <button
              key={action.key}
              type="button"
              className={`qn-item ${action.active ? 'qn-item-active' : ''}`}
              style={{
                '--dx': (-Math.cos(angle)).toFixed(3),
                '--dy': Math.sin(angle).toFixed(3),
                '--i': index,
              }}
              onClick={action.onClick}
              tabIndex={open ? 0 : -1}
              aria-hidden={!open}
              title={action.label}
            >
              <span className="qn-orb">{action.icon}</span>
              <span className="qn-label">{action.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          className="qn-fab"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? 'Đóng menu lối tắt' : 'Mở menu lối tắt'}
          aria-expanded={open}
          title={open ? 'Đóng' : 'Lối tắt'}
        >
          <span className="qn-fab-icon">
            <IconPlus />
          </span>
        </button>
      </div>
    </>
  );
}