const groupRepository = require('../repositories/group.repository');
const taskRepository = require('../repositories/task.repository');
const { sendTaskDigest } = require('../utils/mail'); // hàm gửi 1 mail gộp nhiều công việc cho 1 người
const AppError = require('../utils/AppError');

// Giới hạn mỗi lần gửi để tránh spam và tránh vượt hạn mức Gmail
const MAX_RECIPIENTS = 20; // tối đa 20 người nhận mỗi lần
const MAX_TASKS_PER_PERSON = 30; // tối đa 30 công việc trong mail của mỗi người

// Gửi mail công việc cho nhiều người trong nhóm
// - recipients: mảng { userId, taskIds } - mỗi người nhận ĐÚNG 1 mail, chỉ chứa các công việc ĐƯỢC CHỌN CHO RIÊNG người đó
// - message: lời nhắn thêm (không bắt buộc), gắn vào mail của tất cả mọi người
exports.sendTasksByMail = async (groupId, actorId, { recipients, message = '' }) => {
  // Bắt buộc có actorId: nếu undefined thì Prisma BỎ QUA điều kiện userId và vô tình khớp thành viên bất kỳ
  if (!actorId) throw new AppError('Thiếu thông tin người dùng', 401);

  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw new AppError('Hãy chọn ít nhất 1 người nhận', 400);
  }
  if (recipients.length > MAX_RECIPIENTS) {
    throw new AppError(`Mỗi lần chỉ gửi tối đa ${MAX_RECIPIENTS} người`, 400);
  }
  // Mỗi người chỉ xuất hiện 1 lần (Joi đã chặn, kiểm tra lại cho chắc)
  if (new Set(recipients.map((r) => r.userId)).size !== recipients.length) {
    throw new AppError('Có người nhận bị chọn trùng', 400);
  }

  // Chỉ thành viên ĐÃ ĐỒNG Ý của nhóm mới được gửi (Giảng viên và người ngoài nhóm bị chặn)
  const actorMembership = await groupRepository.findMembership(actorId, groupId);
  if (!actorMembership) {
    throw new AppError('Chỉ thành viên của nhóm mới được gửi mail công việc', 403);
  }
  const isLeader = actorMembership.role === 'leader';

  const group = await groupRepository.findById(groupId);
  if (!group) throw new AppError('Nhóm không tồn tại', 404);

  // Danh sách thành viên ĐÃ ĐỒNG Ý, tra nhanh theo userId
  const members = (await groupRepository.getMembers(groupId)).filter((m) => m.status === 'ACCEPTED');
  const memberById = new Map(members.map((m) => [m.userId, m]));
  const senderName = memberById.get(actorId)?.user.fullName || 'Một thành viên';

  // Lấy task từ CHÍNH nhóm này (task của nhóm khác không bao giờ khớp, không tin groupId/taskId do client gửi)
  const allTasks = await taskRepository.findByGroup(groupId);

  // Kiểm tra TOÀN BỘ trước khi gửi: có lỗi ở bất kỳ người nào thì không gửi mail nào cả (tránh gửi dở dang)
  const plans = recipients.map(({ userId, taskIds }) => {
    const recipient = memberById.get(userId);
    if (!recipient) throw new AppError('Có người nhận không thuộc nhóm này', 400);

    const uniqueTaskIds = new Set(taskIds);
    if (uniqueTaskIds.size === 0) throw new AppError('Mỗi người nhận cần ít nhất 1 công việc', 400);
    if (uniqueTaskIds.size > MAX_TASKS_PER_PERSON) {
      throw new AppError(`Mỗi người chỉ nhận tối đa ${MAX_TASKS_PER_PERSON} công việc mỗi lần gửi`, 400);
    }

    // Giữ thứ tự hiển thị của nhóm; thiếu task nào nghĩa là task đó không tồn tại hoặc thuộc nhóm khác
    const tasks = allTasks.filter((t) => uniqueTaskIds.has(t.id));
    if (tasks.length !== uniqueTaskIds.size) {
      throw new AppError('Có công việc không tồn tại hoặc không thuộc nhóm này', 400);
    }

    // Thành viên thường chỉ gửi được công việc do chính mình tạo (giống quy tắc sửa/xóa task); Trưởng nhóm gửi mọi việc
    if (!isLeader && tasks.some((t) => t.createdBy !== actorId)) {
      throw new AppError('Bạn chỉ được gửi mail về công việc do chính mình tạo', 403);
    }

    return { recipient, userId, tasks };
  });

  const cleanMessage = String(message || '').trim().slice(0, 500);

  // Gửi TUẦN TỰ từng người (không gửi song song) để tránh Gmail chặn vì gửi dồn dập
  // Lỗi của 1 người được ghi lại riêng, không làm hỏng mail của những người còn lại
  const sentNames = [];
  const failedNames = [];
  for (const { recipient, userId, tasks } of plans) {
    try {
      await sendTaskDigest({
        to: recipient.user.email,
        recipientName: recipient.user.fullName,
        senderName,
        groupName: group.name,
        groupId,
        message: cleanMessage,
        // Dữ liệu từng công việc trong mail; isYours = task này giao cho đúng người nhận
        tasks: tasks.map((t) => ({
          title: t.title,
          assigneeName: t.assignee?.fullName || 'Chưa giao',
          priority: t.priority,
          status: t.status,
          deadline: t.deadline,
          tags: (t.tags || []).map((tag) => tag.name),
          isYours: t.assignedTo === userId,
        })),
      });
      sentNames.push(recipient.user.fullName);
    } catch (err) {
      console.error(`Gửi mail công việc cho ${recipient.user.email} thất bại:`, err.message); // nguyên nhân thật hiện ở terminal Backend
      failedNames.push(recipient.user.fullName);
    }
  }

  // Không gửi được cho ai thì báo lỗi hẳn để giao diện hiện lỗi rõ ràng
  if (sentNames.length === 0) {
    throw new AppError('Không gửi được mail cho ai. Vui lòng thử lại sau', 502);
  }

  return { sentCount: sentNames.length, failedNames };
};