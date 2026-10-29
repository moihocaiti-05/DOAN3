const friendshipRepository = require('../repositories/friendship.repository');
const conversationRepository = require('../repositories/conversation.repository'); // dùng lại findGroupPeople
const notificationService = require('./notification.service'); // MỚI THÊM: để tạo / xóa thông báo kết bạn
const { assertCanChat } = require('./message.service'); // dùng lại hàm kiểm tra "được chat trong nhóm"
const socketInstance = require('../sockets/socketInstance'); // MỚI THÊM: để phát realtime "friend_updated"
const AppError = require('../utils/AppError');

// Khóa cặp: id 2 người sắp theo thứ tự chữ cái rồi ghép lại -> (A,B) và (B,A) ra cùng 1 khóa
const makePairKey = (idA, idB) => [idA, idB].sort().join('_');

// MỚI THÊM: báo cho những người liên quan biết "dữ liệu bạn bè vừa thay đổi, hãy tải lại"
// Chuông thông báo và khung chat đều lắng nghe sự kiện này nên cả 2 luôn khớp nhau dù bấm ở bên nào
// Gửi tới phòng thông báo riêng (notification_<userId>) - cùng cách với tin nhắn phòng chat
const emitFriendUpdated = (userIds) => {
  const io = socketInstance.getIO();
  if (!io) return;
  [...new Set(userIds)].forEach((id) => {
    io.to(`notification_${id}`).emit('friend_updated');
  });
};

// MỚI THÊM: gửi 1 thông báo kết bạn - nếu lỗi thì chỉ ghi log, KHÔNG làm hỏng thao tác kết bạn chính
const notifySafely = async (payload) => {
  try {
    await notificationService.notify(payload);
  } catch (error) {
    console.error('Không gửi được thông báo kết bạn:', error.message);
  }
};

// MỚI THÊM: xóa thông báo "lời mời kết bạn" gắn với 1 lời mời (khi lời mời đã được xử lý xong)
// Cũng chỉ ghi log nếu lỗi, và không báo lỗi nếu thông báo vốn không tồn tại
const clearRequestNotification = async (friendshipId) => {
  try {
    await notificationService.removeByReference('friend_request', friendshipId);
  } catch (error) {
    console.error('Không xóa được thông báo lời mời kết bạn:', error.message);
  }
};

// Hai người có đang là bạn bè (đã Đồng ý) không - conversation.service dùng hàm này để cho phép chat riêng
exports.areFriends = async (idA, idB) => {
  const friendship = await friendshipRepository.findByPairKey(makePairKey(idA, idB));
  return !!friendship && friendship.status === 'ACCEPTED';
};

// Lấy toàn bộ dữ liệu bạn bè của 1 người, chia sẵn thành 3 nhóm cho Frontend dùng:
// friends: đã là bạn bè; incoming: lời mời mình NHẬN đang chờ mình trả lời; outgoing: lời mời mình ĐÃ GỬI đang chờ người kia
exports.getFriendData = async (userId) => {
  const rows = await friendshipRepository.findAllOfUser(userId);

  const friends = [];
  const incoming = [];
  const outgoing = [];

  rows.forEach((row) => {
    // "Người còn lại" trong cặp (không phải mình)
    const other = row.requesterId === userId ? row.addressee : row.requester;

    if (row.status === 'ACCEPTED') {
      friends.push({ friendshipId: row.id, user: other });
    } else if (row.addresseeId === userId) {
      incoming.push({ id: row.id, user: other });
    } else {
      outgoing.push({ id: row.id, user: other });
    }
  });

  return { friends, incoming, outgoing };
};

// Gửi lời mời kết bạn - có 2 cách:
// 1) Nhập email: { email }
// 2) Bấm "Kết bạn" trong danh sách thành viên nhóm: { targetUserId, groupId } - cả 2 phải cùng thuộc nhóm đó
exports.sendRequest = async (userId, { email, targetUserId, groupId }) => {
  let target;

  if (email) {
    const cleanEmail = String(email).trim();
    if (!cleanEmail) {
      throw new AppError('Vui lòng nhập email', 400);
    }
    target = await friendshipRepository.findUserByEmail(cleanEmail);
    if (!target) {
      throw new AppError('Không tìm thấy người dùng với email này', 404);
    }
  } else if (targetUserId) {
    // Cách kết bạn từ danh sách thành viên: bắt buộc có groupId để chặn việc đoán id người lạ rồi gửi lời mời hàng loạt
    if (!groupId) {
      throw new AppError('Thiếu thông tin nhóm', 400);
    }
    await assertCanChat(userId, groupId);
    const people = await conversationRepository.findGroupPeople(groupId);
    target = people.find((p) => p.id === targetUserId);
    if (!target) {
      throw new AppError('Người này không thuộc nhóm đồ án', 403);
    }
  } else {
    throw new AppError('Thiếu email hoặc người cần kết bạn', 400);
  }

  if (target.id === userId) {
    throw new AppError('Không thể tự kết bạn với chính mình', 400);
  }

  const pairKey = makePairKey(userId, target.id);
  const existing = await friendshipRepository.findByPairKey(pairKey);

  if (existing) {
    if (existing.status === 'ACCEPTED') {
      throw new AppError('Hai bạn đã là bạn bè', 400);
    }
    if (existing.requesterId === userId) {
      throw new AppError('Bạn đã gửi lời mời cho người này rồi, hãy chờ họ trả lời', 400);
    }
    // Người kia đã mời mình từ trước mà mình lại mời họ -> coi như mình Đồng ý luôn, không tạo lời mời trùng
    const accepted = await friendshipRepository.accept(existing.id);

    // MỚI THÊM: lời mời của người kia đang nằm trong chuông của mình -> xóa đi vì đã xử lý xong
    await clearRequestNotification(existing.id);
    // MỚI THÊM: báo cho người đã mời trước đó biết mình đã đồng ý (mình là người nhận lời mời nên là "addressee")
    await notifySafely({
      userId: existing.requesterId,
      type: 'friend_accepted',
      content: `${accepted.addressee.fullName} đã đồng ý kết bạn với bạn`,
      referenceId: existing.id,
    });
    emitFriendUpdated([userId, target.id]); // MỚI THÊM: cả 2 bên tải lại bạn bè + thông báo

    return { friendship: accepted, autoAccepted: true, otherUserId: target.id };
  }

  let friendship;
  try {
    friendship = await friendshipRepository.create({
      requesterId: userId,
      addresseeId: target.id,
      pairKey,
    });
  } catch (error) {
    // P2002 = vi phạm unique: 2 bên cùng gửi lời mời một lúc nên bản ghi vừa được người kia tạo xong
    if (error.code === 'P2002') {
      throw new AppError('Lời mời kết bạn đã tồn tại', 409);
    }
    throw error;
  }

  // MỚI THÊM: gửi thông báo "có lời mời kết bạn" cho người nhận, referenceId = id lời mời để chuông biết xử lý đúng lời mời nào
  await notifySafely({
    userId: target.id,
    type: 'friend_request',
    content: `${friendship.requester.fullName} đã gửi cho bạn lời mời kết bạn`,
    referenceId: friendship.id,
  });
  emitFriendUpdated([userId, target.id]); // MỚI THÊM: cả 2 bên tải lại bạn bè + thông báo

  return { friendship, autoAccepted: false, otherUserId: target.id };
};

// Đồng ý 1 lời mời - chỉ NGƯỜI NHẬN mới được đồng ý, và lời mời phải còn đang chờ
exports.acceptRequest = async (userId, friendshipId) => {
  const friendship = await friendshipRepository.findById(friendshipId);
  if (!friendship) {
    throw new AppError('Lời mời không tồn tại', 404);
  }
  if (friendship.addresseeId !== userId) {
    throw new AppError('Bạn không thể đồng ý lời mời này', 403);
  }
  if (friendship.status !== 'PENDING') {
    throw new AppError('Lời mời này đã được xử lý', 400);
  }

  const accepted = await friendshipRepository.accept(friendshipId);

  // MỚI THÊM: xóa thông báo lời mời trong chuông (để chuông và khung chat khớp nhau)
  await clearRequestNotification(friendshipId);
  // MỚI THÊM: báo cho người đã gửi lời mời biết mình đã đồng ý (người đồng ý là "addressee")
  await notifySafely({
    userId: friendship.requesterId,
    type: 'friend_accepted',
    content: `${accepted.addressee.fullName} đã đồng ý kết bạn với bạn`,
    referenceId: friendshipId,
  });
  emitFriendUpdated([userId, friendship.requesterId]);

  return { otherUserId: friendship.requesterId };
};

// Xóa 1 quan hệ - dùng chung cho 3 việc: từ chối lời mời (người nhận), hủy lời mời đã gửi (người gửi), hủy kết bạn (cả 2 bên)
// Chỉ 1 trong 2 người của cặp mới được xóa
exports.removeFriendship = async (userId, friendshipId) => {
  const friendship = await friendshipRepository.findById(friendshipId);
  if (!friendship) {
    throw new AppError('Quan hệ kết bạn không tồn tại', 404);
  }
  if (friendship.requesterId !== userId && friendship.addresseeId !== userId) {
    throw new AppError('Bạn không có quyền thao tác', 403);
  }

  await friendshipRepository.remove(friendshipId);

  // MỚI THÊM: xóa thông báo lời mời trong chuông của người nhận (nếu là từ chối / hủy lời mời; nếu là hủy kết bạn thì không có gì để xóa)
  await clearRequestNotification(friendshipId);

  const otherUserId = friendship.requesterId === userId ? friendship.addresseeId : friendship.requesterId;
  emitFriendUpdated([userId, otherUserId]);

  return { otherUserId };
};