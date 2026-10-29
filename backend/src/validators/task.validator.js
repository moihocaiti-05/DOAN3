const Joi = require('joi');

exports.createTaskSchema = Joi.object({
  title: Joi.string().min(3).max(200).required(),
  description: Joi.string().allow('', null),
  groupId: Joi.string().required(),
  assignedTo: Joi.string().allow(null, ''),
  milestoneId: Joi.string().allow(null, ''),
  priority: Joi.string().valid('low', 'medium', 'high'),
  deadline: Joi.date().allow(null),
  tagNames: Joi.array().items(Joi.string().trim().min(1)).default([]),
});

exports.assignTaskSchema = Joi.object({
  assignedTo: Joi.string().required(),
  groupId: Joi.string().required(),
});

exports.updateTagsSchema = Joi.object({
  tagNames: Joi.array().items(Joi.string().trim().min(1)).default([]),
});

// validate khi sửa thông tin chung của task
exports.updateTaskSchema = Joi.object({
  title: Joi.string().min(3).max(200),
  description: Joi.string().allow('', null),
  priority: Joi.string().valid('low', 'medium', 'high'),
  deadline: Joi.date().allow(null),
  milestoneId: Joi.string().allow(null, ''),
}).min(1);

// MỚI THÊM: validate khi tạo Subtask - KHÔNG có groupId/milestoneId vì Backend tự kế thừa từ task cha
exports.createSubtaskSchema = Joi.object({
  title: Joi.string().min(3).max(200).required(),
  description: Joi.string().allow('', null),
  assignedTo: Joi.string().allow(null, ''),
  priority: Joi.string().valid('low', 'medium', 'high'),
  deadline: Joi.date().allow(null),
  tagNames: Joi.array().items(Joi.string().trim().min(1)).default([]),
});

// MỚI THÊM: validate khi gửi mail công việc cho nhiều người
// recipients: mỗi phần tử = 1 người nhận kèm danh sách công việc RIÊNG của người đó (mỗi người 1 mail, chỉ chứa việc của họ)
// .unique('userId') chặn chọn trùng 1 người; .max() là giới hạn mỗi lần gửi (20 người, mỗi người 30 công việc) để tránh spam
exports.sendTaskMailSchema = Joi.object({
  recipients: Joi.array()
    .items(
      Joi.object({
        userId: Joi.string().required(),
        taskIds: Joi.array().items(Joi.string()).min(1).max(30).unique().required(),
      })
    )
    .min(1)
    .max(20)
    .unique('userId')
    .required(),
  message: Joi.string().trim().max(500).allow('', null).default(''), // lời nhắn thêm, không bắt buộc
});

// MỚI THÊM (Phiên 12): validate khi duyệt / từ chối công việc ở bước Kiểm định
// decision = 'approve' (duyệt) hoặc 'reject' (từ chối); từ chối thì BẮT BUỘC có ghi chú (note)
exports.reviewTaskSchema = Joi.object({
  decision: Joi.string().valid('approve', 'reject').required(),
  note: Joi.when('decision', {
    is: 'reject',
    then: Joi.string().trim().min(1).max(1000).required().messages({
      'any.required': 'Phải nhập ghi chú khi từ chối công việc',
      'string.empty': 'Phải nhập ghi chú khi từ chối công việc',
      'string.min': 'Phải nhập ghi chú khi từ chối công việc',
      'string.max': 'Ghi chú tối đa 1000 ký tự',
    }),
    otherwise: Joi.string().trim().max(1000).allow('', null),
  }),
});