const bcrypt = require('bcryptjs');
const fs = require('fs'); // dùng để xóa file avatar cũ trên ổ đĩa khi người dùng đổi avatar mới
const userRepository = require('../repositories/user.repository');
const AppError = require('../utils/AppError');

// Lấy thông tin cá nhân của người đang đăng nhập - dùng cho trang Profile
exports.getProfile = async (userId) => {
  const user = await userRepository.findById(userId);
  if (!user) throw new AppError('Người dùng không tồn tại', 404);
  // KHÔNG được trả password (dù đã mã hoá) ra ngoài, kể cả trang Profile của chính chủ
  const { password, ...rest } = user;
  return rest;
};

// Đổi tên hiển thị
exports.updateProfile = async (userId, { fullName }) => {
  const user = await userRepository.update(userId, { fullName });
  const { password, ...rest } = user;
  return rest;
};

// Đổi ảnh đại diện - filePath là đường dẫn file mới (multer đã lưu sẵn lên ổ đĩa trước khi gọi hàm này)
exports.updateAvatar = async (userId, filePath) => {
  // Lấy avatar CŨ trước khi ghi đè, để biết đường dẫn cần xóa sau đó
  const oldUser = await userRepository.findById(userId);
  const user = await userRepository.update(userId, { avatar: filePath });

  // Xóa file avatar cũ trên ổ đĩa SAU KHI Database đã cập nhật thành công, tránh mất file oan nếu update lỗi
  // Không throw lỗi nếu xóa thất bại (VD user chưa từng có avatar trước đó) - chỉ log lại
  if (oldUser?.avatar) {
    fs.unlink(oldUser.avatar, (err) => {
      if (err) console.error('Không xóa được avatar cũ:', oldUser.avatar, err.message);
    });
  }

  const { password, ...rest } = user;
  return rest;
};

// Đổi mật khẩu - bắt buộc gõ đúng mật khẩu HIỆN TẠI mới cho đổi (bảo mật, tránh người khác chiếm máy đổi bừa)
exports.changePassword = async (userId, currentPassword, newPassword) => {
  const user = await userRepository.findById(userId);
  if (!user) throw new AppError('Người dùng không tồn tại', 404);

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    throw new AppError('Mật khẩu hiện tại không đúng', 400);
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await userRepository.update(userId, { password: hashedPassword });
};