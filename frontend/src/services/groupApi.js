import api from './api'; // instance axios đã cấu hình sẵn baseURL + interceptor tự gắn token vào mọi request

// Gom các hàm gọi API liên quan đến Group vào 1 chỗ, để các component chỉ cần import groupApi mà không cần nhớ từng URL
export const groupApi = {
  // Lấy danh sách nhóm của người đang đăng nhập - dùng cho trang chủ
  getMyGroups: () => api.get('/groups/my-groups'),

  // Tạo nhóm mới - data gồm { name, description }
  createGroup: (data) => api.post('/groups', data),

  // Tham gia nhóm bằng mã mời - vào ngay lập tức, không cần chờ đồng ý
  joinGroup: (inviteCode) => api.post('/groups/join', { inviteCode }),

  // Lấy danh sách thành viên của 1 nhóm (bao gồm cả người đang PENDING) - dùng cho MembersModal và dropdown "Giao cho ai"
  getMembers: (groupId) => api.get(`/groups/${groupId}/members`),

  // Lấy chi tiết nhóm (tên, mã mời...) - dùng cho MembersModal
  getGroupDetail: (groupId) => api.get(`/groups/${groupId}/detail`),

  // Lấy danh sách cảnh báo mất cân bằng khối lượng công việc giữa các thành viên
  getWorkloadWarnings: (groupId) => api.get(`/groups/${groupId}/workload-warnings`),

  // Chuyển quyền trưởng nhóm cho 1 thành viên khác - targetUserId là người được thăng chức
  transferLeadership: (groupId, targetUserId) =>
    api.post(`/groups/${groupId}/transfer-leadership`, { targetUserId }),

  // Xóa 1 thành viên khỏi nhóm - targetUserId là người bị xóa
  removeMember: (groupId, targetUserId) =>
    api.delete(`/groups/${groupId}/members/${targetUserId}`),

  // Lấy danh sách Giảng viên đang phụ trách 1 nhóm (bao gồm cả người đang PENDING chưa đồng ý)
  getSupervisors: (groupId) => api.get(`/groups/${groupId}/supervisors`),

  // Dùng route "invite" GỘP CHUNG duy nhất - Backend tự nhận diện email đó là Sinh viên hay Giảng viên
  // rồi tự tạo đúng loại lời mời (GroupMember hoặc GroupSupervisor) với status PENDING, chờ người đó đồng ý
  invite: (groupId, email) => api.post(`/groups/${groupId}/invite`, { email }),

  // MỚI THÊM: Xóa toàn bộ nhóm - confirmName là tên nhóm người dùng gõ lại để xác nhận (khớp chính xác mới cho xóa)
  // DELETE có body nên phải truyền qua { data: {...} } theo đúng cú pháp axios (khác với POST/PUT truyền thẳng object)
  deleteGroup: (groupId, confirmName) =>
    api.delete(`/groups/${groupId}`, { data: { confirmName } }),

  // MỚI THÊM: Tải báo cáo tiến độ của nhóm (file Excel)
  // responseType 'blob' để axios nhận dữ liệu dạng file nhị phân thay vì cố đọc như chữ/JSON
  exportReport: (groupId) => api.get(`/groups/${groupId}/report`, { responseType: 'blob' }),

  // MỚI THÊM: Lấy 1 trang lịch sử hoạt động của nhóm (mới nhất trước)
  getActivities: (groupId, page = 1, limit = 20) =>
    api.get(`/groups/${groupId}/activities`, { params: { page, limit } }),
};