import api from './api';

// Gom các hàm gọi API liên quan đến Milestone (mốc học thuật)
export const milestoneApi = {
  // Lấy toàn bộ timeline của 1 nhóm (kèm % hoàn thành tính sẵn từ Backend)
  getTimeline: (groupId) => api.get(`/milestones/group/${groupId}`),

  // Tạo mốc mới
  create: (data) => api.post('/milestones', data),

  // MỚI THÊM: sửa tên / mô tả / hạn chót của mốc - data = { title?, description?, dueDate? }
  update: (milestoneId, data) => api.put(`/milestones/${milestoneId}`, data),

  // MỚI THÊM: kéo-thả di chuyển mốc - data = { parentId (null = mốc gốc), index }
  move: (milestoneId, data) => api.patch(`/milestones/${milestoneId}/move`, data),

  // MỚI THÊM: tải báo cáo Excel riêng theo mốc - responseType 'blob' để axios nhận file nhị phân
  exportReport: (groupId) => api.get(`/milestones/group/${groupId}/report`, { responseType: 'blob' }),

  // Xóa mốc
  remove: (milestoneId) => api.delete(`/milestones/${milestoneId}`),
};