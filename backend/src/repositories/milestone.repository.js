const prisma = require('../config/prisma');

// Tạo 1 mốc mới trong nhóm
exports.create = (data) => prisma.milestone.create({ data });

// Lấy TẤT CẢ mốc của 1 nhóm dạng PHẲNG (chưa dựng thành cây), kèm tasks để tính % và parentId để Service dựng cây
exports.findByGroup = (groupId) =>
  prisma.milestone.findMany({
    where: { groupId },
    orderBy: { order: 'asc' },
    // MỚI SỬA: lấy kèm NHÃN, NGƯỜI PHỤ TRÁCH và VIỆC CHA của từng task (chỉ chọn field cần thiết) để Frontend vẽ việc cha/con và tag
    include: {
      tasks: {
        include: {
          tags: { select: { id: true, name: true } },
          assignee: { select: { id: true, fullName: true } },
          parentTask: { select: { id: true, title: true } },
        },
      },
    },
  });

exports.findById = (id) => prisma.milestone.findUnique({ where: { id } });

// MỚI SỬA: Đếm số mốc CÙNG CẤP (cùng parentId) trong nhóm - dùng để gán "order" đúng thứ tự riêng cho từng cấp
// Trước đây đếm TẤT CẢ mốc trong nhóm (countByGroup), giờ phải đếm đúng "anh em cùng cha" để thứ tự hiển thị đúng
exports.countSiblings = (groupId, parentId) =>
  prisma.milestone.count({ where: { groupId, parentId: parentId || null } });

// MỚI THÊM: Đếm số mốc CON trực tiếp của 1 mốc - dùng để chặn xóa nếu mốc đó còn mốc con bên trong
exports.countChildren = (id) => prisma.milestone.count({ where: { parentId: id } });

exports.update = (id, data) => prisma.milestone.update({ where: { id }, data });

// MỚI SỬA: xóa mốc thì XÓA LUÔN các nhận xét của mốc đó (dùng $transaction: lỗi giữa chừng thì hoàn tác cả 2)
// Nếu không xóa, nhận xét sẽ thành "mồ côi" (không thuộc task hay mốc nào) và nằm mãi trong Database
exports.remove = (id) =>
  prisma.$transaction([
    prisma.comment.deleteMany({ where: { milestoneId: id } }),
    prisma.milestone.delete({ where: { id } }),
  ]);

// MỚI THÊM: lấy danh sách PHẲNG rất nhẹ (chỉ id, parentId, order) của mọi mốc trong nhóm - dùng để kiểm tra khi di chuyển mốc
exports.findAllFlat = (groupId) =>
  prisma.milestone.findMany({
    where: { groupId },
    select: { id: true, parentId: true, order: true },
  });

// MỚI THÊM: ghi lại parentId + order của NHIỀU mốc trong 1 giao dịch (lỗi giữa chừng thì hoàn tác hết, cây không bao giờ bị hỏng nửa vời)
// updates = [{ id, parentId, order }, ...]
exports.applyOrder = (updates) =>
  prisma.$transaction(
    updates.map((u) =>
      prisma.milestone.update({
        where: { id: u.id },
        data: { parentId: u.parentId, order: u.order },
      })
    )
  );