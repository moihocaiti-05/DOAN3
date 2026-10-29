import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div style={{ maxWidth: 600, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h2>Xin chào, {user?.fullName}!</h2>
      <p>Email: {user?.email}</p>
      <button onClick={handleLogout} style={{ padding: 10 }}>
        Đăng xuất
      </button>
    </div>
  );
}