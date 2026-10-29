const prisma = require('../config/prisma');

// MỚI SỬA: Tạo 1 bản ghi Giảng viên phụ trách nhóm - LUÔN với status PENDING (chờ Giảng viên đồng ý)
// Trước đây tạo xong là coi như phụ trách luôn, giờ phải chờ Giảng viên bấm "Đồng ý" trên thông báo
exports.create = (groupId, userId) =>
  prisma.groupSupervisor.create({ data: { groupId, userId, status: 'PENDING' } });

// Kiểm tra xem 1 Giảng viên đã CÓ bản ghi nào với nhóm này chưa (bất kể trạng thái PENDING/ACCEPTED/DECLINED)
// Dùng để biết: đã mời rồi (đang chờ/đã nhận) hay từng bị từ chối (có thể mời lại)
exports.findOne = (groupId, userId) =>
  prisma.groupSupervisor.findUnique({
    where: { userId_groupId: { userId, groupId } },
  });

// Lấy danh sách Giảng viên đang phụ trách 1 nhóm - trả về ACCEPTED và PENDING (để Frontend hiện nhãn "Đang chờ")
// MỚI SỬA: loại bỏ Giảng viên đã TỪ CHỐI (DECLINED), trước đây vẫn hiện nhãn "Giảng viên" dù đã từ chối
exports.findByGroup = (groupId) =>
  prisma.groupSupervisor.findMany({
    where: { groupId, status: { not: 'DECLINED' } },
    include: {
      user: { select: { id: true, fullName: true, email: true, avatar: true } },
    },
  });

// Lấy danh sách các nhóm mà 1 Giảng viên đang phụ trách (kèm thông tin nhóm)
// MỚI SỬA: chỉ lấy nhóm Giảng viên ĐÃ ĐỒNG Ý. Trước đây không lọc nên lời mời đang chờ / đã từ chối vẫn hiện nhóm lên trang /supervisor
exports.findByUser = (userId) =>
  prisma.groupSupervisor.findMany({
    where: { userId, status: 'ACCEPTED' },
    include: { group: true },
  });

// MỚI THÊM: Cập nhật trạng thái của 1 bản ghi GroupSupervisor theo ID riêng của nó
// Dùng khi: Giảng viên bấm Đồng ý/Từ chối (qua thông báo), hoặc khi mời lại 1 người đã từng từ chối trước đó
exports.updateStatusById = (id, status) =>
  prisma.groupSupervisor.update({ where: { id }, data: { status } });


// MỚI THÊM (Phiên 7): lấy các nhóm Giảng viên ĐÃ ĐỒNG Ý phụ trách, kèm trạng thái + hạn chót của MỌI task trong nhóm
// (gồm cả việc con, vì số liệu toàn app đều đếm cả việc con). Chỉ select đúng 2 cột cần để truy vấn nhẹ.
exports.findOverviewByUser = (userId) =>
  prisma.groupSupervisor.findMany({
    where: { userId, status: 'ACCEPTED' },
    select: {
      group: {
        select: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
          tasks: { select: { status: true, deadline: true } },
        },
      },
    },
  });

// MỚI THÊM (Phiên 7): với mỗi nhóm trong danh sách, lấy thời điểm có hoạt động MỚI NHẤT trong ActivityLog (1 truy vấn cho tất cả nhóm)
// Trả về mảng dạng [{ groupId, _max: { createdAt } }]; nhóm chưa có hoạt động nào thì không có dòng
exports.getLastActivityByGroups = (groupIds) => {
  if (!groupIds.length) return Promise.resolve([]); // không có nhóm thì khỏi truy vấn
  return prisma.activityLog.groupBy({
    by: ['groupId'],
    where: { groupId: { in: groupIds } },
    _max: { createdAt: true },
  });
};