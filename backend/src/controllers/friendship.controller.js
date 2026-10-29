const friendshipService = require('../services/friendship.service');

// Việc báo realtime ("friend_updated") và tạo/xóa thông báo đã nằm trong friendship.service.js,
// để dù bấm từ khung chat hay từ chuông thông báo thì kết quả vẫn giống nhau - Controller chỉ nhận request và trả kết quả

// GET /friends - bạn bè + lời mời đã nhận + lời mời đã gửi của mình
exports.getAll = async (req, res, next) => {
  try {
    const data = await friendshipService.getFriendData(req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// POST /friends/request - gửi lời mời, body: { email } HOẶC { userId, groupId }
exports.sendRequest = async (req, res, next) => {
  try {
    const { email, userId, groupId } = req.body;
    const result = await friendshipService.sendRequest(req.user.id, {
      email,
      targetUserId: userId,
      groupId,
    });
    res.status(201).json({ success: true, data: { autoAccepted: result.autoAccepted } });
  } catch (error) {
    next(error);
  }
};

// POST /friends/:friendshipId/accept - đồng ý lời mời
exports.accept = async (req, res, next) => {
  try {
    await friendshipService.acceptRequest(req.user.id, req.params.friendshipId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

// DELETE /friends/:friendshipId - từ chối lời mời / hủy lời mời đã gửi / hủy kết bạn
exports.remove = async (req, res, next) => {
  try {
    await friendshipService.removeFriendship(req.user.id, req.params.friendshipId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};