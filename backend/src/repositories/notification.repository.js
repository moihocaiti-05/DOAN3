const prisma = require('../config/prisma');

// Tạo 1 thông báo mới, lưu vào database
exports.create = (data) => prisma.notification.create({ data });

// Lấy tất cả thông báo của 1 user, mới nhất lên đầu
exports.findByUser = (userId) =>
  prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

// MỚI THÊM: Tìm 1 thông báo theo ID - dùng khi xử lý Đồng ý/Từ chối lời mời
exports.findById = (id) => prisma.notification.findUnique({ where: { id } });

// Đếm số thông báo CHƯA ĐỌC
exports.countUnread = (userId) =>
  prisma.notification.count({ where: { userId, isRead: false } });

// Đánh dấu 1 thông báo là đã đọc
exports.markAsRead = (id) =>
  prisma.notification.update({ where: { id }, data: { isRead: true } });

// Đánh dấu TẤT CẢ thông báo của 1 user là đã đọc
exports.markAllAsRead = (userId) =>
  prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });

// MỚI THÊM: Xóa 1 thông báo - dùng sau khi người dùng đã Đồng ý/Từ chối lời mời xong, để nút không còn hiện lại nữa
exports.remove = (id) => prisma.notification.delete({ where: { id } });

// MỚI THÊM: Xóa mọi thông báo cùng loại gắn với 1 đối tượng (VD loại "friend_request" gắn với 1 lời mời kết bạn)
// Dùng deleteMany nên không báo lỗi nếu thông báo đã bị xóa từ trước (VD đã xử lý ở chỗ khác)
exports.removeByReference = (type, referenceId) =>
  prisma.notification.deleteMany({ where: { type, referenceId } });