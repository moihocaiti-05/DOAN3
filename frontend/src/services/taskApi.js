import api from './api';

// Gom các hàm gọi API liên quan đến Task
export const taskApi = {
  // Lấy danh sách task theo nhóm - dùng để hiển thị Kanban board
  getByGroup: (groupId) => api.get(`/tasks/group/${groupId}`),

  // Tạo task mới
  create: (data) => api.post('/tasks', data),

  // Đổi trạng thái task (khi kéo-thả sang cột khác, cũng tái dùng để tick xong Subtask)
  updateStatus: (taskId, status) => api.patch(`/tasks/${taskId}/status`, { status }),

  // Gán/đổi người phụ trách
  assign: (taskId, assignedTo, groupId) =>
    api.patch(`/tasks/${taskId}/assign`, { assignedTo, groupId }),

  // Tải file mẫu Excel - responseType: 'blob' báo cho axios biết đây là file nhị phân
  downloadTemplate: () => api.get('/tasks/template', { responseType: 'blob' }),

  // Upload file Excel để import hàng loạt - FormData là kiểu bắt buộc khi gửi file
  importTasks: (file, groupId) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('groupId', groupId);
    return api.post('/tasks/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // Lấy thống kê tiến độ của nhóm
  getStats: (groupId) => api.get(`/tasks/group/${groupId}/stats`),

  // Cập nhật nội dung mô tả của task (gõ/dán tự do, sửa được nhiều lần)
  updateDescription: (taskId, description) =>
    api.patch(`/tasks/${taskId}/description`, { description }),

  // Sửa thông tin chung của task (tên, mô tả, độ ưu tiên, deadline, mốc)
  update: (taskId, data) => api.put(`/tasks/${taskId}`, data),

  // Xóa task
  remove: (taskId) => api.delete(`/tasks/${taskId}`),

  // Cập nhật (ghi đè) toàn bộ danh sách nhãn của 1 task - dùng khi sửa nhãn trong TaskDetailModal
  updateTags: (taskId, tagNames) => api.patch(`/tasks/${taskId}/tags`, { tagNames }),

  // MỚI THÊM: Tạo 1 Subtask (task con) bên trong task cha có id = taskId
  // data chỉ cần { title, description?, priority?, deadline?, tagNames? } - groupId/milestoneId Backend tự kế thừa từ task cha
  createSubtask: (taskId, data) => api.post(`/tasks/${taskId}/subtasks`, data),

  // MỚI THÊM: Gửi 1 mail GỘP nhiều công việc cho nhiều người trong nhóm
  // data = { taskIds: [...], recipientIds: [...], message? } - Backend trả { sentCount, failedNames }
  sendMail: (groupId, data) => api.post(`/tasks/group/${groupId}/send-mail`, data),

  // MỚI THÊM (Phiên 12): Trưởng nhóm / Giảng viên duyệt hoặc từ chối việc đang ở "Kiểm định"
  // decision = 'approve' | 'reject'; note bắt buộc khi 'reject'
  review: (taskId, decision, note) => api.patch(`/tasks/${taskId}/review`, { decision, note }),
};