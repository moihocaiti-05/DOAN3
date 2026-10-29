const userRepository = require('../repositories/user.repository'); // lấy vai trò + ngày tạo tài khoản
const userStatsRepository = require('../repositories/userStats.repository'); // các câu đếm
const AppError = require('../utils/AppError');

// Thống kê nhỏ hiện ở đầu trang Thông tin cá nhân; nội dung khác nhau theo vai trò:
// - Sinh viên / Trưởng nhóm: { groupCount, completedTasks }
// - Giảng viên: { groupCount (nhóm phụ trách), commentCount (nhận xét đã gửi) }
exports.getMyStats = async (userId) => {
  // Bắt buộc có userId: nếu undefined thì Prisma BỎ QUA điều kiện where và đếm sai trên toàn bảng
  if (!userId) throw new AppError('Thiếu thông tin người dùng', 401);

  const user = await userRepository.findById(userId);
  if (!user) throw new AppError('Người dùng không tồn tại', 404);

  // Các câu đếm độc lập nhau nên chạy song song cho nhanh
  if (user.role === 'GIANG_VIEN') {
    const [groupCount, commentCount] = await Promise.all([
      userStatsRepository.countSupervisedGroups(userId),
      userStatsRepository.countComments(userId),
    ]);
    return { role: user.role, joinedAt: user.createdAt, groupCount, commentCount };
  }

  const [groupCount, completedTasks] = await Promise.all([
    userStatsRepository.countMemberGroups(userId),
    userStatsRepository.countCompletedTasks(userId),
  ]);
  return { role: user.role, joinedAt: user.createdAt, groupCount, completedTasks };
};