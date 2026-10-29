const fs = require('fs'); // MỚI THÊM: dùng để xóa file vật lý trên ổ đĩa khi xóa nhóm
const notificationService = require('./notification.service');
const supervisorService = require('./supervisor.service');
const groupRepository = require('../repositories/group.repository');
const taskRepository = require('../repositories/task.repository');
const userRepository = require('../repositories/user.repository');
const activityService = require('./activity.service'); // MỚI THÊM: ghi lịch sử hoạt động
const AppError = require('../utils/AppError');

// MỚI THÊM: Kiểm tra người gọi API có quyền XEM dữ liệu của 1 nhóm hay không (dùng cho các API ĐỌC)
// Được xem: Giảng viên ĐÃ ĐỒNG Ý phụ trách nhóm, hoặc thành viên ĐÃ ĐỒNG Ý. Người ngoài nhóm, người đang chờ (PENDING) hoặc đã từ chối (DECLINED) bị chặn 403
// (Cùng logic với ensureCanViewGroup trong task.service.js và milestone.service.js - viết lại ở đây để không phải sửa thêm file khác)
const ensureCanViewGroup = async (userId, groupId) => {
  // Bắt buộc có userId và groupId: nếu undefined thì Prisma sẽ BỎ QUA điều kiện đó và vô tình khớp bản ghi bất kỳ
  if (!userId) throw new AppError('Thiếu thông tin người dùng', 401);
  if (!groupId) throw new AppError('Thiếu mã nhóm', 400);

  // Kiểm tra Giảng viên TRƯỚC vì tài khoản có thể vừa là thành viên vừa là Giảng viên của cùng 1 nhóm
  const supervisorship = await groupRepository.findSupervisorship(userId, groupId);
  if (supervisorship) return;

  const membership = await groupRepository.findMembership(userId, groupId);
  if (membership) return;

  throw new AppError('Bạn không có quyền xem dữ liệu của nhóm này', 403);
};

// Logic tạo nhóm mới: tạo Group xong, tự động thêm người tạo làm "leader"
exports.createGroup = async ({ name, description }, creatorId) => {
  const group = await groupRepository.create({ name, description });
  await groupRepository.addMember(creatorId, group.id, 'leader');
  return group;
};

// Lấy danh sách nhóm của 1 user - dùng để hiển thị lên trang chủ
exports.getMyGroups = (userId) => groupRepository.findGroupsByUserId(userId);

// Logic tham gia nhóm bằng mã mời
exports.joinGroup = async (inviteCode, userId) => {
  const group = await groupRepository.findByInviteCode(inviteCode);
  if (!group) {
    throw new AppError('Mã mời không hợp lệ', 404);
  }

  const existingMembership = await groupRepository.findMembershipAny(userId, group.id);
  if (existingMembership) {
    throw new AppError('Bạn đã có liên kết với nhóm này rồi', 400);
  }

  await groupRepository.addMember(userId, group.id, 'member');

  // MỚI THÊM: ghi lịch sử hoạt động
  await activityService.log({
    groupId: group.id,
    actorId: userId,
    type: 'member.joined',
    targetType: 'member',
    targetId: userId,
    summary: 'đã tham gia nhóm bằng mã mời',
  });

  return group;
};

// MỚI THÊM: Lấy danh sách thành viên của 1 nhóm (kèm họ tên, email, avatar) - kiểm tra quyền XEM nhóm trước
// Trước đây Controller gọi thẳng Repository nên bất kỳ ai đăng nhập biết groupId đều lấy được danh sách + email thành viên
exports.getMembers = async (groupId, actorId) => {
  await ensureCanViewGroup(actorId, groupId);
  return groupRepository.getMembers(groupId);
};

// Lấy thông tin chi tiết 1 nhóm (tên, mô tả, mã mời...) - dùng cho modal "Mời thành viên"
// MỚI SỬA: cho phép cả GIẢNG VIÊN (đã đồng ý) xem thông tin nhóm, vì Giảng viên không nằm trong GroupMember
// nên trước đây findMembership không thấy họ và luôn trả 403
exports.getGroupDetail = async (groupId, userId) => {
  // Kiểm tra quyền: là thành viên đã đồng ý HOẶC là Giảng viên đã đồng ý
  const membership = await groupRepository.findMembership(userId, groupId);
  const supervisorship = membership
    ? null // đã là thành viên thì khỏi cần kiểm tra Giảng viên nữa
    : await groupRepository.findSupervisorship(userId, groupId);

  if (!membership && !supervisorship) {
    throw new AppError('Bạn không thuộc nhóm này', 403);
  }

  const group = await groupRepository.findById(groupId);
  if (!group) {
    throw new AppError('Nhóm không tồn tại', 404);
  }

  // Giảng viên KHÔNG được thấy mã mời (inviteCode) - mã này chỉ dành cho việc mời thành viên vào nhóm
  // Cách làm: tách inviteCode ra khỏi object, trả phần còn lại
  if (!membership) {
    const { inviteCode, ...groupWithoutCode } = group;
    return groupWithoutCode;
  }

  return group;
};

// Chuyển quyền trưởng nhóm cho 1 thành viên khác
exports.transferLeadership = async (groupId, actorId, targetUserId) => {
  const actorMembership = await groupRepository.findMembership(actorId, groupId);
  if (!actorMembership || actorMembership.role !== 'leader') {
    throw new AppError('Chỉ trưởng nhóm mới có quyền chuyển quyền', 403);
  }

  const targetMembership = await groupRepository.findMembership(targetUserId, groupId);
  if (!targetMembership) {
    throw new AppError('Người này không thuộc nhóm', 404);
  }

  await groupRepository.updateMemberRole(actorId, groupId, 'member');
  await groupRepository.updateMemberRole(targetUserId, groupId, 'leader');

  const group = await groupRepository.findById(groupId);
  await notificationService.notify({
    userId: targetUserId,
    type: 'promoted_leader',
    content: `Bạn đã được chuyển thành trưởng nhóm "${group.name}"`,
    groupId,
  });

  // MỚI THÊM: ghi lịch sử hoạt động
  const members = await groupRepository.getMembers(groupId);
  const target = members.find((m) => m.userId === targetUserId);
  await activityService.log({
    groupId,
    actorId,
    type: 'member.leader_transferred',
    targetType: 'member',
    targetId: targetUserId,
    summary: `đã chuyển quyền trưởng nhóm cho ${target ? target.user.fullName : 'một thành viên'}`,
  });
};

// Xóa 1 thành viên khỏi nhóm
exports.removeMember = async (groupId, actorId, targetUserId) => {
  const actorMembership = await groupRepository.findMembership(actorId, groupId);
  if (!actorMembership || actorMembership.role !== 'leader') {
    throw new AppError('Chỉ trưởng nhóm mới có quyền xóa thành viên', 403);
  }

  if (actorId === targetUserId) {
    throw new AppError('Không thể tự xóa chính mình, hãy chuyển quyền trước', 400);
  }

  const group = await groupRepository.findById(groupId);

  // MỚI THÊM: lấy tên người bị xóa TRƯỚC khi xóa (sau khi xóa sẽ không tra được nữa)
  const membersBefore = await groupRepository.getMembers(groupId);
  const removedMember = membersBefore.find((m) => m.userId === targetUserId);

  await groupRepository.removeMember(targetUserId, groupId);

  // MỚI THÊM: ghi lịch sử hoạt động
  await activityService.log({
    groupId,
    actorId,
    type: 'member.removed',
    targetType: 'member',
    targetId: targetUserId,
    summary: `đã xóa ${removedMember ? removedMember.user.fullName : 'một thành viên'} khỏi nhóm`,
  });

  await notificationService.notify({
    userId: targetUserId,
    type: 'removed_from_group',
    content: `Bạn đã bị xóa khỏi nhóm "${group.name}"`,
    groupId: null,
  });
};

// Phân tích khối lượng công việc giữa các thành viên - phát hiện mất cân bằng
// MỚI SỬA: thêm tham số actorId (người gọi API) và kiểm tra quyền XEM nhóm trước khi trả cảnh báo
exports.getWorkloadWarnings = async (groupId, actorId) => {
  await ensureCanViewGroup(actorId, groupId);

  const members = await groupRepository.getMembers(groupId);
  // MỚI SỬA: đổi tên biến thành topTasks vì findByGroup CHỈ trả về task cấp cao (kèm subtasks[] lồng bên trong)
  const topTasks = await taskRepository.findByGroup(groupId);

  // MỚI SỬA: "dàn phẳng" - gộp task cấp cao VÀ toàn bộ Subtask của chúng vào 1 mảng duy nhất tên "tasks"
  // Lý do: đã chốt đếm cả việc con ở mọi nơi, để khối lượng việc của mỗi người khớp với Thống kê và Timeline
  // Subtask có sẵn assignedTo + status nên ai được giao việc con chưa xong thì việc con đó tính vào khối lượng của người ấy
  const tasks = topTasks.flatMap((t) => [t, ...(t.subtasks || [])]);

  const activeTasks = tasks.filter((t) => t.status !== 'done');

  const counts = members.map((m) => ({
    userId: m.userId,
    fullName: m.user.fullName,
    activeCount: activeTasks.filter((t) => t.assignedTo === m.userId).length,
  }));

  const total = counts.reduce((sum, c) => sum + c.activeCount, 0);
  const average = members.length > 0 ? total / members.length : 0;

  const warnings = counts
    .filter((c) => average > 0 && c.activeCount >= average * 2)
    .map((c) => ({
      userId: c.userId,
      fullName: c.fullName,
      activeCount: c.activeCount,
      average: Math.round(average * 10) / 10,
    }));

  return warnings;
};

// Trưởng nhóm mời 1 Sinh viên vào nhóm bằng email, chờ người đó đồng ý mới chính thức là thành viên
exports.inviteMember = async (groupId, actorId, email) => {
  const actorMembership = await groupRepository.findMembership(actorId, groupId);
  if (!actorMembership || actorMembership.role !== 'leader') {
    throw new AppError('Chỉ trưởng nhóm mới có quyền mời thành viên', 403);
  }

  const targetUser = await userRepository.findByEmail(email);
  if (!targetUser) {
    throw new AppError('Không tìm thấy tài khoản với email này', 404);
  }

  if (targetUser.role !== 'SINH_VIEN') {
    throw new AppError('Email này không phải tài khoản Sinh viên', 400);
  }

  const existing = await groupRepository.findMembershipAny(targetUser.id, groupId);
  const group = await groupRepository.findById(groupId);

  if (existing) {
    if (existing.status === 'ACCEPTED') {
      throw new AppError('Người này đã là thành viên của nhóm', 400);
    }
    if (existing.status === 'PENDING') {
      throw new AppError('Đã gửi lời mời tới người này, đang chờ phản hồi', 400);
    }
    await groupRepository.updateMemberStatusById(existing.id, 'PENDING');
    await notificationService.notify({
      userId: targetUser.id,
      type: 'group_invite',
      content: `Bạn được mời tham gia nhóm "${group.name}"`,
      groupId,
      referenceId: existing.id,
    });
    await activityService.log({
      groupId,
      actorId,
      type: 'member.invited',
      targetType: 'member',
      targetId: targetUser.id,
      summary: `đã mời ${targetUser.fullName} vào nhóm`,
    });
    return existing;
  }

  const membership = await groupRepository.addMember(targetUser.id, groupId, 'member', 'PENDING');

  await notificationService.notify({
    userId: targetUser.id,
    type: 'group_invite',
    content: `Bạn được mời tham gia nhóm "${group.name}"`,
    groupId,
    referenceId: membership.id,
  });

  // MỚI THÊM: ghi lịch sử hoạt động
  await activityService.log({
    groupId,
    actorId,
    type: 'member.invited',
    targetType: 'member',
    targetId: targetUser.id,
    summary: `đã mời ${targetUser.fullName} vào nhóm`,
  });

  return membership;
};

// Mời 1 người bằng email, GỘP CHUNG cho cả Sinh viên và Giảng viên
exports.invite = async (groupId, actorId, email) => {
  const actorMembership = await groupRepository.findMembership(actorId, groupId);
  if (!actorMembership || actorMembership.role !== 'leader') {
    throw new AppError('Chỉ trưởng nhóm mới có quyền mời', 403);
  }

  const targetUser = await userRepository.findByEmail(email);
  if (!targetUser) {
    throw new AppError('Không tìm thấy tài khoản với email này', 404);
  }

  if (targetUser.role === 'GIANG_VIEN') {
    return supervisorService.inviteSupervisor(groupId, actorId, email);
  }

  return exports.inviteMember(groupId, actorId, email);
};

// MỚI THÊM: Xóa TOÀN BỘ 1 nhóm - chỉ Trưởng nhóm được làm, bắt gõ lại đúng tên nhóm để xác nhận
// (xác nhận chặt vì thao tác này KHÔNG THỂ hoàn tác, mất hết Task/Mốc/Chat/File bên trong)
exports.deleteGroup = async (groupId, actorId, confirmName) => {
  const group = await groupRepository.findById(groupId);
  if (!group) throw new AppError('Nhóm không tồn tại', 404);

  const actorMembership = await groupRepository.findMembership(actorId, groupId);
  if (!actorMembership || actorMembership.role !== 'leader') {
    throw new AppError('Chỉ trưởng nhóm mới có quyền xóa nhóm', 403);
  }

  // So khớp CHÍNH XÁC tên nhóm người dùng gõ lại với tên thật - không trim/không hạ chữ thường,
  // để bắt buộc gõ đúng từng ký tự (giống Cách GitHub xác nhận xóa Repository)
  if (!confirmName || confirmName !== group.name) {
    throw new AppError('Tên nhóm xác nhận không khớp', 400);
  }

  // Lấy trước danh sách đường dẫn file đính kèm - PHẢI lấy TRƯỚC khi xóa Database,
  // vì sau khi transaction chạy xong thì bản ghi Attachment (chứa filePath) đã không còn để truy vấn lại nữa
  const attachments = await groupRepository.getAttachmentPathsByGroup(groupId);

  // Xóa toàn bộ dữ liệu trong Database bằng transaction (Group xóa sau cùng)
  await groupRepository.deleteGroupCascade(groupId);

  // Sau khi Database đã xóa THÀNH CÔNG mới xóa file vật lý trên ổ đĩa
  // (làm SAU để nếu transaction ở trên lỡ lỗi/rollback, file thật vẫn còn nguyên, không mất oan)
  attachments.forEach((a) => {
    fs.unlink(a.filePath, (err) => {
      // Không throw lỗi nếu xóa file thất bại (VD file đã bị xóa tay từ trước) - chỉ log lại, không làm hỏng luồng chính
      if (err) console.error('Không xóa được file vật lý:', a.filePath, err.message);
    });
  });
};