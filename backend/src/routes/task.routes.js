const express = require('express');
const router = express.Router();
const multer = require('multer');
const taskController = require('../controllers/task.controller');
const taskMailController = require('../controllers/taskMail.controller'); // MỚI THÊM: gửi mail gộp công việc
const validate = require('../middlewares/validate.middleware');
const authMiddleware = require('../middlewares/auth.middleware');
const {
  createTaskSchema,
  assignTaskSchema,
  updateTagsSchema,
  updateTaskSchema,
  createSubtaskSchema, // MỚI THÊM
  sendTaskMailSchema, // MỚI THÊM: kiểm tra dữ liệu gửi mail
  reviewTaskSchema, // MỚI THÊM (Phiên 12): kiểm tra dữ liệu duyệt / từ chối
} = require('../validators/task.validator');

const upload = multer({ dest: 'uploads/' });

router.post('/', authMiddleware, validate(createTaskSchema), taskController.createTask);
router.get('/group/:groupId', authMiddleware, taskController.getTasksByGroup);
router.get('/group/:groupId/stats', authMiddleware, taskController.getGroupStats);
// MỚI THÊM: POST /tasks/group/:groupId/send-mail -> gửi 1 mail gộp nhiều công việc cho nhiều người trong nhóm
router.post('/group/:groupId/send-mail', authMiddleware, validate(sendTaskMailSchema), taskMailController.sendMail);
router.patch('/:taskId/status', authMiddleware, taskController.updateStatus);
// MỚI THÊM (Phiên 12): PATCH /tasks/:taskId/review -> Trưởng nhóm / Giảng viên duyệt hoặc từ chối việc đang ở Kiểm định
router.patch('/:taskId/review', authMiddleware, validate(reviewTaskSchema), taskController.reviewTask);
router.patch('/:taskId/assign', authMiddleware, validate(assignTaskSchema), taskController.assignTask);
router.post('/:taskId/remind', authMiddleware, taskController.sendReminder);
router.get('/template', authMiddleware, taskController.downloadTemplate);
router.post('/import', authMiddleware, upload.single('file'), taskController.importTasks);
router.patch('/:taskId/description', authMiddleware, taskController.updateDescription);
router.patch('/:taskId/tags', authMiddleware, validate(updateTagsSchema), taskController.updateTags);

// MỚI THÊM: POST /tasks/:taskId/subtasks -> tạo Subtask bên trong task cha
router.post('/:taskId/subtasks', authMiddleware, validate(createSubtaskSchema), taskController.createSubtask);

router.put('/:taskId', authMiddleware, validate(updateTaskSchema), taskController.updateTask);
router.delete('/:taskId', authMiddleware, taskController.deleteTask);

module.exports = router;