import { useState } from 'react';
import { authAPI } from '../lib/api';
import useAuthStore from '../store/useAuthStore';

// Shown instead of any page while the user is signed in with the default password.
// The server refuses everything else until the password is changed.
export default function ForcePasswordChange() {
  const { user, login, logout } = useAuthStore();
  const [next, setNext]       = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError]     = useState('');
  const [saving, setSaving]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (next !== confirm) { setError('New passwords do not match.'); return; }
    if (next.length < 8)  { setError('New password must be at least 8 characters.'); return; }

    setSaving(true);
    try {
      const res = await authAPI.changePassword('admin123', next);
      login({ ...user, must_change_password: false }, res.data.token);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md w-96">
        <h1 className="text-2xl font-bold text-navy mb-2">Choose a new password</h1>
        <p className="text-gray-600 text-sm mb-6">
          You signed in with the default password, which anyone can look up.
          Choose a new one to continue.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">New Password</label>
            <input
              type="password"
              autoFocus
              value={next}
              onChange={e => setNext(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-navy"
              required
              minLength={8}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-navy"
              required
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-navy text-white py-3 rounded-lg hover:bg-opacity-90 font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save and continue'}
          </button>
          <button type="button" onClick={logout} className="w-full text-gray-500 text-sm hover:underline">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
