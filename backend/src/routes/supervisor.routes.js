const express = require('express');
const router = express.Router();
const supervisorController = require('../controllers/supervisor.controller');
const reviewController = require('../controllers/supervisorReview.controller'); // MỚI THÊM (tính năng 1)
const remindController = require('../controllers/supervisorRemind.controller'); // MỚI THÊM (tính năng 2)
const contributionController = require('../controllers/supervisorContribution.controller'); // MỚI THÊM (tính năng 3)
const exportController = require('../controllers/supervisorExport.controller'); // MỚI THÊM (tính năng 4)
const upcomingController = require('../controllers/supervisorUpcoming.controller'); // MỚI THÊM (tính năng 5)
const authMiddleware = require('../middlewares/auth.middleware');

// Giảng viên xem danh sách các nhóm mình đang phụ trách
// (route này không thuộc về 1 nhóm cụ thể nên để riêng, không lồng trong /groups)
router.get('/my-groups', authMiddleware, supervisorController.getMyGroups);

// MỚI THÊM (Phiên 7): trang tổng quan cho Giảng viên - mỗi nhóm kèm tiến độ, số việc trễ hạn, lần hoạt động gần nhất
// Là route tĩnh (không có :id) nên không bị route động nào ở file này nuốt mất
router.get('/overview', authMiddleware, supervisorController.getOverview);

// MỚI THÊM (tính năng 1): các việc đang chờ Giảng viên duyệt ("Kiểm định") ở mọi nhóm mình phụ trách
router.get('/pending-review', authMiddleware, reviewController.getPendingReview);

// MỚI THÊM (tính năng 2): Giảng viên nhắc nhóm - gửi thông báo chuông cho mọi thành viên nhóm
router.post('/groups/:groupId/remind', authMiddleware, remindController.remind);

// MỚI THÊM (tính năng 3): bảng đóng góp từng thành viên của 1 nhóm
router.get('/groups/:groupId/contributions', authMiddleware, contributionController.getContributions);

// MỚI THÊM (tính năng 4): tải file Excel tổng hợp tất cả nhóm (1 sheet tổng hợp + 1 sheet chi tiết cho từng nhóm)
router.get('/export', authMiddleware, exportController.exportAll);

// MỚI THÊM (tính năng 5): việc và mốc sắp đến hạn (kèm việc/mốc đã quá hạn) của mọi nhóm; ?days=7 (1 đến 60)
router.get('/upcoming', authMiddleware, upcomingController.getUpcoming);

module.exports = router;