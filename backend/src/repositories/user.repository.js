const prisma = require('../config/prisma');

exports.findByEmail = (email) => prisma.user.findUnique({ where: { email } });

exports.create = (data) => prisma.user.create({ data });

exports.findById = (id) => prisma.user.findUnique({ where: { id } });

// MỚI THÊM: Cập nhật thông tin user - dùng chung cho cả đổi tên, đổi avatar, đổi mật khẩu
// (Service sẽ truyền data khác nhau tuỳ mục đích, hàm này không cần biết cụ thể đang đổi field gì)
exports.update = (id, data) => prisma.user.update({ where: { id }, data });