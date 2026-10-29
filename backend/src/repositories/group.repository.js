const prisma = require('../config/prisma');

// Tạo 1 nhóm mới trong database
exports.create = (data) => prisma.group.create({ data });

// Tìm nhóm theo ID
exports.findById = (id) => prisma.group.findUnique({ where: { id } });

// Tìm nhóm theo mã mời (dùng khi có người nhập mã để tham gia)
exports.findByInviteCode = (inviteCode) =>
  prisma.group.findUnique({ where: { inviteCode } });

// Lấy tất cả nhóm mà 1 user đang là thành viên (dùng cho trang chủ - danh sách nhóm của tôi)
// MỚI SỬA: chỉ lấy nhóm mà user ĐÃ ĐỒNG Ý (status ACCEPTED).
// Trước đây không lọc trạng thái nên lời mời đang chờ (PENDING) hoặc đã từ chối (DECLINED) vẫn hiện nhóm lên trang chủ
exports.findGroupsByUserId = (userId) =>
  prisma.group.findMany({
    where: {
      members: {
        some: { userId, status: 'ACCEPTED' }, // MỚI SỬA: thêm điều kiện đã đồng ý
      },
    },
    include: {
      // MỚI SỬA: chỉ đếm/trả thành viên ĐÃ ĐỒNG Ý, để số "x thành viên" ở trang chủ không tính người đang chờ
      members: { where: { status: 'ACCEPTED' } },
    },
  });

// Thêm 1 user vào làm thành viên của 1 nhóm
exports.addMember = (userId, groupId, role = 'member', status = 'ACCEPTED') =>
  prisma.groupMember.create({
    data: { userId, groupId, role, status },
  });

// Kiểm tra 1 user có đang là thành viên ĐÃ ĐỒNG Ý của 1 nhóm hay không
exports.findMembership = (userId, groupId) =>
  prisma.groupMember.findFirst({
    where: { userId, groupId, status: 'ACCEPTED' },
  });

// Kiểm tra 1 user có bản ghi thành viên nào trong nhóm hay không, KHÔNG PHÂN BIỆT trạng thái
exports.findMembershipAny = (userId, groupId) =>
  prisma.groupMember.findUnique({
    where: { userId_groupId: { userId, groupId } },
  });

// Lấy danh sách thành viên của 1 nhóm, kèm thông tin cơ bản của từng người
// MỚI SỬA: loại bỏ người đã TỪ CHỐI lời mời (DECLINED). Vẫn giữ ACCEPTED và PENDING
// (PENDING để modal Thành viên hiện nhãn "Đang chờ"). Trước đây lấy tất cả nên người từ chối vẫn hiện như thành viên
exports.getMembers = (groupId) =>
  prisma.groupMember.findMany({
    where: { groupId, status: { not: 'DECLINED' } },
    include: {
      user: { select: { id: true, fullName: true, email: true, avatar: true } },
    },
  });

// Tìm 1 thành viên ĐÃ ĐỒNG Ý trong nhóm dựa theo email - dùng khi đọc file Excel import
exports.findMemberByEmail = async (groupId, email) => {
  const membership = await prisma.groupMember.findFirst({
    where: {
      groupId,
      status: 'ACCEPTED',
      user: { email },
    },
    include: { user: true },
  });
  return membership;
};

// Đổi vai trò của 1 thành viên trong nhóm (dùng cho chức năng chuyển quyền trưởng nhóm)
exports.updateMemberRole = (userId, groupId, newRole) =>
  prisma.groupMember.update({
    where: { userId_groupId: { userId, groupId } },
    data: { role: newRole },
  });

// Xóa 1 thành viên khỏi nhóm
exports.removeMember = (userId, groupId) =>
  prisma.groupMember.delete({
    where: { userId_groupId: { userId, groupId } },
  });

// Đếm số lượng "leader" hiện có trong nhóm - dùng để đảm bảo nhóm luôn có ít nhất 1 trưởng nhóm
exports.countLeaders = (groupId) =>
  prisma.groupMember.count({ where: { groupId, role: 'leader' } });

// Cập nhật trạng thái (PENDING/ACCEPTED/DECLINED) của 1 bản ghi GroupMember theo ID riêng của nó
exports.updateMemberStatusById = (id, status) =>
  prisma.groupMember.update({ where: { id }, data: { status } });

// Lấy toàn bộ đường dẫn file đính kèm (Attachment.filePath) của mọi Task trong 1 nhóm
// Dùng TRƯỚC khi xóa nhóm, để Service biết cần xóa những file vật lý nào trên ổ đĩa
exports.getAttachmentPathsByGroup = (groupId) =>
  prisma.attachment.findMany({
    where: { task: { groupId } },
    select: { filePath: true },
  });

// Xóa TOÀN BỘ dữ liệu thuộc về 1 nhóm bằng $transaction (chạy tuần tự, lỗi giữa chừng thì rollback hết)
// Thứ tự bắt buộc: xóa bảng "con" TRƯỚC, Group xóa SAU CÙNG - để không bị lỗi ràng buộc khóa ngoại
exports.deleteGroupCascade = (groupId) =>
  prisma.$transaction([
    prisma.activityLog.deleteMany({ where: { groupId } }), // PHIÊN 5: dọn lịch sử hoạt động của nhóm
    prisma.comment.deleteMany({ where: { OR: [{ task: { groupId } }, { milestone: { groupId } }] } }),
    prisma.attachment.deleteMany({ where: { task: { groupId } } }),
    prisma.message.deleteMany({ where: { groupId } }),
    prisma.task.deleteMany({ where: { groupId } }),        // Subtask cũng bị xóa theo vì cùng groupId
    prisma.milestone.deleteMany({ where: { groupId } }),    // Cả cây mốc (gốc lẫn con) xóa chung trong 1 lệnh
    prisma.tag.deleteMany({ where: { groupId } }),
    prisma.groupSupervisor.deleteMany({ where: { groupId } }),
    prisma.groupMember.deleteMany({ where: { groupId } }),
    prisma.notification.deleteMany({ where: { groupId } }), // dọn luôn thông báo cũ liên quan tới nhóm này
    prisma.group.delete({ where: { id: groupId } }),
  ]);

// Kiểm tra 1 user có phải GIẢNG VIÊN ĐÃ ĐỒNG Ý phụ trách nhóm này không
// (Giảng viên nằm ở bảng GroupSupervisor, KHÔNG nằm trong GroupMember nên findMembership không tìm thấy họ)
exports.findSupervisorship = (userId, groupId) =>
  prisma.groupSupervisor.findFirst({
    where: { userId, groupId, status: 'ACCEPTED' },
  });

// Lấy danh sách Giảng viên ĐÃ ĐỒNG Ý của 1 nhóm - dùng để gắn nhãn vai trò "Giảng viên" lên từng nhận xét
exports.getAcceptedSupervisors = (groupId) =>
  prisma.groupSupervisor.findMany({
    where: { groupId, status: 'ACCEPTED' },
  });