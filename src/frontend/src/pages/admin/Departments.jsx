import { useState, useEffect } from 'react';
import { adminAPI } from '../../lib/api';

const EMPTY = { name: '', code: '', color_code: '#19224A', display_order: '', is_active: true };

export default function Departments() {
  const [departments, setDepartments] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  const load = () => adminAPI.getDepartments().then(r => setDepartments(r.data)).catch(() => {});

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setError('');
    setShowForm(true);
  };

  const openEdit = (d) => {
    setEditing(d);
    setForm({ name: d.name, code: d.code, color_code: d.color_code, display_order: d.display_order, is_active: !!d.is_active });
    setError('');
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, display_order: parseInt(form.display_order) || 99 };
      if (editing) {
        await adminAPI.updateDepartment(editing.department_id, payload);
      } else {
        await adminAPI.createDepartment(payload);
      }
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (d) => {
    await adminAPI.updateDepartment(d.department_id, { ...d, is_active: d.is_active ? 0 : 1 });
    load();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-navy">Departments ({departments.length})</h2>
        <button
          onClick={openCreate}
          className="bg-teal text-white px-5 py-2 rounded-lg hover:bg-opacity-90 font-semibold"
        >
          + Add Department
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-navy text-white">
            <tr>
              <th className="px-5 py-3 text-left">Name</th>
              <th className="px-5 py-3 text-left">Code</th>
              <th className="px-5 py-3 text-left">Color</th>
              <th className="px-5 py-3 text-left">Order</th>
              <th className="px-5 py-3 text-left">Status</th>
              <th className="px-5 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {departments.map(d => (
              <tr key={d.department_id} className={`border-b hover:bg-gray-50 ${!d.is_active ? 'opacity-50' : ''}`}>
                <td className="px-5 py-3 font-semibold">{d.name}</td>
                <td className="px-5 py-3">
                  <span className="px-2 py-1 rounded font-mono text-sm" style={{ backgroundColor: d.color_code + '22', color: d.color_code }}>
                    {d.code}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded border" style={{ backgroundColor: d.color_code }} />
                    <span className="text-sm text-gray-500">{d.color_code}</span>
                  </div>
                </td>
                <td className="px-5 py-3 text-gray-600">{d.display_order}</td>
                <td className="px-5 py-3">
                  <button
                    onClick={() => toggleActive(d)}
                    className={`px-2 py-1 rounded text-xs font-semibold ${d.is_active ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {d.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-5 py-3">
                  <button
                    onClick={() => openEdit(d)}
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
            <h2 className="text-xl font-bold mb-6">{editing ? 'Edit Department' : 'Add Department'}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Code (2-4 letters) *</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={e => set('code', e.target.value.toUpperCase())}
                  maxLength={4}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Display Color</label>
                <input
                  type="color"
                  value={form.color_code}
                  onChange={e => set('color_code', e.target.value)}
                  className="w-full h-10 border rounded-lg cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Display Order</label>
                <input
                  type="number"
                  min="1"
                  value={form.display_order}
                  onChange={e => set('display_order', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
                />
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
                  {saving ? 'Saving...' : 'Save'}
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
