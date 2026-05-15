import { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { settingsAPI, authAPI } from './lib/api';
import useAuthStore from './store/useAuthStore';

// ── Lazy-loaded routes ────────────────────────────────────────────────────────
const Login        = lazy(() => import('./pages/Login'));
const Home         = lazy(() => import('./pages/Home'));
const Reception    = lazy(() => import('./pages/Reception'));
const QueueDashboard = lazy(() => import('./pages/QueueDashboard'));
const Admin        = lazy(() => import('./pages/Admin'));
const Overview     = lazy(() => import('./pages/admin/Overview'));
const Departments  = lazy(() => import('./pages/admin/Departments'));
const Users        = lazy(() => import('./pages/admin/Users'));
const Settings     = lazy(() => import('./pages/admin/Settings'));
const Announcements = lazy(() => import('./pages/admin/Announcements'));
const AuditLog     = lazy(() => import('./pages/admin/AuditLog'));
const QueueControl = lazy(() => import('./pages/admin/QueueControl'));
const Reports      = lazy(() => import('./pages/Reports'));
const PublicDisplay = lazy(() => import('./pages/PublicDisplay'));
const ServerSetup  = lazy(() => import('./pages/ServerSetup'));

// ── Loading fallback ──────────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-gray-400 text-sm font-semibold animate-pulse">Loading...</div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  return m ? `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}` : null;
}

function RootRedirect() {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated() ? <Navigate to="/home" /> : <Navigate to="/login" />;
}

function ProtectedRoute({ children, roles = [], page = null, denyDeptStaff = false }) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated()) return <Navigate to="/login" />;

  if (page && user?.allowed_pages) {
    if (!user.allowed_pages.includes(page)) return <Navigate to="/home" />;
    return children; // explicit grant — skip role/dept checks
  }

  if (roles.length > 0 && !roles.includes(user?.role)) {
    return <Navigate to="/" />;
  }

  if (denyDeptStaff && user?.role === 'staff' && user?.department_id) {
    return <Navigate to="/queue" />;
  }

  return children;
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const { isAuthenticated, updateUser } = useAuthStore();
  // Block rendering until me() settles so ProtectedRoute always sees fresh permissions
  const [authReady, setAuthReady] = useState(!isAuthenticated());

  useEffect(() => {
    settingsAPI.getPublic().then(res => {
      const rgb = hexToRgb(res.data.primary_color || '');
      if (rgb) document.documentElement.style.setProperty('--color-navy', rgb);
      if (res.data.school_name) document.title = `${res.data.school_name} — Queue Management`;
    }).catch(() => {});

    if (isAuthenticated()) {
      authAPI.me()
        .then(res => updateUser(res.data))
        .catch(() => {})
        .finally(() => setAuthReady(true));
    }
  }, []);

  if (!authReady) return <PageLoader />;

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
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
            <Route path="audit-log" element={<AuditLog />} />
            <Route path="queue-control" element={<QueueControl />} />
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

          <Route path="/display" element={<PublicDisplay />} />
          <Route path="/" element={<RootRedirect />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
