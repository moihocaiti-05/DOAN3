import { createContext, useContext, useState, useEffect } from 'react';
import socket from '../services/socket'; // MỚI THÊM: để kết nối hoặc ngắt socket theo trạng thái đăng nhập

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  // MỚI THÊM: có người đăng nhập (kể cả khi tải lại trang mà vẫn còn đăng nhập) thì kết nối socket bằng token;
  // đăng xuất thì ngắt hẳn, để socket cũ không còn nằm trong phòng thông báo hay phòng nhóm của người trước
  useEffect(() => {
    if (user) {
      if (!socket.connected) socket.connect();
    } else {
      socket.disconnect();
    }
  }, [user]);

  const login = (userData, token) => {
    // MỚI SỬA: lưu token trước, rồi mới setUser - để lúc socket kết nối đọc được đúng token mới
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', token);
    setUser(userData);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  };

  // MỚI THÊM: Cập nhật lại thông tin user trong state + localStorage MÀ KHÔNG đăng nhập lại
  // Dùng sau khi đổi tên/avatar ở trang Profile - để mọi nơi trong app (Header, MembersModal...) 
  // hiển thị đúng dữ liệu mới ngay lập tức, không cần F5 lại trang
  const updateUser = (userData) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}