import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail'; // MỚI THÊM: màn hình nhập mã xác nhận email
import Home from './pages/Home';
import GroupDetail from './pages/GroupDetail';
import ProfilePage from './pages/ProfilePage';
import SupervisorDashboard from './pages/SupervisorDashboard'; // MỚI THÊM
import SupervisorCharts from './pages/SupervisorCharts'; // MỚI THÊM (GV9): trang biểu đồ của 1 nhóm
import QuickNav from './components/QuickNav'; // MỚI THÊM: bảng phím tắt ở mép phải

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" />;
}

function App() {
  return (
    <BrowserRouter>
      <QuickNav /> {/* MỚI THÊM: hiện ở mọi trang sau khi đăng nhập */}
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
        {/* MỚI THÊM (GV9): trang biểu đồ của 1 nhóm, mở từ nút "Biểu đồ" trên trang /supervisor */}
        <Route
          path="/supervisor/groups/:groupId/charts"
          element={
            <PrivateRoute>
              <SupervisorCharts />
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