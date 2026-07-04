import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';

// Standalone shell for screens that live outside the Admin panel (Queue Control,
// Announcements). Provides a header with the screen title, a back-to-Home button
// and logout, plus the same padded scrollable body the Admin layout gives them.
export default function ScreenShell({ title, children }) {
  const navigate = useNavigate();
  const user     = useAuthStore(s => s.user);
  const logout   = useAuthStore(s => s.logout);

  return (
    <div className="flex flex-col h-screen">
      <header className="bg-white border-b py-4 px-8 flex justify-between items-center shrink-0">
        <h1 className="text-2xl font-bold text-navy">{title}</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{user?.full_name}</span>
          <button
            onClick={() => navigate('/home')}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 text-sm font-semibold"
          >
            ← Home
          </button>
          <button
            onClick={() => logout()}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm font-semibold"
          >
            Logout
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-auto p-8 bg-gray-50">
        {children}
      </div>
    </div>
  );
}
