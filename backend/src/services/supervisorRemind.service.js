const supervisorRepository = require('../repositories/supervisor.repository');
const remindRepository = require('../repositories/supervisorRemind.repository');
const notificationService = require('./notification.service');
const AppError = require('../utils/AppError');

// Câu nhắc mặc định khi Giảng viên không gõ gì (Frontend cũng điền sẵn đúng câu này vào ô nhập)
const DEFAULT_MESSAGE = 'Hãy cập nhật tiến độ các công việc của nhóm.';
const MAX_MESSAGE_LENGTH = 300;

// MỚI THÊM (tính năng 2): Giảng viên bấm "Nhắc nhóm" -> gửi thông báo chuông cho TẤT CẢ thành viên nhóm
// Cố ý KHÔNG ghi vào lịch sử hoạt động (ActivityLog): nếu ghi, mỗi lần nhắc sẽ làm nhóm trông như "vừa có hoạt động"
// và trang tổng quan sẽ không còn báo "ít hoạt động" cho đúng nhóm đang bị nhắc.
exports.remindGroup = async (groupId, actorId, rawMessage) => {
  // Bắt buộc có groupId và actorId: nếu undefined thì Prisma bỏ qua điều kiện và khớp bản ghi bất kỳ
  if (!actorId) throw new AppError('Thiếu thông tin người dùng', 401);
  if (!groupId) throw new AppError('Thiếu mã nhóm', 400);

  // Chỉ Giảng viên ĐÃ ĐỒNG Ý phụ trách nhóm này mới được nhắc (đang chờ hoặc đã từ chối thì không)
  const supervisorship = await supervisorRepository.findOne(groupId, actorId);
  if (!supervisorship || supervisorship.status !== 'ACCEPTED') {
    throw new AppError('Bạn không phải giảng viên phụ trách nhóm này', 403);
  }

  // Làm sạch lời nhắn: bỏ khoảng trắng 2 đầu, để trống thì dùng câu mặc định, quá dài thì báo lỗi
  const message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new AppError(`Lời nhắn tối đa ${MAX_MESSAGE_LENGTH} ký tự`, 400);
  }
  const finalMessage = message || DEFAULT_MESSAGE;

  const [group, actor, members] = await Promise.all([
    remindRepository.findGroupName(groupId),
    remindRepository.findUserName(actorId),
    remindRepository.findAcceptedMemberIds(groupId),
  ]);
  if (!group) throw new AppError('Không tìm thấy nhóm', 404);

  // Gửi cho mọi thành viên, trừ chính người gọi (phòng trường hợp tài khoản vừa là thành viên vừa là Giảng viên)
  const receiverIds = members.map((m) => m.userId).filter((id) => id !== actorId);
  if (receiverIds.length === 0) {
    throw new AppError('Nhóm chưa có thành viên nào để nhắc', 400);
  }

  const content = `Giảng viên ${actor ? actor.fullName : ''} nhắc nhóm "${group.name}": ${finalMessage}`;

  await Promise.all(
    receiverIds.map((userId) =>
      notificationService.notify({
        userId,
        type: 'supervisor_reminder',
        content,
        groupId, // để bấm vào thông báo mở đúng nhóm
      })
    )
  );

  return { notified: receiverIds.length };
};