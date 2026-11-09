import './styles/theme.css'; // import ĐẦU TIÊN, trước mọi CSS khác - để các biến var(--color-...) có sẵn
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google'; // MỚI THÊM: cung cấp Client ID cho nút "Đăng nhập với Google"
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* MỚI THÊM: GoogleOAuthProvider bọc ngoài cùng; Client ID đọc từ frontend/.env (biến VITE_GOOGLE_CLIENT_ID) */}
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      {/* ThemeProvider bọc ngoài - để mọi trang trong app đều đọc/đổi được theme */}
      <ThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </GoogleOAuthProvider>
  </StrictMode>
);