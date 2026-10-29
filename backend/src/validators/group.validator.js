const Joi = require('joi');

exports.createGroupSchema = Joi.object({
  name: Joi.string().min(3).max(200).required(),
  description: Joi.string().allow('', null),
});

exports.joinGroupSchema = Joi.object({
  inviteCode: Joi.string().required(),
});

// MỚI THÊM: validate khi Trưởng nhóm mời 1 Sinh viên bằng email
exports.inviteMemberSchema = Joi.object({
  email: Joi.string().email().required(),
});