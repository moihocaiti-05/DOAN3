const taskService = require('../services/task.service');

exports.createTask = async (req, res, next) => {
  try {
    const task = await taskService.createTask(req.body, req.user.id);
    res.status(201).json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};

exports.getTasksByGroup = async (req, res, next) => {
  try {
    // MỚI SỬA: truyền thêm req.user.id (người đang đăng nhập) để Service kiểm tra họ có quyền xem nhóm này không
    const tasks = await taskService.getTasksByGroup(req.params.groupId, req.user.id);
    res.json({ success: true, data: tasks });
  } catch (error) {
    next(error);
  }
};

exports.updateStatus = async (req, res, next) => {
  try {
    // MỚI SỬA: truyền thêm req.user.id (người đang đăng nhập) để Service kiểm tra họ thuộc nhóm của task
    const task = await taskService.updateTaskStatus(req.params.taskId, req.body.status, req.user.id);
    res.json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};

exports.assignTask = async (req, res, next) => {
  try {
    // MỚI SỬA: không còn đọc groupId từ body (client gửi lên không đáng tin) - Service tự lấy groupId từ task trong database
    const { assignedTo } = req.body;
    const task = await taskService.assignTask(req.params.taskId, assignedTo, req.user.id);
    res.json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};
const path = require('path');
const fs = require('fs');

exports.downloadTemplate = async (req, res, next) => {
  try {
    const workbook = await taskService.generateTemplate();
    res.setHeader('Content-Disposition', 'attachment; filename=mau-import-task.xlsx');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
};

exports.importTasks = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Chưa chọn file' });
    }
    const { groupId } = req.body;
    const result = await taskService.importTasksFromExcel(req.file.path, groupId, req.user.id);

    fs.unlinkSync(req.file.path);

    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

exports.getGroupStats = async (req, res, next) => {
  try {
    // MỚI SỬA: truyền thêm req.user.id để Service kiểm tra quyền xem nhóm trước khi trả thống kê
    const stats = await taskService.getGroupStats(req.params.groupId, req.user.id);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
};

exports.sendReminder = async (req, res, next) => {
  try {
    await taskService.sendDeadlineReminder(req.params.taskId, req.user.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

exports.updateDescription = async (req, res, next) => {
  try {
    // MỚI SỬA: truyền thêm req.user.id để Service kiểm tra thành viên nhóm
    const task = await taskService.updateDescription(req.params.taskId, req.body.description, req.user.id);
    res.json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};

exports.updateTags = async (req, res, next) => {
  try {
    // MỚI SỬA: truyền thêm req.user.id để Service kiểm tra thành viên nhóm
    const task = await taskService.updateTaskTags(req.params.taskId, req.body.tagNames, req.user.id);
    res.json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};

exports.deleteTask = async (req, res, next) => {
  try {
    await taskService.deleteTask(req.params.taskId, req.user.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

exports.updateTask = async (req, res, next) => {
  try {
    const task = await taskService.updateTask(req.params.taskId, req.user.id, req.body);
    res.json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};

// MỚI THÊM: Xử lý route POST /tasks/:taskId/subtasks - tạo Subtask bên trong task cha có id = :taskId
exports.createSubtask = async (req, res, next) => {
  try {
    const subtask = await taskService.createSubtask(req.params.taskId, req.user.id, req.body);
    res.status(201).json({ success: true, data: subtask });
  } catch (error) {
    next(error);
  }
};

// MỚI THÊM (Phiên 12): PATCH /tasks/:taskId/review - Trưởng nhóm / Giảng viên duyệt hoặc từ chối công việc ở bước Kiểm định
exports.reviewTask = async (req, res, next) => {
  try {
    const { decision, note } = req.body;
    const task = await taskService.reviewTask(req.params.taskId, decision, note, req.user.id);
    res.json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};