const ExcelJS = require('exceljs');
const supervisorService = require('./supervisor.service');
const contributionService = require('./supervisorContribution.service');
const exportRepository = require('../repositories/supervisorExport.repository');
const AppError = require('../utils/AppError');

// ===== Giờ Việt Nam =====
// ExcelJS ghi kiểu Date theo UTC nên người xem sẽ thấy lệch 7 tiếng -> mọi ngày giờ đều ghi thành CHỮ theo giờ Việt Nam
// (cùng cách làm với báo cáo tiến độ của nhóm). "Hôm nay" = 00:00 giờ Việt Nam.
const TZ = 'Asia/Ho_Chi_Minh';

const partsOf = (date) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(date));
  const out = {};
  parts.forEach((p) => {
    out[p.type] = p.value;
  });
  return out;
};

const fmtDate = (date) => {
  if (!date) return '';
  const p = partsOf(date);
  return `${p.day}/${p.month}/${p.year}`;
};

const fmtDateTime = (date) => {
  if (!date) return '';
  const p = partsOf(date);
  return `${p.hour}:${p.minute} ${p.day}/${p.month}/${p.year}`;
};

const startOfTodayVN = () => {
  const p = partsOf(new Date());
  return new Date(`${p.year}-${p.month}-${p.day}T00:00:00+07:00`);
};

// ===== Chữ hiển thị =====
const GROUP_STATUS_LABEL = { late: 'Trễ hạn', idle: 'Ít hoạt động', ok: 'Đang ổn' };
const GROUP_STATUS_RANK = { late: 0, idle: 1, ok: 2 }; // cùng thứ tự với trang tổng quan: nhóm có vấn đề lên đầu
const TASK_STATUS_LABEL = {
  todo: 'Danh sách công việc',
  doing: 'Đang làm',
  redo: 'Làm lại',
  review: 'Kiểm định',
  done: 'Hoàn thành',
};
const PRIORITY_LABEL = { high: 'Cao', medium: 'Trung bình', low: 'Thấp' };

// ===== Màu (ARGB) =====
const COLOR = {
  header: 'FF334155',
  headerText: 'FFFFFFFF',
  border: 'FFCBD5E1',
  groupStatus: { late: 'FFF8D7DA', idle: 'FFFFF3CD', ok: 'FFD4EDDA' },
  taskStatus: { doing: 'FFDCEBFA', redo: 'FFFDE6CF', review: 'FFE9DDFB', done: 'FFD4EDDA' }, // "Kiểm định" tím nhạt như báo cáo nhóm
  muted: 'FFF1F5F9',
  late: 'FFC0392B',
};

const FONT = { name: 'Arial', size: 10 };
const thin = { style: 'thin', color: { argb: COLOR.border } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

// Tên sheet Excel: tối đa 31 ký tự, không chứa \ / ? * [ ] : và dấu nháy đơn; không trùng nhau
const makeSheetName = (name, used) => {
  const base = (name || 'Nhóm').replace(/[\\/?*[\]:']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31).trim() || 'Nhóm'; // cắt đủ 31 ký tự rồi bỏ khoảng trắng thừa ở cuối
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${n})`;
    candidate = base.slice(0, 31 - suffix.length).trim() + suffix;
    n += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
};

// Ghi 1 hàng tiêu đề bảng (nền tối, chữ trắng đậm)
const writeHeader = (sheet, rowNumber, labels) => {
  const row = sheet.getRow(rowNumber);
  labels.forEach((label, i) => {
    const cell = row.getCell(i + 1);
    cell.value = label;
    cell.font = { ...FONT, bold: true, color: { argb: COLOR.headerText } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.header } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = BORDER;
  });
  row.height = 22;
};

// Định dạng chung cho 1 ô dữ liệu
const styleCell = (cell, opts = {}) => {
  cell.font = { ...FONT, ...(opts.font || {}) };
  cell.border = BORDER;
  cell.alignment = { vertical: 'top', wrapText: true, horizontal: opts.center ? 'center' : 'left', indent: opts.indent || 0 };
  if (opts.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
};

// ===== Sheet "Tổng hợp" =====
const buildSummarySheet = (wb, groups, sheetNames, memberCounts, actorName, idleDays) => {
  const sheet = wb.addWorksheet('Tổng hợp', { views: [{ state: 'frozen', ySplit: 4 }] });
  sheet.columns = [
    { width: 6 }, { width: 34 }, { width: 12 }, { width: 11 }, { width: 11 },
    { width: 11 }, { width: 14 }, { width: 22 }, { width: 16 }, { width: 16 },
  ];

  sheet.mergeCells('A1:J1');
  const title = sheet.getCell('A1');
  title.value = 'BÁO CÁO TỔNG HỢP CÁC NHÓM HƯỚNG DẪN';
  title.font = { ...FONT, size: 14, bold: true };
  title.alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 26;

  sheet.mergeCells('A2:J2');
  const info = sheet.getCell('A2');
  info.value = `Giảng viên: ${actorName || ''}  ·  Xuất lúc: ${fmtDateTime(new Date())} (giờ Việt Nam)  ·  Số nhóm: ${groups.length}`;
  info.font = { ...FONT, color: { argb: 'FF475569' } };

  writeHeader(sheet, 4, [
    'STT', 'Nhóm', 'Thành viên', 'Tổng việc', 'Đã xong', 'Tiến độ',
    'Việc trễ hạn', 'Hoạt động gần nhất', 'Số ngày im lặng', 'Trạng thái',
  ]);

  const first = 5;
  groups.forEach((g, i) => {
    const row = sheet.getRow(first + i);
    const cells = [
      i + 1,
      { text: g.name, hyperlink: `#'${sheetNames[i]}'!A1` }, // bấm tên nhóm để nhảy sang sheet chi tiết
      memberCounts[i],
      g.totalTasks,
      g.doneTasks,
      g.progress / 100,
      g.lateTasks,
      g.lastActivityAt ? fmtDateTime(g.lastActivityAt) : 'Chưa có hoạt động',
      g.idleDays,
      GROUP_STATUS_LABEL[g.status],
    ];
    cells.forEach((value, c) => {
      const cell = row.getCell(c + 1);
      cell.value = value;
      const isLink = c === 1;
      styleCell(cell, {
        center: c !== 1 && c !== 7,
        font: isLink ? { color: { argb: 'FF1D4ED8' }, underline: true } : c === 6 && g.lateTasks > 0 ? { bold: true, color: { argb: COLOR.late } } : {},
        fill: c === 9 ? COLOR.groupStatus[g.status] : undefined,
      });
    });
    row.getCell(6).numFmt = '0%';
  });

  // Dòng tổng cộng: dùng công thức để file tự cập nhật nếu người xem sửa số liệu; kèm giá trị tính sẵn cho các trình xem không chạy công thức
  const last = first + groups.length - 1;
  const totalRow = sheet.getRow(last + 1);
  const sum = (key) => groups.reduce((s, g) => s + g[key], 0);
  const totalTasks = sum('totalTasks');
  const totalDone = sum('doneTasks');
  const totalLate = sum('lateTasks');
  const totalMembers = memberCounts.reduce((s, n) => s + n, 0);
  const totals = [
    ['A', ''],
    ['B', 'Tổng cộng'],
    ['C', { formula: `SUM(C${first}:C${last})`, result: totalMembers }],
    ['D', { formula: `SUM(D${first}:D${last})`, result: totalTasks }],
    ['E', { formula: `SUM(E${first}:E${last})`, result: totalDone }],
    ['F', { formula: `IF(D${last + 1}=0,0,E${last + 1}/D${last + 1})`, result: totalTasks === 0 ? 0 : totalDone / totalTasks }],
    ['G', { formula: `SUM(G${first}:G${last})`, result: totalLate }],
    ['H', ''],
    ['I', ''],
    ['J', ''],
  ];
  totals.forEach(([col, value]) => {
    const cell = totalRow.getCell(col);
    cell.value = value;
    styleCell(cell, { center: col !== 'B', font: { bold: true }, fill: COLOR.muted });
  });
  totalRow.getCell('F').numFmt = '0%';

  // Ghi chú cách tính để người đọc hiểu số liệu
  const notes = [
    'Ghi chú cách tính:',
    '- Trễ hạn: việc có hạn chót trước hôm nay (giờ Việt Nam) và chưa Hoàn thành.',
    '- Việc con được tính chung với việc chính (tổng việc, đã xong, trễ hạn).',
    `- Ít hoạt động: nhóm đã từ ${idleDays} ngày trở lên không có hoạt động nào trong lịch sử hoạt động (nhóm xong 100% việc thì không bị tính). Nhóm có việc trễ hạn luôn hiện "Trễ hạn".`,
    '- Bấm vào tên nhóm để chuyển sang sheet chi tiết của nhóm đó.',
  ];
  notes.forEach((text, i) => {
    const cell = sheet.getCell(last + 3 + i, 1);
    cell.value = text;
    cell.font = { ...FONT, italic: i > 0, bold: i === 0, color: { argb: 'FF475569' } };
  });

  return sheet;
};

// ===== Sheet chi tiết của 1 nhóm =====
const buildGroupSheet = (wb, sheetName, group, contribution, tasks, today) => {
  const sheet = wb.addWorksheet(sheetName);
  sheet.columns = [
    { width: 42 }, { width: 14 }, { width: 20 }, { width: 13 }, { width: 14 }, { width: 11 },
    { width: 24 }, { width: 28 }, { width: 24 }, { width: 19 }, { width: 10 },
  ];

  sheet.mergeCells('A1:K1');
  const title = sheet.getCell('A1');
  title.value = group.name;
  title.font = { ...FONT, size: 14, bold: true };
  sheet.getRow(1).height = 26;

  sheet.mergeCells('A2:K2');
  const info = sheet.getCell('A2');
  info.value = `Tiến độ ${group.progress}%  ·  ${group.doneTasks}/${group.totalTasks} việc xong  ·  ${group.lateTasks} việc trễ hạn  ·  Trạng thái: ${GROUP_STATUS_LABEL[group.status]}  ·  Hoạt động gần nhất: ${group.lastActivityAt ? fmtDateTime(group.lastActivityAt) : 'chưa có'}`;
  info.font = { ...FONT, color: { argb: 'FF475569' } };

  const back = sheet.getCell('A3');
  back.value = { text: '← Về sheet Tổng hợp', hyperlink: "#'Tổng hợp'!A1" };
  back.font = { ...FONT, color: { argb: 'FF1D4ED8' }, underline: true };

  // --- Bảng 1: đóng góp thành viên ---
  let r = 5;
  sheet.getCell(r, 1).value = 'ĐÓNG GÓP CỦA TỪNG THÀNH VIÊN';
  sheet.getCell(r, 1).font = { ...FONT, bold: true, size: 11 };
  r += 1;
  writeHeader(sheet, r, ['Thành viên', 'Vai trò', 'Được giao', 'Xong', 'Chưa xong', 'Trễ hạn', 'Hoàn thành']);
  r += 1;
  contribution.members.forEach((m) => {
    const row = sheet.getRow(r);
    const values = [
      m.fullName,
      m.role === 'leader' ? 'Trưởng nhóm' : 'Thành viên',
      m.assigned,
      m.done,
      m.pending,
      m.late,
      m.assigned === 0 ? '—' : m.progress / 100,
    ];
    values.forEach((v, c) => {
      const cell = row.getCell(c + 1);
      cell.value = v;
      styleCell(cell, {
        center: c > 0,
        font: c === 5 && m.late > 0 ? { bold: true, color: { argb: COLOR.late } } : {},
      });
    });
    if (m.assigned > 0) row.getCell(7).numFmt = '0%';
    r += 1;
  });
  if (contribution.unassigned.assigned > 0) {
    const u = contribution.unassigned;
    const row = sheet.getRow(r);
    ['Chưa giao ai (hoặc người đã rời nhóm)', '', u.assigned, u.done, u.pending, u.late, '—'].forEach((v, c) => {
      const cell = row.getCell(c + 1);
      cell.value = v;
      styleCell(cell, { center: c > 0, fill: COLOR.muted });
    });
    r += 1;
  }

  // --- Bảng 2: danh sách công việc (việc chính, ngay sau là các việc con của nó) ---
  r += 1;
  sheet.getCell(r, 1).value = 'DANH SÁCH CÔNG VIỆC';
  sheet.getCell(r, 1).font = { ...FONT, bold: true, size: 11 };
  r += 1;
  writeHeader(sheet, r, [
    'Công việc', 'Loại', 'Trạng thái', 'Độ ưu tiên', 'Hạn chót', 'Trễ hạn',
    'Người phụ trách', 'Thuộc việc cha', 'Mốc', 'Hoàn thành lúc', 'Làm lại (lần)',
  ]);
  r += 1;

  const ids = new Set(tasks.map((t) => t.id));
  const isChild = (t) => t.parentTaskId && ids.has(t.parentTaskId);
  const parents = tasks.filter((t) => !isChild(t));
  const ordered = [];
  parents.forEach((p) => {
    ordered.push(p);
    tasks.filter((t) => t.parentTaskId === p.id).forEach((c) => ordered.push(c));
  });

  ordered.forEach((t) => {
    const done = t.status === 'done';
    const late = !done && t.deadline && new Date(t.deadline) < today;
    const child = isChild(t);
    const row = sheet.getRow(r);
    const values = [
      t.title,
      child ? 'Việc con' : 'Việc chính',
      TASK_STATUS_LABEL[t.status] || t.status,
      PRIORITY_LABEL[t.priority] || t.priority,
      fmtDate(t.deadline),
      late ? 'Trễ' : '',
      t.assignee ? t.assignee.fullName : 'Chưa giao',
      child && t.parentTask ? t.parentTask.title : '',
      t.milestone ? t.milestone.title : '',
      done ? fmtDateTime(t.completedAt) : '', // completedAt không bị xóa khi việc bị làm lại, nên chỉ hiện khi đang ở "Hoàn thành"
      t.reopenCount || 0,
    ];
    values.forEach((v, c) => {
      const cell = row.getCell(c + 1);
      cell.value = v;
      styleCell(cell, {
        center: [1, 2, 3, 4, 5, 9, 10].includes(c),
        indent: c === 0 && child ? 2 : 0,
        font: c === 5 && late ? { bold: true, color: { argb: COLOR.late } } : c === 0 && !child ? { bold: true } : {},
        fill: c === 2 ? COLOR.taskStatus[t.status] : undefined,
      });
    });
    r += 1;
  });

  if (ordered.length === 0) {
    const cell = sheet.getCell(r, 1);
    cell.value = 'Nhóm chưa có công việc nào.';
    cell.font = { ...FONT, italic: true, color: { argb: 'FF475569' } };
  }

  return sheet;
};

// MỚI THÊM (tính năng 4): xuất 1 file Excel gồm sheet "Tổng hợp" (mỗi nhóm 1 dòng) và 1 sheet chi tiết cho TỪNG nhóm
// (đóng góp thành viên + danh sách công việc). Chỉ gồm các nhóm Giảng viên ĐÃ ĐỒNG Ý phụ trách (lọc quyền nằm trong
// getSupervisorOverview và getGroupContributions nên người ngoài không xem được nhóm nào). Trả về Buffer của file .xlsx
exports.exportAllGroups = async (userId) => {
  // Bắt buộc có userId: nếu undefined thì Prisma bỏ qua điều kiện và trả nhóm của người khác
  if (!userId) throw new AppError('Thiếu thông tin người dùng', 401);

  const overview = await supervisorService.getSupervisorOverview(userId);
  // Cùng thứ tự với trang tổng quan: nhóm có vấn đề lên đầu, cùng mức thì theo tên
  const groups = [...overview.groups].sort(
    (a, b) => GROUP_STATUS_RANK[a.status] - GROUP_STATUS_RANK[b.status] || a.name.localeCompare(b.name, 'vi')
  );
  if (groups.length === 0) throw new AppError('Bạn chưa phụ trách nhóm nào để xuất báo cáo', 400);

  const groupIds = groups.map((g) => g.id);
  const [allTasks, actor, contributions] = await Promise.all([
    exportRepository.findTasksDetail(groupIds),
    exportRepository.findUserName(userId),
    Promise.all(groups.map((g) => contributionService.getGroupContributions(g.id, userId))),
  ]);

  const today = startOfTodayVN();
  const used = new Set(['tổng hợp']); // tên sheet đã dùng (không phân biệt hoa thường)
  const sheetNames = groups.map((g) => makeSheetName(g.name, used));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Quản lý đồ án';
  wb.created = new Date();

  // Số thành viên mỗi nhóm = số dòng thành viên trong bảng đóng góp
  buildSummarySheet(wb, groups, sheetNames, contributions.map((c) => c.members.length), actor ? actor.fullName : '', overview.idleThresholdDays);

  groups.forEach((g, i) => {
    const tasks = allTasks.filter((t) => t.groupId === g.id);
    buildGroupSheet(wb, sheetNames[i], g, contributions[i], tasks, today);
  });

  return wb.xlsx.writeBuffer();
};