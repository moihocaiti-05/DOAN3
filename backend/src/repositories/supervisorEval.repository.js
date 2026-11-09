const prisma = require('../config/prisma');

// Các trường của 1 đánh giá trả về cho Frontend (không trả supervisorId, milestoneId vì đã biết từ ngữ cảnh)
const EVAL_SELECT = { rating: true, score: true, note: true, updatedAt: true };

// MỚI THÊM: các trường của 1 công việc để Giảng viên XEM NỘI DUNG khi đánh giá (dùng cho cả việc chính lẫn việc con)
const TASK_SELECT = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  deadline: true,
  completedAt: true,
  reopenCount: true,
  assignee: { select: { fullName: true } },
  tags: { select: { name: true } },
};

// Giảng viên này có ĐANG phụ trách nhóm (đã bấm Đồng ý) không? Trả về bản ghi hoặc null
// Tự lọc status ACCEPTED ngay tại đây để lời mời đang chờ (PENDING) hoặc đã từ chối (DECLINED) không chấm được
exports.findAcceptedSupervisorship = (userId, groupId) =>
  prisma.groupSupervisor.findFirst({ where: { userId, groupId, status: 'ACCEPTED' } });

// Lấy MỌI mốc của nhóm (dạng phẳng, đã sắp theo order) kèm: các việc gắn trực tiếp và đánh giá CỦA GIẢNG VIÊN NÀY
// MỚI SỬA: lấy đầy đủ nội dung việc chính (parentTaskId = null) và việc con của từng việc chính (quan hệ subtasks)
exports.findMilestonesWithEvaluation = (groupId, supervisorId) =>
  prisma.milestone.findMany({
    where: { groupId },
    orderBy: { order: 'asc' },
    select: {
      id: true,
      title: true,
      dueDate: true,
      order: true,
      parentId: true,
      tasks: {
        where: { parentTaskId: null },
        orderBy: { createdAt: 'asc' },
        select: {
          ...TASK_SELECT,
          subtasks: { orderBy: { createdAt: 'asc' }, select: TASK_SELECT },
        },
      },
      evaluations: { where: { supervisorId }, select: EVAL_SELECT },
    },
  });

// Tạo mới hoặc GHI ĐÈ đánh giá của 1 Giảng viên cho 1 mốc (nhờ @@unique([milestoneId, supervisorId]) nên upsert tìm đúng bản ghi)
exports.upsert = (milestoneId, supervisorId, data) =>
  prisma.milestoneEvaluation.upsert({
    where: { milestoneId_supervisorId: { milestoneId, supervisorId } },
    create: { milestoneId, supervisorId, ...data },
    update: data,
    select: EVAL_SELECT,
  });

// Xóa đánh giá của 1 Giảng viên cho 1 mốc (deleteMany để không báo lỗi nếu chưa có đánh giá nào)
exports.remove = (milestoneId, supervisorId) =>
  prisma.milestoneEvaluation.deleteMany({ where: { milestoneId, supervisorId } });