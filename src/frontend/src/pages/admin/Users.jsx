import { useState, useEffect } from 'react';
import { adminAPI } from '../../lib/api';
import { toast } from '../../store/useToastStore';

const ROLES = ['staff', 'admin', 'super_admin'];
const REPORT_SUB_KEYS = ['reports_daily', 'reports_service_types', 'reports_transfers', 'reports_purposes', 'reports_ticket_log'];
const ALL_PAGES = [
  { key: 'reception',             label: 'Reception — Create Tickets' },
  { key: 'queue',                 label: 'Queue Dashboard — Serve Tickets' },
  { key: 'all_queues',            label: 'All Queues — Cross-department view' },
  { key: 'reports',               label: 'Reports' },
  { key: 'reports_daily',         label: 'Daily Summary',       sub: true },
  { key: 'reports_service_types', label: 'Service Types',       sub: true },
  { key: 'reports_transfers',     label: 'Transfers',           sub: true },
  { key: 'reports_purposes',      label: 'Visit Purposes',      sub: true },
  { key: 'reports_ticket_log',    label: 'Ticket Log',          sub: true },
  { key: 'admin',                 label: 'Admin Panel' },
  { key: 'kiosk',                 label: 'Self-Service Kiosk' },
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
    setShowDeleteConfirm(false);
    setShowForm(true);
  };

  const openEdit = (u) => {
    setEditing(u);
    let pages = null;
    if (u.allowed_pages) {
      try { pages = typeof u.allowed_pages === 'string' ? JSON.parse(u.allowed_pages) : u.allowed_pages; } catch {}
    }
    setForm({ username: u.username, password: '', full_name: u.full_name, role: u.role, department_id: u.department_id || '', is_active: !!u.is_active, allowed_pages: pages });
    setError('');
    setShowDeleteConfirm(false);
    setShowForm(true);
  };

  const togglePage = (key) => {
    setForm(f => {
      const current = f.allowed_pages || [];
      const isAdding = !current.includes(key);
      let next = isAdding ? [...current, key] : current.filter(p => p !== key);
      if (REPORT_SUB_KEYS.includes(key)) {
        if (isAdding) {
          if (!next.includes('reports')) next = [...next, 'reports'];
        } else {
          if (!REPORT_SUB_KEYS.some(k => next.includes(k))) next = next.filter(p => p !== 'reports');
        }
      }
      return { ...f, allowed_pages: next.length ? next : null };
    });
  };

  const handleDelete = async () => {
    try {
      await adminAPI.deleteUser(editing.user_id);
      setShowForm(false);
      setShowDeleteConfirm(false);
      toast.success(`${editing.full_name} deleted`);
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Delete failed');
      setShowDeleteConfirm(false);
    }
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
      let pages = null;
      if (u.allowed_pages) {
        try { pages = typeof u.allowed_pages === 'string' ? JSON.parse(u.allowed_pages) : u.allowed_pages; } catch {}
      }
      await adminAPI.updateUser(u.user_id, {
        full_name: u.full_name, role: u.role, department_id: u.department_id,
        is_active: u.is_active ? 0 : 1, allowed_pages: pages
      });
      loadUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update user');
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
                    <label key={p.key} className={`flex items-center gap-2 cursor-pointer${p.sub ? ' ml-6' : ''}`}>
                      <input
                        type="checkbox"
                        checked={form.allowed_pages ? form.allowed_pages.includes(p.key) : false}
                        onChange={() => togglePage(p.key)}
                        className="w-4 h-4 accent-teal"
                      />
                      <span className={`text-sm ${p.sub ? 'text-gray-500' : 'text-gray-700'}`}>{p.label}</span>
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
                  onClick={() => { setShowForm(false); setShowDeleteConfirm(false); }}
                  className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>

              {editing && editing.role !== 'super_admin' && (
                <div className="pt-3 border-t">
                  {!showDeleteConfirm ? (
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="text-red-500 text-sm hover:underline"
                    >
                      Delete this user
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-sm text-red-700 flex-1">Permanently delete <strong>{editing.full_name}</strong>?</p>
                      <button
                        type="button"
                        onClick={handleDelete}
                        className="px-3 py-1 bg-red-600 text-white rounded text-sm font-semibold hover:bg-red-700"
                      >
                        Yes, Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
