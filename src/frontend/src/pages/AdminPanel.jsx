import { useState, useEffect } from 'react';
import { userAPI, departmentAPI } from '../lib/api';
import useAuthStore from '../store/useAuthStore';

const ROLES = ['staff', 'admin', 'super_admin'];

const EMPTY_FORM = {
  username: '', password: '', full_name: '', role: 'staff', department_id: ''
};

export default function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const user = useAuthStore(state => state.user);
  const logout = useAuthStore(state => state.logout);

  useEffect(() => {
    fetchUsers();
    fetchDepartments();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await userAPI.getAll();
      setUsers(res.data);
    } catch {
      setError('Failed to load users');
    }
  };

  const fetchDepartments = async () => {
    const res = await departmentAPI.getAll();
    setDepartments(res.data);
  };

  const openCreate = () => {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setError('');
    setShowForm(true);
  };

  const openEdit = (u) => {
    setEditingUser(u);
    setForm({
      username: u.username,
      password: '',
      full_name: u.full_name,
      role: u.role,
      department_id: u.department_id || ''
    });
    setError('');
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        department_id: form.department_id ? parseInt(form.department_id) : null
      };
      if (editingUser) {
        if (!payload.password) delete payload.password;
        await userAPI.update(editingUser.user_id, payload);
      } else {
        await userAPI.create(payload);
      }
      setShowForm(false);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (u) => {
    if (!confirm(`Deactivate user "${u.username}"?`)) return;
    try {
      await userAPI.deactivate(u.user_id);
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to deactivate user');
    }
  };

  const handleToggleActive = async (u) => {
    try {
      await userAPI.update(u.user_id, { is_active: u.is_active ? 0 : 1 });
      fetchUsers();
    } catch {
      alert('Failed to update user');
    }
  };

  const deptName = (id) => departments.find(d => d.department_id === id)?.name || '—';

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-navy text-white py-4 px-8 flex justify-between items-center">
        <h1 className="text-2xl font-bold">Admin Panel — User Management</h1>
        <div className="flex items-center gap-4">
          <span>{user?.full_name}</span>
          <button onClick={() => logout()} className="bg-red-600 px-4 py-2 rounded hover:bg-red-700">Logout</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-700">Staff Accounts ({users.length})</h2>
          <button
            onClick={openCreate}
            className="bg-teal text-white px-6 py-2 rounded-lg hover:bg-opacity-90 font-semibold"
          >
            + Add User
          </button>
        </div>

        {/* User Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-navy text-white">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Username</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Department</th>
                <th className="px-4 py-3 text-left">Last Login</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.user_id} className={`border-b hover:bg-gray-50 ${!u.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium">{u.full_name}</td>
                  <td className="px-4 py-3 text-gray-600">{u.username}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      u.role === 'super_admin' ? 'bg-purple-100 text-purple-800' :
                      u.role === 'admin' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">{deptName(u.department_id)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleActive(u)}
                      disabled={u.role === 'super_admin'}
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        u.is_active
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : 'bg-red-100 text-red-800 hover:bg-red-200'
                      } disabled:cursor-not-allowed`}
                    >
                      {u.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3 flex gap-2">
                    <button
                      onClick={() => openEdit(u)}
                      className="px-3 py-1 bg-navy text-white rounded text-sm hover:bg-opacity-80"
                    >
                      Edit
                    </button>
                    {u.role !== 'super_admin' && u.is_active && (
                      <button
                        onClick={() => handleDeactivate(u)}
                        className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* Create / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
            <h2 className="text-xl font-bold mb-6">{editingUser ? 'Edit User' : 'Create New User'}</h2>

            <form onSubmit={handleSave}>
              <div className="mb-4">
                <label className="block text-gray-700 font-semibold mb-1">Full Name *</label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={e => setForm({ ...form, full_name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-navy"
                  required
                />
              </div>

              <div className="mb-4">
                <label className="block text-gray-700 font-semibold mb-1">Username *</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-navy"
                  disabled={!!editingUser}
                  required={!editingUser}
                />
              </div>

              <div className="mb-4">
                <label className="block text-gray-700 font-semibold mb-1">
                  Password {editingUser ? '(leave blank to keep current)' : '*'}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-navy"
                  required={!editingUser}
                  minLength={editingUser ? 0 : 6}
                />
              </div>

              <div className="mb-4">
                <label className="block text-gray-700 font-semibold mb-1">Role *</label>
                <select
                  value={form.role}
                  onChange={e => setForm({ ...form, role: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-navy"
                  required
                >
                  {ROLES.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div className="mb-6">
                <label className="block text-gray-700 font-semibold mb-1">Department</label>
                <select
                  value={form.department_id}
                  onChange={e => setForm({ ...form, department_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-navy"
                >
                  <option value="">None (Admin / Reception)</option>
                  {departments.map(d => (
                    <option key={d.department_id} value={d.department_id}>{d.name}</option>
                  ))}
                </select>
              </div>

              {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-teal text-white py-2 rounded-lg hover:bg-opacity-90 font-semibold disabled:opacity-50"
                >
                  {saving ? 'Saving...' : (editingUser ? 'Save Changes' : 'Create User')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 font-semibold"
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
