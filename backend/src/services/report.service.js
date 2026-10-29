const ExcelJS = require('exceljs'); // Thư viện tạo file Excel - dự án đã dùng sẵn ở task.service.js
const groupRepository = require('../repositories/group.repository');
const taskRepository = require('../repositories/task.repository');
const commentRepository = require('../repositories/comment.repository'); // Lấy nhận xét của Giảng viên theo mốc và theo việc
const activityRepository = require('../repositories/activity.repository'); // Lấy lịch sử hoạt động cho sheet cuối
const taskService = require('./task.service'); // Dùng lại getGroupStats để số liệu KHỚP trang Thống kê
const milestoneService = require('./milestone.service'); // Dùng lại getTimeline để số liệu KHỚP trang Tiến độ theo mốc
const AppError = require('../utils/AppError');

const TZ = 'Asia/Ho_Chi_Minh'; // Múi giờ Việt Nam - mọi ngày giờ trong báo cáo đều hiển thị theo múi giờ này

// Bảng đổi mã trạng thái trong database sang chữ tiếng Việt hiển thị trong Excel
// "redo" (Làm lại) chuẩn bị sẵn cho trạng thái mới sau này; hiện chưa có task nào mang trạng thái này nên không ảnh hưởng
const STATUS_LABEL = { todo: 'Danh sách công việc', doing: 'Đang làm', redo: 'Làm lại', review: 'Kiểm định', done: 'Hoàn thành' }; // MỚI SỬA (Phiên 12)

// Màu nền ô "Trạng thái" để nhìn lướt là biết (xám = chưa làm, xanh dương = đang làm, cam = làm lại, xanh lá = xong)
const STATUS_FILL = { todo: 'FFEDEDED', doing: 'FFDCEBFA', redo: 'FFFFE3CC', review: 'FFE9DDFB', done: 'FFDDF3E0' }; // MỚI SỬA (Phiên 12): thêm màu tím nhạt cho Kiểm định

// Bảng đổi mã độ ưu tiên sang chữ tiếng Việt
const PRIORITY_LABEL = { low: 'Thấp', medium: 'Trung bình', high: 'Cao' };

// Tính tỉ lệ hoàn thành dạng số thập phân (0 -> 1) để Excel tự hiển thị thành % nhờ numFmt '0%'
const ratio = (done, total) => (total > 0 ? done / total : 0);

// Đổi 1 mốc thời gian thành CHỮ theo giờ Việt Nam.
// Lý do dùng chữ: ExcelJS ghi Date theo giờ UTC nên người xem sẽ thấy chậm 7 tiếng; ghi thành chữ thì luôn đúng.
const fmtDate = (value) =>
  value
    ? new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
    : '';
const fmtDateTime = (value) =>
  value
    ? new Intl.DateTimeFormat('vi-VN', {
        timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date(value))
    : '';

// 00:00 của HÔM NAY theo giờ Việt Nam (không phụ thuộc múi giờ của máy chủ)
const vnStartOfToday = () => {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date()); // dạng 2026-10-11
  return new Date(`${ymd}T00:00:00+07:00`);
};

// Tô màu và in đậm hàng tiêu đề của 1 sheet (màu coral của dự án, chữ trắng)
const styleHeaderRow = (row) => {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFC636B' } };
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  row.height = 28;
};

// Tạo sheet có hàng tiêu đề đã tô màu + cố định khi cuộn - dùng chung cho các sheet
const createSheet = (workbook, name, columns) => {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = columns;
  styleHeaderRow(sheet.getRow(1));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return sheet;
};

// Duyệt cây mốc để tạo bảng: id mốc -> đường dẫn đầy đủ dạng "Mốc cha > Mốc con"
const buildMilestonePathMap = (nodes, prefix = '', map = new Map()) => {
  nodes.forEach((node) => {
    const path = prefix ? `${prefix} > ${node.title}` : node.title;
    map.set(node.id, path);
    buildMilestonePathMap(node.children, path, map); // đệ quy xuống các mốc con
  });
  return map;
};

// Dàn phẳng cây mốc thành danh sách theo đúng thứ tự hiển thị (mốc cha rồi tới mốc con)
const flattenMilestones = (nodes, out = []) => {
  nodes.forEach((node) => {
    out.push(node);
    flattenMilestones(node.children, out);
  });
  return out;
};

// ===== Các hàm trang trí dùng chung cho sheet "Mốc", "Thành viên", "Công việc" =====
const PINK = 'FFFDE8E9';       // nền hàng tiêu đề nhóm (mốc gốc / tên thành viên)
const PINK_LIGHT = 'FFFEF4F4'; // nền mốc con
const GRAY = 'FFF2F2F2';       // nền hàng tiêu đề cột phụ
const THIN = { style: 'thin', color: { argb: 'FFDDDDDD' } };

const fillCell = (cell, argb) => {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
};

// Tô nền + kẻ viền mảnh cho các ô từ cột 1 đến cột "count" của 1 hàng
const paintRow = (row, count, argb) => {
  for (let c = 1; c <= count; c++) {
    const cell = row.getCell(c);
    if (argb) fillCell(cell, argb);
    cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
  }
};

// Kẻ viền cho hàng dữ liệu thường (không tô nền)
const boxRow = (row, count) => paintRow(row, count, null);

// Tô màu riêng cho ô trạng thái
const paintStatus = (cell, status) => {
  if (STATUS_FILL[status]) fillCell(cell, STATUS_FILL[status]);
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
};

// Tô đỏ nhạt ô "Trễ hạn" khi có trễ
const paintLate = (cell) => {
  if (cell.value) {
    fillCell(cell, 'FFFFD6D6');
    cell.font = { bold: true, color: { argb: 'FFC00000' } };
  }
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
};

// Hàng tiêu đề cột phụ (nền xám, in đậm) - dùng bên trong sheet có nhiều khối
const subHeader = (sheet, labels) => {
  const row = sheet.addRow(labels);
  row.font = { bold: true };
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  paintRow(row, labels.length, GRAY);
  return row;
};

// Tạo báo cáo tiến độ của 1 nhóm, trả về workbook để Controller ghi ra response
// actorId: người gọi API - dùng để kiểm tra quyền XEM nhóm (thành viên hoặc Giảng viên đã đồng ý)
// MỚI SỬA: báo cáo gộp từ 9 xuống 5 sheet: Tổng quan, Mốc, Thành viên, Công việc, Lịch sử hoạt động
// (nhận xét của Giảng viên không còn sheet riêng: nằm ở cột "Nhận xét của giảng viên" của sheet Mốc và sheet Công việc)
exports.generateProgressReport = async (groupId, actorId) => {
  // getGroupStats tự kiểm tra quyền (401/403) nên gọi ĐẦU TIÊN - người ngoài nhóm bị chặn ngay, không đọc thêm dữ liệu nào
  const stats = await taskService.getGroupStats(groupId, actorId);

  const group = await groupRepository.findById(groupId);
  if (!group) throw new AppError('Nhóm không tồn tại', 404);

  // Cây mốc (đã có sẵn % đệ quy gộp cả mốc con, giống trang Timeline)
  const timeline = await milestoneService.getTimeline(groupId, actorId);

  // Chỉ tính thành viên ĐÃ THAM GIA (ACCEPTED), bỏ người còn đang chờ chấp nhận lời mời
  const allMembers = await groupRepository.getMembers(groupId);
  const members = allMembers.filter((m) => m.status === 'ACCEPTED');
  const nameById = new Map(allMembers.map((m) => [m.userId, m.user.fullName]));

  // Danh sách Giảng viên đã đồng ý - để lọc nhận xét của Giảng viên
  const supervisors = await groupRepository.getAcceptedSupervisors(groupId);
  const supervisorIds = new Set(supervisors.map((s) => s.userId));

  // findByGroup chỉ trả task cấp cao (kèm subtasks[]), nên "dàn phẳng" để đếm cả việc con
  const topTasks = await taskRepository.findByGroup(groupId);
  const tasks = topTasks.flatMap((t) => [
    { ...t, isSub: false, parentTitle: '' },
    ...(t.subtasks || []).map((s) => ({ ...s, isSub: true, parentTitle: t.title, tags: t.tags || [] })),
  ]);

  // Mốc "hôm nay" 00:00 GIỜ VIỆT NAM - công việc có deadline trước mốc này mà chưa xong là TRỄ HẠN
  const today = vnStartOfToday();
  const lateDays = new Map(); // id task trễ hạn -> số ngày trễ
  tasks.forEach((t) => {
    if (t.status !== 'done' && t.deadline && new Date(t.deadline) < today) {
      lateDays.set(t.id, Math.ceil((today - new Date(t.deadline)) / (24 * 60 * 60 * 1000)));
    }
  });
  const lateText = (t) => (lateDays.has(t.id) ? `Trễ ${lateDays.get(t.id)} ngày` : '');

  const milestonePathMap = buildMilestonePathMap(timeline);
  const flatMilestones = flattenMilestones(timeline);

  // MỚI THÊM: Nhận xét của Giảng viên (chỉ lấy người là Giảng viên ĐÃ ĐỒNG Ý của nhóm), gom thành 1 đoạn chữ cho mỗi mốc / mỗi việc
  // Mỗi nhận xét 1 dòng dạng "Tên giảng viên (giờ): nội dung"; chạy song song để không phải chờ từng truy vấn
  const supervisorNotes = (list) =>
    list
      .filter((c) => supervisorIds.has(c.authorId))
      .map((c) => `${c.author?.fullName || 'Không rõ'} (${fmtDateTime(c.createdAt)}): ${c.content}`)
      .join('\n');
  const taskComments = await Promise.all(tasks.map((t) => commentRepository.findByTask(t.id)));
  const taskNoteById = new Map(tasks.map((t, i) => [t.id, supervisorNotes(taskComments[i])]));
  const milestoneComments = await Promise.all(flatMilestones.map((n) => commentRepository.findByMilestone(n.id)));
  const milestoneNoteById = new Map(flatMilestones.map((n, i) => [n.id, supervisorNotes(milestoneComments[i])]));

  // Các hàm đổi dữ liệu 1 task thành chữ, dùng chung cho nhiều sheet
  const assigneeName = (t) => (t.assignedTo ? nameById.get(t.assignedTo) || 'Không rõ' : 'Chưa giao');
  const milestoneName = (t) => (t.milestoneId ? milestonePathMap.get(t.milestoneId) || '' : 'Không thuộc mốc nào');
  const kindLabel = (t) => (t.isSub ? 'Việc con' : 'Việc chính');
  const tagsText = (t) => (t.tags || []).map((tag) => tag.name).join(', ');
  // Ngày hoàn thành gần nhất; "lần đầu" chưa có dữ liệu riêng thì dùng tạm ngày gần nhất
  const lastDone = (t) => fmtDateTime(t.completedAt);
  const firstDone = (t) => fmtDateTime(t.firstCompletedAt || t.completedAt);

  // Đếm số việc theo từng trạng thái cho 1 danh sách task
  const countBy = (list) => ({
    total: list.length,
    todo: list.filter((t) => t.status === 'todo').length,
    doing: list.filter((t) => t.status === 'doing').length,
    redo: list.filter((t) => t.status === 'redo').length,
    review: list.filter((t) => t.status === 'review').length, // MỚI THÊM (Phiên 12)
    done: list.filter((t) => t.status === 'done').length,
    late: list.filter((t) => lateDays.has(t.id)).length,
  });

  const workbook = new ExcelJS.Workbook();

  // ===== SHEET 1: Tổng quan =====
  const overview = workbook.addWorksheet('Tổng quan');
  overview.columns = [
    { key: 'label', width: 34 },
    { key: 'value', width: 28 },
  ];

  overview.addRow([`Báo cáo tiến độ: ${group.name}`]);
  overview.getRow(1).font = { bold: true, size: 14 };
  overview.addRow([]); // dòng trống ngăn cách

  overview.addRow(['Ngày xuất báo cáo', fmtDateTime(new Date())]);
  overview.addRow(['Tổng số công việc (gồm việc con)', stats.total]);
  overview.addRow(['Danh sách công việc', stats.todo]); // MỚI SỬA (Phiên 12): đổi tên từ "Chưa làm"
  overview.addRow(['Đang làm', stats.doing]);
  overview.addRow(['Làm lại', stats.redo || 0]);
  overview.addRow(['Kiểm định', stats.review || 0]); // MỚI THÊM (Phiên 12)
  overview.addRow(['Hoàn thành', stats.done]);
  const percentRow = overview.addRow(['Tiến độ hoàn thành', ratio(stats.done, stats.total)]);
  percentRow.getCell(2).numFmt = '0%'; // lấy theo hàng vừa thêm, không viết cứng địa chỉ ô
  overview.addRow(['Số công việc trễ hạn', lateDays.size]);
  overview.addRow(['Tổng số lần làm lại', tasks.reduce((sum, t) => sum + (t.reopenCount || 0), 0)]);
  overview.addRow(['Số thành viên', members.length]);

  for (let r = 3; r <= overview.rowCount; r++) {
    overview.getCell(`A${r}`).font = { bold: true };
    overview.getCell(`B${r}`).alignment = { horizontal: 'left' };
  }

  // ===== SHEET 2: Mốc =====
  // Mỗi mốc 1 dòng đậm (mốc con thụt vào, nền nhạt hơn) kèm số liệu + tiến độ + nhận xét của Giảng viên,
  // ngay dưới là các công việc GÁN TRỰC TIẾP vào mốc đó
  const milestoneSheet = createSheet(workbook, 'Mốc', [
    { header: 'Mốc / Công việc', key: 'name', width: 48 },
    { header: 'Hạn', key: 'dueDate', width: 14 },
    { header: 'Loại', key: 'kind', width: 12 },
    { header: 'Người phụ trách', key: 'assignee', width: 24 },
    { header: 'Trạng thái', key: 'status', width: 14 },
    { header: 'Trễ hạn', key: 'late', width: 14 },
    { header: 'Tổng việc', key: 'total', width: 11 },
    { header: 'Đã xong', key: 'done', width: 11 },
    { header: 'Tiến độ', key: 'percent', width: 11 },
    { header: 'Nhận xét của giảng viên', key: 'note', width: 60 }, // MỚI THÊM
  ]);
  const MS_COLS = 10;

  // Ghi các dòng công việc nằm dưới 1 mốc (level = cấp của mốc, việc thụt thêm 1 cấp)
  const addTaskRowsUnder = (sheet, list, level) => {
    list.forEach((t) => {
      const row = sheet.addRow({
        name: t.title,
        dueDate: fmtDate(t.deadline),
        kind: kindLabel(t),
        assignee: assigneeName(t),
        status: STATUS_LABEL[t.status] || t.status,
        late: lateText(t),
        note: taskNoteById.get(t.id) || '', // MỚI THÊM: nhận xét của Giảng viên trên việc này
      });
      boxRow(row, MS_COLS);
      row.getCell('name').alignment = { indent: level + 1, vertical: 'middle' };
      row.getCell('note').alignment = { wrapText: true, vertical: 'top' };
      paintStatus(row.getCell('status'), t.status);
      paintLate(row.getCell('late'));
    });
  };

  const addMilestoneBlock = (node, level) => {
    const head = milestoneSheet.addRow({
      name: node.title,
      dueDate: fmtDate(node.dueDate),
      kind: 'Mốc',
      total: node.taskCount,
      done: node.doneCount,
      percent: ratio(node.doneCount, node.taskCount),
      note: milestoneNoteById.get(node.id) || '', // MỚI THÊM: nhận xét của Giảng viên trên mốc
    });
    head.font = { bold: true };
    paintRow(head, MS_COLS, level === 0 ? PINK : PINK_LIGHT);
    head.getCell('name').alignment = { indent: level, vertical: 'middle' };
    head.getCell('percent').numFmt = '0%';
    ['dueDate', 'kind', 'total', 'done', 'percent'].forEach((k) => {
      head.getCell(k).alignment = { horizontal: 'center', vertical: 'middle' };
    });
    head.getCell('note').alignment = { wrapText: true, vertical: 'top' };

    addTaskRowsUnder(milestoneSheet, tasks.filter((t) => t.milestoneId === node.id), level);
    node.children.forEach((child) => addMilestoneBlock(child, level + 1));
  };
  timeline.forEach((node) => addMilestoneBlock(node, 0));

  // Khối cuối: các việc không thuộc mốc nào
  const noMilestoneTasks = tasks.filter((t) => !t.milestoneId);
  const noMs = countBy(noMilestoneTasks);
  const noMsHead = milestoneSheet.addRow({
    name: 'Không thuộc mốc nào',
    kind: 'Nhóm riêng',
    total: noMs.total,
    done: noMs.done,
    percent: ratio(noMs.done, noMs.total),
  });
  noMsHead.font = { bold: true, italic: true };
  paintRow(noMsHead, MS_COLS, GRAY);
  noMsHead.getCell('percent').numFmt = '0%';
  ['kind', 'total', 'done', 'percent'].forEach((k) => {
    noMsHead.getCell(k).alignment = { horizontal: 'center', vertical: 'middle' };
  });
  addTaskRowsUnder(milestoneSheet, noMilestoneTasks, 0);

  // ===== SHEET 3: Thành viên =====
  // Phần 1: bảng TỔNG HỢP (mỗi người 1 dòng, có số liệu từng trạng thái)
  // Phần 2: CHI TIẾT từng người (khung tên + danh sách công việc được giao)
  // Sheet này có nhiều khối nên KHÔNG cố định hàng tiêu đề
  const memberSheet = workbook.addWorksheet('Thành viên');
  memberSheet.columns = [
    { key: 'a', width: 42 },
    { key: 'b', width: 14 },
    { key: 'c', width: 30 },
    { key: 'd', width: 13 },
    { key: 'e', width: 13 },
    { key: 'f', width: 14 },
    { key: 'g', width: 14 },
    { key: 'h', width: 20 },
    { key: 'i', width: 14 },
    { key: 'j', width: 14 }, // MỚI THÊM (Phiên 12): thêm 1 cột cho "Kiểm định"
  ];
  const MB_COLS = 10; // MỚI SỬA (Phiên 12): 9 -> 10 cột

  const title1 = memberSheet.addRow(['TỔNG HỢP ĐÓNG GÓP']);
  title1.font = { bold: true, size: 13 };
  title1.height = 24;

  const sumHeader = memberSheet.addRow([
    'Thành viên', 'Vai trò', 'Tổng được giao', 'Danh sách công việc', 'Đang làm', 'Làm lại', 'Kiểm định', 'Hoàn thành', 'Trễ hạn', 'Tiến độ',
  ]);
  styleHeaderRow(sumHeader);
  paintRow(sumHeader, MB_COLS, 'FFFC636B');

  // Thêm 1 dòng tổng hợp cho 1 danh sách task (1 thành viên, nhóm "chưa giao", hoặc cả nhóm)
  const addSummaryRow = (label, roleText, list, italic = false) => {
    const c = countBy(list);
    const row = memberSheet.addRow([label, roleText, c.total, c.todo, c.doing, c.redo, c.review, c.done, c.late, ratio(c.done, c.total)]);
    boxRow(row, MB_COLS);
    row.getCell(10).numFmt = '0%'; // MỚI SỬA (Phiên 12): cột Tiến độ giờ là cột 10
    for (let col = 2; col <= MB_COLS; col++) row.getCell(col).alignment = { horizontal: 'center', vertical: 'middle' };
    if (italic) row.font = { italic: true };
    if (c.late > 0) paintLate(row.getCell(9)); // MỚI SỬA (Phiên 12): cột Trễ hạn giờ là cột 9
    return row;
  };

  const roleLabel = (m) => (m.role === 'leader' ? 'Trưởng nhóm' : 'Thành viên');
  members.forEach((m) => addSummaryRow(m.user.fullName, roleLabel(m), tasks.filter((t) => t.assignedTo === m.userId)));
  const unassignedTasks = tasks.filter((t) => !t.assignedTo);
  addSummaryRow('Chưa giao cho ai', '', unassignedTasks, true);
  const totalRow = addSummaryRow('Cả nhóm', '', tasks);
  totalRow.font = { bold: true };
  paintRow(totalRow, MB_COLS, PINK);

  memberSheet.addRow([]);
  memberSheet.addRow([]);
  const title2 = memberSheet.addRow(['CHI TIẾT TỪNG THÀNH VIÊN']);
  title2.font = { bold: true, size: 13 };
  title2.height = 24;
  memberSheet.addRow([]);

  // 1 khối chi tiết: khung tên (kèm tóm tắt) + hàng tiêu đề cột phụ + các dòng công việc
  const addMemberBlock = (label, roleText, list) => {
    const c = countBy(list);
    const banner = memberSheet.addRow([
      label,
      roleText,
      list.length === 0
        ? 'Chưa được giao công việc nào'
        : `Giao ${c.total} · Xong ${c.done} · Đang làm ${c.doing} · Làm lại ${c.redo} · Kiểm định ${c.review} · Trễ ${c.late}`,
    ]);
    banner.font = { bold: true };
    banner.height = 22;
    paintRow(banner, MB_COLS, PINK);
    banner.alignment = { vertical: 'middle' };
    memberSheet.mergeCells(banner.number, 3, banner.number, MB_COLS); // gộp ô tóm tắt cho khỏi bị cắt chữ

    if (list.length > 0) {
      subHeader(memberSheet, [
        'Công việc', 'Loại', 'Mốc', 'Deadline', 'Độ ưu tiên', 'Trạng thái', 'Trễ hạn', 'Hoàn thành gần nhất', 'Số lần làm lại',
      ]);
      list.forEach((t) => {
        const row = memberSheet.addRow([
          t.title,
          kindLabel(t),
          milestoneName(t),
          fmtDate(t.deadline),
          PRIORITY_LABEL[t.priority] || t.priority,
          STATUS_LABEL[t.status] || t.status,
          lateText(t),
          lastDone(t),
          t.reopenCount || 0,
        ]);
        boxRow(row, MB_COLS);
        row.getCell(1).alignment = { indent: 1, vertical: 'middle', wrapText: true };
        row.getCell(3).alignment = { vertical: 'middle', wrapText: true };
        [2, 4, 5, 8, 9].forEach((col) => {
          row.getCell(col).alignment = { horizontal: 'center', vertical: 'middle' };
        });
        paintStatus(row.getCell(6), t.status);
        paintLate(row.getCell(7));
      });
    }
    memberSheet.addRow([]); // dòng trống ngăn giữa các thành viên
  };

  members.forEach((m) => addMemberBlock(m.user.fullName, roleLabel(m), tasks.filter((t) => t.assignedTo === m.userId)));
  if (unassignedTasks.length > 0) addMemberBlock('Chưa giao cho ai', '', unassignedTasks);

  // ===== SHEET 4: Công việc =====
  // Tất cả công việc (kể cả việc con) trên 1 bảng; dùng bộ lọc ở hàng tiêu đề để xem riêng task trễ hạn / theo người / theo trạng thái
  const allTasks = createSheet(workbook, 'Công việc', [
    { header: 'Công việc', key: 'title', width: 36 },
    { header: 'Loại', key: 'kind', width: 12 },
    { header: 'Thuộc việc chính', key: 'parent', width: 28 },
    { header: 'Mô tả', key: 'description', width: 40 },
    { header: 'Người phụ trách', key: 'assignee', width: 24 },
    { header: 'Người tạo', key: 'creator', width: 22 },
    { header: 'Mốc', key: 'milestone', width: 32 },
    { header: 'Nhãn', key: 'tags', width: 20 },
    { header: 'Độ ưu tiên', key: 'priority', width: 13 },
    { header: 'Trạng thái', key: 'status', width: 14 },
    { header: 'Deadline', key: 'deadline', width: 14 },
    { header: 'Trễ hạn', key: 'late', width: 14 },
    { header: 'Hoàn thành lần đầu', key: 'firstDone', width: 20 },
    { header: 'Hoàn thành gần nhất', key: 'lastDone', width: 20 },
    { header: 'Số lần làm lại', key: 'reopen', width: 13 },
    { header: 'Nhận xét của giảng viên', key: 'note', width: 60 }, // MỚI THÊM
    { header: 'Ngày tạo', key: 'createdAt', width: 18 },
    { header: 'Cập nhật gần nhất', key: 'updatedAt', width: 18 },
  ]);
  allTasks.autoFilter = { from: 'A1', to: 'R1' }; // bộ lọc trên hàng tiêu đề (18 cột A -> R)

  tasks.forEach((t) => {
    const row = allTasks.addRow({
      title: t.title,
      kind: kindLabel(t),
      parent: t.parentTitle,
      description: t.description || '',
      assignee: assigneeName(t),
      creator: t.creator?.fullName || (t.createdBy ? nameById.get(t.createdBy) || '' : ''),
      milestone: milestoneName(t),
      tags: tagsText(t),
      priority: PRIORITY_LABEL[t.priority] || t.priority,
      status: STATUS_LABEL[t.status] || t.status,
      deadline: fmtDate(t.deadline),
      late: lateText(t),
      firstDone: firstDone(t),
      lastDone: lastDone(t),
      reopen: t.reopenCount || 0,
      note: taskNoteById.get(t.id) || '',
      createdAt: fmtDateTime(t.createdAt),
      updatedAt: fmtDateTime(t.updatedAt),
    });
    paintStatus(row.getCell('status'), t.status);
    paintLate(row.getCell('late'));
  });
  allTasks.getColumn('description').alignment = { wrapText: true, vertical: 'top' };
  allTasks.getColumn('note').alignment = { wrapText: true, vertical: 'top' };

  // ===== SHEET 5: Lịch sử hoạt động =====
  // Mới nhất trước, tối đa 2000 dòng gần nhất
  const activitySheet = createSheet(workbook, 'Lịch sử hoạt động', [
    { header: 'Thời gian', key: 'time', width: 18 },
    { header: 'Người thực hiện', key: 'actor', width: 24 },
    { header: 'Hoạt động', key: 'summary', width: 80 },
  ]);
  const activities = await activityRepository.findRecentByGroup(groupId);
  if (activities.length === 0) {
    activitySheet.addRow({ time: 'Chưa có hoạt động nào được ghi lại' });
  } else {
    activities.forEach((a) => {
      activitySheet.addRow({
        time: fmtDateTime(a.createdAt),
        actor: a.actor?.fullName || 'Không rõ',
        summary: a.summary,
      });
    });
  }

  return workbook;
};


// ===== MỚI THÊM: BÁO CÁO RIÊNG THEO MỐC (nút "Xuất Excel" ở tab Tiến độ theo mốc) =====
// Gọn hơn báo cáo tiến độ đầy đủ: chỉ 2 sheet - "Tổng quan mốc" (mỗi mốc 1 dòng) và "Chi tiết mốc" (mốc kèm công việc bên dưới)
// Dùng cùng nguồn dữ liệu với trang Tiến độ theo mốc nên con số khớp 100%
exports.generateMilestoneReport = async (groupId, actorId) => {
  // getTimeline tự kiểm tra quyền XEM nhóm (thành viên hoặc Giảng viên đã đồng ý) nên gọi ĐẦU TIÊN
  const timeline = await milestoneService.getTimeline(groupId, actorId);

  const group = await groupRepository.findById(groupId);
  if (!group) throw new AppError('Nhóm không tồn tại', 404);

  const allMembers = await groupRepository.getMembers(groupId);
  const nameById = new Map(allMembers.map((m) => [m.userId, m.user.fullName]));
  const supervisors = await groupRepository.getAcceptedSupervisors(groupId);
  const supervisorIds = new Set(supervisors.map((s) => s.userId));

  const topTasks = await taskRepository.findByGroup(groupId);
  const tasks = topTasks.flatMap((t) => [
    { ...t, isSub: false },
    ...(t.subtasks || []).map((s) => ({ ...s, isSub: true })),
  ]);

  const today = vnStartOfToday();
  const lateIds = new Set(
    tasks
      .filter((t) => t.status !== 'done' && t.deadline && new Date(t.deadline) < today)
      .map((t) => t.id)
  );
  const lateText = (t) => (lateIds.has(t.id) ? 'Trễ hạn' : '');

  const flatMilestones = flattenMilestones(timeline);

  // Nhận xét của Giảng viên: mỗi nhận xét 1 dòng "Tên (giờ): nội dung"
  const supervisorNotes = (list) =>
    list
      .filter((c) => supervisorIds.has(c.authorId))
      .map((c) => `${c.author?.fullName || 'Không rõ'} (${fmtDateTime(c.createdAt)}): ${c.content}`)
      .join('\n');
  const milestoneComments = await Promise.all(flatMilestones.map((n) => commentRepository.findByMilestone(n.id)));
  const milestoneNoteById = new Map(flatMilestones.map((n, i) => [n.id, supervisorNotes(milestoneComments[i])]));

  const assigneeName = (t) => (t.assignedTo ? nameById.get(t.assignedTo) || 'Không rõ' : 'Chưa giao');
  const kindLabel = (t) => (t.isSub ? 'Việc con' : 'Việc chính');

  // Trạng thái của 1 mốc - cùng luật với huy hiệu trên trang web
  const milestoneStatus = (node) => {
    if (node.percent === 100 && node.taskCount > 0) return 'Hoàn thành';
    if (node.dueDate && node.percent !== 100 && new Date(node.dueDate) < today) return 'Trễ hạn';
    if (node.percent > 0) return 'Đang thực hiện';
    return 'Chưa bắt đầu';
  };
  const MS_STATUS_FILL = {
    'Hoàn thành': 'FFDDF3E0',
    'Trễ hạn': 'FFFFD6D6',
    'Đang thực hiện': 'FFDCEBFA',
    'Chưa bắt đầu': 'FFEDEDED',
  };

  // Số việc TRỄ HẠN trong 1 mốc, tính gộp cả các mốc con bên trong
  const lateCountOf = (node) => {
    const ids = new Set(flattenMilestones([node]).map((n) => n.id));
    return tasks.filter((t) => t.milestoneId && ids.has(t.milestoneId) && lateIds.has(t.id)).length;
  };

  const workbook = new ExcelJS.Workbook();

  // ===== SHEET 1: Tổng quan mốc =====
  const totalDone = tasks.filter((t) => t.status === 'done').length;
  const sheet1 = createSheet(workbook, 'Tổng quan mốc', [
    { header: 'Mốc', key: 'name', width: 48 },
    { header: 'Hạn', key: 'due', width: 14 },
    { header: 'Trạng thái', key: 'status', width: 18 },
    { header: 'Tổng việc', key: 'total', width: 11 },
    { header: 'Đã xong', key: 'done', width: 11 },
    { header: 'Tiến độ', key: 'percent', width: 11 },
    { header: 'Việc trễ hạn', key: 'late', width: 13 },
    { header: 'Nhận xét của giảng viên', key: 'note', width: 60 },
  ]);
  const S1_COLS = 8;

  // Mỗi mốc 1 dòng (mốc gốc đậm + nền hồng nhạt, mốc con thụt vào theo cấp)
  const addMilestoneSummary = (node, level) => {
    const status = milestoneStatus(node);
    const row = sheet1.addRow({
      name: node.title,
      due: fmtDate(node.dueDate),
      status,
      total: node.taskCount,
      done: node.doneCount,
      percent: ratio(node.doneCount, node.taskCount),
      late: lateCountOf(node) || '',
      note: milestoneNoteById.get(node.id) || '',
    });
    row.font = { bold: level === 0 };
    paintRow(row, S1_COLS, level === 0 ? PINK : null);
    row.getCell('name').alignment = { indent: level, vertical: 'middle' };
    row.getCell('percent').numFmt = '0%';
    ['due', 'status', 'total', 'done', 'percent', 'late'].forEach((k) => {
      row.getCell(k).alignment = { horizontal: 'center', vertical: 'middle' };
    });
    fillCell(row.getCell('status'), MS_STATUS_FILL[status]);
    paintLate(row.getCell('late'));
    row.getCell('note').alignment = { wrapText: true, vertical: 'top' };
    node.children.forEach((child) => addMilestoneSummary(child, level + 1));
  };
  timeline.forEach((node) => addMilestoneSummary(node, 0));

  // Dòng tổng cả dự án ở cuối bảng
  const sumRow = sheet1.addRow({
    name: `TỔNG CẢ DỰ ÁN - ${group.name}`,
    due: '',
    status: '',
    total: tasks.length,
    done: totalDone,
    percent: ratio(totalDone, tasks.length),
    late: lateIds.size || '',
    note: `Xuất ngày ${fmtDateTime(new Date())}`,
  });
  sumRow.font = { bold: true };
  paintRow(sumRow, S1_COLS, GRAY);
  sumRow.getCell('percent').numFmt = '0%';
  ['total', 'done', 'percent', 'late'].forEach((k) => {
    sumRow.getCell(k).alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // ===== SHEET 2: Chi tiết mốc =====
  const detail = createSheet(workbook, 'Chi tiết mốc', [
    { header: 'Mốc / Công việc', key: 'name', width: 48 },
    { header: 'Hạn', key: 'due', width: 14 },
    { header: 'Loại', key: 'kind', width: 12 },
    { header: 'Người phụ trách', key: 'assignee', width: 24 },
    { header: 'Trạng thái', key: 'status', width: 14 },
    { header: 'Trễ hạn', key: 'late', width: 12 },
    { header: 'Tổng việc', key: 'total', width: 11 },
    { header: 'Đã xong', key: 'done', width: 11 },
    { header: 'Tiến độ', key: 'percent', width: 11 },
  ]);
  const D_COLS = 9;

  const addTaskRows = (list, level) => {
    list.forEach((t) => {
      const row = detail.addRow({
        name: t.title,
        due: fmtDate(t.deadline),
        kind: kindLabel(t),
        assignee: assigneeName(t),
        status: STATUS_LABEL[t.status] || t.status,
        late: lateText(t),
      });
      boxRow(row, D_COLS);
      row.getCell('name').alignment = { indent: level + 1, vertical: 'middle' };
      paintStatus(row.getCell('status'), t.status);
      paintLate(row.getCell('late'));
    });
  };

  const addDetailBlock = (node, level) => {
    const head = detail.addRow({
      name: node.title,
      due: fmtDate(node.dueDate),
      kind: 'Mốc',
      total: node.taskCount,
      done: node.doneCount,
      percent: ratio(node.doneCount, node.taskCount),
    });
    head.font = { bold: true };
    paintRow(head, D_COLS, level === 0 ? PINK : PINK_LIGHT);
    head.getCell('name').alignment = { indent: level, vertical: 'middle' };
    head.getCell('percent').numFmt = '0%';
    ['due', 'kind', 'total', 'done', 'percent'].forEach((k) => {
      head.getCell(k).alignment = { horizontal: 'center', vertical: 'middle' };
    });
    addTaskRows(tasks.filter((t) => t.milestoneId === node.id), level);
    node.children.forEach((child) => addDetailBlock(child, level + 1));
  };
  timeline.forEach((node) => addDetailBlock(node, 0));

  const noMs = tasks.filter((t) => !t.milestoneId);
  if (noMs.length > 0) {
    const done = noMs.filter((t) => t.status === 'done').length;
    const head = detail.addRow({
      name: 'Không thuộc mốc nào',
      kind: 'Nhóm riêng',
      total: noMs.length,
      done,
      percent: ratio(done, noMs.length),
    });
    head.font = { bold: true, italic: true };
    paintRow(head, D_COLS, GRAY);
    head.getCell('percent').numFmt = '0%';
    ['kind', 'total', 'done', 'percent'].forEach((k) => {
      head.getCell(k).alignment = { horizontal: 'center', vertical: 'middle' };
    });
    addTaskRows(noMs, 0);
  }

  return workbook;
};