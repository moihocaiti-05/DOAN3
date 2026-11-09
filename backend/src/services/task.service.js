const milestoneRepository = require('../repositories/milestone.repository');
const notificationService = require('./notification.service');
const taskRepository = require('../repositories/task.repository');
const groupRepository = require('../repositories/group.repository');
const activityService = require('./activity.service'); // MỚI THÊM: ghi lịch sử hoạt động của nhóm
const AppError = require('../utils/AppError');
const ExcelJS = require('exceljs');

// MỚI THÊM: chữ hiển thị của trạng thái - dùng trong câu mô tả lịch sử hoạt động
const STATUS_TEXT = { todo: 'Danh sách công việc', doing: 'Đang làm', redo: 'Làm lại', review: 'Kiểm định', done: 'Hoàn thành' }; // MỚI SỬA (Phiên 12): cột đầu đổi tên + thêm "Kiểm định"

// MỚI THÊM: lấy họ tên 1 thành viên trong nhóm - dùng cho câu mô tả lịch sử (VD "đã giao ... cho An")
const getMemberName = async (groupId, userId) => {
  const members = await groupRepository.getMembers(groupId);
  const found = members.find((m) => m.userId === userId);
  return found ? found.user.fullName : 'một thành viên';
};

// MỚI THÊM: Kiểm tra người gọi API có phải thành viên ĐÃ ĐỒNG Ý của nhóm chứa task này không
// Dùng chung cho các thao tác GHI (đổi trạng thái, giao việc, sửa nội dung, sửa nhãn) - Giảng viên và người ngoài nhóm bị chặn 403
// Trưởng nhóm cũng là thành viên nên đi qua bình thường
const ensureTaskGroupMember = async (task, actorId) => {
  // Bắt buộc có actorId: nếu truyền undefined thì Prisma sẽ BỎ QUA điều kiện userId và vô tình khớp thành viên bất kỳ
  if (!actorId) throw new AppError('Thiếu thông tin người dùng', 401);
  const membership = await groupRepository.findMembership(actorId, task.groupId);
  if (!membership) {
    throw new AppError('Bạn không thuộc nhóm này', 403);
  }
};

// MỚI THÊM: Kiểm tra người gọi API có quyền XEM dữ liệu của 1 nhóm hay không (dùng cho các API ĐỌC)
// Được xem: thành viên ĐÃ ĐỒNG Ý, hoặc Giảng viên ĐÃ ĐỒNG Ý phụ trách nhóm. Người ngoài nhóm, người đang chờ (PENDING) hoặc đã từ chối (DECLINED) bị chặn 403
// Khác với ensureTaskGroupMember ở trên (chỉ cho thành viên, dùng cho thao tác GHI), hàm này CHO PHÉP thêm Giảng viên vì Giảng viên được xem nhưng không được sửa
const ensureCanViewGroup = async (userId, groupId) => {
  // Bắt buộc có userId: nếu undefined thì Prisma BỎ QUA điều kiện userId và vô tình khớp người bất kỳ trong nhóm
  if (!userId) throw new AppError('Thiếu thông tin người dùng', 401);
  if (!groupId) throw new AppError('Thiếu mã nhóm', 400);

  // Kiểm tra Giảng viên TRƯỚC vì tài khoản có thể vừa là thành viên vừa là Giảng viên của cùng 1 nhóm
  const supervisorship = await groupRepository.findSupervisorship(userId, groupId);
  if (supervisorship) return;

  const membership = await groupRepository.findMembership(userId, groupId);
  if (membership) return;

  throw new AppError('Bạn không có quyền xem dữ liệu của nhóm này', 403);
};

// MỚI THÊM: đổi deadline (chuỗi "2026-10-30" từ ô chọn ngày) thành đối tượng Date trước khi lưu.
// Prisma không nhận chuỗi ngày rút gọn, sẽ báo "Expected ISO-8601 DateTime". Dùng chung cho tạo Task và tạo Subtask.
//  - undefined: không gửi deadline -> Prisma bỏ qua
//  - chuỗi rỗng hoặc null: không có hạn -> lưu null
const parseDeadline = (deadline) => {
  if (deadline === undefined) return undefined;
  if (!deadline) return null;
  const value = new Date(deadline);
  if (Number.isNaN(value.getTime())) {
    throw new AppError('Deadline không hợp lệ', 400);
  }
  return value;
};

exports.createTask = async (taskData, creatorId) => {
  const { groupId, assignedTo, tagNames = [], deadline, ...restData } = taskData;

  const creatorMembership = await groupRepository.findMembership(creatorId, groupId);
  if (!creatorMembership) {
    throw new AppError('Bạn không thuộc nhóm này', 403);
  }

  if (assignedTo) {
    const assigneeMembership = await groupRepository.findMembership(assignedTo, groupId);
    if (!assigneeMembership) {
      throw new AppError('Người được giao không thuộc nhóm này', 400);
    }
  }

  const task = await taskRepository.createWithTags(
    { ...restData, deadline: parseDeadline(deadline), groupId, assignedTo, createdBy: creatorId },
    tagNames
  );

  if (assignedTo && assignedTo !== creatorId) {
    await notificationService.notify({
      userId: assignedTo,
      type: 'task_assigned',
      content: `Bạn được giao công việc mới: "${task.title}"`,
      groupId,
    });
  }

  // MỚI THÊM: ghi lịch sử hoạt động
  await activityService.log({
    groupId,
    actorId: creatorId,
    type: 'task.created',
    targetType: 'task',
    targetId: task.id,
    summary: `đã tạo công việc "${task.title}"`,
  });

  return task;
};

// MỚI SỬA: thêm tham số actorId (người gọi API) và kiểm tra quyền XEM nhóm trước khi trả danh sách task
// Trước đây hàm này trả task cho bất kỳ ai biết groupId (chỉ cần đăng nhập)
exports.getTasksByGroup = async (groupId, actorId) => {
  await ensureCanViewGroup(actorId, groupId);
  return taskRepository.findByGroup(groupId);
};

// ===== MỚI THÊM (Phiên 12): TRẠNG THÁI "KIỂM ĐỊNH" =====
// Luồng: Danh sách công việc -> Đang làm / Làm lại -> Kiểm định -> (duyệt) Hoàn thành. Từ chối thì về "Làm lại" kèm ghi chú.
// Người DUYỆT = Trưởng nhóm hoặc Giảng viên (đã đồng ý phụ trách nhóm). Thành viên thường không tự đưa việc CHÍNH sang "Hoàn thành" được.
// Việc CON (checklist) không cần Kiểm định, vẫn tick xong tự do như trước.
const VALID_STATUSES = ['todo', 'doing', 'redo', 'review', 'done'];

// Xác định VAI TRÒ của người gọi API đối với nhóm chứa task: 'leader' | 'member' | 'supervisor'; người ngoài nhóm bị chặn 403
const getActorRole = async (task, actorId) => {
  // Bắt buộc có actorId: nếu undefined thì Prisma BỎ QUA điều kiện userId và vô tình khớp người bất kỳ
  if (!actorId) throw new AppError('Thiếu thông tin người dùng', 401);
  const membership = await groupRepository.findMembership(actorId, task.groupId);
  if (membership) return membership.role === 'leader' ? 'leader' : 'member';
  const supervisorship = await groupRepository.findSupervisorship(actorId, task.groupId);
  if (supervisorship) return 'supervisor';
  throw new AppError('Bạn không thuộc nhóm này', 403);
};

// Tên người duyệt để ghi vào ghi chú từ chối (Giảng viên không nằm trong danh sách thành viên nên tra riêng)
const getReviewerName = async (groupId, userId, role) => {
  if (role === 'supervisor') {
    const supervisors = await groupRepository.getAcceptedSupervisors(groupId);
    const found = supervisors.find((s) => s.userId === userId);
    return found?.user?.fullName || 'Giảng viên';
  }
  return getMemberName(groupId, userId);
};

exports.updateTaskStatus = async (taskId, newStatus, actorId) => {
  if (!VALID_STATUSES.includes(newStatus)) throw new AppError('Trạng thái không hợp lệ', 400);

  const task = await taskRepository.findById(taskId);
  if (!task) throw new AppError('Task không tồn tại', 404);
  const role = await getActorRole(task, actorId);
  const isReviewer = role === 'leader' || role === 'supervisor';

  // Trạng thái không đổi thì không làm gì (không ghi đè ngày hoàn thành, không ghi lịch sử thừa)
  if (task.status === newStatus) return task;

  if (task.parentTaskId) {
    // Việc con: chỉ thành viên mới đổi được (Giảng viên chỉ xem), không áp luật Kiểm định
    if (role === 'supervisor') throw new AppError('Giảng viên không được sửa công việc con', 403);
  } else {
    // Việc chính: áp luật Kiểm định
    if (role === 'supervisor' && !(task.status === 'review' && newStatus === 'done')) {
      throw new AppError('Giảng viên chỉ được duyệt công việc đang ở trạng thái Kiểm định', 403);
    }
    if (newStatus === 'done' && !isReviewer) {
      throw new AppError('Công việc phải qua bước Kiểm định: hãy chuyển sang "Kiểm định" để Trưởng nhóm hoặc Giảng viên duyệt', 403);
    }
    if (task.status === 'review' && newStatus !== 'done' && !isReviewer) {
      throw new AppError('Công việc đang chờ duyệt, chỉ Trưởng nhóm hoặc Giảng viên mới đưa ra khỏi Kiểm định được', 403);
    }
    if (task.status === 'review' && newStatus === 'redo') {
      throw new AppError('Từ chối công việc cần có ghi chú lý do: hãy dùng nút "Từ chối" trong chi tiết công việc', 400);
    }
  }

  // Truyền thêm task cũ để Repository biết trạng thái trước đó (giữ ngày hoàn thành, đếm số lần làm lại, xóa ghi chú từ chối)
  const updatedTask = await taskRepository.updateStatus(taskId, newStatus, task);

  await activityService.log({
    groupId: task.groupId,
    actorId,
    type: 'task.status_changed',
    targetType: 'task',
    targetId: taskId,
    summary: `đã chuyển công việc "${task.title}" từ "${STATUS_TEXT[task.status] || task.status}" sang "${STATUS_TEXT[newStatus] || newStatus}"`,
  });

  // Nộp Kiểm định (việc chính): báo Trưởng nhóm biết có việc cần duyệt
  if (newStatus === 'review' && !task.parentTaskId) {
    const members = await groupRepository.getMembers(task.groupId);
    const actorName = await getMemberName(task.groupId, actorId);
    const leaders = members.filter((m) => m.role === 'leader' && m.status === 'ACCEPTED' && m.userId !== actorId);
    for (const leader of leaders) {
      await notificationService.notify({
        userId: leader.userId,
        type: 'task_assigned',
        content: `${actorName} đã nộp công việc "${task.title}" để Kiểm định`,
        groupId: task.groupId,
      });
    }
  }

  return updatedTask;
};

// MỚI THÊM (Phiên 12): Trưởng nhóm / Giảng viên DUYỆT hoặc TỪ CHỐI 1 việc đang ở "Kiểm định"
// decision: 'approve' (-> Hoàn thành) | 'reject' (-> Làm lại, BẮT BUỘC có ghi chú)
exports.reviewTask = async (taskId, decision, note, actorId) => {
  const task = await taskRepository.findById(taskId);
  if (!task) throw new AppError('Task không tồn tại', 404);

  const role = await getActorRole(task, actorId);
  if (role === 'member') throw new AppError('Chỉ Trưởng nhóm hoặc Giảng viên mới được duyệt công việc', 403);
  if (task.parentTaskId) throw new AppError('Công việc con không cần Kiểm định', 400);
  if (task.status !== 'review') throw new AppError('Công việc này không ở trạng thái Kiểm định', 400);

  const cleanNote = String(note || '').trim();
  const reviewerName = await getReviewerName(task.groupId, actorId, role);

  if (decision === 'approve') {
    const updated = await taskRepository.updateStatus(taskId, 'done', task);

    await activityService.log({
      groupId: task.groupId,
      actorId,
      type: 'task.reviewed',
      targetType: 'task',
      targetId: taskId,
      summary: `đã duyệt công việc "${task.title}" (Hoàn thành)`,
    });

    if (task.assignedTo && task.assignedTo !== actorId) {
      await notificationService.notify({
        userId: task.assignedTo,
        type: 'task_assigned',
        content: `Công việc "${task.title}" đã được duyệt: Hoàn thành`,
        groupId: task.groupId,
      });
    }
    return updated;
  }

  if (decision === 'reject') {
    if (!cleanNote) throw new AppError('Phải nhập ghi chú khi từ chối công việc', 400);
    const updated = await taskRepository.reject(taskId, cleanNote, reviewerName);

    await activityService.log({
      groupId: task.groupId,
      actorId,
      type: 'task.reviewed',
      targetType: 'task',
      targetId: taskId,
      summary: `đã từ chối công việc "${task.title}", yêu cầu làm lại: "${cleanNote.length > 120 ? `${cleanNote.slice(0, 120)}...` : cleanNote}"`,
    });

    if (task.assignedTo && task.assignedTo !== actorId) {
      await notificationService.notify({
        userId: task.assignedTo,
        type: 'task_assigned',
        content: `Công việc "${task.title}" bị từ chối, cần làm lại. Ghi chú: ${cleanNote}`,
        groupId: task.groupId,
      });
    }
    return updated;
  }

  throw new AppError('Quyết định không hợp lệ', 400);
};

// MỚI SỬA: đổi tham số cuối từ groupId (do client gửi lên, không đáng tin) thành actorId (người gọi API)
// groupId giờ được lấy từ CHÍNH task trong database, nên không thể gửi groupId của nhóm khác để vượt kiểm tra
exports.assignTask = async (taskId, assignedTo, actorId) => {
  const existingTask = await taskRepository.findById(taskId);
  if (!existingTask) throw new AppError('Task không tồn tại', 404);
  await ensureTaskGroupMember(existingTask, actorId);

  const membership = await groupRepository.findMembership(assignedTo, existingTask.groupId);
  if (!membership) {
    throw new AppError('Người được giao không thuộc nhóm này', 400);
  }
  const task = await taskRepository.updateAssignee(taskId, assignedTo);

  await notificationService.notify({
    userId: assignedTo,
    type: 'task_assigned',
    content: `Bạn được giao công việc: "${task.title}"`,
    groupId: existingTask.groupId,
  });

  // MỚI THÊM: ghi lịch sử hoạt động
  await activityService.log({
    groupId: existingTask.groupId,
    actorId,
    type: 'task.assigned',
    targetType: 'task',
    targetId: taskId,
    summary: `đã giao công việc "${task.title}" cho ${await getMemberName(existingTask.groupId, assignedTo)}`,
  });

  return task;
};

// Tìm (hoặc tạo mới nếu chưa có) 1 mốc theo ĐƯỜNG DẪN PHÂN CẤP, dùng riêng cho lúc Import Excel
const resolveMilestonePath = async (pathString, groupId, flatMilestones, createdMilestoneNames) => {
  const levelNames = String(pathString)
    .split('>')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  let parentId = null;
  let milestoneId = null;

  for (const levelName of levelNames) {
    let found = flatMilestones.find(
      (m) => m.parentId === parentId && m.title.toLowerCase().trim() === levelName.toLowerCase()
    );

    if (!found) {
      const siblingCount = flatMilestones.filter((m) => m.parentId === parentId).length;
      found = await milestoneRepository.create({
        title: levelName,
        groupId,
        parentId,
        order: siblingCount,
      });
      flatMilestones.push(found);
      createdMilestoneNames.push(levelName);
    }

    parentId = found.id;
    milestoneId = found.id;
  }

  return milestoneId;
};

// ---------- MỚI THÊM: đọc file Excel theo TIÊU ĐỀ CỘT (không còn phụ thuộc vị trí cột) ----------

// Lấy chữ từ 1 ô Excel. Ô email hay bị Excel tự đổi thành hyperlink ({text, hyperlink}),
// ô công thức là {result}, ô nhiều kiểu chữ là {richText} -> đều đổi về chuỗi thường.
const cellText = (v) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((p) => p.text).join('').trim();
    if (v.text !== undefined) return cellText(v.text);
    if (v.result !== undefined) return cellText(v.result);
    return '';
  }
  return String(v).trim();
};

// Chuẩn hóa tiêu đề: bỏ dấu, thường hóa, bỏ phần trong ngoặc ().
// VD "Độ ưu tiên (low/medium/high)" -> "do uu tien"
const normalizeHeader = (value) =>
  cellText(value)
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Mỗi cột chấp nhận nhiều tên tiêu đề (đã chuẩn hóa). Muốn thêm tên mới chỉ cần thêm vào đây.
const IMPORT_COLUMN_ALIASES = {
  title: ['ten cong viec', 'cong viec', 'ten task', 'task', 'tieu de'],
  description: ['mo ta'],
  email: ['email', 'email nguoi phu trach', 'nguoi phu trach', 'nguoi thuc hien', 'phu trach'],
  priority: ['do uu tien', 'uu tien', 'priority'],
  deadline: ['deadline', 'han chot', 'han hoan thanh', 'han'],
  milestone: ['ten moc', 'moc'],
  tags: ['nhan', 'tag', 'tags'],
  parent: ['thuoc cong viec cha', 'cong viec cha', 'viec cha'],
};

const IMPORT_REQUIRED_LABEL = 'Tên công việc';

// Dò dòng tiêu đề trong 10 dòng đầu. Trả về { headerRowNumber, columns } hoặc null nếu thiếu cột "Tên công việc"
const findImportHeader = (sheet) => {
  const lastRow = Math.min(10, sheet.rowCount);
  for (let r = 1; r <= lastRow; r++) {
    const columns = {};
    sheet.getRow(r).eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const key = normalizeHeader(cell.value);
      if (!key) return;
      for (const [field, aliases] of Object.entries(IMPORT_COLUMN_ALIASES)) {
        if (columns[field] === undefined && aliases.includes(key)) {
          columns[field] = colNumber;
          break;
        }
      }
    });
    if (columns.title !== undefined) return { headerRowNumber: r, columns };
  }
  return null;
};

// Ưu tiên sheet tên "Danh sách task" / "Danh sách công việc" / "Import"; không có thì lấy sheet ĐẦU TIÊN như trước
const pickImportSheet = (workbook) =>
  workbook.worksheets.find((ws) =>
    ['danh sach task', 'danh sach cong viec', 'import'].includes(normalizeHeader(ws.name))
  ) || workbook.worksheets[0];

// Đổi ô Deadline thành Date (UTC 00:00). Nhận: ô kiểu ngày, số serial Excel, yyyy-mm-dd, dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy
// Trả về: Date = hợp lệ | null = để trống | undefined = KHÔNG hợp lệ
const parseExcelDeadline = (raw) => {
  if (raw === null || raw === undefined || raw === '') return null;
  let v = raw;
  if (typeof v === 'object' && !(v instanceof Date)) v = v.result !== undefined ? v.result : v.text;
  if (v === null || v === undefined || v === '') return null;

  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v;

  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  const s = String(v).trim();
  if (!s) return null;

  let y;
  let mo;
  let d;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    y = Number(m[1]);
    mo = Number(m[2]);
    d = Number(m[3]);
  } else {
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (!m) return undefined;
    d = Number(m[1]);
    mo = Number(m[2]);
    y = Number(m[3]);
  }
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return undefined;
  return date;
};

// Độ ưu tiên: nhận low/medium/high và cả thấp / trung bình / cao. Không nhận ra -> medium như cũ
const PRIORITY_MAP = {
  low: 'low',
  thap: 'low',
  medium: 'medium',
  'trung binh': 'medium',
  high: 'high',
  cao: 'high',
};
const parsePriority = (raw) => PRIORITY_MAP[normalizeHeader(raw)] || 'medium';

exports.importTasksFromExcel = async (filePath, groupId, creatorId) => {
  const creatorMembership = await groupRepository.findMembership(creatorId, groupId);
  if (!creatorMembership) {
    throw new AppError('Bạn không thuộc nhóm này', 403);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = pickImportSheet(workbook);
  if (!sheet) {
    throw new AppError('File Excel không có sheet nào', 400);
  }

  // MỚI SỬA: tìm cột theo TIÊU ĐỀ thay vì cố định cột 1..8
  const header = findImportHeader(sheet);
  if (!header) {
    throw new AppError(
      `Không tìm thấy cột "${IMPORT_REQUIRED_LABEL}" trong sheet "${sheet.name}". Hãy kiểm tra dòng tiêu đề (không được xóa hoặc đổi tên cột này).`,
      400
    );
  }
  const { headerRowNumber, columns } = header;
  const cellOf = (row, field) =>
    columns[field] === undefined ? undefined : row.getCell(columns[field]).value;

  let milestones = await milestoneRepository.findByGroup(groupId);

  // Tra cứu "công việc cha" theo TÊN (chỉ task cấp cao mới được làm cha - luật Subtask sâu 1 cấp)
  const existingTopTasks = await taskRepository.findByGroup(groupId);
  const titleToTask = new Map();
  existingTopTasks.forEach((t) =>
    titleToTask.set(t.title.toLowerCase().trim(), { id: t.id, milestoneId: t.milestoneId })
  );

  let createdCount = 0;
  const errors = [];
  const createdMilestoneNames = [];

  for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const title = cellText(cellOf(row, 'title'));
    if (!title) continue;

    const description = cellText(cellOf(row, 'description'));
    const email = cellText(cellOf(row, 'email'));
    const priority = parsePriority(cellOf(row, 'priority'));
    const milestoneName = cellText(cellOf(row, 'milestone'));
    const tagsText = cellText(cellOf(row, 'tags'));
    const parentTitle = cellText(cellOf(row, 'parent'));

    // Deadline sai định dạng -> báo lỗi đúng dòng đó (trước đây làm cả lần import bị lỗi 500)
    const deadline = parseExcelDeadline(cellOf(row, 'deadline'));
    if (deadline === undefined) {
      errors.push({
        row: rowNumber,
        error: `Deadline "${cellText(cellOf(row, 'deadline'))}" không hợp lệ (dùng yyyy-mm-dd hoặc dd/mm/yyyy)`,
      });
      continue;
    }

    let assignedTo = null;
    if (email) {
      const membership = await groupRepository.findMemberByEmail(groupId, email);
      if (!membership) {
        errors.push({ row: rowNumber, error: `Không tìm thấy "${email}" trong nhóm` });
        continue;
      }
      assignedTo = membership.userId;
    }

    const tagNames = tagsText
      ? tagsText
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
      : [];

    // Có "Thuộc công việc cha" -> tạo SUBTASK (kế thừa milestoneId của task cha)
    if (parentTitle) {
      const parent = titleToTask.get(parentTitle.toLowerCase().trim());

      if (!parent) {
        errors.push({
          row: rowNumber,
          error: `Không tìm thấy công việc cha "${parentTitle}" (phải là công việc CẤP CAO, đã tồn tại hoặc nằm ở dòng phía TRÊN trong cùng file)`,
        });
        continue;
      }

      await taskRepository.createWithTags(
        {
          title,
          description: description || null,
          priority,
          deadline,
          groupId,
          assignedTo,
          milestoneId: parent.milestoneId,
          parentTaskId: parent.id,
          createdBy: creatorId,
        },
        tagNames
      );
      createdCount++;
      continue;
    }

    // Task CẤP CAO bình thường
    let milestoneId = null;
    if (milestoneName) {
      milestoneId = await resolveMilestonePath(milestoneName, groupId, milestones, createdMilestoneNames);
    }

    const newTask = await taskRepository.createWithTags(
      {
        title,
        description: description || null,
        priority,
        deadline,
        groupId,
        assignedTo,
        milestoneId,
        createdBy: creatorId,
      },
      tagNames
    );
    createdCount++;

    // Đăng ký task vừa tạo để các dòng phía dưới dùng làm "công việc cha"
    titleToTask.set(title.toLowerCase().trim(), { id: newTask.id, milestoneId: newTask.milestoneId });
  }

  // Ghi 1 dòng lịch sử cho cả lần import
  if (createdCount > 0) {
    await activityService.log({
      groupId,
      actorId: creatorId,
      type: 'task.imported',
      targetType: 'task',
      summary: `đã nhập ${createdCount} công việc từ file Excel`,
    });
  }

  return {
    created: createdCount,
    errors,
    createdMilestones: [...new Set(createdMilestoneNames)],
  };
};

// ===== MỚI SỬA: FILE MẪU IMPORT CÓ SẴN MENU CHỌN =====
const TEMPLATE_LAST_ROW = 300; // số dòng được gắn menu / kiểm tra

// Dựng danh sách đường dẫn mốc dạng "Mốc cha > Mốc con" từ danh sách mốc phẳng của nhóm
const buildMilestonePaths = (flat) => {
  const byId = new Map(flat.map((m) => [m.id, m]));
  const pathOf = (m) => {
    const names = [];
    let cur = m;
    let guard = 0;
    while (cur && guard < 10) {
      names.unshift(cur.title);
      cur = cur.parentId ? byId.get(cur.parentId) : null;
      guard++;
    }
    return names.join(' > ');
  };
  return flat.map(pathOf).sort((a, b) => a.localeCompare(b, 'vi'));
};

exports.generateTemplate = async (groupId, actorId) => {
  // Có groupId thì kiểm tra quyền xem nhóm rồi lấy thành viên + mốc của nhóm đó để làm menu chọn
  let memberEmails = [];
  let milestonePaths = [];
  if (groupId) {
    await ensureCanViewGroup(actorId, groupId);
    const members = await groupRepository.getMembers(groupId);
    memberEmails = members
      .filter((m) => m.status === 'ACCEPTED' && m.user && m.user.email)
      .map((m) => m.user.email);
    milestonePaths = buildMilestonePaths(await milestoneRepository.findByGroup(groupId));
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Danh sách task', { views: [{ state: 'frozen', ySplit: 1 }] });

  // Tiêu đề NGẮN (import đọc theo tên cột nên không cần ghi hướng dẫn dài trong ô tiêu đề)
  sheet.columns = [
    { header: 'Tên công việc', key: 'title', width: 30 },
    { header: 'Mô tả', key: 'description', width: 34 },
    { header: 'Email người phụ trách', key: 'email', width: 30 },
    { header: 'Độ ưu tiên', key: 'priority', width: 14 },
    { header: 'Deadline', key: 'deadline', width: 14 },
    { header: 'Tên mốc', key: 'milestone', width: 36 },
    { header: 'Nhãn', key: 'tags', width: 22 },
    { header: 'Thuộc công việc cha', key: 'parentTitle', width: 30 },
    { header: 'Kiểm tra', key: 'check', width: 30 },
  ];

  // Sheet ẩn "Danh mục": nguồn dữ liệu cho các menu chọn
  const lists = workbook.addWorksheet('Danh mục');
  lists.getCell('A1').value = 'Email thành viên';
  lists.getCell('B1').value = 'Mốc hiện có';
  memberEmails.forEach((e, i) => { lists.getCell(`A${i + 2}`).value = e; });
  milestonePaths.forEach((p, i) => { lists.getCell(`B${i + 2}`).value = p; });
  lists.state = 'hidden';

  // Tiêu đề: cột bắt buộc màu đậm, cột tùy chọn màu nhạt; ghi chú hướng dẫn hiện khi rê chuột
  const headerNotes = {
    A1: 'BẮT BUỘC. Tên công việc.',
    C1: 'Chọn trong menu (chỉ thành viên của nhóm). Để trống nếu chưa giao.',
    D1: 'Chọn low / medium / high. Để trống = medium.',
    E1: 'Nhập ngày dạng dd/mm/yyyy. Để trống nếu không có hạn.',
    F1: 'Chọn mốc có sẵn, hoặc gõ mốc mới. Mốc con: gõ "Mốc cha > Mốc con". Việc con không cần điền (tự theo việc cha).',
    G1: 'Nhiều nhãn cách nhau bằng dấu phẩy.',
    H1: 'Để trống nếu là việc chính. Muốn là việc CON: chọn tên việc cha (việc cha phải nằm ở dòng phía TRÊN).',
    I1: 'Cột tự kiểm tra, hệ thống không đọc cột này.',
  };
  const header = sheet.getRow(1);
  header.height = 30;
  header.eachCell((cell) => {
    const required = cell.address === 'A1';
    cell.font = { bold: true, color: { argb: required ? 'FFFFFFFF' : 'FF1F2937' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: required ? 'FFE5484D' : 'FFE5E7EB' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    if (headerNotes[cell.address]) cell.note = headerNotes[cell.address];
  });

  // 2 dòng ví dụ: dòng 2 là việc chính, dòng 3 là việc CON của dòng 2
  sheet.addRow({ title: 'Viết mục tiêu đề tài', description: 'Nêu rõ mục tiêu nghiên cứu', priority: 'medium', milestone: 'Đề cương > Chương 1' });
  sheet.addRow({ title: 'Viết đặt vấn đề', description: 'Phần mở đầu của mục tiêu đề tài', priority: 'low', parentTitle: 'Viết mục tiêu đề tài' });
  [2, 3].forEach((r) => { sheet.getRow(r).font = { italic: true, color: { argb: 'FF9CA0A8' } }; });

  const emailRange = memberEmails.length > 0 ? `'Danh mục'!$A$2:$A$${memberEmails.length + 1}` : null;
  const milestoneRange = milestonePaths.length > 0 ? `'Danh mục'!$B$2:$B$${milestonePaths.length + 1}` : null;

  for (let r = 2; r <= TEMPLATE_LAST_ROW; r++) {
    // Email: chỉ chọn thành viên của nhóm
    if (emailRange) {
      sheet.getCell(`C${r}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: [emailRange],
        showErrorMessage: true, errorStyle: 'stop',
        errorTitle: 'Email không hợp lệ', error: 'Hãy chọn email của một thành viên trong nhóm.',
      };
    }
    // Độ ưu tiên
    sheet.getCell(`D${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"low,medium,high"'],
      showErrorMessage: true, errorStyle: 'stop',
      errorTitle: 'Độ ưu tiên', error: 'Chọn low, medium hoặc high.',
    };
    // Deadline: chỉ nhận ngày hợp lệ
    sheet.getCell(`E${r}`).numFmt = 'dd/mm/yyyy';
    sheet.getCell(`E${r}`).dataValidation = {
      type: 'date', operator: 'greaterThan', allowBlank: true, formulae: [new Date(Date.UTC(2000, 0, 1))],
      showErrorMessage: true, errorStyle: 'stop',
      errorTitle: 'Deadline', error: 'Nhập ngày hợp lệ, ví dụ 15/11/2026.',
    };
    // Mốc: chọn mốc có sẵn, vẫn cho gõ mốc mới (errorStyle information)
    if (milestoneRange) {
      sheet.getCell(`F${r}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: [milestoneRange],
        showErrorMessage: true, errorStyle: 'information',
        errorTitle: 'Mốc mới', error: 'Mốc này chưa có, hệ thống sẽ tự tạo mới khi import.',
      };
    }
    // Việc cha: chọn từ các tên ở cột A (cho phép gõ việc cha đã có sẵn trên hệ thống)
    sheet.getCell(`H${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: [`$A$2:$A$${TEMPLATE_LAST_ROW}`],
      showErrorMessage: true, errorStyle: 'warning',
      errorTitle: 'Việc cha', error: 'Tên này chưa có trong cột Tên công việc. Vẫn dùng nếu việc cha đã có sẵn trên hệ thống?',
    };
    // Cột Kiểm tra: tự báo lỗi thường gặp ngay trong Excel
    const emailCheck = emailRange ? `IF(AND(C${r}<>"",COUNTIF(${emailRange},C${r})=0),"Email không thuộc nhóm",` : 'IF(FALSE,"",';
    sheet.getCell(`I${r}`).value = {
      formula: `IF(A${r}="","",${emailCheck}IF(AND(H${r}<>"",COUNTIF($A$1:A${r - 1},H${r})=0),"Việc cha không nằm ở dòng phía trên","OK")))`,
    };
  }

  // Tô đỏ ô Kiểm tra khi có lỗi
  sheet.addConditionalFormatting({
    ref: `I2:I${TEMPLATE_LAST_ROW}`,
    rules: [{
      type: 'expression', formulae: ['AND(I2<>"",I2<>"OK")'],
      style: { font: { color: { argb: 'FFB42318' }, bold: true } },
    }],
  });

  // Sheet hướng dẫn ngắn (đặt SAU sheet dữ liệu)
  const guide = workbook.addWorksheet('Hướng dẫn');
  guide.getColumn(1).width = 100;
  [
    'CÁCH ĐIỀN FILE IMPORT',
    '1. Chỉ điền ở sheet "Danh sách task". Dòng 2 và 3 là ví dụ, có thể xóa.',
    '2. Cột Tên công việc là bắt buộc. Các cột còn lại có thể để trống.',
    '3. Email, Độ ưu tiên, Mốc, Việc cha: bấm vào ô rồi chọn trong mũi tên xổ xuống.',
    '4. Việc CON: chọn tên việc cha ở cột "Thuộc công việc cha". Việc cha phải nằm ở dòng phía trên.',
    '5. Cột Kiểm tra tự báo lỗi (chữ đỏ). Sửa hết rồi mới import. Cột này hệ thống không đọc.',
    '6. Đừng xóa hay đổi tên cột "Tên công việc". Các cột khác có thể đổi vị trí.',
  ].forEach((t, i) => {
    const c = guide.getCell(`A${i + 1}`);
    c.value = t;
    c.alignment = { wrapText: true };
    if (i === 0) c.font = { bold: true };
  });

  return workbook;
};

// MỚI SỬA: thêm tham số actorId (người gọi API) và kiểm tra quyền XEM nhóm trước khi trả số liệu thống kê
exports.getGroupStats = async (groupId, actorId) => {
  await ensureCanViewGroup(actorId, groupId);

  // MỚI SỬA: đổi tên biến thành topTasks vì findByGroup CHỈ trả về task cấp cao (kèm subtasks[] lồng bên trong)
  const topTasks = await taskRepository.findByGroup(groupId);
  const members = await groupRepository.getMembers(groupId);

  // MỚI SỬA: "dàn phẳng" - gộp task cấp cao VÀ toàn bộ Subtask của chúng vào 1 mảng duy nhất tên "tasks"
  // Lý do: đã chốt đếm cả việc con ở mọi nơi, để số liệu Thống kê khớp với % Mốc trên Timeline
  // (các dòng tính toán bên dưới giữ nguyên, tự động đếm luôn Subtask nhờ dùng mảng đã gộp này)
  // Subtask đã có sẵn assignedTo + status nên "đóng góp từng người" cũng tự tính đúng theo người phụ trách việc con
  // Không sửa taskRepository.findByGroup vì Import Excel vẫn cần nó chỉ trả task cấp cao để tra "công việc cha"
  const tasks = topTasks.flatMap((t) => [t, ...(t.subtasks || [])]);

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const doing = tasks.filter((t) => t.status === 'doing').length;
  const todo = tasks.filter((t) => t.status === 'todo').length;
  const redo = tasks.filter((t) => t.status === 'redo').length; // MỚI THÊM: số việc đang ở trạng thái "Làm lại"
  const review = tasks.filter((t) => t.status === 'review').length; // MỚI THÊM (Phiên 12): số việc đang chờ Kiểm định

  const completionPercent = total > 0 ? Math.round((done / total) * 100) : 0;

  const contribution = members.map((m) => {
    const memberTasks = tasks.filter((t) => t.assignedTo === m.userId);
    return {
      userId: m.userId,
      fullName: m.user.fullName,
      total: memberTasks.length,
      todo: memberTasks.filter((t) => t.status === 'todo').length,
      doing: memberTasks.filter((t) => t.status === 'doing').length,
      redo: memberTasks.filter((t) => t.status === 'redo').length, // MỚI THÊM
      review: memberTasks.filter((t) => t.status === 'review').length, // MỚI THÊM (Phiên 12)
      done: memberTasks.filter((t) => t.status === 'done').length,
    };
  });

  return { total, done, doing, todo, redo, review, completionPercent, contribution };
};

exports.sendDeadlineReminder = async (taskId, actorId) => {
  const task = await taskRepository.findById(taskId);
  if (!task) throw new AppError('Task không tồn tại', 404);

  const actorMembership = await groupRepository.findMembership(actorId, task.groupId);
  if (!actorMembership || actorMembership.role !== 'leader') {
    throw new AppError('Chỉ trưởng nhóm mới có quyền nhắc nhở', 403);
  }

  if (!task.assignedTo) {
    throw new AppError('Task này chưa được gán cho ai', 400);
  }

  await notificationService.notify({
    userId: task.assignedTo,
    type: 'deadline_reminder',
    content: `Trưởng nhóm nhắc bạn hoàn thành công việc: "${task.title}"`,
    groupId: task.groupId,
  });
};

// MỚI SỬA: thêm tham số actorId và kiểm tra thành viên nhóm trước khi sửa nội dung
exports.updateDescription = async (taskId, description, actorId) => {
  const task = await taskRepository.findById(taskId);
  if (!task) throw new AppError('Task không tồn tại', 404);
  await ensureTaskGroupMember(task, actorId);
  return taskRepository.updateDescription(taskId, description);
};

// MỚI SỬA: thêm tham số actorId và kiểm tra thành viên nhóm trước khi sửa nhãn
exports.updateTaskTags = async (taskId, tagNames, actorId) => {
  const task = await taskRepository.findById(taskId);
  if (!task) throw new AppError('Task không tồn tại', 404);
  await ensureTaskGroupMember(task, actorId);
  return taskRepository.updateTags(taskId, task.groupId, tagNames);
};

const canModifyTask = async (task, actorId, groupRepository) => {
  if (task.createdBy === actorId) return true;
  const membership = await groupRepository.findMembership(actorId, task.groupId);
  return membership?.role === 'leader';
};

exports.deleteTask = async (taskId, actorId) => {
  const task = await taskRepository.findById(taskId);
  if (!task) throw new AppError('Task không tồn tại', 404);

  const allowed = await canModifyTask(task, actorId, groupRepository);
  if (!allowed) {
    throw new AppError('Bạn không có quyền xóa task này', 403);
  }

  const result = await taskRepository.remove(taskId);

  // MỚI THÊM: ghi lịch sử hoạt động (sau khi xóa thành công)
  await activityService.log({
    groupId: task.groupId,
    actorId,
    type: 'task.deleted',
    targetType: 'task',
    targetId: taskId,
    summary: `đã xóa công việc "${task.title}"`,
  });

  return result;
};

exports.updateTask = async (taskId, actorId, updateData) => {
  const task = await taskRepository.findById(taskId);
  if (!task) throw new AppError('Task không tồn tại', 404);

  const allowed = await canModifyTask(task, actorId, groupRepository);
  if (!allowed) {
    throw new AppError('Bạn không có quyền sửa task này', 403);
  }

  const { title, description, priority, deadline, milestoneId } = updateData;

  // MỚI SỬA: đổi deadline (chuỗi "2026-09-15" từ ô chọn ngày) thành đối tượng Date trước khi lưu.
  // Trước đây truyền thẳng chuỗi nên Prisma báo "Invalid value for argument `deadline`... Expected ISO-8601 DateTime".
  //  - undefined: người dùng không gửi deadline -> giữ nguyên deadline cũ (Prisma bỏ qua giá trị undefined)
  //  - chuỗi rỗng hoặc null: người dùng xóa deadline -> lưu null
  //  - có giá trị: đổi sang Date; nếu ngày không hợp lệ thì báo lỗi 400 thay vì để lỗi Prisma
  let deadlineValue;
  if (deadline === undefined) {
    deadlineValue = undefined;
  } else if (!deadline) {
    deadlineValue = null;
  } else {
    deadlineValue = new Date(deadline);
    if (Number.isNaN(deadlineValue.getTime())) {
      throw new AppError('Deadline không hợp lệ', 400);
    }
  }

  const dataToUpdate = { title, description, priority, deadline: deadlineValue, milestoneId };

  const updatedTask = await taskRepository.update(taskId, dataToUpdate);

  // MỚI THÊM: ghi lịch sử hoạt động
  await activityService.log({
    groupId: task.groupId,
    actorId,
    type: 'task.updated',
    targetType: 'task',
    targetId: taskId,
    summary: `đã chỉnh sửa công việc "${updatedTask.title}"`,
  });

  return updatedTask;
};

exports.createSubtask = async (parentTaskId, creatorId, subtaskData) => {
  const parentTask = await taskRepository.findById(parentTaskId);
  if (!parentTask) throw new AppError('Công việc cha không tồn tại', 404);

  if (parentTask.parentTaskId) {
    throw new AppError('Không thể tạo Subtask bên trong 1 Subtask khác (chỉ hỗ trợ 1 cấp)', 400);
  }

  const creatorMembership = await groupRepository.findMembership(creatorId, parentTask.groupId);
  if (!creatorMembership) {
    throw new AppError('Bạn không thuộc nhóm này', 403);
  }

  const { assignedTo, tagNames = [], deadline, ...restData } = subtaskData;

  if (assignedTo) {
    const assigneeMembership = await groupRepository.findMembership(assignedTo, parentTask.groupId);
    if (!assigneeMembership) {
      throw new AppError('Người được giao không thuộc nhóm này', 400);
    }
  }

  const subtask = await taskRepository.createWithTags(
    {
      ...restData,
      deadline: parseDeadline(deadline),
      groupId: parentTask.groupId,
      milestoneId: parentTask.milestoneId,
      parentTaskId: parentTask.id,
      assignedTo: assignedTo || null,
      createdBy: creatorId,
    },
    tagNames
  );

  if (assignedTo && assignedTo !== creatorId) {
    await notificationService.notify({
      userId: assignedTo,
      type: 'task_assigned',
      content: `Bạn được giao công việc con: "${subtask.title}" (thuộc "${parentTask.title}")`,
      groupId: parentTask.groupId,
    });
  }

  // MỚI THÊM: ghi lịch sử hoạt động
  await activityService.log({
    groupId: parentTask.groupId,
    actorId: creatorId,
    type: 'task.created',
    targetType: 'task',
    targetId: subtask.id,
    summary: `đã tạo công việc con "${subtask.title}" trong "${parentTask.title}"`,
  });

  return subtask;
};