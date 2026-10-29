const taskMailService = require('../services/taskMail.service'); // Controller chỉ gọi Service, không tự viết logic nghiệp vụ

// Xử lý route POST /tasks/group/:groupId/send-mail - gửi mail gộp nhiều công việc cho nhiều người
exports.sendMail = async (req, res, next) => {
  try {
    // groupId lấy từ đường dẫn, người gửi lấy từ token (req.user.id), taskIds/recipientIds/message lấy từ body đã qua Joi
    const result = await taskMailService.sendTasksByMail(req.params.groupId, req.user.id, req.body);
    res.json({ success: true, data: result }); // data = { sentCount, failedNames }
  } catch (error) {
    next(error); // đẩy lỗi qua error.middleware.js xử lý tập trung
  }
};