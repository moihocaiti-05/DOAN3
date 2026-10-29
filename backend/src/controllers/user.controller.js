const path = require('path');
const userService = require('../services/user.service');
const userRepository = require('../repositories/user.repository');

exports.getProfile = async (req, res, next) => {
  try {
    const user = await userService.getProfile(req.user.id);
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const user = await userService.updateProfile(req.user.id, req.body);
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

exports.uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Chưa chọn ảnh' });
    }
    const user = await userService.updateAvatar(req.user.id, req.file.path);
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    await userService.changePassword(req.user.id, req.body.currentPassword, req.body.newPassword);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

// MỚI THÊM: Xem ảnh đại diện trực tiếp - KHÔNG có authMiddleware vì thẻ <img> không gửi được token
// (giống hệt cơ chế attachmentController.viewAttachment đang dùng cho ảnh đính kèm task)
exports.viewAvatar = async (req, res, next) => {
  try {
    const user = await userRepository.findById(req.params.userId);
    if (!user || !user.avatar) {
      return res.status(404).json({ success: false, message: 'Người dùng chưa có ảnh đại diện' });
    }
    res.sendFile(path.resolve(user.avatar));
  } catch (error) {
    next(error);
  }
};