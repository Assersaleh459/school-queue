import { useState, useEffect } from 'react';
import { adminAPI } from '../../lib/api';

const ROLES = ['staff', 'admin', 'super_admin'];
const ALL_PAGES = [
  { key: 'reception', label: 'Reception — Create Tickets' },
  { key: 'queue',     label: 'Queue Dashboard — Serve Tickets' },
  { key: 'reports',   label: 'Reports' },
  { key: 'admin',     label: 'Admin Panel' },
];
const EMPTY = { username: '', password: '', full_name: '', role: 'staff', department_id: '', is_active: true, allowed_pages: null };

const ROLE_COLORS = {
  super_admin: 'bg-purple-100 text-purple-800',
  admin: 'bg-blue-100 text-blue-800',
  staff: 'bg-gray-100 text-gray-700'
};

export default function Users() {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadUsers();
    adminAPI.getDepartments().then(r => setDepartments(r.data)).catch(() => {});
  }, []);

  const loadUsers = () => adminAPI.getUsers().then(r => setUsers(r.data)).catch(() => {});

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setError('');
    setShowForm(true);
  };

  const openEdit = (u) => {
    setEditing(u);
    setForm({ username: u.username, password: '', full_name: u.full_name, role: u.role, department_id: u.department_id || '', is_active: !!u.is_active, allowed_pages: u.allowed_pages || null });
    setError('');
    setShowForm(true);
  };

  const togglePage = (key) => {
    setForm(f => {
      const current = f.allowed_pages || [];
      const next = current.includes(key) ? current.filter(p => p !== key) : [...current, key];
      return { ...f, allowed_pages: next.length ? next : null };
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, department_id: form.department_id ? parseInt(form.department_id) : null };
      if (editing) {
        if (!payload.password) delete payload.password;
        await adminAPI.updateUser(editing.user_id, payload);
      } else {
        await adminAPI.createUser(payload);
      }
      setShowForm(false);
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u) => {
    if (u.role === 'super_admin') return;
    try {
      await adminAPI.updateUser(u.user_id, { ...u, is_active: u.is_active ? 0 : 1, password: undefined });
      loadUsers();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update user');
    }
  };

  const deptName = (id) => departments.find(d => d.department_id === id)?.name || '—';

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-navy">Users ({users.length})</h2>
        <button
          onClick={openCreate}
          className="bg-teal text-white px-5 py-2 rounded-lg hover:bg-opacity-90 font-semibold"
        >
          + Add User
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-navy text-white">
            <tr>
              <th className="px-5 py-3 text-left">Name</th>
              <th className="px-5 py-3 text-left">Username</th>
              <th className="px-5 py-3 text-left">Role</th>
              <th className="px-5 py-3 text-left">Department</th>
              <th className="px-5 py-3 text-left">Last Login</th>
              <th className="px-5 py-3 text-left">Status</th>
              <th className="px-5 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.user_id} className={`border-b hover:bg-gray-50 ${!u.is_active ? 'opacity-50' : ''}`}>
                <td className="px-5 py-3 font-medium">{u.full_name}</td>
                <td className="px-5 py-3 text-gray-600 font-mono text-sm">{u.username}</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${ROLE_COLORS[u.role] || 'bg-gray-100'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-5 py-3 text-gray-600">{deptName(u.department_id)}</td>
                <td className="px-5 py-3 text-sm text-gray-500">
                  {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}
                </td>
                <td className="px-5 py-3">
                  <button
                    onClick={() => toggleActive(u)}
                    disabled={u.role === 'super_admin'}
                    className={`px-2 py-1 rounded text-xs font-semibold disabled:cursor-not-allowed ${
                      u.is_active ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-red-100 text-red-800 hover:bg-red-200'
                    }`}
                  >
                    {u.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-5 py-3">
                  <button
                    onClick={() => openEdit(u)}
                    className="px-3 py-1 bg-navy text-white rounded text-sm hover:bg-opacity-80"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-8 w-full max-w-md">
            <h2 className="text-xl font-bold mb-6">{editing ? 'Edit User' : 'Create User'}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={e => set('full_name', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Username *</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={e => set('username', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
                  disabled={!!editing}
                  required={!editing}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Password {editing ? '(blank = keep current)' : '*'}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
                  required={!editing}
                  minLength={editing ? 0 : 6}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Role *</label>
                <select
                  value={form.role}
                  onChange={e => set('role', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
                >
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Department</label>
                <select
                  value={form.department_id}
                  onChange={e => set('department_id', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
                >
                  <option value="">None (Admin / No department)</option>
                  {departments.map(d => <option key={d.department_id} value={d.department_id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Screen Access
                  <span className="ml-2 text-xs font-normal text-gray-400">(leave all unchecked = role defaults apply)</span>
                </label>
                <div className="border rounded-lg p-3 space-y-2">
                  {ALL_PAGES.map(p => (
                    <label key={p.key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.allowed_pages ? form.allowed_pages.includes(p.key) : false}
                        onChange={() => togglePage(p.key)}
                        className="w-4 h-4 accent-teal"
                      />
                      <span className="text-sm text-gray-700">{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => set('is_active', e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm font-semibold text-gray-700">Active</span>
              </label>

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-teal text-white py-2 rounded-lg font-semibold hover:bg-opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create User'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
