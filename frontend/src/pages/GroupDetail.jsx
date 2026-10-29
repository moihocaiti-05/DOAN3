import TaskDetailModal from '../components/TaskDetailModal';
import TaskFilterBar from '../components/TaskFilterBar';
import NotificationBell from '../components/NotificationBell';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import socket from '../services/socket';
import { taskApi } from '../services/taskApi';
import { groupApi } from '../services/groupApi';
import { milestoneApi } from '../services/milestoneApi';
import { friendApi } from '../services/friendApi'; // MỚI THÊM: để đếm lời mời kết bạn đang chờ
import KanbanZone from '../components/KanbanZone';
import CreateTaskModal from '../components/CreateTaskModal';
import SendTaskMailModal from '../components/SendTaskMailModal'; // MỚI THÊM: hộp thoại gửi mail gộp công việc
import ImportTaskModal from '../components/ImportTaskModal';
import MembersModal from '../components/MembersModal';
import AvatarStack from '../components/AvatarStack';
import StatsModal from '../components/StatsModal';
import ChatBox from '../components/ChatBox';
import TimelineView from '../components/TimelineView';
import ActivityFeed from '../components/ActivityFeed'; // MỚI THÊM: tab "Hoạt động"
import '../styles/kanban.css';

// ===== MỚI THÊM: Bộ lọc / tìm kiếm / sắp xếp công việc =====
// Các hàm dưới đây là hàm thuần (không phụ thuộc React) nên đặt ngoài component cho gọn
const EMPTY_FILTERS = { search: '', assignee: '', priority: '', status: '', deadline: '', tag: '', sort: '' };
const FILTER_STORAGE_PREFIX = 'taskFilters:'; // khóa lưu bộ lọc trong trình duyệt, mỗi nhóm 1 khóa riêng
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

// Đọc bộ lọc đã lưu của nhóm. Ô tìm kiếm chữ KHÔNG được nhớ (tránh vào lại thấy danh sách "trống" mà không hiểu vì sao)
const loadSavedFilters = (groupId) => {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_PREFIX + groupId);
    return raw ? { ...EMPTY_FILTERS, ...JSON.parse(raw), search: '' } : { ...EMPTY_FILTERS };
  } catch {
    return { ...EMPTY_FILTERS }; // trình duyệt chặn lưu trữ hoặc dữ liệu hỏng thì dùng bộ lọc rỗng
  }
};

const saveFilters = (groupId, filters) => {
  try {
    localStorage.setItem(FILTER_STORAGE_PREFIX + groupId, JSON.stringify({ ...filters, search: '' }));
  } catch {
    // không lưu được thì thôi, bộ lọc vẫn dùng bình thường trong phiên này
  }
};

// Bỏ dấu tiếng Việt + chữ thường, để gõ "thiet ke" vẫn tìm ra "Thiết kế"
const removeAccents = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();

// Đổi Date thành chuỗi ngày "yyyy-mm-dd" theo giờ máy người dùng
const toDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Kiểm tra hạn chót. So sánh theo NGÀY (bỏ giờ): deadline lưu dạng "2026-10-20T00:00:00.000Z" nên cắt 10 ký tự đầu là ngày đã chọn
const matchesDeadline = (item, mode) => {
  if (mode === 'none') return !item.deadline;
  if (!item.deadline) return false;
  const due = item.deadline.slice(0, 10);
  const today = new Date();
  const todayStr = toDateStr(today);
  if (mode === 'overdue') return item.status !== 'done' && due < todayStr;
  if (mode === 'today') return due === todayStr;
  if (mode === 'week') {
    const end = new Date(today);
    end.setDate(end.getDate() + 6); // hôm nay + 6 ngày tới = 7 ngày
    return due >= todayStr && due <= toDateStr(end);
  }
  return true;
};

// 1 task (hoặc 1 việc con) có thỏa TẤT CẢ bộ lọc đang bật không
// scope: { showAll, userId } - showAll = true khi đang xem "Việc cả nhóm"; false (đang xem "Việc của tôi") thì chỉ lấy việc của userId
// MỚI SỬA: Trưởng nhóm cũng dùng 2 chế độ này như thành viên (trước đây Trưởng nhóm luôn showAll = true)
const taskMatchesFilters = (item, filters, scope) => {
  const keywords = removeAccents(filters.search.trim()).split(/\s+/).filter(Boolean);
  if (keywords.length > 0) {
    // Tìm trong tên, mô tả, tên người phụ trách và tên các nhãn; mọi từ khóa đều phải xuất hiện
    const haystack = removeAccents(
      [item.title, item.description, item.assignee?.fullName, ...(item.tags || []).map((t) => t.name)].join(' ')
    );
    if (!keywords.every((word) => haystack.includes(word))) return false;
  }

  if (filters.assignee === 'unassigned') {
    if (item.assignedTo) return false;
  } else if (filters.assignee && item.assignedTo !== filters.assignee) {
    return false;
  }

  if (filters.priority && item.priority !== filters.priority) return false;
  if (filters.status && item.status !== filters.status) return false;
  if (filters.tag && !(item.tags || []).some((t) => t.name === filters.tag)) return false;
  if (filters.deadline && !matchesDeadline(item, filters.deadline)) return false;
  if (!scope.showAll && item.assignedTo !== scope.userId) return false;

  return true;
};

// Sắp xếp danh sách task (không đổi mảng gốc). sort rỗng = giữ thứ tự Backend trả về (mới tạo trước)
const sortTasks = (list, sort) => {
  if (!sort) return list;
  const sorted = [...list];
  if (sort === 'deadline') {
    // Có hạn gần nhất lên trước, việc chưa có hạn xuống cuối
    sorted.sort((a, b) => {
      if (!a.deadline && !b.deadline) return 0;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return a.deadline.localeCompare(b.deadline);
    });
  } else if (sort === 'priority') {
    sorted.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9));
  } else if (sort === 'name') {
    sorted.sort((a, b) => a.title.localeCompare(b.title, 'vi'));
  }
  return sorted;
};

export default function GroupDetail() {
    const { groupId } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [milestoneTree, setMilestoneTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showMailModal, setShowMailModal] = useState(false); // MỚI THÊM: hộp thoại Gửi mail công việc
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showChat, setShowChat] = useState(false);

  const [unreadChat, setUnreadChat] = useState(0);
  const [pendingFriendCount, setPendingFriendCount] = useState(0); // MỚI THÊM: số lời mời kết bạn đang chờ mình trả lời
  const showChatRef = useRef(showChat);

  // MỚI THÊM: trạng thái nút "Xuất báo cáo" - đang tải (để khóa nút, tránh bấm nhiều lần) và thông báo lỗi nếu có
  const [exportingReport, setExportingReport] = useState(false);
  const [reportError, setReportError] = useState('');
  const [boardError, setBoardError] = useState(''); // MỚI THÊM (Phiên 12): lời báo khi kéo thẻ sai luật Kiểm định

  // MỚI SỬA: gộp các state lọc lẻ (searchText, filterAssignee, filterPriority) thành 1 object "filters",
  // khởi tạo từ bộ lọc đã lưu của nhóm này (trừ ô tìm kiếm chữ)
  const [filters, setFilters] = useState(() => loadSavedFilters(groupId));

  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskDetail, setShowTaskDetail] = useState(false);

  const [activeTab, setActiveTab] = useState('board');

  const [viewMode, setViewMode] = useState('team');

  const myMembership = members.find((m) => m.userId === user.id && m.status === 'ACCEPTED');
  const isLeader = myMembership?.role === 'leader';
  const isMember = !!myMembership;
  // MỚI THÊM (Phiên 12): ai được DUYỆT công việc ở bước Kiểm định = Trưởng nhóm, hoặc Giảng viên (tài khoản Giảng viên không phải thành viên nhóm)
  const isSupervisor = user.role === 'GIANG_VIEN' && !isMember;
  const canReview = isLeader || isSupervisor;

  // MỚI THÊM: đường dẫn của nút "Quay lại" - Giảng viên về trang riêng /supervisor,
  // người khác về /home. Vì trang /home chỉ liệt kê nhóm mà mình là THÀNH VIÊN,
  // Giảng viên (nằm ở bảng GroupSupervisor) về đó sẽ thấy trống và tưởng nhóm bị mất
  const backPath = user.role === 'GIANG_VIEN' ? '/supervisor' : '/home';

  const loadTasks = async () => {
    setLoading(true);
    try {
      const res = await taskApi.getByGroup(groupId);
      setTasks(res.data.data);
    } finally {
      setLoading(false);
    }
  };

  const loadMilestones = async () => {
    const res = await milestoneApi.getTimeline(groupId);
    setMilestoneTree(res.data.data);
  };

  useEffect(() => {
    loadTasks();
    loadMilestones();
  }, [groupId]);

  useEffect(() => {
    groupApi.getMembers(groupId).then((res) => setMembers(res.data.data));
  }, [groupId]);

  // MỚI THÊM: đổi sang nhóm khác thì nạp lại bộ lọc đã lưu của nhóm đó
  useEffect(() => {
    setFilters(loadSavedFilters(groupId));
  }, [groupId]);

  // Luôn giữ ref showChatRef trùng với state showChat, để handler socket (tạo 1 lần) đọc được giá trị mới nhất
  useEffect(() => {
    showChatRef.current = showChat;
  }, [showChat]);

  // MỚI THÊM: đếm số lời mời kết bạn đang chờ mình trả lời - tải lúc vào trang và tải lại mỗi khi Backend báo "friend_updated"
  useEffect(() => {
    const loadPendingFriends = () => {
      friendApi
        .getAll()
        .then((res) => setPendingFriendCount(res.data.data.incoming.length))
        .catch(() => {}); // lỗi mạng thì bỏ qua, badge giữ nguyên số cũ
    };

    loadPendingFriends();
    socket.on('friend_updated', loadPendingFriends);
    return () => {
      socket.off('friend_updated', loadPendingFriends);
    };
  }, [user.id]);

  useEffect(() => {
    // Vào phòng Socket.io của nhóm này để nhận tin nhắn chat cả nhóm
    socket.emit('join_group', groupId);

    // Tin nhắn chat cả nhóm: khung chat đang đóng thì cộng 1 vào số chưa đọc
    const handleNewMessage = (message) => {
      if (message.groupId !== groupId) return;
      if (message.senderId === user.id) return;

      if (showChatRef.current) {
        setUnreadChat(0);
      } else {
        setUnreadChat((prev) => prev + 1);
      }
    };

    // Tin nhắn trong nhóm chat con / chat riêng cũng làm nút 💬 hiện số chưa đọc khi khung chat đang đóng
    // (tin này được Backend phát tới phòng thông báo riêng của mình, và ChatBox đã vào phòng đó)
    const handleNewConversationMessage = (message) => {
      if (message.senderId === user.id) return; // tin do chính mình gửi thì không tính là chưa đọc

      if (showChatRef.current) {
        // Khung chat đang mở: ChatBox tự hiện chấm số riêng cho từng cuộc trò chuyện, nút 💬 không cần đếm
        setUnreadChat(0);
      } else {
        setUnreadChat((prev) => prev + 1);
      }
    };

    socket.on('new_message', handleNewMessage);
    socket.on('new_conversation_message', handleNewConversationMessage);

    return () => {
      socket.emit('leave_group', groupId);
      socket.off('new_message', handleNewMessage);
      socket.off('new_conversation_message', handleNewConversationMessage);
    };
  }, [groupId, user.id]);

  const handleOpenChat = () => {
    setShowChat(true);
    setUnreadChat(0);
  };

  // MỚI THÊM: Tải báo cáo tiến độ về máy dưới dạng file Excel
  const handleExportReport = async () => {
    setExportingReport(true);
    setReportError('');
    try {
      const res = await groupApi.exportReport(groupId);

      // Tạo 1 đường link tạm trỏ tới dữ liệu file trong bộ nhớ trình duyệt, rồi giả lập bấm vào link để tải về
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'bao-cao-tien-do.xlsx'; // tên file lưu về máy
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url); // giải phóng link tạm sau khi tải xong
    } catch (err) {
      // Vì responseType là 'blob' nên nội dung lỗi từ Backend cũng bị gói thành Blob, phải đọc ra chữ rồi mới lấy được message
      let message = 'Không xuất được báo cáo, vui lòng thử lại';
      try {
        if (err.response?.data instanceof Blob) {
          const text = await err.response.data.text();
          message = JSON.parse(text).message || message;
        }
      } catch {
        // đọc lỗi thất bại thì giữ câu thông báo mặc định ở trên
      }
      setReportError(message);
    } finally {
      setExportingReport(false); // dù thành công hay lỗi đều mở khóa nút lại
    }
  };

  // MỚI SỬA: lọc theo bộ lọc mới (trạng thái, hạn chót, nhãn, chưa giao, tìm không dấu...) rồi sắp xếp
  // Task cấp cao được giữ lại nếu CHÍNH NÓ khớp, hoặc có ÍT NHẤT 1 việc con khớp (việc con không có thẻ riêng nên hiện thẻ cha)
  // MỚI SỬA: bỏ "isLeader ||" - Trưởng nhóm cũng chia được "Việc cả nhóm" / "Việc của tôi" giống thành viên
  const scope = { showAll: viewMode === 'team', userId: user.id };
  const getFilteredTasks = () => {
    const visible = tasks.filter(
      (t) =>
        taskMatchesFilters(t, filters, scope) ||
        (t.subtasks || []).some((s) => taskMatchesFilters(s, filters, scope))
    );
    return sortTasks(visible, filters.sort);
  };

  // Có đang lọc không (sắp xếp không tính là lọc)
  const filtersActive = !!(
    filters.search.trim() || filters.assignee || filters.priority || filters.status || filters.deadline || filters.tag
  );

  // Danh sách tên nhãn đang dùng trong nhóm (không trùng, xếp A-Z) để đổ vào ô lọc nhãn
  const tagOptions = [...new Set(tasks.flatMap((t) => (t.tags || []).map((tag) => tag.name)))].sort((a, b) =>
    a.localeCompare(b, 'vi')
  );

  // Đổi 1 bộ lọc rồi lưu lại cho lần sau; xóa bộ lọc thì giữ nguyên cách sắp xếp
  const applyFilters = (next) => {
    setFilters(next);
    saveFilters(groupId, next);
  };
  const handleFilterChange = (key, value) => applyFilters({ ...filters, [key]: value });
  const handleResetFilters = () => applyFilters({ ...EMPTY_FILTERS, sort: filters.sort });

  // MỚI SỬA: Dựng lại CÂY zone song song với cây mốc (milestoneTree) - mỗi node giữ:
  // - tasks: CHỈ các task gán TRỰC TIẾP vào đúng mốc này (không gộp con cháu)
  // - children: mảng các node con (mốc con), đệ quy y hệt cấu trúc milestoneTree
  // Thay thế hoàn toàn buildZones/flattenMilestones cũ (gộp chung hoặc tách phẳng) - giờ giữ đúng cấu trúc lồng nhau
  const buildZoneTree = (nodes) => {
    const filtered = getFilteredTasks();
    const build = (node) => {
      const children = node.children.map(build);
      const zoneTasks = filtered.filter((t) => t.milestoneId === node.id);
      return {
        key: node.id,
        title: node.title,
        tasks: zoneTasks,
        // MỚI THÊM: toàn bộ việc của mốc (KHÔNG lọc) - dùng để tính % tiến độ, để lọc không làm lệch % của mốc
        allTasks: tasks.filter((t) => t.milestoneId === node.id),
        // MỚI THÊM: mốc này (hoặc mốc con của nó) có việc khớp bộ lọc không - để ẩn các mốc trống khi đang lọc
        hasMatch: zoneTasks.length > 0 || children.some((c) => c.hasMatch),
        children,
      };
    };
    return nodes.map(build);
  };

  // MỚI THÊM: Đệ quy hiển thị 1 node zone - vẽ board 3 cột của CHÍNH mốc này trước (dùng KanbanZone có sẵn,
  // không cần sửa component đó), rồi nếu có mốc con thì vẽ tiếp bên dưới, thụt lề bằng class "kanban-zone-children"
  // để mắt người xem thấy rõ "Chương 1", "Chương 2" đang nằm BÊN TRONG "Đề cương"
  const renderZoneNode = (node) => (filtersActive && !node.hasMatch) ? null : ( // MỚI SỬA: đang lọc thì ẩn mốc không có việc nào khớp
    <div key={node.key} className="kanban-zone-node">
      <KanbanZone
        title={node.title}
        tasks={node.tasks}
        allTasks={node.allTasks}
        sensors={sensors}
        onDragEnd={handleDragEnd}
        onOpenDetail={handleOpenTaskDetail}
      />
      {node.children.length > 0 && (
        <div className="kanban-zone-children">
          {node.children.map(renderZoneNode)}
        </div>
      )}
    </div>
  );

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id;
    const newStatus = over.id;

    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    // MỚI THÊM (Phiên 12): luật KIỂM ĐỊNH - chặn ngay trên giao diện để người dùng thấy lý do (Backend cũng kiểm tra lại)
    if (isSupervisor && !(task.status === 'review' && newStatus === 'done')) {
      setBoardError('Giảng viên chỉ duyệt công việc ở cột "Kiểm định" (kéo sang "Hoàn thành" để duyệt).');
      return;
    }
    if (newStatus === 'done' && !canReview) {
      setBoardError('Công việc phải qua bước Kiểm định: hãy kéo sang cột "Kiểm định", Trưởng nhóm hoặc Giảng viên sẽ duyệt.');
      return;
    }
    if (task.status === 'review' && newStatus !== 'done' && !canReview) {
      setBoardError('Công việc đang chờ duyệt, chỉ Trưởng nhóm hoặc Giảng viên mới đưa ra khỏi cột "Kiểm định" được.');
      return;
    }
    if (task.status === 'review' && newStatus === 'redo') {
      // Từ chối bắt buộc có ghi chú nên mở chi tiết công việc để người duyệt nhập
      setBoardError('Để từ chối, hãy nhập ghi chú rồi bấm "Từ chối" trong cửa sổ chi tiết công việc.');
      handleOpenTaskDetail(task);
      return;
    }
    setBoardError('');

    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );

    try {
      await taskApi.updateStatus(taskId, newStatus);
    } catch (err) {
      // MỚI SỬA (Phiên 12): hiện lời báo của Backend (VD thiếu quyền) rồi tải lại để thẻ trở về cột cũ
      setBoardError(err.response?.data?.message || 'Không đổi được trạng thái, thử lại');
      loadTasks();
    }
  };

  const handleOpenTaskDetail = (task) => {
  setSelectedTask(task);
  setShowTaskDetail(true);
};

  // MỚI THÊM: tổng số hiện trên badge nút 💬 = tin chưa đọc + lời mời kết bạn đang chờ
  const totalChatBadge = unreadChat + pendingFriendCount;

  return (
    <div className="group-detail-page">
      <header className="group-detail-header">
        {/* MỚI SỬA: đổi to="/home" thành to={backPath} để Giảng viên quay về /supervisor thay vì /home */}
        <Link to={backPath} className="group-detail-back">&larr; Quay lại trang chủ</Link>
        <div className="group-detail-title-row">
          <h1 className="group-detail-title">
            {activeTab === 'board' ? 'Bảng công việc' : activeTab === 'timeline' ? 'Tiến độ dự án' : 'Hoạt động của nhóm'}
          </h1>
          <div className="header-actions">
  <div className="header-action-group">
    <NotificationBell />
    <AvatarStack members={members} onClick={() => setShowMembersModal(true)} />
  </div>

  <div className="header-action-group">
    <button className="btn-secondary" onClick={() => setShowStatsModal(true)}>
      📊 Thống kê
    </button>
    {/* MỚI THÊM: nút xuất báo cáo Excel - thành viên và Giảng viên đều thấy; bấm xong sẽ khóa nút cho tới khi tải xong */}
    <button className="btn-secondary" onClick={handleExportReport} disabled={exportingReport}>
      {exportingReport ? 'Đang xuất...' : '📥 Xuất báo cáo'}
    </button>
    <button className="btn-secondary chat-toggle-btn" onClick={handleOpenChat}>
      💬 Trò chuyện
      {/* MỚI SỬA: hiện tổng (tin chưa đọc + lời mời kết bạn đang chờ) thay vì chỉ tin chưa đọc */}
      {totalChatBadge > 0 && (
        <span className="chat-unread-badge">{totalChatBadge > 9 ? '9+' : totalChatBadge}</span>
      )}
    </button>
  </div>

  {activeTab === 'board' && isMember && (
    <div className="header-action-group">
      {/* MỚI THÊM: nút gửi mail gộp nhiều công việc - chỉ thành viên thấy (Giảng viên không gửi) */}
      <button className="btn-secondary" onClick={() => setShowMailModal(true)}>
        📧 Gửi mail
      </button>
      <button className="btn-secondary" onClick={() => setShowImportModal(true)}>
        Import Excel
      </button>
      <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
        + Thêm công việc
      </button>
    </div>
  )}
</div>
        </div>

        {/* MỚI THÊM: dòng báo lỗi xuất báo cáo (chỉ hiện khi có lỗi) - dùng biến theme, có màu dự phòng */}
        {reportError && (
          <p style={{ color: 'var(--color-danger, #D14343)', margin: '8px 0 0', fontSize: '14px' }}>
            {reportError}
          </p>
        )}

        {/* MỚI THÊM (Phiên 12): lời báo khi kéo thẻ sai luật Kiểm định */}
        {boardError && activeTab === 'board' && (
          <p style={{ color: 'var(--color-danger, #D14343)', margin: '8px 0 0', fontSize: '14px' }}>
            {boardError}
          </p>
        )}

        <div className="tab-switcher">
          <button
            className={`tab-btn ${activeTab === 'board' ? 'tab-btn-active' : ''}`}
            onClick={() => setActiveTab('board')}
          >
            Bảng công việc
          </button>
          <button
            className={`tab-btn ${activeTab === 'timeline' ? 'tab-btn-active' : ''}`}
            onClick={() => setActiveTab('timeline')}
          >
            Tiến độ theo mốc
          </button>
          <button
            className={`tab-btn ${activeTab === 'activity' ? 'tab-btn-active' : ''}`}
            onClick={() => setActiveTab('activity')}
          >
            Hoạt động
          </button>
        </div>
      </header>

      <main className="group-detail-content">
        {activeTab === 'board' ? (
          loading ? (
            <p>Đang tải...</p>
          ) : (
            <>
              {/* MỚI SỬA: bỏ "&& !isLeader" - Trưởng nhóm cũng thấy 2 nút "Việc cả nhóm" / "Việc của tôi" */}
              {isMember && (
                <div className="task-view-switcher">
                  <button
                    className={`task-view-btn ${viewMode === 'team' ? 'task-view-btn-active' : ''}`}
                    onClick={() => setViewMode('team')}
                  >
                    Việc cả nhóm
                  </button>
                  <button
                    className={`task-view-btn ${viewMode === 'mine' ? 'task-view-btn-active' : ''}`}
                    onClick={() => setViewMode('mine')}
                  >
                    Việc của tôi
                  </button>
                </div>
              )}

              <TaskFilterBar
                members={members}
                tagOptions={tagOptions}
                filters={filters}
                onFilterChange={handleFilterChange}
                onReset={handleResetFilters}
                resultCount={getFilteredTasks().length}
                totalCount={tasks.length}
              />

              {/* MỚI SỬA: dựng cây zone rồi đệ quy render, thay vì map phẳng buildZones() cũ */}
              <div className="kanban-zone-list">
                {buildZoneTree(milestoneTree).map(renderZoneNode)}
                {/* MỚI SỬA: đang lọc mà vùng "Không thuộc mốc nào" không có việc khớp thì ẩn đi */}
                {(!filtersActive || getFilteredTasks().some((t) => !t.milestoneId)) && (
                  <KanbanZone
                    title="Không thuộc mốc nào"
                    tasks={getFilteredTasks().filter((t) => !t.milestoneId)}
                    allTasks={tasks.filter((t) => !t.milestoneId)}
                    sensors={sensors}
                    onDragEnd={handleDragEnd}
                    onOpenDetail={handleOpenTaskDetail}
                  />
                )}
                {/* MỚI THÊM: báo rõ khi không có việc nào khớp bộ lọc */}
                {filtersActive && getFilteredTasks().length === 0 && (
                  <p className="task-filter-empty">Không có công việc nào khớp bộ lọc.</p>
                )}
              </div>
            </>
          )
        ) : activeTab === 'timeline' ? (
          <TimelineView groupId={groupId} canReview={canReview} />
        ) : (
          <ActivityFeed groupId={groupId} />
        )}
      </main>

      <CreateTaskModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={loadTasks}
        groupId={groupId}
      />
      <ImportTaskModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImported={loadTasks}
        groupId={groupId}
      />
      {/* MỚI THÊM: truyền danh sách công việc + thành viên sẵn có, không gọi thêm API khi mở */}
      <SendTaskMailModal
        isOpen={showMailModal}
        onClose={() => setShowMailModal(false)}
        groupId={groupId}
        tasks={tasks}
        members={members}
        currentUserId={user.id}
        isLeader={isLeader}
      />
      <MembersModal
        isOpen={showMembersModal}
        onClose={() => setShowMembersModal(false)}
        groupId={groupId}
        onChanged={() => groupApi.getMembers(groupId).then((res) => setMembers(res.data.data))}
        onDeleted={() => navigate('/home')}
      />
      <StatsModal
        isOpen={showStatsModal}
        onClose={() => setShowStatsModal(false)}
        groupId={groupId}
        tasks={tasks}
      />
      <ChatBox
        isOpen={showChat}
        onClose={() => setShowChat(false)}
        groupId={groupId}
      />

      <TaskDetailModal
  isOpen={showTaskDetail}
  onClose={() => setShowTaskDetail(false)}
  task={selectedTask}
  onUpdated={loadTasks}
  isLeader={isLeader} // MỚI THÊM: Trưởng nhóm được Sửa/Xóa mọi task dù ai tạo
  isMember={isMember} // MỚI THÊM: không phải thành viên (VD Giảng viên) thì modal chuyển sang chế độ chỉ xem
  canReview={canReview} // MỚI THÊM (Phiên 12): Trưởng nhóm / Giảng viên được duyệt hoặc từ chối ở bước Kiểm định
/>
    </div>
  );
}