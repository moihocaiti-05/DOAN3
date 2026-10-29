const Joi = require('joi');

exports.createMilestoneSchema = Joi.object({
  title: Joi.string().min(2).max(200).required(),
  description: Joi.string().allow('', null),
  groupId: Joi.string().required(),
  dueDate: Joi.date().allow(null),
  // MỚI THÊM: id của mốc cha - để trống hoặc null nghĩa là tạo mốc gốc (mốc lớn nhất, không có cha)
  parentId: Joi.string().allow(null, ''),
});



// MỚI THÊM: validate khi sửa mốc (gửi trường nào thì đổi trường đó, ít nhất 1 trường)
exports.updateMilestoneSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200),
  description: Joi.string().allow('', null),
  dueDate: Joi.date().allow(null, ''),
}).min(1);

// MỚI THÊM: validate khi kéo-thả mốc - parentId = mốc cha mới (null = mốc gốc), index = vị trí mới trong danh sách anh em
exports.moveMilestoneSchema = Joi.object({
  parentId: Joi.string().allow(null, '').default(null),
  index: Joi.number().integer().min(0).required(),
});