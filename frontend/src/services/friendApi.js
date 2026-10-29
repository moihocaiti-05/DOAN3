import api from './api';

// Gom hàm gọi API liên quan đến kết bạn
export const friendApi = {
  // Lấy bạn bè + lời mời đã nhận + lời mời đã gửi của mình: { friends, incoming, outgoing }
  getAll: () => api.get('/friends'),

  // Gửi lời mời bằng email (không cần chung nhóm)
  requestByEmail: (email) => api.post('/friends/request', { email }),

  // Gửi lời mời cho 1 người trong danh sách thành viên nhóm (cần kèm groupId để Backend kiểm tra cùng nhóm)
  requestInGroup: (userId, groupId) => api.post('/friends/request', { userId, groupId }),

  // Đồng ý 1 lời mời (friendshipId là id của bản ghi lời mời)
  accept: (friendshipId) => api.post(`/friends/${friendshipId}/accept`),

  // Từ chối lời mời / hủy lời mời đã gửi / hủy kết bạn - cùng 1 API xóa bản ghi
  remove: (friendshipId) => api.delete(`/friends/${friendshipId}`),
};