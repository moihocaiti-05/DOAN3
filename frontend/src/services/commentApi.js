import api from './api';

// Gom các hàm gọi API liên quan đến Comment
export const commentApi = {
  // Lấy danh sách comment của 1 task
  getByTask: (taskId) => api.get(`/comments/tasks/${taskId}`),

  // Tạo comment mới cho 1 task
  create: (taskId, content) => api.post(`/comments/tasks/${taskId}`, { content }),

  // Xóa 1 comment (dùng chung cho comment Task và nhận xét Mốc)
  remove: (commentId) => api.delete(`/comments/${commentId}`),

  // MỚI THÊM: Lấy nhận xét của 1 mốc - trả về { comments, canWrite }
  getByMilestone: (milestoneId) => api.get(`/comments/milestones/${milestoneId}`),

  // MỚI THÊM: Viết nhận xét cho 1 mốc (Backend sẽ từ chối nếu không phải Giảng viên/Trưởng nhóm)
  createOnMilestone: (milestoneId, content) =>
    api.post(`/comments/milestones/${milestoneId}`, { content }),
};