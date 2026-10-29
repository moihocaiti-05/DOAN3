const prisma = require('../config/prisma');

// Lưu 1 tin nhắn mới vào database - dùng chung cho cả tin nhắn chữ và tin nhắn có file
// MỚI SỬA: include sẵn "sender" ngay khi tạo - để trả về đủ dữ liệu cho Socket.io phát đi ngay,
// không cần Service phải fetch lại lần nữa (trước đây message.service.js không include sender lúc create,
// nên chatHandler.js phải gọi thêm findByGroup rồi lấy phần tử cuối - giờ có thể bỏ bước thừa đó)
exports.create = (data) =>
  prisma.message.create({
    data,
    include: {
      sender: { select: { id: true, fullName: true, avatar: true } },
    },
  });

// Tìm 1 tin nhắn theo ID - dùng khi cần xem/tải file đính kèm của đúng tin nhắn đó
exports.findById = (id) => prisma.message.findUnique({ where: { id } });

// Lấy lịch sử chat của 1 nhóm, sắp xếp theo thời gian cũ -> mới (để hiển thị đúng thứ tự đọc)
exports.findByGroup = (groupId) =>
  prisma.message.findMany({
    where: { groupId },
    orderBy: { createdAt: 'asc' },
    include: {
      sender: { select: { id: true, fullName: true, avatar: true } },
    },
  });