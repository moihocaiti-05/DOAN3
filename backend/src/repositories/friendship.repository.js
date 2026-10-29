const prisma = require('../config/prisma');

// Các trường thông tin người dùng cần trả về cho Frontend (không bao giờ trả password)
const userSelect = { id: true, fullName: true, avatar: true, role: true };

// Phần "include" dùng chung: kèm thông tin cả người gửi lẫn người nhận lời mời
const withUsers = {
  requester: { select: userSelect },
  addressee: { select: userSelect },
};

// Tìm người dùng theo email, KHÔNG phân biệt chữ hoa/chữ thường (VD "A@Gmail.com" vẫn khớp "a@gmail.com")
exports.findUserByEmail = (email) =>
  prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: userSelect,
  });

// Tìm 1 bản ghi kết bạn theo khóa cặp (id 2 người ghép theo thứ tự) - dù ai mời ai cũng ra cùng 1 bản ghi
exports.findByPairKey = (pairKey) => prisma.friendship.findUnique({ where: { pairKey } });

// Tìm 1 bản ghi kết bạn theo ID
exports.findById = (id) => prisma.friendship.findUnique({ where: { id } });

// Tạo lời mời kết bạn mới (trạng thái mặc định là PENDING)
exports.create = ({ requesterId, addresseeId, pairKey }) =>
  prisma.friendship.create({
    data: { requesterId, addresseeId, pairKey },
    include: withUsers,
  });

// Chuyển 1 lời mời sang ACCEPTED (đã là bạn bè)
exports.accept = (id) =>
  prisma.friendship.update({
    where: { id },
    data: { status: 'ACCEPTED' },
    include: withUsers,
  });

// Xóa bản ghi - dùng chung cho: từ chối lời mời, hủy lời mời đã gửi, hủy kết bạn
exports.remove = (id) => prisma.friendship.delete({ where: { id } });

// Lấy mọi bản ghi liên quan tới 1 người (cả đã gửi lẫn đã nhận, cả đang chờ lẫn đã là bạn bè), mới nhất lên đầu
exports.findAllOfUser = (userId) =>
  prisma.friendship.findMany({
    where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
    orderBy: { createdAt: 'desc' },
    include: withUsers,
  });