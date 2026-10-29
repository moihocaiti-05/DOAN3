import api from './api'; // instance axios đã cấu hình sẵn baseURL + interceptor gắn token

// Gom các hàm gọi API liên quan tới việc Giảng viên phụ trách nhóm
export const supervisorApi = {
  // Lấy danh sách các nhóm mà Giảng viên đang đăng nhập ĐANG PHỤ TRÁCH (đã đồng ý lời mời)
  getMyGroups: () => api.get('/supervisors/my-groups'),

  // MỚI THÊM (Phiên 7): bảng tổng quan - mỗi nhóm kèm tiến độ, số việc trễ hạn, lần hoạt động gần nhất, trạng thái
  // Trả về { idleThresholdDays, groups: [...] } nằm trong res.data.data
  getOverview: () => api.get('/supervisors/overview'),

  // MỚI THÊM (tính năng 1): các việc đang chờ Giảng viên duyệt ("Kiểm định") ở mọi nhóm mình phụ trách
  // Trả về mảng trong res.data.data, mỗi phần tử: { id, title, parentTitle, groupId, groupName, assigneeName, submittedAt }
  getPendingReview: () => api.get('/supervisors/pending-review'),

  // MỚI THÊM (tính năng 2): nhắc nhóm - gửi thông báo chuông cho mọi thành viên nhóm
  // message có thể để trống (Backend dùng câu mặc định). Trả về { notified: số người đã nhận } trong res.data.data
  remindGroup: (groupId, message) => api.post(`/supervisors/groups/${groupId}/remind`, { message }),

  // MỚI THÊM (tính năng 3): bảng đóng góp từng thành viên của 1 nhóm
  // Trả về { groupName, totalTasks, members: [...], unassigned: {...} } trong res.data.data
  getContributions: (groupId) => api.get(`/supervisors/groups/${groupId}/contributions`),

  // MỚI THÊM (tính năng 4): tải file Excel tổng hợp tất cả nhóm (responseType 'blob' vì đây là file nhị phân, không phải JSON)
  exportAll: () => api.get('/supervisors/export', { responseType: 'blob' }),

  // MỚI THÊM (tính năng 5): việc và mốc sắp đến hạn trong "days" ngày tới (kèm việc/mốc đã quá hạn chưa xong) của mọi nhóm
  // Trả về { days, overdueCount, upcomingCount, items: [...] } trong res.data.data; mỗi item có kind = 'task' | 'milestone'
  getUpcoming: (days) => api.get('/supervisors/upcoming', { params: { days } }),
};