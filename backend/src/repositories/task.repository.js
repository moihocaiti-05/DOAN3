const prisma = require('../config/prisma');

// Tạo task mới (không kèm nhãn)
exports.create = (data) => prisma.task.create({ data });

// Tạo 1 task kèm gắn nhãn (nếu có) - dùng chung cho cả Task thường và Subtask
// (Subtask chỉ khác ở chỗ Service truyền thêm parentTaskId trong data, hàm này không cần biết gì thêm)
exports.createWithTags = (data, tagNames = []) => {
  const taskData = { ...data };

  if (tagNames.length > 0) {
    taskData.tags = {
      connectOrCreate: tagNames.map((name) => ({
        where: { groupId_name: { groupId: data.groupId, name } },
        create: { name, groupId: data.groupId },
      })),
    };
  }

  return prisma.task.create({
    data: taskData,
    // MỚI THÊM: include sẵn thông tin người phụ trách - để tạo xong Subtask là có luôn dữ liệu trả về Frontend, không cần load lại
    include: {
      assignee: { select: { id: true, fullName: true, email: true, avatar: true } },
      tags: true,
    },
  });
};

// Tìm task theo ID
exports.findById = (id) => prisma.task.findUnique({ where: { id } });

// Lấy tất cả task CẤP CAO NHẤT của 1 nhóm - lọc parentTaskId: null để KHÔNG lấy Subtask ra làm card riêng trên Kanban
// MỚI SỬA: kèm luôn danh sách subtasks của từng task, để TaskDetailModal có sẵn dữ liệu mà không cần gọi API riêng
exports.findByGroup = (groupId) =>
  prisma.task.findMany({
    where: { groupId, parentTaskId: null },
    orderBy: { createdAt: 'desc' },
    include: {
      assignee: { select: { id: true, fullName: true, email: true, avatar: true } },
      creator: { select: { id: true, fullName: true } },
      tags: true,
      subtasks: {
        orderBy: { createdAt: 'asc' },
        include: {
          assignee: { select: { id: true, fullName: true, email: true, avatar: true } },
        },
      },
    },
  });

// Cập nhật trạng thái task (dùng khi kéo-thả trên Kanban board, cũng tái dùng cho việc tick xong Subtask)
// MỚI SỬA: "current" = bản ghi task TRƯỚC khi đổi (Service truyền vào) để biết trạng thái cũ:
//  - Chuyển sang done: ghi completedAt = giờ hiện tại; firstCompletedAt chỉ ghi nếu chưa từng có (lần hoàn thành đầu tiên)
//  - Kéo từ done ra trạng thái khác: KHÔNG xóa ngày hoàn thành, chỉ tăng reopenCount (số lần làm lại)
exports.updateStatus = (id, status, current) => {
  const data = { status };
  if (status === 'done') {
    const now = new Date();
    data.completedAt = now;
    if (!current || !current.firstCompletedAt) data.firstCompletedAt = now;
  } else if (current && current.status === 'done') {
    data.reopenCount = { increment: 1 };
  }
  // MỚI THÊM (Phiên 12): nộp Kiểm định lại hoặc được duyệt thì xóa ghi chú từ chối cũ
  if (status === 'review' || status === 'done') {
    data.reviewNote = null;
    data.reviewedAt = null;
    data.reviewedByName = null;
  }
  return prisma.task.update({ where: { id }, data });
};

// MỚI THÊM (Phiên 12): TỪ CHỐI ở bước Kiểm định - đưa task về "Làm lại" kèm ghi chú lý do
exports.reject = (id, note, reviewerName) =>
  prisma.task.update({
    where: { id },
    data: { status: 'redo', reviewNote: note, reviewedAt: new Date(), reviewedByName: reviewerName },
  });

// Gán người phụ trách cho task
exports.updateAssignee = (id, assignedTo) =>
  prisma.task.update({ where: { id }, data: { assignedTo } });

// Xóa task - nếu task này có Subtask bên trong, Database tự xóa luôn các Subtask đó (nhờ onDelete: Cascade ở schema)
exports.remove = (id) => prisma.task.delete({ where: { id } });

// Tạo nhiều task cùng lúc (dùng cho các dòng import KHÔNG có nhãn)
exports.createMany = (dataArray) =>
  prisma.task.createMany({ data: dataArray });

// Cập nhật nội dung mô tả của task
exports.updateDescription = (id, description) =>
  prisma.task.update({ where: { id }, data: { description } });

// Cập nhật (ghi đè) toàn bộ danh sách nhãn của 1 task
exports.updateTags = (id, groupId, tagNames = []) =>
  prisma.task.update({
    where: { id },
    data: {
      tags: {
        set: [],
        connectOrCreate: tagNames.map((name) => ({
          where: { groupId_name: { groupId, name } },
          create: { name, groupId },
        })),
      },
    },
    include: { tags: true },
  });

// Cập nhật thông tin chung của task (tên, độ ưu tiên, deadline, mốc)
// data chỉ chứa các field được phép sửa - Service sẽ lọc trước khi gọi hàm này
exports.update = (id, data) =>
  prisma.task.update({
    where: { id },
    data,
    include: {
      assignee: { select: { id: true, fullName: true, email: true, avatar: true } },
      creator: { select: { id: true, fullName: true } },
      tags: true,
      // MỚI THÊM: kèm subtasks để dữ liệu trả về luôn đầy đủ, nhất quán với findByGroup
      subtasks: {
        orderBy: { createdAt: 'asc' },
        include: {
          assignee: { select: { id: true, fullName: true, email: true, avatar: true } },
        },
      },
    },
  });