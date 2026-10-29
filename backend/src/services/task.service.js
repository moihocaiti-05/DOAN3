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

exports.createTask = async (taskData, creatorId) => {
  const { groupId, assignedTo, tagNames = [], ...restData } = taskData;

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
    { ...restData, groupId, assignedTo, createdBy: creatorId },
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

exports.importTasksFromExcel = async (filePath, groupId, creatorId) => {
  const creatorMembership = await groupRepository.findMembership(creatorId, groupId);
  if (!creatorMembership) {
    throw new AppError('Bạn không thuộc nhóm này', 403);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];

  let milestones = await milestoneRepository.findByGroup(groupId);

  // MỚI THÊM: chuẩn bị dữ liệu để tra cứu "công việc cha" theo TÊN - dùng cho cột "Thuộc công việc cha"
  // Bước 1: lấy toàn bộ task CẤP CAO NHẤT đã có sẵn trong nhóm (taskRepository.findByGroup vốn đã lọc
  // parentTaskId: null từ trước) - CHỈ những task này mới được phép làm cha, đúng luật "Subtask chỉ sâu 1 cấp"
  const existingTopTasks = await taskRepository.findByGroup(groupId);
  // Map: tên công việc (viết thường, đã trim) -> { id, milestoneId } - để tra cứu nhanh + biết milestoneId cần kế thừa
  const titleToTask = new Map();
  existingTopTasks.forEach((t) =>
    titleToTask.set(t.title.toLowerCase().trim(), { id: t.id, milestoneId: t.milestoneId })
  );

  let createdCount = 0;
  const errors = [];
  const createdMilestoneNames = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const title = row.getCell(1).value;
    const description = row.getCell(2).value;
    const email = row.getCell(3).value;
    const priority = row.getCell(4).value;
    const deadline = row.getCell(5).value;
    const milestoneName = row.getCell(6).value;
    const tagsCell = row.getCell(7).value;
    const parentTitle = row.getCell(8).value; // MỚI THÊM: cột "Thuộc công việc cha"

    if (!title) continue;

    let assignedTo = null;

    if (email) {
      const membership = await groupRepository.findMemberByEmail(groupId, email);
      if (!membership) {
        errors.push({ row: rowNumber, error: `Không tìm thấy "${email}" trong nhóm` });
        continue;
      }
      assignedTo = membership.userId;
    }

    const tagNames = tagsCell
      ? String(tagsCell)
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
      : [];

    // MỚI THÊM: nếu dòng này có ghi "Thuộc công việc cha" -> tạo thành SUBTASK thay vì task cấp cao
    if (parentTitle) {
      const parentKey = String(parentTitle).toLowerCase().trim();
      const parent = titleToTask.get(parentKey);

      if (!parent) {
        errors.push({
          row: rowNumber,
          error: `Không tìm thấy công việc cha "${parentTitle}" (phải là công việc CẤP CAO, đã tồn tại hoặc nằm ở dòng phía TRÊN trong cùng file)`,
        });
        continue;
      }

      // Subtask TỰ ĐỘNG kế thừa milestoneId từ task cha - bỏ qua giá trị ở cột "Tên mốc" của chính dòng này
      // (giống hệt luật khi tạo Subtask bằng tay qua giao diện, xem task.service.js -> exports.createSubtask)
      await taskRepository.createWithTags(
        {
          title: String(title),
          description: description ? String(description) : null,
          priority: ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
          deadline: deadline ? new Date(deadline) : null,
          groupId,
          assignedTo,
          milestoneId: parent.milestoneId,
          parentTaskId: parent.id,
          createdBy: creatorId,
        },
        tagNames
      );
      createdCount++;
      continue; // xong dòng này, KHÔNG chạy tiếp xuống nhánh tạo task cấp cao bên dưới
    }

    // Nhánh cũ: tạo task CẤP CAO bình thường (không có công việc cha)
    let milestoneId = null;
    if (milestoneName) {
      milestoneId = await resolveMilestonePath(milestoneName, groupId, milestones, createdMilestoneNames);
    }

    const newTask = await taskRepository.createWithTags(
      {
        title: String(title),
        description: description ? String(description) : null,
        priority: ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
        deadline: deadline ? new Date(deadline) : null,
        groupId,
        assignedTo,
        milestoneId,
        createdBy: creatorId,
      },
      tagNames
    );
    createdCount++;

    // MỚI THÊM: đăng ký ngay task vừa tạo vào titleToTask - để CÁC DÒNG PHÍA DƯỚI trong cùng file
    // có thể lấy nó làm "công việc cha" luôn, không cần task đó phải có sẵn từ trước khi import
    titleToTask.set(String(title).toLowerCase().trim(), { id: newTask.id, milestoneId: newTask.milestoneId });
  }

  // MỚI THÊM: ghi 1 dòng lịch sử cho cả lần import (không ghi từng task để tránh tràn lịch sử)
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

exports.generateTemplate = async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Danh sách task');

  // MỚI SỬA: giảm bớt width của vài cột tiêu đề dài (46/55 -> 34/36) - vì giờ chữ đã tự XUỐNG DÒNG
  // (nhờ wrapText bên dưới) nên không cần kéo cột quá rộng để chứa hết chữ trên 1 dòng nữa
  sheet.columns = [
    { header: 'Tên công việc', key: 'title', width: 26 },
    { header: 'Mô tả', key: 'description', width: 32 },
    { header: 'Email người phụ trách', key: 'email', width: 22 },
    { header: 'Độ ưu tiên (low/medium/high)', key: 'priority', width: 18 },
    { header: 'Deadline (yyyy-mm-dd)', key: 'deadline', width: 16 },
    { header: 'Tên mốc (để trống nếu không có; gõ "Mốc cha > Mốc con" để tạo mốc con)', key: 'milestone', width: 34 },
    { header: 'Nhãn (nhiều nhãn cách nhau bằng dấu phẩy, để trống nếu không có)', key: 'tags', width: 30 },
    // MỚI THÊM: cột thứ 8 - tạo Subtask bằng cách ghi đúng tên 1 công việc cha
    { header: 'Thuộc công việc cha (để trống nếu là công việc chính; gõ đúng Tên công việc cha để biến dòng này thành công việc CON)', key: 'parentTitle', width: 36 },
  ];

  // MỚI SỬA: thêm alignment wrapText - chữ tiêu đề dài giờ tự XUỐNG DÒNG bên trong ô thay vì tràn ra ngoài
  // horizontal/vertical: căn giữa cho đẹp khi có nhiều dòng; row height tăng lên để đủ chỗ hiển thị 2-3 dòng chữ
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { wrapText: true, vertical: 'middle', horizontal: 'left' };
  sheet.getRow(1).height = 45;

  // MỚI SỬA: 2 dòng ví dụ mẫu - dòng 1 là công việc cha, dòng 2 là công việc CON của dòng 1 (dùng đúng tên ở dòng 1)
  sheet.addRow({
    title: 'Viết mục tiêu đề tài',
    description: 'Nêu rõ mục tiêu nghiên cứu',
    email: '',
    priority: 'medium',
    deadline: '',
    milestone: 'Đề cương > Chương 1',
    tags: '',
    parentTitle: '',
  });
  sheet.addRow({
    title: 'Viết đặt vấn đề',
    description: 'Phần mở đầu của mục tiêu đề tài',
    email: '',
    priority: 'low',
    deadline: '',
    milestone: '',
    tags: '',
    parentTitle: 'Viết mục tiêu đề tài', // MỚI THÊM: chính là tên task ở dòng ví dụ ngay phía trên
  });
  sheet.getRow(2).font = { italic: true, color: { argb: 'FF9CA0A8' } };
  sheet.getRow(3).font = { italic: true, color: { argb: 'FF9CA0A8' } };

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

  const { assignedTo, tagNames = [], ...restData } = subtaskData;

  if (assignedTo) {
    const assigneeMembership = await groupRepository.findMembership(assignedTo, parentTask.groupId);
    if (!assigneeMembership) {
      throw new AppError('Người được giao không thuộc nhóm này', 400);
    }
  }

  const subtask = await taskRepository.createWithTags(
    {
      ...restData,
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