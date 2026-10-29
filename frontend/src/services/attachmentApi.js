import api from './api';

// Gom các hàm gọi API liên quan đến Attachment (file đính kèm)
export const attachmentApi = {
  // Lấy danh sách file đính kèm của 1 task
  getByTask: (taskId) => api.get(`/attachments/tasks/${taskId}`),

  // Upload 1 file mới - dùng FormData vì đây là gửi file, không phải JSON thường
  upload: (taskId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/attachments/tasks/${taskId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // Tải 1 file về máy
  download: (attachmentId) =>
    api.get(`/attachments/${attachmentId}/download`, { responseType: 'blob' }),

  // Xóa 1 file đính kèm
  remove: (attachmentId) => api.delete(`/attachments/${attachmentId}`),

  // Lấy URL để hiển thị ảnh trực tiếp (dùng cho thẻ <img>), không cần gọi axios vì đây chỉ là 1 đường link
getViewUrl: (attachmentId) => `http://localhost:5000/api/attachments/${attachmentId}/view`,
};

