const activityRepository = require('../repositories/activity.repository');
const groupRepository = require('../repositories/group.repository');
const AppError = require('../utils/AppError');

// Kiểm tra quyền XEM nhóm (thành viên hoặc Giảng viên đã đồng ý) - cùng logic với các service khác
const ensureCanViewGroup = async (userId, groupId) => {
  if (!userId) throw new AppError('Thiếu thông tin người dùng', 401);
  if (!groupId) throw new AppError('Thiếu mã nhóm', 400);

  const supervisorship = await groupRepository.findSupervisorship(userId, groupId);
  if (supervisorship) return;

  const membership = await groupRepository.findMembership(userId, groupId);
  if (membership) return;

  throw new AppError('Bạn không có quyền xem dữ liệu của nhóm này', 403);
};

// Ghi 1 dòng lịch sử. AN TOÀN: nếu ghi lỗi chỉ in ra console, KHÔNG làm hỏng thao tác chính của người dùng
// (giống cách notifySafely). summary là câu mô tả KHÔNG gồm tên người làm, VD: 'đã tạo công việc "Viết báo cáo"'
exports.log = async ({ groupId, actorId, type, targetType, targetId = null, summary }) => {
  try {
    if (!groupId || !actorId) return; // thiếu thông tin thì bỏ qua, không ném lỗi
    await activityRepository.create({ groupId, actorId, type, targetType, targetId, summary });
  } catch (error) {
    console.error('Không ghi được lịch sử hoạt động:', error.message);
  }
};

// Lấy 1 trang lịch sử của nhóm (mới nhất trước) - có kiểm tra quyền xem
exports.getGroupActivities = async (groupId, actorId, page, limit) => {
  await ensureCanViewGroup(actorId, groupId);

  // Làm sạch tham số phân trang do client gửi lên: trang >= 1, mỗi trang 1..50 dòng (mặc định 20)
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));

  const [items, total] = await Promise.all([
    activityRepository.findByGroup(groupId, (safePage - 1) * safeLimit, safeLimit),
    activityRepository.countByGroup(groupId),
  ]);

  return { items, total, page: safePage, limit: safeLimit, hasMore: safePage * safeLimit < total };
};