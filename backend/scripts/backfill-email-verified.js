require('dotenv').config(); // BẮT BUỘC có dòng này, nếu không DATABASE_URL bị undefined khi chạy script riêng

const prisma = require('../src/config/prisma'); // dùng lại PrismaClient của dự án

// Script chạy tay MỘT LẦN sau khi migrate: đánh dấu mọi tài khoản CŨ là "đã xác nhận email"
// Lý do: cột emailVerified mới mặc định false, nếu không chạy script này thì tài khoản cũ bị chặn đăng nhập
// An toàn khi chạy lại: chỉ đụng tới tài khoản chưa xác nhận VÀ không có mã đang chờ
// (tài khoản đăng ký mới luôn có mã đang chờ trong bảng email_verifications nên sẽ không bị đánh dấu nhầm)
async function main() {
  const result = await prisma.user.updateMany({
    where: { emailVerified: false, emailVerification: { is: null } },
    data: { emailVerified: true },
  });
  console.log(`Đã đánh dấu ${result.count} tài khoản cũ là đã xác nhận email.`);
}

main()
  .catch((err) => {
    console.error('Lỗi khi chạy script:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect(); // đóng kết nối để script tự thoát
  });