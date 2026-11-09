const supervisorRepository = require('../repositories/supervisor.repository');
const groupRepository = require('../repositories/group.repository');
const chartRepository = require('../repositories/supervisorChart.repository');
const AppError = require('../utils/AppError');

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

// Các khoảng thời gian cho phép: 4, 8, 12, 26 tuần gần nhất, hoặc 0 = toàn bộ (đến ngày kết thúc)
// MỚI SỬA: thêm 26 tuần
const ALLOWED_WEEKS = [0, 4, 8, 12, 26];
const DEFAULT_WEEKS = 8;
const MAX_WEEKS = 52;        // "Toàn bộ" hiển thị tối đa 52 tuần để biểu đồ không quá dài
const MAX_FUTURE_WEEKS = 26; // MỚI THÊM: ngày kết thúc xa tới đâu cũng chỉ kéo trục thêm tối đa 26 tuần tính từ hôm nay

// ===== Các hàm xử lý ngày =====

// Lấy 0 giờ 0 phút của 1 ngày, để so sánh THEO NGÀY chứ không theo giờ
const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Lấy ngày THỨ HAI của tuần chứa "date" (tuần bắt đầu từ thứ Hai, giống thẻ "Hoàn thành theo tuần" đã có)
const startOfWeek = (date) => {
  const d = startOfDay(date);
  const offset = (d.getDay() + 6) % 7; // getDay(): Chủ nhật = 0, thứ Hai = 1 ... -> đổi để thứ Hai = 0
  d.setDate(d.getDate() - offset);
  return d;
};

// Cộng thêm n ngày vào 1 ngày (n âm thì lùi lại)
const addDays = (date, n) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};

const pad = (n) => String(n).padStart(2, '0'); // 5 -> "05"
const toLabel = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; // nhãn trục ngang, ví dụ "27/10"
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; // ví dụ "2026-10-27"

// Lấy ngày MUỘN NHẤT trong 1 danh sách ngày (bỏ qua giá trị rỗng); danh sách rỗng thì trả null
const latestDate = (dates) =>
  dates
    .filter(Boolean)
    .map((d) => new Date(d))
    .reduce((max, d) => (!max || d > max ? d : max), null);

// ===== Kiểm tra tham số =====

// Đọc ?weeks= từ URL. Không gửi thì dùng mặc định; gửi giá trị lạ thì báo 400
const parseWeeks = (raw) => {
  if (raw === undefined || raw === '') return DEFAULT_WEEKS;
  const n = Number(raw);
  if (!ALLOWED_WEEKS.includes(n)) {
    throw new AppError('Khoảng thời gian không hợp lệ (chỉ nhận 0, 4, 8, 12 hoặc 26)', 400);
  }
  return n;
};

// Dựng danh sách các tuần: mỗi tuần có start (thứ Hai) và end (thứ Hai tuần sau, KHÔNG tính)
// MỚI SỬA:
//  - N tuần (4, 8, 12, 26): N tuần gần nhất, tuần cuối là tuần hiện tại (không có tuần tương lai)
//  - Toàn bộ (0): từ tuần sớm nhất tới tuần chứa NGÀY KẾT THÚC (nếu ngày kết thúc còn ở tương lai), tối đa MAX_WEEKS tuần
// Trả về { weeks, truncated }: truncated = true khi dữ liệu dài hơn MAX_WEEKS nên đã bị cắt bớt phần đầu
const buildWeeks = (weeksParam, earliestDate, endDate, currentStart) => {
  const make = (first, count) =>
    Array.from({ length: count }, (_, i) => {
      const start = addDays(first, i * 7);
      return { start, end: addDays(start, 7) };
    });

  if (weeksParam > 0) {
    return { weeks: make(addDays(currentStart, -(weeksParam - 1) * 7), weeksParam), truncated: false };
  }

  // Tuần cuối của trục: tuần hiện tại, hoặc tuần chứa ngày kết thúc nếu ngày đó ở tương lai (nhưng không xa quá MAX_FUTURE_WEEKS tuần)
  let lastStart = currentStart;
  if (endDate) {
    const endWeek = startOfWeek(endDate);
    if (endWeek > lastStart) {
      const limit = addDays(currentStart, MAX_FUTURE_WEEKS * 7);
      lastStart = endWeek < limit ? endWeek : limit;
    }
  }

  const needed = Math.max(Math.round((lastStart - startOfWeek(earliestDate)) / MS_PER_WEEK) + 1, 1);
  const count = Math.min(needed, MAX_WEEKS);
  return { weeks: make(addDays(lastStart, -(count - 1) * 7), count), truncated: needed > MAX_WEEKS };
};

// Cho 1 ngày, trả về vị trí của tuần chứa nó trong danh sách tuần; nằm ngoài khoảng đang xem thì trả -1
const weekIndexOf = (date, weeks) => {
  const idx = Math.round((startOfWeek(date) - weeks[0].start) / MS_PER_WEEK);
  return idx >= 0 && idx < weeks.length ? idx : -1;
};

// ===== Dựng danh sách mốc theo cây =====

// Duyệt cây mốc (mốc lớn -> mốc nhỏ) theo đúng thứ tự hiển thị, mỗi mốc trả về:
// số việc, số việc xong, tổng lần làm lại, và % hoàn thành. Số liệu của mốc lớn đã GỘP cả các mốc nhỏ bên trong
const buildMilestoneRows = (milestones, tasks) => {
  // Gom các mốc theo mốc cha; mốc gốc (không có cha) nằm ở khóa 'root'
  const byParent = new Map();
  milestones.forEach((m) => {
    const key = m.parentId || 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(m);
  });
  // Thứ tự giữa các mốc cùng cấp: theo "order", bằng nhau thì mốc tạo trước đứng trước
  const byOrder = (a, b) => a.order - b.order || new Date(a.createdAt) - new Date(b.createdAt);

  // Số liệu của các việc gắn TRỰC TIẾP vào từng mốc (chưa gộp mốc con)
  const own = new Map();
  tasks.forEach((t) => {
    if (!t.milestoneId) return;
    const s = own.get(t.milestoneId) || { total: 0, done: 0, reopen: 0 };
    s.total += 1;
    if (t.status === 'done') s.done += 1;
    s.reopen += t.reopenCount || 0;
    own.set(t.milestoneId, s);
  });

  const rows = [];

  // Đi từ trên xuống: thêm dòng của mốc vào danh sách trước (để đúng thứ tự cha trước con),
  // rồi cộng dồn số liệu của các mốc con vào mốc cha
  const walk = (m, depth) => {
    const s = own.get(m.id) || { total: 0, done: 0, reopen: 0 };
    const row = { id: m.id, title: m.title, depth, totalTasks: s.total, doneTasks: s.done, reopenTotal: s.reopen };
    rows.push(row);
    (byParent.get(m.id) || []).sort(byOrder).forEach((child) => {
      const c = walk(child, depth + 1);
      row.totalTasks += c.totalTasks;
      row.doneTasks += c.doneTasks;
      row.reopenTotal += c.reopenTotal;
    });
    return row;
  };

  (byParent.get('root') || []).sort(byOrder).forEach((m) => walk(m, 0));

  // Tính % sau cùng, khi đã cộng dồn xong
  rows.forEach((r) => {
    r.percent = r.totalTasks === 0 ? 0 : Math.round((r.doneTasks / r.totalTasks) * 100);
  });
  return rows;
};

// ===== Hàm chính =====

// Trả về số liệu cho các biểu đồ của 1 nhóm. Chỉ Giảng viên ĐÃ ĐỒNG Ý phụ trách nhóm mới xem được
exports.getGroupCharts = async (groupId, actorId, rawWeeks) => {
  // Bắt buộc có actorId và groupId: nếu undefined thì Prisma bỏ qua điều kiện và vô tình khớp bản ghi bất kỳ
  if (!actorId) throw new AppError('Thiếu thông tin người dùng', 401);
  if (!groupId) throw new AppError('Thiếu mã nhóm', 400);

  const weeksParam = parseWeeks(rawWeeks);

  // Quyền: phải là Giảng viên của nhóm này và đã bấm Đồng ý (PENDING hoặc DECLINED đều bị chặn)
  const supervisorship = await supervisorRepository.findOne(groupId, actorId);
  if (!supervisorship || supervisorship.status !== 'ACCEPTED') {
    throw new AppError('Bạn không phải Giảng viên đang phụ trách nhóm này', 403);
  }

  const group = await groupRepository.findById(groupId);
  if (!group) throw new AppError('Không tìm thấy nhóm', 404);

  // MỚI SỬA: lấy việc và mốc TRƯỚC, vì cần mốc để biết ngày kết thúc rồi mới dựng được danh sách tuần
  const [tasks, milestones] = await Promise.all([
    chartRepository.findTasksByGroup(groupId),
    chartRepository.findMilestonesByGroup(groupId),
  ]);

  const today = startOfDay(new Date());
  const currentStart = startOfWeek(new Date()); // thứ Hai của tuần hiện tại
  const currentKey = toKey(currentStart);

  // MỚI THÊM: NGÀY KẾT THÚC = hạn chót muộn nhất của các mốc; nhóm chưa đặt hạn cho mốc nào thì lấy hạn chót muộn nhất của các việc
  const milestoneEnd = latestDate(milestones.map((m) => m.dueDate));
  const taskEnd = latestDate(tasks.map((t) => t.deadline));
  const endDate = milestoneEnd || taskEnd; // null nếu cả hai đều không có
  const endSource = milestoneEnd ? 'milestone' : taskEnd ? 'task' : null;

  // Ngày sớm nhất của nhóm (ngày tạo nhóm hoặc ngày tạo việc đầu tiên), dùng khi chọn "Toàn bộ"
  const earliest = [group.createdAt, ...tasks.map((t) => t.createdAt)]
    .filter(Boolean)
    .map((d) => new Date(d))
    .reduce((min, d) => (d < min ? d : min), new Date());

  const { weeks, truncated } = buildWeeks(weeksParam, earliest, endDate, currentStart);

  // Lấy thêm tên người được giao việc và các hoạt động trong khoảng đang xem
  const assigneeIds = [...new Set(tasks.map((t) => t.assignedTo).filter(Boolean))];
  const [users, activityDates] = await Promise.all([
    chartRepository.findUsersByIds(assigneeIds),
    chartRepository.findActivityDates(groupId, weeks[0].start),
  ]);

  // Ngày "xong" của 1 việc đang ở trạng thái done: ưu tiên lần hoàn thành gần nhất, thiếu thì lùi dần
  const doneDateOf = (t) => new Date(t.completedAt || t.firstCompletedAt || t.createdAt);
  const doneTasks = tasks.filter((t) => t.status === 'done');

  // Số liệu TÓM TẮT cho các thẻ ở đầu trang; không phụ thuộc khoảng thời gian đang chọn
  const lastWeekStart = addDays(currentStart, -7); // thứ Hai của tuần trước
  const summary = {
    totalTasks: tasks.length,
    doneTasks: doneTasks.length,
    percent: tasks.length === 0 ? 0 : Math.round((doneTasks.length / tasks.length) * 100),
    // "Đang trễ hạn" = chưa xong và ngày hạn đã qua (đúng quy ước trễ hạn ở trang tổng quan)
    lateNow: tasks.filter((t) => t.status !== 'done' && t.deadline && startOfDay(t.deadline) < today).length,
    doneThisWeek: doneTasks.filter((t) => doneDateOf(t) >= currentStart).length,
    doneLastWeek: doneTasks.filter((t) => {
      const d = doneDateOf(t);
      return d >= lastWeekStart && d < currentStart;
    }).length,
    // MỚI THÊM: tuần hiện tại đã trôi qua mấy ngày (thứ Hai = 1 ... Chủ nhật = 7), để Frontend báo "tuần chưa kết thúc"
    daysIntoWeek: Math.round((today - currentStart) / MS_PER_DAY) + 1,
  };

  // Mảng đếm theo từng tuần
  const completed = weeks.map(() => 0); // số việc xong trong tuần
  const due = weeks.map(() => 0);       // số việc có hạn chót rơi vào tuần
  const late = weeks.map(() => 0);      // trong đó số việc trễ hạn
  const durSum = weeks.map(() => 0);    // tổng số ngày làm xong (để tính trung bình)
  const durCount = weeks.map(() => 0);  // số việc tham gia tính trung bình
  const activity = weeks.map(() => 0);  // số hoạt động trong tuần

  // 1) Việc hoàn thành mỗi tuần (chỉ tính việc ĐANG ở trạng thái done, khớp thẻ "Hoàn thành theo tuần" của trang nhóm)
  doneTasks.forEach((t) => {
    const idx = weekIndexOf(doneDateOf(t), weeks);
    if (idx >= 0) completed[idx] += 1;
  });

  // 3) Việc trễ hạn: xét các việc có hạn chót rơi vào từng tuần
  tasks.forEach((t) => {
    if (!t.deadline) return;
    const idx = weekIndexOf(t.deadline, weeks);
    if (idx < 0) return;
    due[idx] += 1;

    const deadlineDay = startOfDay(t.deadline);
    // Việc đã xong: trễ nếu xong SAU ngày hạn. Việc chưa xong: trễ nếu ngày hạn đã qua (khớp quy ước "trễ hạn" của app)
    const isLate = t.status === 'done'
      ? startOfDay(doneDateOf(t)) > deadlineDay
      : deadlineDay < today;
    if (isLate) late[idx] += 1;
  });

  // 4) Thời gian làm xong 1 việc: từ lúc tạo tới lần hoàn thành ĐẦU TIÊN (việc từng bị làm lại vẫn tính lần đầu)
  let overallSum = 0;
  let overallCount = 0;
  tasks.forEach((t) => {
    const finishedAt = t.firstCompletedAt || t.completedAt;
    if (!finishedAt) return;
    const days = Math.max(0, (new Date(finishedAt) - new Date(t.createdAt)) / MS_PER_DAY);
    overallSum += days;
    overallCount += 1;
    const idx = weekIndexOf(finishedAt, weeks);
    if (idx >= 0) {
      durSum[idx] += days;
      durCount[idx] += 1;
    }
  });

  // 7) Đếm số hoạt động của nhóm theo tuần
  activityDates.forEach((a) => {
    const idx = weekIndexOf(a.createdAt, weeks);
    if (idx >= 0) activity[idx] += 1;
  });

  // ===== Số liệu theo THÀNH VIÊN (biểu đồ 5 và 6) =====

  // Danh sách thành viên có được giao việc; thêm 1 dòng "Chưa giao" nếu có việc chưa giao cho ai
  const nameOf = new Map(users.map((u) => [u.id, u.fullName]));
  const memberList = assigneeIds.map((id) => ({ id, name: nameOf.get(id) || 'Thành viên đã rời nhóm' }));
  if (tasks.some((t) => !t.assignedTo)) memberList.push({ id: null, name: 'Chưa giao' });

  // Mỗi thành viên có 1 "key" dạng m0, m1... dùng làm tên cột trong dữ liệu theo tuần (an toàn hơn dùng id dài)
  const members = memberList.map((m, i) => ({
    key: `m${i}`,
    id: m.id,
    name: m.name,
    totalAssigned: 0, // tổng số việc được giao
    totalDone: 0,     // số việc đã xong
    reopenTotal: 0,   // tổng số lần việc của người này bị làm lại
  }));
  const memberByAssignee = new Map(members.map((m) => [m.id === null ? 'none' : m.id, m]));

  // Dữ liệu theo tuần của từng thành viên: mỗi tuần 1 dòng { label, isCurrent, isFuture, m0: số việc xong, m1: ... }
  // MỚI SỬA: tuần tương lai để null (chưa có số liệu) thay vì 0
  const memberWeekly = weeks.map((w) => {
    const isFuture = w.start > currentStart;
    const row = { label: toLabel(w.start), isCurrent: toKey(w.start) === currentKey, isFuture };
    members.forEach((m) => {
      row[m.key] = isFuture ? null : 0;
    });
    return row;
  });

  tasks.forEach((t) => {
    const m = memberByAssignee.get(t.assignedTo === null ? 'none' : t.assignedTo);
    if (!m) return;
    m.totalAssigned += 1;
    m.reopenTotal += t.reopenCount || 0;
    if (t.status === 'done') {
      m.totalDone += 1;
      const idx = weekIndexOf(doneDateOf(t), weeks);
      if (idx >= 0) memberWeekly[idx][m.key] += 1;
    }
  });

  // Người làm xong nhiều nhất xếp trước (cho chú thích biểu đồ dễ đọc); "key" không đổi nên dữ liệu theo tuần vẫn khớp
  members.sort((a, b) => b.totalDone - a.totalDone);

  // ===== Số liệu theo MỐC (biểu đồ 6 và 8) =====
  const milestoneRows = buildMilestoneRows(milestones, tasks);
  // Tổng lần làm lại của các việc chưa gắn mốc nào (để biểu đồ "làm lại theo mốc" không bị thiếu số)
  const unlinkedReopen = tasks
    .filter((t) => !t.milestoneId)
    .reduce((sum, t) => sum + (t.reopenCount || 0), 0);

  // Ghép thành 1 mảng, mỗi phần tử là 1 tuần chứa số liệu của các biểu đồ theo thời gian
  const weekly = weeks.map((w, i) => {
    const base = { weekStart: toKey(w.start), label: toLabel(w.start) };

    // MỚI THÊM: TUẦN TƯƠNG LAI (chưa tới): chưa có số liệu thật nên để null (đường biểu đồ dừng lại, không vẽ số 0)
    // Riêng "due" (số việc đến hạn) vẫn giữ để Giảng viên thấy trước tuần nào dồn nhiều hạn chót
    if (w.start > currentStart) {
      return {
        ...base,
        isCurrent: false,
        isFuture: true,
        completed: null,
        cumulativeDone: null,
        cumulativeTotal: null,
        cumulativePercent: null,
        due: due[i],
        late: late[i],
        avgDays: null,
        avgCount: 0,
        activity: null,
      };
    }

    // 2) Tiến độ tích lũy: tại CUỐI tuần này, đã xong bao nhiêu / tổng việc đã tồn tại
    const cumulativeDone = doneTasks.filter((t) => doneDateOf(t) < w.end).length;
    const cumulativeTotal = tasks.filter((t) => new Date(t.createdAt) < w.end).length;
    return {
      ...base,
      isCurrent: toKey(w.start) === currentKey, // MỚI THÊM: đây là tuần hiện tại (chưa kết thúc)
      isFuture: false,
      completed: completed[i],
      cumulativeDone,
      cumulativeTotal,
      cumulativePercent: cumulativeTotal === 0 ? 0 : Math.round((cumulativeDone / cumulativeTotal) * 100),
      due: due[i],
      late: late[i],
      // Tuần không có việc nào xong thì để null để đường biểu đồ bị ngắt, không vẽ số 0 gây hiểu nhầm
      avgDays: durCount[i] === 0 ? null : Math.round((durSum[i] / durCount[i]) * 10) / 10,
      avgCount: durCount[i],
      activity: activity[i],
    };
  });

  // MỚI THÊM: nhãn của tuần "hôm nay" và tuần chứa ngày kết thúc, để Frontend vẽ 2 vạch đứng
  // endLabel = null khi ngày kết thúc không có hoặc nằm ngoài khoảng đang xem
  const endIdx = endDate ? weekIndexOf(endDate, weeks) : -1;

  return {
    groupName: group.name,
    weeks: weeksParam, // trả lại đúng giá trị đang xem (0 = toàn bộ) để Frontend tô sáng nút
    totalTasks: tasks.length,
    avgDaysOverall: overallCount === 0 ? null : Math.round((overallSum / overallCount) * 10) / 10,
    avgDaysCount: overallCount, // số việc dùng để tính trung bình toàn nhóm
    endDate: endDate ? toKey(endDate) : null, // MỚI THÊM: ngày kết thúc dạng "YYYY-MM-DD" (null nếu chưa có hạn chót nào)
    endSource,                                // MỚI THÊM: 'milestone' | 'task' | null - ngày kết thúc lấy từ đâu
    truncated,                                // MỚI THÊM: true khi "Toàn bộ" dài hơn 52 tuần nên đã cắt bớt
    currentLabel: toLabel(currentStart),      // MỚI THÊM
    endLabel: endIdx >= 0 ? weekly[endIdx].label : null, // MỚI THÊM
    summary,          // { totalTasks, doneTasks, percent, lateNow, doneThisWeek, doneLastWeek, daysIntoWeek }
    weekly,
    members,          // [{ key, id, name, totalAssigned, totalDone, reopenTotal }]
    memberWeekly,     // [{ label, isCurrent, isFuture, m0, m1, ... }] số việc xong mỗi tuần của từng thành viên
    milestones: milestoneRows, // [{ id, title, depth, totalTasks, doneTasks, reopenTotal, percent }]
    unlinkedReopen,   // tổng lần làm lại của việc chưa gắn mốc
  };
};