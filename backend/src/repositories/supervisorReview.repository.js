const prisma = require('../config/prisma');

// MỚI THÊM (Phiên 7 - tính năng 1): lấy MỌI việc đang ở trạng thái "review" (Kiểm định) thuộc các nhóm
// mà Giảng viên này ĐÃ ĐỒNG Ý phụ trách. Lọc quyền nằm ngay trong điều kiện where nên người ngoài không thấy được việc nào.
// Cũ nhất xếp trước (việc chờ lâu nhất cần duyệt trước).
exports.findReviewTasksForSupervisor = (userId) =>
  prisma.task.findMany({
    where: {
      status: 'review',
      group: { supervisors: { some: { userId, status: 'ACCEPTED' } } },
    },
    select: {
      id: true,
      title: true,
      updatedAt: true, // dùng làm thời điểm "nộp kiểm định" (việc đang chờ duyệt thường không bị sửa thêm)
      groupId: true,
      group: { select: { id: true, name: true } },
      assignee: { select: { id: true, fullName: true } }, // người làm việc này (có thể null nếu chưa giao)
      parentTask: { select: { id: true, title: true } }, // nếu là việc con thì lấy tên việc cha
    },
    orderBy: { updatedAt: 'asc' },
  });