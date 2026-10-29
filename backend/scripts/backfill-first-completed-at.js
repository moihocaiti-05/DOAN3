// Chạy 1 LẦN SAU KHI migrate (thêm cột firstCompletedAt, reopenCount):
// điền "ngày hoàn thành lần đầu" cho các task đã xong từ trước.
// Chạy trong thư mục backend:  node scripts/backfill-first-completed-at.js
require('dotenv').config(); // bắt buộc: nếu thiếu, mật khẩu database sẽ bị undefined (lỗi SASL)
const prisma = require('../src/config/prisma');

(async () => {
  try {
    // Task đã xong mà chưa có ngày hoàn thành gần nhất -> ước lượng bằng ngày cập nhật
    const a = await prisma.$executeRaw`UPDATE "tasks" SET "completedAt" = "updatedAt" WHERE "status" = 'done' AND "completedAt" IS NULL`;
    // Task có ngày hoàn thành nhưng chưa có "lần đầu" -> lấy cùng giá trị
    const b = await prisma.$executeRaw`UPDATE "tasks" SET "firstCompletedAt" = "completedAt" WHERE "firstCompletedAt" IS NULL AND "completedAt" IS NOT NULL`;
    console.log(`Đã điền ngày hoàn thành cho ${a} công việc, ngày hoàn thành lần đầu cho ${b} công việc.`);
  } catch (error) {
    console.error('Lỗi:', error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    process.exit();
  }
})();