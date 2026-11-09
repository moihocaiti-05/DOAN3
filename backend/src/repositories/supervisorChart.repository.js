const prisma = require('../config/prisma');

// Lấy TẤT CẢ việc của 1 nhóm (gồm cả việc con, vì số liệu toàn app đều đếm cả việc con)
// Chỉ select đúng các cột cần để tính biểu đồ nên truy vấn nhẹ
exports.findTasksByGroup = (groupId) =>
  prisma.task.findMany({
    where: { groupId },
    select: {
      status: true,           // để biết việc đã "done" hay chưa
      deadline: true,         // hạn chót, dùng cho biểu đồ trễ hạn
      createdAt: true,        // ngày tạo, dùng tính "thời gian làm xong 1 việc" và tổng việc theo thời gian
      completedAt: true,      // lần hoàn thành GẦN NHẤT
      firstCompletedAt: true, // lần hoàn thành ĐẦU TIÊN
      assignedTo: true,       // người được giao việc (null = chưa giao), dùng cho biểu đồ thành viên
      milestoneId: true,      // việc thuộc mốc nào (null = chưa gắn mốc)
      reopenCount: true,      // số lần việc bị kéo ra khỏi "done" để làm lại
    },
  });

// Lấy tên của các người được giao việc
// Chỉ nhận danh sách id (không đụng tới quan hệ của bảng thành viên) nên cả người đã rời nhóm vẫn có tên
exports.findUsersByIds = (ids) => {
  if (!ids.length) return Promise.resolve([]); // không có ai thì khỏi truy vấn (tránh điều kiện rỗng)
  return prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, fullName: true },
  });
};

// Lấy tất cả mốc của nhóm để dựng cây mốc (mốc lớn chứa mốc nhỏ)
// MỚI SỬA: lấy thêm dueDate (hạn chót của mốc) để xác định NGÀY KẾT THÚC của đồ án
exports.findMilestonesByGroup = (groupId) =>
  prisma.milestone.findMany({
    where: { groupId },
    select: { id: true, title: true, parentId: true, order: true, createdAt: true, dueDate: true },
  });

// Lấy thời điểm của các hoạt động trong nhóm kể từ ngày "since", để đếm theo tuần
// Chỉ lấy cột createdAt cho nhẹ (không cần nội dung hoạt động)
exports.findActivityDates = (groupId, since) =>
  prisma.activityLog.findMany({
    where: { groupId, createdAt: { gte: since } },
    select: { createdAt: true },
  });