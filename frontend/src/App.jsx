import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail'; // MỚI THÊM: màn hình nhập mã xác nhận email
import Home from './pages/Home';
import GroupDetail from './pages/GroupDetail';
import ProfilePage from './pages/ProfilePage';
import SupervisorDashboard from './pages/SupervisorDashboard'; // MỚI THÊM

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        {/* MỚI THÊM: trang nhập mã xác nhận email - công khai vì người dùng chưa đăng nhập */}
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route
          path="/home"
          element={
            <PrivateRoute>
              <Home />
            </PrivateRoute>
          }
        />
        {/* MỚI THÊM: Route Dashboard riêng cho Giảng viên - liệt kê các nhóm đang phụ trách */}
        <Route
          path="/supervisor"
          element={
            <PrivateRoute>
              <SupervisorDashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/groups/:groupId"
          element={
            <PrivateRoute>
              <GroupDetail />
            </PrivateRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <PrivateRoute>
              <ProfilePage />
            </PrivateRoute>
          }
        />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;