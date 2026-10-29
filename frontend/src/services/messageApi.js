import api from './api';

// Gom hàm gọi API liên quan đến Message
// Tin nhắn CHỮ vẫn gửi qua Socket.io trực tiếp (xem ChatBox.jsx), KHÔNG dùng REST API ở đây
// Tin nhắn có FILE bắt buộc phải qua REST (multipart) vì Socket.io không hợp để tải file nhị phân lên
export const messageApi = {
  getByGroup: (groupId) => api.get(`/messages/group/${groupId}`),

  // MỚI THÊM: Gửi tin nhắn kèm file - content là chữ đi kèm (không bắt buộc, có thể để trống)
  uploadFile: (groupId, file, content) => {
    const formData = new FormData();
    formData.append('file', file);
    if (content) formData.append('content', content);
    return api.post(`/messages/group/${groupId}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // Dựng URL xem trực tiếp file (dùng cho <img>) - route công khai, không cần token
  getViewUrl: (messageId) => `${api.defaults.baseURL}/messages/${messageId}/file/view`,

  // Tải file về máy - gọi bằng axios (có token) rồi tự tạo link tải, giống cơ chế attachmentApi.download
  download: (messageId) => api.get(`/messages/${messageId}/file/download`, { responseType: 'blob' }),
};