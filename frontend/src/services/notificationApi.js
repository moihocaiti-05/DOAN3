import api from './api';

// Gom các hàm gọi API liên quan đến Notification
export const notificationApi = {
  getMy: () => api.get('/notifications'),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markAllAsRead: () => api.patch('/notifications/mark-all-read'),

  // MỚI THÊM: Đồng ý ("accept") hoặc Từ chối ("decline") 1 lời mời (tham gia nhóm / phụ trách nhóm)
  respond: (notificationId, action) =>
    api.patch(`/notifications/${notificationId}/respond`, { action }),
};