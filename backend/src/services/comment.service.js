const commentRepository = require('../repositories/comment.repository');
const taskRepository = require('../repositories/task.repository');
const groupRepository = require('../repositories/group.repository');
const milestoneRepository = require('../repositories/milestone.repository'); // để biết mốc thuộc nhóm nào
const notificationService = require('./notification.service');
const activityService = require('./activity.service'); // MỚI THÊM: ghi lịch sử hoạt động
const AppError = require('../utils/AppError');

// ===================== HÀM PHỤ DÙNG CHUNG (cho comment Task lẫn nhận xét Mốc) =====================

// Xác định vai trò của 1 user trong 1 nhóm
// Trả về 'supervisor' (Giảng viên) | 'leader' (Trưởng nhóm) | 'member' (Thành viên) | null (không thuộc nhóm)
// Kiểm tra Giảng viên TRƯỚC vì Giảng viên không nằm trong GroupMember nên findMembership sẽ không thấy họ
const getRoleInGroup = async (userId, groupId) => {
  const supervisorship = await groupRepository.findSupervisorship(userId, groupId);
  if (supervisorship) return 'supervisor';

  const membership = await groupRepository.findMembership(userId, groupId);
  if (!membership) return null;
  return membership.role === 'leader' ? 'leader' : 'member';
};

// MỚI THÊM: Gắn thêm 2 thông tin vào từng comment để Frontend hiển thị:
//   authorRole: nhãn vai trò cạnh tên người viết ('supervisor' | 'leader' | 'member')
//   isMine: comment này có phải của người đang xem không (để hiện nút Xóa)
const labelComments = async (comments, groupId, userId) => {
  // Lấy song song thành viên và Giảng viên của nhóm để biết ai đang giữ vai trò nào
  const [members, supervisors] = await Promise.all([
    groupRepository.getMembers(groupId),
    groupRepository.getAcceptedSupervisors(groupId),
  ]);

  // Tập id các Trưởng nhóm và Giảng viên hiện tại
  const leaderIds = new Set(
    members.filter((m) => m.status === 'ACCEPTED' && m.role === 'leader').map((m) => m.userId)
  );
  const supervisorIds = new Set(supervisors.map((s) => s.userId));

  return comments.map((c) => ({
    ...c,
    authorRole: supervisorIds.has(c.authorId) ? 'supervisor' : leaderIds.has(c.authorId) ? 'leader' : 'member',
    isMine: c.authorId === userId,
  }));
};

// ===================== COMMENT TRÊN TASK =====================

// Viết comment vào 1 task - thành viên, trưởng nhóm HOẶC Giảng viên của nhóm chứa task đó đều được viết
// MỚI SỬA: trước đây dùng findMembership nên Giảng viên luôn bị từ chối (403)
exports.createTaskComment = async (taskId, content, authorId) => {
  const text = (content || '').trim();
  if (!text) throw new AppError('Nội dung bình luận không được để trống', 400);

  const task = await taskRepository.findById(taskId);
  if (!task) throw new AppError('Task không tồn tại', 404);

  const role = await getRoleInGroup(authorId, task.groupId);
  if (!role) {
    throw new AppError('Bạn không thuộc nhóm này', 403);
  }

  const comment = await commentRepository.create({ content: text, authorId, taskId });

  // Báo cho người phụ trách task biết có comment mới (nếu người viết không phải chính họ)
  if (task.assignedTo && task.assignedTo !== authorId) {
    await notificationService.notify({
      userId: task.assignedTo,
      type: 'task_assigned', // dùng tạm loại này, không cần thêm loại mới cho 1 trường hợp nhỏ
      // MỚI SỬA: nếu người viết là Giảng viên thì ghi rõ trong nội dung thông báo
      content:
        role === 'supervisor'
          ? `Giảng viên ${comment.author.fullName} vừa bình luận trên công việc: "${task.title}"`
          : `Có bình luận mới trên công việc: "${task.title}"`,
      groupId: task.groupId,
    });
  }

  // MỚI SỬA: trả về đúng comment vừa tạo (kèm tên người viết + nhãn vai trò)
  // thay vì tải lại cả danh sách rồi lấy phần tử cuối như trước
  return { ...comment, authorRole: role, isMine: true };
};

// Lấy danh sách comment của 1 task
// MỚI SỬA: thêm kiểm tra người xem phải thuộc nhóm (trước đây ai có id task cũng xem được) + gắn nhãn vai trò
exports.getTaskComments = async (taskId, userId) => {
  const task = await taskRepository.findById(taskId);
  if (!task) throw new AppError('Task không tồn tại', 404);

  const role = await getRoleInGroup(userId, task.groupId);
  if (!role) throw new AppError('Bạn không thuộc nhóm này', 403);

  const comments = await commentRepository.findByTask(taskId);
  return labelComments(comments, task.groupId, userId);
};

// Xóa comment - chỉ người viết mới được xóa comment của chính mình
// (áp dụng chung cho cả comment Task lẫn nhận xét Mốc)
exports.deleteComment = async (commentId, userId) => {
  const comment = await commentRepository.findById(commentId);
  if (!comment) throw new AppError('Bình luận không tồn tại', 404);
  if (comment.authorId !== userId) {
    throw new AppError('Bạn chỉ có thể xóa bình luận của chính mình', 403);
  }
  return commentRepository.remove(commentId);
};

// ===================== NHẬN XÉT THEO MỐC =====================

// Hàm phụ: tìm mốc theo id, không có thì báo lỗi 404
const findMilestoneOrThrow = async (milestoneId) => {
  const milestone = await milestoneRepository.findById(milestoneId);
  if (!milestone) throw new AppError('Mốc không tồn tại', 404);
  return milestone;
};

// Lấy nhận xét của 1 mốc - ai thuộc nhóm (thành viên, trưởng nhóm, Giảng viên) đều được XEM
// Trả về { comments, canWrite }: canWrite cho Frontend biết có hiện ô nhập nhận xét hay không
exports.getMilestoneComments = async (milestoneId, userId) => {
  const milestone = await findMilestoneOrThrow(milestoneId);

  const role = await getRoleInGroup(userId, milestone.groupId);
  if (!role) throw new AppError('Bạn không thuộc nhóm này', 403);

  const comments = await commentRepository.findByMilestone(milestoneId);
  const labeled = await labelComments(comments, milestone.groupId, userId); // MỚI SỬA: dùng hàm dùng chung

  return { comments: labeled, canWrite: role === 'supervisor' || role === 'leader' };
};

// Viết nhận xét cho 1 mốc - CHỈ Giảng viên và Trưởng nhóm được viết
// Nếu người viết là Giảng viên -> báo 🔔 cho toàn bộ thành viên nhóm
exports.createMilestoneComment = async (milestoneId, content, userId) => {
  const text = (content || '').trim();
  if (!text) throw new AppError('Nội dung nhận xét không được để trống', 400);

  const milestone = await findMilestoneOrThrow(milestoneId);

  const role = await getRoleInGroup(userId, milestone.groupId);
  if (role !== 'supervisor' && role !== 'leader') {
    throw new AppError('Chỉ Giảng viên và Trưởng nhóm mới được nhận xét mốc', 403);
  }

  const comment = await commentRepository.create({ content: text, authorId: userId, milestoneId });

  // MỚI THÊM: ghi lịch sử hoạt động
  await activityService.log({
    groupId: milestone.groupId,
    actorId: userId,
    type: 'comment.milestone',
    targetType: 'milestone',
    targetId: milestoneId,
    summary: `đã nhận xét mốc "${milestone.title}"`,
  });

  if (role === 'supervisor') {
    // Báo cho mọi thành viên ĐÃ ĐỒNG Ý trong nhóm (trừ chính người viết, phòng trường hợp tài khoản test vừa là thành viên vừa là Giảng viên)
    const members = await groupRepository.getMembers(milestone.groupId);
    const receivers = members.filter((m) => m.status === 'ACCEPTED' && m.userId !== userId);

    await Promise.all(
      receivers.map((m) =>
        notificationService.notify({
          userId: m.userId,
          type: 'task_assigned', // dùng tạm loại có sẵn giống comment Task, không cần thêm loại mới
          content: `Giảng viên ${comment.author.fullName} vừa nhận xét mốc: "${milestone.title}"`,
          groupId: milestone.groupId,
        })
      )
    );
  }

  return { ...comment, authorRole: role, isMine: true };
};