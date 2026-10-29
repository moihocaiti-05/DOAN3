import api from './api';

export const userApi = {
  // Lấy thông tin cá nhân mới nhất của người đang đăng nhập
  getProfile: () => api.get('/users/me'),

  // Đổi tên hiển thị
  updateProfile: (data) => api.patch('/users/me', data),

  // Đổi ảnh đại diện - FormData vì đây là upload file
  uploadAvatar: (file) => {
    const formData = new FormData();
    formData.append('avatar', file);
    return api.post('/users/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // Đổi mật khẩu
  changePassword: (currentPassword, newPassword) =>
    api.patch('/users/me/password', { currentPassword, newPassword }),

  // MỚI THÊM: thống kê nhỏ ở đầu trang cá nhân - Sinh viên { groupCount, completedTasks }, Giảng viên { groupCount, commentCount }, kèm joinedAt
  getStats: () => api.get('/users/me/stats'),

  // Dựng URL trực tiếp tới ảnh đại diện của 1 user bất kỳ (dùng cho thẻ <img>, route này công khai không cần token)
  getAvatarUrl: (userId) => `${api.defaults.baseURL}/users/${userId}/avatar`,
};