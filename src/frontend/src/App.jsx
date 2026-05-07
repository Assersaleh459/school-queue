import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Home from './pages/Home';
import Reception from './pages/Reception';
import QueueDashboard from './pages/QueueDashboard';
import Admin from './pages/Admin';
import Overview from './pages/admin/Overview';
import Departments from './pages/admin/Departments';
import Users from './pages/admin/Users';
import Settings from './pages/admin/Settings';
import Announcements from './pages/admin/Announcements';
import Reports from './pages/Reports';
import PublicDisplay from './pages/PublicDisplay';
import ServerSetup from './pages/ServerSetup';
import useAuthStore from './store/useAuthStore';

function RootRedirect() {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated() ? <Navigate to="/home" /> : <Navigate to="/login" />;
}

function ProtectedRoute({ children, roles = [], page = null, denyDeptStaff = false }) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated()) return <Navigate to="/login" />;

  // If this user has explicit allowed_pages set, enforce them (overrides role check)
  if (page && user?.allowed_pages) {
    if (!user.allowed_pages.includes(page)) return <Navigate to="/home" />;
  } else if (roles.length > 0 && !roles.includes(user?.role)) {
    return <Navigate to="/" />;
  }

  if (denyDeptStaff && user?.role === 'staff' && user?.department_id) {
    return <Navigate to="/queue" />;
  }

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/home" element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        } />

        <Route path="/reception" element={
          <ProtectedRoute page="reception" roles={['super_admin', 'admin', 'staff', 'reception']} denyDeptStaff>
            <Reception />
          </ProtectedRoute>
        } />

        <Route path="/queue" element={
          <ProtectedRoute page="queue" roles={['super_admin', 'admin', 'staff']}>
            <QueueDashboard />
          </ProtectedRoute>
        } />

        <Route path="/admin" element={
          <ProtectedRoute page="admin" roles={['super_admin', 'admin']}>
            <Admin />
          </ProtectedRoute>
        }>
          <Route index element={<Overview />} />
          <Route path="departments" element={<Departments />} />
          <Route path="users" element={<Users />} />
          <Route path="announcements" element={<Announcements />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        <Route path="/reports" element={
          <ProtectedRoute page="reports" roles={['super_admin', 'admin']}>
            <Reports />
          </ProtectedRoute>
        } />

        <Route path="/server-setup" element={
          <ProtectedRoute roles={['super_admin']}>
            <ServerSetup />
          </ProtectedRoute>
        } />

        {/* Public — no auth required */}
        <Route path="/display" element={<PublicDisplay />} />

        <Route path="/" element={<RootRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}
