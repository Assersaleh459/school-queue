import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';
import { settingsAPI, authAPI } from '../lib/api';

const TILES = [
  {
    label: 'Reception',
    description: 'Create tickets for parents',
    path: '/reception',
    page: 'reception',
    color: '#5FAEB6',
    roles: ['super_admin', 'admin', 'staff', 'reception'],
    hiddenForDeptStaff: true,
    icon: '🎫'
  },
  {
    label: 'Queue Dashboard',
    description: 'Call and serve tickets',
    path: '/queue',
    page: 'queue',
    color: '#19224A',
    roles: ['super_admin', 'admin', 'staff'],
    requiresDept: true,
    icon: '📋'
  },
  {
    label: 'Admin Panel',
    description: 'Manage users, departments, settings',
    path: '/admin',
    page: 'admin',
    color: '#223B73',
    roles: ['super_admin', 'admin'],
    icon: '⚙️'
  },
  {
    label: 'Reports',
    description: 'Daily summaries and exports',
    path: '/reports',
    page: 'reports',
    color: '#2563eb',
    roles: ['super_admin', 'admin'],
    icon: '📊'
  },
  {
    label: 'Display Monitor',
    description: 'Public queue display screen',
    path: '/display',
    page: null,
    color: '#059669',
    roles: ['super_admin', 'admin', 'staff'],
    icon: '📺'
  }
];

export default function Home() {
  const navigate  = useNavigate();
  const user      = useAuthStore(s => s.user);
  const logout    = useAuthStore(s => s.logout);
  const [schoolName, setSchoolName] = useState('Al-Noor International School');
  const [pwModal, setPwModal]       = useState(false);

  useEffect(() => {
    settingsAPI.getPublic()
      .then(res => { if (res.data.school_name) setSchoolName(res.data.school_name); })
      .catch(() => {});
  }, []);

  const visible = TILES.filter(t => {
    if (user?.allowed_pages) {
      if (!t.page) return false; // uncontrollable tile (Display Monitor) — hide when access is restricted
      return user.allowed_pages.includes(t.page);
    }
    if (!t.roles.includes(user?.role)) return false;
    if (t.requiresDept && !user?.department_id) return false;
    if (t.hiddenForDeptStaff && user?.role === 'staff' && user?.department_id) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-navy text-white py-5 px-8 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">SchoolQ</h1>
          <p className="text-teal text-sm mt-0.5">{schoolName}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-300">{user?.full_name}</span>
          <span className="text-xs bg-teal bg-opacity-30 text-teal px-2 py-1 rounded">{user?.role}</span>
          <button
            onClick={() => setPwModal(true)}
            className="bg-white bg-opacity-10 text-white px-3 py-2 rounded-lg hover:bg-opacity-20 text-sm font-semibold"
            title="Change your password"
          >
            🔑 Password
          </button>
          {window.electronAPI && user?.role === 'super_admin' && (
            <button
              onClick={() => navigate('/server-setup')}
              className="bg-white bg-opacity-10 text-white px-3 py-2 rounded-lg hover:bg-opacity-20 text-sm font-semibold"
              title="Server connection settings"
            >
              🔌 Server
            </button>
          )}
          <button
            onClick={() => logout()}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm font-semibold"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-8 py-12">
        <h2 className="text-2xl font-bold text-navy mb-2">Welcome, {user?.full_name}</h2>
        <p className="text-gray-500 mb-10">Select a module to get started.</p>

        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
          {visible.map(tile => (
            <button
              key={tile.path}
              onClick={() => navigate(tile.path)}
              className="bg-white rounded-2xl shadow-sm p-7 text-left hover:shadow-md transition-shadow border border-transparent hover:border-gray-200 group"
            >
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl mb-4"
                style={{ backgroundColor: tile.color + '18' }}
              >
                {tile.icon}
              </div>
              <p className="text-lg font-bold text-navy group-hover:text-teal transition-colors">
                {tile.label}
              </p>
              <p className="text-sm text-gray-500 mt-1">{tile.description}</p>
            </button>
          ))}
        </div>
      </main>

      {pwModal && <ChangePasswordModal onClose={() => setPwModal(false)} />}
    </div>
  );
}

function ChangePasswordModal({ onClose }) {
  const [current, setCurrent]   = useState('');
  const [next, setNext]         = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState(false);
  const [saving, setSaving]     = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (next !== confirm) { setError('New passwords do not match.'); return; }
    if (next.length < 6)  { setError('New password must be at least 6 characters.'); return; }

    setSaving(true);
    try {
      await authAPI.changePassword(current, next);
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-navy">Change Password</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {success ? (
          <div className="text-center py-4">
            <p className="text-green-600 font-bold text-lg">✓ Password changed!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Current Password</label>
              <input
                type="password"
                autoFocus
                value={current}
                onChange={e => setCurrent(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">New Password</label>
              <input
                type="password"
                value={next}
                onChange={e => setNext(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Confirm New Password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
                required
              />
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-teal text-white py-3 rounded-xl font-bold hover:bg-opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Change Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
