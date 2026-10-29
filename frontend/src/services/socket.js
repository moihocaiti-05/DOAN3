import { io } from 'socket.io-client';

// Tạo 1 kết nối Socket.io DUY NHẤT, dùng chung cho toàn bộ app
// (không tạo mới mỗi lần vào trang, tránh mở nhiều kết nối thừa)
// MỚI SỬA: autoConnect: false - KHÔNG tự kết nối lúc mở trang nữa, vì lúc đó có thể chưa đăng nhập (chưa có token)
// AuthContext sẽ gọi socket.connect() khi đã có người đăng nhập và socket.disconnect() khi đăng xuất
// MỚI THÊM: auth là hàm - mỗi lần (kết nối lại) đều đọc token MỚI NHẤT trong localStorage, nên đăng nhập tài khoản khác vẫn dùng đúng token
const socket = io('http://localhost:5000', {
  autoConnect: false,
  auth: (callback) => {
    callback({ token: localStorage.getItem('token') });
  },
});

// MỚI THÊM: Backend từ chối kết nối (token sai, hết hạn hoặc chưa đăng nhập) thì ghi 1 dòng vào Console (F12) để dễ tìm nguyên nhân
socket.on('connect_error', (err) => {
  console.warn('Socket bị từ chối:', err.message);
});

export default socket;