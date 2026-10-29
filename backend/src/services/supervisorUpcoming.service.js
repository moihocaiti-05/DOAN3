const upcomingRepository = require('../repositories/supervisorUpcoming.repository');
const { MS_PER_DAY, startOfTodayVN } = require('../utils/vnDate');
const AppError = require('../utils/AppError');

const DEFAULT_DAYS = 7;
const MAX_DAYS = 60;

// Số ngày còn lại tới hạn chót, tính theo ngày giờ Việt Nam: 0 = hôm nay, 1 = ngày mai, âm = đã quá hạn
// (hạn chót < 00:00 hôm nay thì mới là trễ, giống quy ước của trang tổng quan và file Excel)
const daysLeftOf = (deadline, today) => Math.floor((new Date(deadline) - today) / MS_PER_DAY);

// Gom số việc (tổng / đã xong) của 1 mốc, CỘNG CẢ các mốc con cháu bên dưới nó
const buildMilestoneStats = (milestones, taskStatuses) => {
  const own = new Map(); // id mốc -> { total, done } của riêng mốc đó
  taskStatuses.forEach((t) => {
    const s = own.get(t.milestoneId) || { total: 0, done: 0 };
    s.total += 1;
    if (t.status === 'done') s.done += 1;
    own.set(t.milestoneId, s);
  });

  const childrenOf = new Map(); // id mốc cha -> danh sách id mốc con
  milestones.forEach((m) => {
    if (!m.parentId) return;
    if (!childrenOf.has(m.parentId)) childrenOf.set(m.parentId, []);
    childrenOf.get(m.parentId).push(m.id);
  });

  const memo = new Map();
  const collect = (id, visiting) => {
    if (memo.has(id)) return memo.get(id);
    if (visiting.has(id)) return { total: 0, done: 0 }; // chống vòng lặp nếu dữ liệu cây bị lỗi
    visiting.add(id);
    const base = own.get(id) || { total: 0, done: 0 };
    let total = base.total;
    let done = base.done;
    (childrenOf.get(id) || []).forEach((childId) => {
      const c = collect(childId, visiting);
      total += c.total;
      done += c.done;
    });
    visiting.delete(id);
    const result = { total, done };
    memo.set(id, result);
    return result;
  };

  return (id) => collect(id, new Set());
};

// MỚI THÊM (tính năng 5): danh sách việc và mốc SẮP ĐẾN HẠN (trong "days" ngày tới) của MỌI nhóm Giảng viên phụ trách,
// kèm các việc/mốc ĐÃ QUÁ HẠN mà chưa xong (xếp lên đầu, trễ nhiều nhất trước).
// Quy ước: mốc coi là "xong" khi có ít nhất 1 việc (tính cả mốc con) và tất cả đều "done"; mốc chưa có việc nào vẫn hiện khi tới hạn.
exports.getUpcomingDeadlines = async (userId, rawDays) => {
  // Bắt buộc có userId: nếu undefined thì Prisma bỏ qua điều kiện và trả dữ liệu của người khác
  if (!userId) throw new AppError('Thiếu thông tin người dùng', 401);

  let days = DEFAULT_DAYS;
  if (rawDays !== undefined && rawDays !== null && rawDays !== '') {
    days = Number(rawDays);
    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
      throw new AppError(`Số ngày phải là số nguyên từ 1 đến ${MAX_DAYS}`, 400);
    }
  }

  const today = startOfTodayVN();
  // Mốc giới hạn (không gồm): hết ngày thứ "days" kể từ hôm nay
  const limit = new Date(today.getTime() + (days + 1) * MS_PER_DAY);

  const [tasks, milestones, milestoneTasks] = await Promise.all([
    upcomingRepository.findOpenTasksDueBefore(userId, limit),
    upcomingRepository.findMilestones(userId),
    upcomingRepository.findMilestoneTaskStatuses(userId),
  ]);

  const statsOf = buildMilestoneStats(milestones, milestoneTasks);

  const items = [];

  tasks.forEach((t) => {
    const daysLeft = daysLeftOf(t.deadline, today);
    if (daysLeft > days) return; // phòng trường hợp Repository trả dư
    items.push({
      kind: 'task',
      id: t.id,
      title: t.title,
      groupId: t.groupId,
      groupName: t.group.name,
      deadline: t.deadline,
      daysLeft,
      assigneeName: t.assignee ? t.assignee.fullName : null,
      parentTitle: t.parentTask ? t.parentTask.title : null, // có giá trị nghĩa là việc con
      milestoneTitle: t.milestone ? t.milestone.title : null,
    });
  });

  milestones.forEach((m) => {
    if (!m.dueDate) return;
    const daysLeft = daysLeftOf(m.dueDate, today);
    if (daysLeft > days) return;
    const stats = statsOf(m.id);
    if (stats.total > 0 && stats.done === stats.total) return; // mốc đã xong hết thì không cần nhắc
    items.push({
      kind: 'milestone',
      id: m.id,
      title: m.title,
      groupId: m.groupId,
      groupName: m.group.name,
      deadline: m.dueDate,
      daysLeft,
      totalTasks: stats.total,
      doneTasks: stats.done,
    });
  });

  // Trễ nhiều nhất lên đầu, rồi tới sắp đến hạn gần nhất; cùng ngày thì mốc trước việc, rồi theo tên
  items.sort(
    (a, b) =>
      a.daysLeft - b.daysLeft ||
      (a.kind === b.kind ? 0 : a.kind === 'milestone' ? -1 : 1) ||
      a.title.localeCompare(b.title, 'vi')
  );

  return {
    days,
    overdueCount: items.filter((i) => i.daysLeft < 0).length,
    upcomingCount: items.filter((i) => i.daysLeft >= 0).length,
    items,
  };
};