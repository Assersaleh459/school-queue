import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';

export default function Admin() {
  const user = useAuthStore(state => state.user);
  const logout = useAuthStore(state => state.logout);
  const navigate = useNavigate();

  return (
    <div className="flex h-screen">
      <aside className="w-64 bg-navy text-white flex flex-col shrink-0">
        <div className="p-6 border-b border-white border-opacity-20">
          <h2 className="text-xl font-bold">Admin Panel</h2>
          <p className="text-teal text-sm mt-1">{user?.full_name}</p>
        </div>
        <nav className="p-4 space-y-1 flex-1">
          <NavLink to="/admin" end className={({ isActive }) =>
            `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-teal text-white' : 'text-gray-300 hover:bg-white hover:bg-opacity-10'}`
          }>Overview</NavLink>
          <NavLink to="/admin/departments" className={({ isActive }) =>
            `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-teal text-white' : 'text-gray-300 hover:bg-white hover:bg-opacity-10'}`
          }>Departments</NavLink>
          <NavLink to="/admin/users" className={({ isActive }) =>
            `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-teal text-white' : 'text-gray-300 hover:bg-white hover:bg-opacity-10'}`
          }>Users</NavLink>
          <NavLink to="/admin/announcements" className={({ isActive }) =>
            `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-teal text-white' : 'text-gray-300 hover:bg-white hover:bg-opacity-10'}`
          }>Announcements</NavLink>
          {user?.role === 'super_admin' && (
            <NavLink to="/admin/settings" className={({ isActive }) =>
              `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-teal text-white' : 'text-gray-300 hover:bg-white hover:bg-opacity-10'}`
            }>Settings</NavLink>
          )}
        </nav>
        <div className="p-4 border-t border-white border-opacity-20 space-y-2">
          <button
            onClick={() => navigate('/home')}
            className="w-full bg-white bg-opacity-10 text-white py-2 rounded-lg hover:bg-opacity-20 text-sm font-semibold"
          >
            ← Home
          </button>
          <button
            onClick={() => logout()}
            className="w-full bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 text-sm font-semibold"
          >
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b py-4 px-8 shrink-0">
          <h1 className="text-2xl font-bold text-navy">System Administration</h1>
        </header>
        <div className="flex-1 overflow-auto p-8 bg-gray-50">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
