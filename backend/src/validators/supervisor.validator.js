const Joi = require('joi');

// Kiểm tra dữ liệu khi Trưởng nhóm gửi request mời Giảng viên
// Không cần validate groupId ở đây nữa vì giờ lấy từ URL (req.params.groupId), không lấy từ Body
exports.inviteSupervisorSchema = Joi.object({
  email: Joi.string().email().required(), // email của Giảng viên muốn mời
});