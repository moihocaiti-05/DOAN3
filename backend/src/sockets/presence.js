// File này chỉ làm 1 việc: GHI NHỚ ai đang "ở trong" trang của từng nhóm (đang mở trang nhóm đó)
// Dữ liệu chỉ nằm trong bộ nhớ của server (không lưu database): server khởi động lại thì trống, mọi người tự vào lại khi Frontend kết nối lại
//
// Cấu trúc:  groupId -> Map( userId -> Set(socketId) )
// Dùng Set socketId vì 1 người có thể mở nhiều tab / nhiều thiết bị: chỉ khi ĐÓNG HẾT các tab thì mới tính là rời nhóm
const rooms = new Map();

// Thêm 1 kết nối (socketId) của userId vào nhóm
exports.add = (groupId, userId, socketId) => {
  if (!rooms.has(groupId)) rooms.set(groupId, new Map());
  const users = rooms.get(groupId);
  if (!users.has(userId)) users.set(userId, new Set());
  users.get(userId).add(socketId);
};

// Bỏ 1 kết nối khỏi nhóm; hết kết nối thì bỏ luôn userId, hết người thì bỏ luôn nhóm cho nhẹ bộ nhớ
exports.remove = (groupId, userId, socketId) => {
  const users = rooms.get(groupId);
  if (!users || !users.has(userId)) return;
  const sockets = users.get(userId);
  sockets.delete(socketId);
  if (sockets.size === 0) users.delete(userId);
  if (users.size === 0) rooms.delete(groupId);
};

// Danh sách userId đang online trong nhóm
exports.getOnlineUserIds = (groupId) => {
  const users = rooms.get(groupId);
  return users ? [...users.keys()] : [];
};