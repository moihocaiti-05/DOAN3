const supervisorRepository = require('../repositories/supervisor.repository');
const contributionRepository = require('../repositories/supervisorContribution.repository');
const AppError = require('../utils/AppError');

// Lấy 0 giờ 0 phút của hôm nay, để so hạn chót THEO NGÀY (cùng quy ước với trang tổng quan)
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// % hoàn thành, làm tròn; chưa có việc nào thì là 0
const percent = (done, total) => (total === 0 ? 0 : Math.round((done / total) * 100));

// MỚI THÊM (tính năng 3): bảng đóng góp của từng thành viên trong 1 nhóm - Giảng viên xem ai được giao bao nhiêu việc,
// xong bao nhiêu, trễ bao nhiêu. Quy ước giống trang tổng quan: "trễ hạn" = có hạn chót < hôm nay và chưa "done";
// việc con được tính chung với việc chính.
exports.getGroupContributions = async (groupId, actorId) => {
  // Bắt buộc có groupId và actorId: nếu undefined thì Prisma bỏ qua điều kiện và khớp bản ghi bất kỳ
  if (!actorId) throw new AppError('Thiếu thông tin người dùng', 401);
  if (!groupId) throw new AppError('Thiếu mã nhóm', 400);

  // Chỉ Giảng viên ĐÃ ĐỒNG Ý phụ trách nhóm này mới được xem
  const supervisorship = await supervisorRepository.findOne(groupId, actorId);
  if (!supervisorship || supervisorship.status !== 'ACCEPTED') {
    throw new AppError('Bạn không phải giảng viên phụ trách nhóm này', 403);
  }

  const [group, members, tasks] = await Promise.all([
    contributionRepository.findGroupName(groupId),
    contributionRepository.findAcceptedMembers(groupId),
    contributionRepository.findTasksForContribution(groupId),
  ]);
  if (!group) throw new AppError('Không tìm thấy nhóm', 404);

  const today = startOfToday();
  const isDone = (t) => t.status === 'done';
  const isLate = (t) => !isDone(t) && t.deadline && new Date(t.deadline) < today;

  // Mỗi thành viên: đếm việc của riêng họ
  const rows = members.map((m) => {
    const mine = tasks.filter((t) => t.assignedTo === m.userId);
    const done = mine.filter(isDone).length;
    return {
      userId: m.userId,
      fullName: m.user.fullName,
      role: m.role, // 'leader' | 'member'
      assigned: mine.length,
      done,
      pending: mine.length - done,
      late: mine.filter(isLate).length,
      progress: percent(done, mine.length),
    };
  });

  // Trưởng nhóm lên đầu, sau đó xếp theo tên (tiếng Việt)
  rows.sort((a, b) => {
    if (a.role !== b.role) return a.role === 'leader' ? -1 : 1;
    return a.fullName.localeCompare(b.fullName, 'vi');
  });

  // Việc chưa giao ai, hoặc giao cho người không còn trong nhóm (đã rời/bị xóa) -> gom vào 1 dòng riêng
  const memberIds = new Set(members.map((m) => m.userId));
  const orphan = tasks.filter((t) => !t.assignedTo || !memberIds.has(t.assignedTo));
  const orphanDone = orphan.filter(isDone).length;

  return {
    groupName: group.name,
    totalTasks: tasks.length,
    members: rows,
    unassigned: {
      assigned: orphan.length,
      done: orphanDone,
      pending: orphan.length - orphanDone,
      late: orphan.filter(isLate).length,
    },
  };
};