const notificationRepository = require('../repositories/notification.repository');
const groupRepository = require('../repositories/group.repository');
const supervisorRepository = require('../repositories/supervisor.repository');
const activityService = require('./activity.service'); // MỚI THÊM: ghi lịch sử hoạt động
const AppError = require('../utils/AppError');
const socketInstance = require('../sockets/socketInstance');

// Hàm dùng chung để tạo + gửi 1 thông báo real-time
// nhận thêm "referenceId" - id của GroupMember/GroupSupervisor đang chờ đồng ý (dùng cho loại thông báo lời mời)
exports.notify = async ({ userId, type, content, groupId = null, referenceId = null }) => {
  const notification = await notificationRepository.create({ userId, type, content, groupId, referenceId });

  const io = socketInstance.getIO();
  if (io) {
    io.to(`notification_${userId}`).emit('new_notification', notification);
  }

  return notification;
};

exports.getMyNotifications = (userId) => notificationRepository.findByUser(userId);

exports.getUnreadCount = (userId) => notificationRepository.countUnread(userId);

exports.markAsRead = (id) => notificationRepository.markAsRead(id);

exports.markAllAsRead = (userId) => notificationRepository.markAllAsRead(userId);

// Xử lý khi người được mời bấm "Đồng ý" hoặc "Từ chối" ngay trên thông báo
// notificationId: thông báo đang thao tác, userId: người đang đăng nhập (phải trùng chủ thông báo), action: 'accept' hoặc 'decline'
exports.respondToInvite = async (notificationId, userId, action) => {
  if (!['accept', 'decline'].includes(action)) {
    throw new AppError('Hành động không hợp lệ', 400);
  }

  const notification = await notificationRepository.findById(notificationId);
  if (!notification) {
    throw new AppError('Thông báo không tồn tại', 404);
  }

  // Chỉ đúng người nhận thông báo này mới được phản hồi
  if (notification.userId !== userId) {
    throw new AppError('Bạn không có quyền phản hồi thông báo này', 403);
  }

  // Chỉ 2 loại thông báo này là "lời mời" cần phản hồi, các loại khác (task_assigned...) không áp dụng
  // (Lời mời kết bạn KHÔNG đi qua hàm này - nó gọi thẳng API kết bạn, xem NotificationBell.jsx và friendship.service.js)
  if (!['group_invite', 'supervisor_invited'].includes(notification.type)) {
    throw new AppError('Thông báo này không phải lời mời', 400);
  }

  const newStatus = action === 'accept' ? 'ACCEPTED' : 'DECLINED';

  // Dựa vào "type" để biết cần cập nhật bảng GroupMember hay GroupSupervisor
  if (notification.type === 'group_invite') {
    await groupRepository.updateMemberStatusById(notification.referenceId, newStatus);
  } else {
    await supervisorRepository.updateStatusById(notification.referenceId, newStatus);
  }

  // MỚI THÊM: chỉ ghi lịch sử khi ĐỒNG Ý (từ chối thì nhóm không cần biết trên tab Hoạt động)
  // activityService.log tự bắt lỗi bên trong nên không làm hỏng việc chấp nhận lời mời
  if (action === 'accept' && notification.groupId) {
    const isMember = notification.type === 'group_invite';
    await activityService.log({
      groupId: notification.groupId,
      actorId: userId,
      type: isMember ? 'member.accepted' : 'supervisor.accepted',
      targetType: isMember ? 'member' : 'supervisor',
      targetId: notification.referenceId,
      summary: isMember
        ? 'đã chấp nhận lời mời và tham gia nhóm'
        : 'đã chấp nhận lời mời làm giảng viên hướng dẫn nhóm',
    });
  }

  // Xóa thông báo sau khi đã xử lý xong, để nút Đồng ý/Từ chối không còn hiện lại
  await notificationRepository.remove(notificationId);
};

// Xóa mọi thông báo cùng loại gắn với 1 đối tượng - dùng khi lời mời kết bạn đã được xử lý
// (đồng ý / từ chối / hủy) để thông báo cũ không còn hiện nút bấm trong chuông
exports.removeByReference = (type, referenceId) =>
  notificationRepository.removeByReference(type, referenceId);