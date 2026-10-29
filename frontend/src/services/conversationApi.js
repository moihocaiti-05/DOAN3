import api from './api';

// Gom hàm gọi API liên quan đến phòng chat (nhóm chat con + chat riêng)
// Tin nhắn trong phòng chat gửi qua REST (Backend lấy người gửi từ token, không tin dữ liệu Client gửi lên),
// rồi Backend tự phát realtime cho các thành viên trong phòng
export const conversationApi = {
  // Những người có thể nhắn riêng / thêm vào nhóm chat con trong 1 nhóm đồ án (không gồm chính mình)
  getPeople: (groupId) => api.get(`/conversations/group/${groupId}/people`),

  // Các nhóm chat con của nhóm đồ án mà mình đang tham gia
  getGroupChats: (groupId) => api.get(`/conversations/group/${groupId}`),

  // Tạo nhóm chat con: tên nhóm + danh sách id thành viên được chọn
  createGroupChat: (groupId, name, memberIds) =>
    api.post(`/conversations/group/${groupId}`, { name, memberIds }),

  // Mở (hoặc tạo mới nếu chưa có) chat riêng với 1 người, kèm nhóm đồ án mà 2 người cùng thuộc
  openPrivate: (userId, groupId) => api.post('/conversations/private', { userId, groupId }),

  // Lịch sử tin nhắn của 1 phòng chat
  getMessages: (conversationId) => api.get(`/conversations/${conversationId}/messages`),

  // Gửi tin nhắn chữ vào phòng chat
  sendMessage: (conversationId, content) =>
    api.post(`/conversations/${conversationId}/messages`, { content }),

  // Gửi tin nhắn kèm file - content là chữ đi kèm (không bắt buộc)
  uploadFile: (conversationId, file, content) => {
    const formData = new FormData();
    formData.append('file', file);
    if (content) formData.append('content', content);
    return api.post(`/conversations/${conversationId}/messages/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};