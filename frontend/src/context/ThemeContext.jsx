import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

// Danh sách theme có sẵn - id phải khớp CHÍNH XÁC với selector [data-theme="..."] trong theme.css
export const THEMES = [
  { id: 'light', label: 'Sáng', emoji: '☀️' },
  { id: 'dark', label: 'Tối', emoji: '🌙' },
  { id: 'warm', label: 'Kem ấm', emoji: '🎨' },
  { id: 'blue', label: 'Xanh dịu', emoji: '💧' },
];

export function ThemeProvider({ children }) {
  // Đọc theme đã lưu CỦA TRÌNH DUYỆT NÀY từ localStorage - vì lưu ở localStorage (không lưu server/DB),
  // mỗi người dùng trên máy/trình duyệt riêng có theme riêng, KHÔNG ảnh hưởng tới người khác dùng chung hệ thống
  const [theme, setThemeState] = useState(() => localStorage.getItem('theme') || 'light');

  // Mỗi khi theme đổi, gắn thuộc tính data-theme lên thẻ <html> - toàn bộ theme.css dựa vào thuộc tính này
  // để biết đang áp dụng bảng màu nào, đồng thời lưu lại localStorage để lần sau mở lại vẫn giữ đúng theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const setTheme = (newTheme) => setThemeState(newTheme);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}