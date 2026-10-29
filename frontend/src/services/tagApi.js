import api from './api'; // instance axios đã cấu hình sẵn baseURL + interceptor gắn token

// Gom các hàm gọi API liên quan đến Tag (nhãn phân loại task)
export const tagApi = {
  // Lấy "ngân hàng nhãn" hiện có của 1 nhóm - dùng để gợi ý khi chọn/gõ nhãn cho task
  getByGroup: (groupId) => api.get(`/groups/${groupId}/tags`),
};