require('dotenv').config(); // MỚI THÊM: đọc file .env (mật khẩu database...) vì script này chạy riêng, không qua server.js

// Chạy 1 LẦN SAU KHI migrate: điền "ngày hoàn thành" cho các task đã xong từ trước.
// Chạy trong thư mục backend:  node scripts/backfill-completed-at.js
// Lưu ý: chỉ là ƯỚC LƯỢNG (dùng ngày cập nhật gần nhất), vì trước đây hệ thống không lưu ngày hoàn thành thật.
const prisma = require('../src/config/prisma');

prisma
  .$executeRaw`UPDATE "tasks" SET "completedAt" = "updatedAt" WHERE "status" = 'done' AND "completedAt" IS NULL`
  .then((count) => {
    console.log(`Đã điền ngày hoàn thành (ước lượng) cho ${count} công việc.`);
  })
  .catch((error) => {
    console.error('Lỗi:', error.message);
    process.exitCode = 1;
  })
  .finally(() => process.exit());