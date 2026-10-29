const prisma = require('../config/prisma'); // PrismaClient đã có adapter (giống các repository khác)

// Tìm mã xác nhận đang chờ của 1 user (null nếu chưa có)
exports.findByUserId = (userId) =>
  prisma.emailVerification.findUnique({ where: { userId } });

// Tạo mã mới cho user, hoặc GHI ĐÈ mã cũ nếu user đã có (upsert = có thì sửa, chưa có thì tạo)
// Khi ghi đè phải đặt lại attempts = 0 để mã mới có đủ lượt nhập
exports.upsert = (userId, { codeHash, expiresAt, lastSentAt }) =>
  prisma.emailVerification.upsert({
    where: { userId },
    create: { userId, codeHash, expiresAt, lastSentAt, attempts: 0 },
    update: { codeHash, expiresAt, lastSentAt, attempts: 0 },
  });

// Tăng số lần nhập sai thêm 1 và trả về bản ghi sau khi tăng
exports.incrementAttempts = (userId) =>
  prisma.emailVerification.update({
    where: { userId },
    data: { attempts: { increment: 1 } },
  });

// Xóa mã của user; dùng deleteMany nên KHÔNG báo lỗi khi bản ghi không tồn tại
exports.deleteByUserId = (userId) =>
  prisma.emailVerification.deleteMany({ where: { userId } });