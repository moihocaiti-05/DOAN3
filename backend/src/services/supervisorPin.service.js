const supervisorRepository = require('../repositories/supervisor.repository');
const pinRepository = require('../repositories/supervisorPin.repository');
const AppError = require('../utils/AppError');

// MỚI THÊM (GV6): ghim / bỏ ghim 1 nhóm cho CHÍNH Giảng viên đang đăng nhập
// Chỉ Giảng viên ĐÃ ĐỒNG Ý phụ trách nhóm đó mới ghim được; người khác ghim không ảnh hưởng gì tới Giảng viên khác
exports.setPin = async (userId, groupId, pinned) => {
  // Bắt buộc có đủ: nếu undefined thì Prisma bỏ qua điều kiện và có thể khớp nhầm bản ghi
  if (!userId) throw new AppError('Thiếu thông tin người dùng', 401);
  if (!groupId) throw new AppError('Thiếu mã nhóm', 400);
  if (typeof pinned !== 'boolean') throw new AppError('Giá trị "pinned" phải là true hoặc false', 400);

  const record = await supervisorRepository.findOne(groupId, userId);
  if (!record || record.status !== 'ACCEPTED') {
    throw new AppError('Bạn không phụ trách nhóm này', 403);
  }

  await pinRepository.updatePinned(record.id, pinned);
  return { groupId, pinned };
};