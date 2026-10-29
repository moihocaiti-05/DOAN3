const reviewRepository = require('../repositories/supervisorReview.repository');
const AppError = require('../utils/AppError');

// MỚI THÊM (Phiên 7 - tính năng 1): danh sách việc đang chờ Giảng viên duyệt, đã gọn lại đúng những gì giao diện cần
exports.getPendingReviewTasks = async (userId) => {
  // Bắt buộc có userId: nếu undefined thì Prisma bỏ qua điều kiện và trả việc của người khác
  if (!userId) throw new AppError('Thiếu thông tin người dùng', 401);

  const tasks = await reviewRepository.findReviewTasksForSupervisor(userId);

  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    parentTitle: t.parentTask ? t.parentTask.title : null, // có giá trị nghĩa là đây là việc con
    groupId: t.groupId,
    groupName: t.group.name,
    assigneeName: t.assignee ? t.assignee.fullName : null,
    submittedAt: t.updatedAt,
  }));
};