import './styles/theme.css'; // MỚI THÊM: import ĐẦU TIÊN, trước mọi CSS khác - để các biến var(--color-...) có sẵn
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx'; // MỚI THÊM

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* MỚI THÊM: ThemeProvider bọc ngoài cùng - để mọi trang trong app đều đọc/đổi được theme */}
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>
);