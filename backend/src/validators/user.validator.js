const Joi = require('joi');

exports.updateProfileSchema = Joi.object({
  fullName: Joi.string().min(2).max(100).required(),
});

exports.changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(6).required(),
});