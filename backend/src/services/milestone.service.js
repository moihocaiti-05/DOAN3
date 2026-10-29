const milestoneRepository = require('../repositories/milestone.repository');
const groupRepository = require('../repositories/group.repository');
const activityService = require('./activity.service'); // MỚI THÊM: ghi lịch sử hoạt động
const AppError = require('../utils/AppError');

// MỚI THÊM: Kiểm tra người gọi API có quyền XEM dữ liệu của 1 nhóm hay không (dùng cho API ĐỌC timeline)
// Được xem: Giảng viên ĐÃ ĐỒNG Ý phụ trách nhóm, hoặc thành viên ĐÃ ĐỒNG Ý. Người ngoài nhóm, người đang chờ (PENDING) hoặc đã từ chối (DECLINED) bị chặn 403
// (Cùng logic với ensureCanViewGroup trong task.service.js - viết lại ở đây để không phải sửa thêm file khác)
const ensureCanViewGroup = async (userId, groupId) => {
  // Bắt buộc có userId và groupId: nếu undefined thì Prisma sẽ BỎ QUA điều kiện đó và vô tình khớp bản ghi bất kỳ
  if (!userId) throw new AppError('Thiếu thông tin người dùng', 401);
  if (!groupId) throw new AppError('Thiếu mã nhóm', 400);

  // Kiểm tra Giảng viên TRƯỚC vì tài khoản có thể vừa là thành viên vừa là Giảng viên của cùng 1 nhóm
  const supervisorship = await groupRepository.findSupervisorship(userId, groupId);
  if (supervisorship) return;

  const membership = await groupRepository.findMembership(userId, groupId);
  if (membership) return;

  throw new AppError('Bạn không có quyền xem dữ liệu của nhóm này', 403);
};

exports.createMilestone = async (data, userId) => {
  const { groupId, dueDate, parentId } = data;
  const cleanParentId = parentId || null;

  const membership = await groupRepository.findMembership(userId, groupId);
  if (!membership) {
    throw new AppError('Bạn không thuộc nhóm này', 403);
  }

  if (cleanParentId) {
    const parent = await milestoneRepository.findById(cleanParentId);
    if (!parent || parent.groupId !== groupId) {
      throw new AppError('Mốc cha không hợp lệ', 400);
    }
  }

  const siblingCount = await milestoneRepository.countSiblings(groupId, cleanParentId);

  const milestone = await milestoneRepository.create({
    ...data,
    parentId: cleanParentId,
    dueDate: dueDate ? new Date(dueDate) : null,
    order: siblingCount,
  });

  // MỚI THÊM: ghi lịch sử hoạt động
  await activityService.log({
    groupId,
    actorId: userId,
    type: 'milestone.created',
    targetType: 'milestone',
    targetId: milestone.id,
    summary: `đã tạo mốc "${milestone.title}"`,
  });

  return milestone;
};

// Tính đệ quy tổng số task và số task đã xong cho 1 mốc, TÍNH GỘP CẢ các mốc con bên trong
const aggregate = (node) => {
  let total = node.tasks.length;
  let done = node.tasks.filter((t) => t.status === 'done').length;

  for (const child of node.children) {
    const childResult = aggregate(child);
    total += childResult.total;
    done += childResult.done;
  }

  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return { total, done, percent };
};

const buildTree = (flatList) => {
  const map = new Map();
  flatList.forEach((m) => map.set(m.id, { ...m, children: [] }));

  const roots = [];
  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
};

// Chuyển 1 node trong cây (kèm children thô) thành dữ liệu trả về cho Frontend
const formatNode = (node) => {
  const { total, done, percent } = aggregate(node);
  return {
    id: node.id,
    title: node.title,
    description: node.description,
    dueDate: node.dueDate,
    order: node.order,
    parentId: node.parentId,
    taskCount: total,
    doneCount: done,
    percent,
    // MỚI THÊM: danh sách TÊN các công việc GÁN TRỰC TIẾP vào mốc này (kể cả Subtask, vì Subtask
    // cũng có milestoneId trùng mốc cha nên vẫn nằm trong node.tasks) - để Frontend hiện tiêu đề từng task,
    // không chỉ mỗi con số như trước. Chỉ lấy vài field cần thiết, không trả nguyên object Task đầy đủ
    tasks: node.tasks
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        // MỚI THÊM: thông tin để Frontend phân biệt việc cha/con và hiện tag, người phụ trách, hạn chót
        priority: t.priority,
        deadline: t.deadline,
        completedAt: t.completedAt, // MỚI THÊM: ngày hoàn thành gần nhất - để vẽ biểu đồ "Hoàn thành theo tuần"
        parentTaskId: t.parentTaskId,
        parentTaskId: t.parentTaskId,
        parentTitle: t.parentTask ? t.parentTask.title : null,
        tags: (t.tags || []).map((tag) => ({ id: tag.id, name: tag.name })),
        assignee: t.assignee ? { id: t.assignee.id, fullName: t.assignee.fullName } : null,
      })),
    children: node.children
      .sort((a, b) => a.order - b.order)
      .map(formatNode),
  };
};

// MỚI SỬA: thêm tham số actorId (người gọi API) và kiểm tra quyền XEM nhóm trước khi trả cây mốc
// Trước đây hàm này trả cây mốc (kèm tên từng task) cho bất kỳ ai biết groupId (chỉ cần đăng nhập)
exports.getTimeline = async (groupId, actorId) => {
  await ensureCanViewGroup(actorId, groupId);

  const flatMilestones = await milestoneRepository.findByGroup(groupId);
  const tree = buildTree(flatMilestones);
  return tree
    .sort((a, b) => a.order - b.order)
    .map(formatNode);
};

exports.deleteMilestone = async (id, userId) => {
  const milestone = await milestoneRepository.findById(id);
  if (!milestone) throw new AppError('Mốc không tồn tại', 404);

  const membership = await groupRepository.findMembership(userId, milestone.groupId);
  if (!membership) throw new AppError('Bạn không thuộc nhóm này', 403);

  const childrenCount = await milestoneRepository.countChildren(id);
  if (childrenCount > 0) {
    throw new AppError('Mốc này còn mốc con bên trong, hãy xóa hết mốc con trước', 400);
  }

  const result = await milestoneRepository.remove(id);

  // MỚI THÊM: ghi lịch sử hoạt động (sau khi xóa thành công)
  await activityService.log({
    groupId: milestone.groupId,
    actorId: userId,
    type: 'milestone.deleted',
    targetType: 'milestone',
    targetId: id,
    summary: `đã xóa mốc "${milestone.title}"`,
  });

  return result;
};

// MỚI THÊM: kiểm tra người gọi là thành viên ĐÃ ĐỒNG Ý của nhóm chứa mốc (giống luật của việc xóa mốc) - dùng cho thao tác GHI
const ensureMilestoneMember = async (milestone, userId) => {
  if (!userId) throw new AppError('Thiếu thông tin người dùng', 401);
  const membership = await groupRepository.findMembership(userId, milestone.groupId);
  if (!membership) throw new AppError('Bạn không thuộc nhóm này', 403);
};

// MỚI THÊM: sửa tên / mô tả / hạn chót của 1 mốc
exports.updateMilestone = async (id, userId, data) => {
  const milestone = await milestoneRepository.findById(id);
  if (!milestone) throw new AppError('Mốc không tồn tại', 404);
  await ensureMilestoneMember(milestone, userId);

  const { title, description, dueDate } = data;

  // dueDate: undefined = giữ nguyên; rỗng/null = xóa hạn; có giá trị = đổi sang Date (sai định dạng thì báo 400)
  let dueValue;
  if (dueDate === undefined) {
    dueValue = undefined;
  } else if (!dueDate) {
    dueValue = null;
  } else {
    dueValue = new Date(dueDate);
    if (Number.isNaN(dueValue.getTime())) throw new AppError('Hạn chót không hợp lệ', 400);
  }

  const updated = await milestoneRepository.update(id, {
    title,
    description: description === undefined ? undefined : description || null,
    dueDate: dueValue,
  });

  await activityService.log({
    groupId: milestone.groupId,
    actorId: userId,
    type: 'milestone.updated',
    targetType: 'milestone',
    targetId: id,
    summary: `đã chỉnh sửa mốc "${updated.title}"`,
  });

  return updated;
};

// MỚI THÊM: DI CHUYỂN 1 mốc (kéo-thả): đổi mốc cha và/hoặc vị trí trong danh sách anh em
// parentId = id mốc cha mới (null = đưa ra thành mốc gốc); index = vị trí mới trong danh sách anh em (TÍNH KHÔNG gồm chính mốc đang di chuyển)
exports.moveMilestone = async (id, userId, { parentId, index }) => {
  const milestone = await milestoneRepository.findById(id);
  if (!milestone) throw new AppError('Mốc không tồn tại', 404);
  await ensureMilestoneMember(milestone, userId);

  const newParentId = parentId || null;
  if (newParentId === id) throw new AppError('Không thể đặt mốc vào bên trong chính nó', 400);

  const all = await milestoneRepository.findAllFlat(milestone.groupId);
  const byId = new Map(all.map((m) => [m.id, m]));

  if (newParentId) {
    if (!byId.has(newParentId)) throw new AppError('Mốc đích không hợp lệ', 400);
    // Chống vòng lặp: đi từ mốc đích ngược lên gốc, nếu gặp chính mốc đang di chuyển nghĩa là đang đặt mốc vào bên trong con/cháu của nó
    const seen = new Set();
    let cur = byId.get(newParentId);
    while (cur && !seen.has(cur.id)) {
      if (cur.id === id) {
        throw new AppError('Không thể đặt mốc vào bên trong mốc con của chính nó', 400);
      }
      seen.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : null;
    }
  }

  const oldParentId = milestone.parentId || null;
  // Danh sách anh em của 1 cấp, đã sắp theo order, LOẠI mốc đang di chuyển
  const siblingsOf = (pid) =>
    all
      .filter((m) => (m.parentId || null) === pid && m.id !== id)
      .sort((a, b) => a.order - b.order);

  const newSiblings = siblingsOf(newParentId);
  const at = Math.max(0, Math.min(Number(index) || 0, newSiblings.length));
  newSiblings.splice(at, 0, { id });

  // Đánh lại số thứ tự 0,1,2... cho cả cấp mới (và cấp cũ nếu chuyển sang cha khác) để không bao giờ bị trùng/hở số
  const updates = newSiblings.map((m, i) => ({ id: m.id, parentId: newParentId, order: i }));
  if (oldParentId !== newParentId) {
    siblingsOf(oldParentId).forEach((m, i) =>
      updates.push({ id: m.id, parentId: oldParentId, order: i })
    );
  }

  await milestoneRepository.applyOrder(updates);

  await activityService.log({
    groupId: milestone.groupId,
    actorId: userId,
    type: 'milestone.moved',
    targetType: 'milestone',
    targetId: id,
    summary: `đã di chuyển mốc "${milestone.title}"`,
  });

  return { id, parentId: newParentId };
};