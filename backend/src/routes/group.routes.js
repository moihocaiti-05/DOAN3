const express = require('express'); // Nạp thư viện Express - framework chính viết Backend bằng Node.js

const router = express.Router(); // Tạo router riêng cho Group - sẽ được gắn vào routes/index.js dưới tiền tố /api/groups

const groupController = require('../controllers/group.controller'); // Controller xử lý các API của Group
const supervisorController = require('../controllers/supervisor.controller'); // Controller của Giảng viên - dùng nhờ cho vài route nằm dưới /groups/...
const tagController = require('../controllers/tag.controller'); // Controller của Nhãn - dùng nhờ cho route lấy "ngân hàng nhãn" của nhóm

const authMiddleware = require('../middlewares/auth.middleware'); // Middleware kiểm tra đăng nhập (token JWT) - gắn vào MỌI route bên dưới

const validate = require('../middlewares/validate.middleware'); // Middleware kiểm tra Body request theo khuôn Joi, chặn dữ liệu sai trước khi vào Controller

// Nạp các khuôn Joi cụ thể - mỗi khuôn quy định Body của 1 loại request phải có field gì, kiểu gì
const { createGroupSchema, joinGroupSchema, inviteMemberSchema } = require('../validators/group.validator');
const { inviteSupervisorSchema } = require('../validators/supervisor.validator');

// POST /api/groups -> Tạo nhóm mới. Phải đăng nhập + Body đúng khuôn createGroupSchema mới cho vào Controller
router.post('/', authMiddleware, validate(createGroupSchema), groupController.createGroup);

// GET /api/groups/my-groups -> Lấy danh sách nhóm của người đang đăng nhập, dùng cho trang chủ
router.get('/my-groups', authMiddleware, groupController.getMyGroups);

// POST /api/groups/join -> Tham gia nhóm bằng mã mời, vào ngay không cần chờ đồng ý
router.post('/join', authMiddleware, validate(joinGroupSchema), groupController.joinGroup);

// GET /api/groups/:groupId/members -> Lấy danh sách thành viên của 1 nhóm (:groupId là tham số động trên URL)
router.get('/:groupId/members', authMiddleware, groupController.getMembers);

// GET /api/groups/:groupId/workload-warnings -> Lấy cảnh báo mất cân bằng khối lượng công việc giữa các thành viên
router.get('/:groupId/workload-warnings', authMiddleware, groupController.getWorkloadWarnings);

// MỚI THÊM: GET /api/groups/:groupId/activities -> Lịch sử hoạt động của nhóm (phân trang). Người ngoài nhóm bị Service chặn 403
router.get('/:groupId/activities', authMiddleware, groupController.getActivities);

// MỚI THÊM: GET /api/groups/:groupId/report -> Xuất báo cáo tiến độ của nhóm ra file Excel
// Thành viên và Giảng viên đã đồng ý xuất được; người ngoài nhóm bị Service chặn 403
router.get('/:groupId/report', authMiddleware, groupController.exportReport);

// POST /api/groups/:groupId/transfer-leadership -> Chuyển quyền trưởng nhóm cho 1 thành viên khác
router.post('/:groupId/transfer-leadership', authMiddleware, groupController.transferLeadership);

// DELETE /api/groups/:groupId/members/:targetUserId -> Xóa 1 thành viên (targetUserId) khỏi nhóm (groupId)
router.delete('/:groupId/members/:targetUserId', authMiddleware, groupController.removeMember);

// GET /api/groups/:groupId/detail -> Lấy thông tin chi tiết nhóm (tên, mã mời...)
router.get('/:groupId/detail', authMiddleware, groupController.getGroupDetail);

// POST /api/groups/:groupId/invite-supervisor -> Mời Giảng viên vào nhóm bằng email
// Chú ý: gọi supervisorController chứ không phải groupController, dù URL vẫn nằm dưới /groups/
router.post('/:groupId/invite-supervisor', authMiddleware, validate(inviteSupervisorSchema), supervisorController.invite);

// GET /api/groups/:groupId/supervisors -> Xem danh sách Giảng viên đang phụ trách nhóm (gồm cả người đang PENDING)
router.get('/:groupId/supervisors', authMiddleware, supervisorController.getByGroup);

// GET /api/groups/:groupId/tags -> Lấy "ngân hàng nhãn" của nhóm, dùng để gợi ý khi tạo task
router.get('/:groupId/tags', authMiddleware, tagController.getByGroup);

// POST /api/groups/:groupId/invite-member -> Mời 1 Sinh viên vào nhóm bằng email (route cũ, riêng cho Sinh viên)
router.post('/:groupId/invite-member', authMiddleware, validate(inviteMemberSchema), groupController.inviteMember);

// POST /api/groups/:groupId/invite -> Route mời GỘP CHUNG (Frontend đang dùng route này)
// Backend tự nhận diện email là Sinh viên hay Giảng viên rồi tự rẽ đúng luồng xử lý tương ứng
router.post('/:groupId/invite', authMiddleware, validate(inviteMemberSchema), groupController.invite);

// MỚI THÊM: DELETE /api/groups/:groupId -> Xóa toàn bộ nhóm (chỉ Trưởng nhóm, bắt gõ lại tên nhóm để xác nhận)
// Không dùng validate(...) Joi riêng - việc kiểm tra confirmName (tên nhóm gõ lại) đã xử lý thẳng trong group.service.js
router.delete('/:groupId', authMiddleware, groupController.deleteGroup);

module.exports = router; // Xuất router này ra để routes/index.js import vào và gắn tiền tố /api/groups phía trước