const supervisorRepository = require('../repositories/supervisor.repository');
const groupRepository = require('../repositories/group.repository');
const userRepository = require('../repositories/user.repository');
const notificationService = require('./notification.service');
const activityService = require('./activity.service'); // MỚI THÊM: ghi lịch sử hoạt động
const AppError = require('../utils/AppError');

// Kiểm tra người gọi API có quyền XEM dữ liệu của 1 nhóm hay không (dùng cho API ĐỌC)
// Được xem: Giảng viên ĐÃ ĐỒNG Ý phụ trách nhóm, hoặc thành viên ĐÃ ĐỒNG Ý. Người ngoài nhóm, người đang chờ (PENDING) hoặc đã từ chối (DECLINED) bị chặn 403
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

// Mời 1 Giảng viên phụ trách nhóm - chỉ tạo lời mời PENDING, chờ Giảng viên bấm Đồng ý
exports.inviteSupervisor = async (groupId, actorId, email) => {
  const actorMembership = await groupRepository.findMembership(actorId, groupId);
  if (!actorMembership || actorMembership.role !== 'leader') {
    throw new AppError('Chỉ trưởng nhóm mới có quyền mời giảng viên hướng dẫn', 403);
  }

  const targetUser = await userRepository.findByEmail(email);
  if (!targetUser) {
    throw new AppError('Không tìm thấy tài khoản với email này', 404);
  }

  if (targetUser.role !== 'GIANG_VIEN') {
    throw new AppError('Email này chưa đăng ký với vai trò Giảng viên hướng dẫn', 400);
  }

  const existing = await supervisorRepository.findOne(groupId, targetUser.id);
  const group = await groupRepository.findById(groupId);

  if (existing) {
    if (existing.status === 'ACCEPTED') {
      throw new AppError('Giảng viên này đã phụ trách nhóm rồi', 400);
    }
    if (existing.status === 'PENDING') {
      throw new AppError('Đã gửi lời mời, đang chờ giảng viên phản hồi', 400);
    }
    // status === 'DECLINED' -> mời lại: cập nhật về PENDING thay vì tạo bản ghi mới
    await supervisorRepository.updateStatusById(existing.id, 'PENDING');
    await notificationService.notify({
      userId: targetUser.id,
      type: 'supervisor_invited',
      content: `Bạn được mời làm giảng viên hướng dẫn nhóm "${group.name}"`,
      groupId,
      referenceId: existing.id,
    });
    // MỚI THÊM: ghi lịch sử (mời lại)
    await activityService.log({
      groupId,
      actorId,
      type: 'supervisor.invited',
      targetType: 'supervisor',
      targetId: existing.id,
      summary: `đã mời giảng viên ${targetUser.fullName} làm giảng viên hướng dẫn`,
    });
    return existing;
  }

  const supervisor = await supervisorRepository.create(groupId, targetUser.id); // status PENDING mặc định

  await notificationService.notify({
    userId: targetUser.id,
    type: 'supervisor_invited',
    content: `Bạn được mời làm giảng viên hướng dẫn nhóm "${group.name}"`,
    groupId,
    referenceId: supervisor.id,
  });

  // MỚI THÊM: ghi lịch sử (mời lần đầu)
  await activityService.log({
    groupId,
    actorId,
    type: 'supervisor.invited',
    targetType: 'supervisor',
    targetId: supervisor.id,
    summary: `đã mời giảng viên ${targetUser.fullName} làm giảng viên hướng dẫn`,
  });

  return supervisor;
};

// Thêm tham số actorId (người gọi API) và kiểm tra quyền XEM nhóm trước khi trả danh sách Giảng viên
exports.getGroupSupervisors = async (groupId, actorId) => {
  await ensureCanViewGroup(actorId, groupId);
  return supervisorRepository.findByGroup(groupId);
};

exports.getMySupervisedGroups = (userId) => supervisorRepository.findByUser(userId);


// ===== MỚI THÊM (Phiên 7): TRANG TỔNG QUAN CHO GIẢNG VIÊN =====

// Nhóm bị coi là "ít hoạt động" khi đã từ ngần này ngày trở lên không có hoạt động nào (người dùng chọn 7 ngày)
const IDLE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Lấy 0 giờ 0 phút của 1 ngày, để so sánh THEO NGÀY chứ không theo giờ
const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Trả về danh sách nhóm Giảng viên phụ trách, mỗi nhóm đã tính sẵn: tiến độ, số việc trễ hạn, lần hoạt động gần nhất, trạng thái
// Quy ước: việc "trễ hạn" = có deadline < hôm nay (theo ngày) và chưa "done" (khớp quy ước hiện có của app)
exports.getSupervisorOverview = async (userId) => {
  // Bắt buộc có userId: nếu undefined thì Prisma bỏ qua điều kiện và trả nhóm của người khác
  if (!userId) throw new AppError('Thiếu thông tin người dùng', 401);

  // Chỉ nhóm mà Giảng viên này ĐÃ ĐỒNG Ý phụ trách (lọc ngay trong Repository nên người ngoài không thấy nhóm nào)
  const rows = await supervisorRepository.findOverviewByUser(userId);
  const groupIds = rows.map((r) => r.group.id);

  const lastRows = await supervisorRepository.getLastActivityByGroups(groupIds);
  const lastMap = new Map(lastRows.map((r) => [r.groupId, r._max.createdAt]));

  const today = startOfDay(new Date());

  const groups = rows.map(({ group }) => {
    const totalTasks = group.tasks.length;
    const doneTasks = group.tasks.filter((t) => t.status === 'done').length;
    const lateTasks = group.tasks.filter(
      (t) => t.status !== 'done' && t.deadline && new Date(t.deadline) < today
    ).length;
    const progress = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);

    // Chưa có hoạt động nào thì lấy ngày tạo nhóm làm mốc tính số ngày im lặng
    const lastActivityAt = lastMap.get(group.id) || null;
    const baseDate = lastActivityAt || group.createdAt;
    const idleDays = Math.max(0, Math.round((today - startOfDay(baseDate)) / MS_PER_DAY));

    // Thứ tự ưu tiên: trễ hạn > ít hoạt động > đang ổn
    // Nhóm đã xong 100% việc thì im lặng là bình thường, không đánh dấu "ít hoạt động"
    const allDone = totalTasks > 0 && doneTasks === totalTasks;
    let status = 'ok';
    if (lateTasks > 0) status = 'late';
    else if (idleDays >= IDLE_DAYS && !allDone) status = 'idle';

    return {
      id: group.id,
      name: group.name,
      description: group.description,
      totalTasks,
      doneTasks,
      progress,
      lateTasks,
      lastActivityAt, // null nếu nhóm chưa có hoạt động nào
      idleDays,
      status,
    };
  });

  // Trả kèm ngưỡng để Frontend ghi đúng chữ "ít hoạt động (N ngày)" mà không phải viết cứng số
  return { idleThresholdDays: IDLE_DAYS, groups };
};