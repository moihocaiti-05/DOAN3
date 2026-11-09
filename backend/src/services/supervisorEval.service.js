const evalRepository = require('../repositories/supervisorEval.repository');
const milestoneRepository = require('../repositories/milestone.repository');
const groupRepository = require('../repositories/group.repository');
const activityService = require('./activity.service'); // ghi lịch sử hoạt động của nhóm
const AppError = require('../utils/AppError');

// 3 mức xếp loại hợp lệ và chữ hiển thị tương ứng
const VALID_RATINGS = ['pass', 'improve', 'fail'];
const RATING_TEXT = { pass: 'Đạt', improve: 'Cần cải thiện', fail: 'Chưa đạt' };
const NOTE_MAX_LENGTH = 1000;

// MỚI THÊM: đổi 1 công việc lấy từ Prisma thành dữ liệu gọn cho Frontend (tên người phụ trách và tên nhãn là chữ thuần)
const mapTask = (t) => ({
  id: t.id,
  title: t.title,
  description: t.description,
  status: t.status,
  priority: t.priority,
  deadline: t.deadline,
  completedAt: t.completedAt,
  reopenCount: t.reopenCount,
  assigneeName: t.assignee ? t.assignee.fullName : null,
  tags: t.tags.map((tag) => tag.name),
});

// Chỉ Giảng viên ĐÃ ĐỒNG Ý phụ trách nhóm mới được xem / chấm đánh giá (thành viên và người ngoài nhóm bị 403)
const assertSupervisor = async (userId, groupId) => {
  // Bắt buộc có userId và groupId: nếu undefined thì Prisma BỎ QUA điều kiện đó và có thể khớp nhầm bản ghi bất kỳ
  if (!userId) throw new AppError('Thiếu thông tin người dùng', 401);
  if (!groupId) throw new AppError('Thiếu mã nhóm', 400);

  const supervisorship = await evalRepository.findAcceptedSupervisorship(userId, groupId);
  if (!supervisorship) {
    throw new AppError('Chỉ giảng viên phụ trách nhóm này mới được đánh giá mốc', 403);
  }
};

// Danh sách mốc của 1 nhóm kèm đánh giá của Giảng viên đang đăng nhập
// Trả về danh sách PHẲNG đã sắp theo thứ tự cây (mốc cha rồi tới mốc con), mỗi phần tử có "depth" để Frontend thụt lề
exports.getGroupEvaluations = async (userId, groupId) => {
  await assertSupervisor(userId, groupId);

  const group = await groupRepository.findById(groupId);
  if (!group) throw new AppError('Không tìm thấy nhóm', 404);

  const rows = await evalRepository.findMilestonesWithEvaluation(groupId, userId);

  // Gom mốc theo mốc cha (rows đã sắp theo order tăng dần nên thứ tự anh em được giữ nguyên)
  const byParent = new Map();
  rows.forEach((m) => {
    const key = m.parentId || null; // mốc gốc dùng khóa null
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(m);
  });

  // Duyệt cây theo chiều sâu để ra danh sách phẳng đúng thứ tự hiển thị
  const milestones = [];
  const walk = (parentId, depth) => {
    (byParent.get(parentId) || []).forEach((m) => {
      milestones.push({
        id: m.id,
        title: m.title,
        dueDate: m.dueDate,
        depth,
        hasChildren: byParent.has(m.id),
        totalTasks: m.tasks.length,
        doneTasks: m.tasks.filter((t) => t.status === 'done').length,
        tasks: m.tasks.map((t) => ({ ...mapTask(t), subtasks: t.subtasks.map(mapTask) })), // MỚI THÊM: nội dung từng việc + việc con
        evaluation: m.evaluations[0] || null, // null = chưa đánh giá
      });
      walk(m.id, depth + 1);
    });
  };
  walk(null, 0);

  return {
    groupName: group.name,
    evaluatedCount: milestones.filter((m) => m.evaluation).length,
    totalCount: milestones.length,
    milestones,
  };
};

// Lưu (tạo mới hoặc sửa) đánh giá của Giảng viên đang đăng nhập cho 1 mốc
exports.saveEvaluation = async (userId, milestoneId, body) => {
  if (!milestoneId) throw new AppError('Thiếu mã mốc', 400);

  const milestone = await milestoneRepository.findById(milestoneId);
  if (!milestone) throw new AppError('Không tìm thấy mốc', 404);

  // Quyền được kiểm tra theo nhóm CỦA MỐC (không tin groupId do Frontend gửi)
  await assertSupervisor(userId, milestone.groupId);

  const input = body || {};

  // Xếp loại: bắt buộc, phải là 1 trong 3 giá trị
  if (!VALID_RATINGS.includes(input.rating)) {
    throw new AppError('Xếp loại không hợp lệ (chọn Đạt, Cần cải thiện hoặc Chưa đạt)', 400);
  }

  // Điểm: không bắt buộc; nếu có thì phải là số từ 0 đến 10, làm tròn 1 chữ số thập phân
  let score = null;
  if (input.score !== undefined && input.score !== null && input.score !== '') {
    score = Number(input.score);
    if (!Number.isFinite(score) || score < 0 || score > 10) {
      throw new AppError('Điểm phải là số từ 0 đến 10', 400);
    }
    score = Math.round(score * 10) / 10;
  }

  // Ghi chú: không bắt buộc, bỏ khoảng trắng 2 đầu, tối đa 1000 ký tự
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > NOTE_MAX_LENGTH) {
    throw new AppError(`Ghi chú tối đa ${NOTE_MAX_LENGTH} ký tự`, 400);
  }

  const saved = await evalRepository.upsert(milestoneId, userId, {
    rating: input.rating,
    score,
    note: note || null,
  });

  // Ghi lịch sử hoạt động của nhóm (log đã tự bọc try/catch nên lỗi ghi log không làm hỏng việc lưu)
  await activityService.log({
    groupId: milestone.groupId,
    actorId: userId,
    type: 'milestone.evaluated',
    targetType: 'milestone',
    targetId: milestone.id,
    summary: `đã đánh giá mốc "${milestone.title}": ${RATING_TEXT[input.rating]}${score !== null ? ` (${score}/10)` : ''}`,
  });

  return saved;
};

// Xóa đánh giá của Giảng viên đang đăng nhập cho 1 mốc (không đụng tới đánh giá của Giảng viên khác)
exports.removeEvaluation = async (userId, milestoneId) => {
  if (!milestoneId) throw new AppError('Thiếu mã mốc', 400);

  const milestone = await milestoneRepository.findById(milestoneId);
  if (!milestone) throw new AppError('Không tìm thấy mốc', 404);

  await assertSupervisor(userId, milestone.groupId);
  await evalRepository.remove(milestoneId, userId);
};