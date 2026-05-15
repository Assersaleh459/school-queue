import { useState, useEffect } from 'react';
import { adminAPI, reportsAPI } from '../../lib/api';

const DEPT_EMPTY = { name: '', name_ar: '', code: '', color_code: '#19224A', display_order: '', is_active: true, room_number: '' };
const CAT_EMPTY  = { name: '', estimated_time_minutes: 5, is_active: true };

export default function Departments() {
  const [departments, setDepartments] = useState([]);
  const [showForm, setShowForm]       = useState(false);
  const [editing, setEditing]         = useState(null);
  const [form, setForm]               = useState(DEPT_EMPTY);
  const [error, setError]             = useState('');
  const [saving, setSaving]           = useState(false);

  // service types modal
  const [catDept, setCatDept]       = useState(null);
  const [categories, setCategories] = useState([]);
  const [catForm, setCatForm]       = useState(CAT_EMPTY);
  const [editingCat, setEditingCat] = useState(null);
  const [catError, setCatError]     = useState('');
  const [catSaving, setCatSaving]   = useState(false);
  const [catStats, setCatStats]     = useState({}); // category_id → { actual_avg_minutes, sample_count }

  useEffect(() => { load(); }, []);

  const load = () => adminAPI.getDepartments().then(r => setDepartments(r.data)).catch(() => {});
  const set  = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setcf = (k, v) => setCatForm(f => ({ ...f, [k]: v }));

  const openCreate = () => { setEditing(null); setForm(DEPT_EMPTY); setError(''); setShowForm(true); };
  const openEdit   = (d) => {
    setEditing(d);
    setForm({ name: d.name, name_ar: d.name_ar || '', code: d.code, color_code: d.color_code, display_order: d.display_order, is_active: !!d.is_active, room_number: d.room_number || '' });
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

  // --- Service Types ---
  const openCatModal = async (dept) => {
    setCatDept(dept);
    setCatError('');
    setEditingCat(null);
    setCatForm(CAT_EMPTY);
    const res = await adminAPI.getCategories(dept.department_id);
    setCategories(res.data);
    reportsAPI.getCategoryStats().then(r => {
      const map = {};
      r.data.forEach(s => { map[s.category_id] = s; });
      setCatStats(map);
    }).catch(() => {});
  };

  const startEditCat = (cat) => {
    setEditingCat(cat);
    setCatForm({ name: cat.name, estimated_time_minutes: cat.estimated_time_minutes, is_active: !!cat.is_active });
    setCatError('');
  };

  const cancelCatEdit = () => { setEditingCat(null); setCatForm(CAT_EMPTY); setCatError(''); };

  const saveCat = async (e) => {
    e.preventDefault();
    setCatSaving(true);
    setCatError('');
    try {
      if (editingCat) {
        await adminAPI.updateCategory(catDept.department_id, editingCat.category_id, catForm);
      } else {
        await adminAPI.createCategory(catDept.department_id, catForm);
      }
      setEditingCat(null);
      setCatForm(CAT_EMPTY);
      const res = await adminAPI.getCategories(catDept.department_id);
      setCategories(res.data);
    } catch (err) {
      setCatError(err.response?.data?.error || 'Save failed');
    } finally {
      setCatSaving(false);
    }
  };

  const deleteCat = async (cat) => {
    if (!window.confirm(`Delete "${cat.name}"?`)) return;
    try {
      await adminAPI.deleteCategory(catDept.department_id, cat.category_id);
      const res = await adminAPI.getCategories(catDept.department_id);
      setCategories(res.data);
    } catch (err) {
      setCatError(err.response?.data?.error || 'Delete failed');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-navy">Departments ({departments.length})</h2>
        <button onClick={openCreate} className="bg-teal text-white px-5 py-2 rounded-lg hover:bg-opacity-90 font-semibold">
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
                <td className="px-5 py-3 flex gap-2">
                  <button onClick={() => openEdit(d)} className="px-3 py-1 bg-navy text-white rounded text-sm hover:bg-opacity-80">
                    Edit
                  </button>
                  <button onClick={() => openCatModal(d)} className="px-3 py-1 bg-teal text-white rounded text-sm hover:bg-opacity-80">
                    Service Types
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Department form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-8 w-full max-w-md">
            <h2 className="text-xl font-bold mb-6">{editing ? 'Edit Department' : 'Add Department'}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Name (English) *</label>
                <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal" required />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Name (Arabic — اسم القسم)</label>
                <input type="text" value={form.name_ar} onChange={e => set('name_ar', e.target.value)}
                  dir="rtl" placeholder="مثال: القسم المالي"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal text-right" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Code (2-4 letters) *</label>
                <input type="text" value={form.code} onChange={e => set('code', e.target.value.toUpperCase())}
                  maxLength={4} className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal font-mono" required />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Display Color</label>
                <input type="color" value={form.color_code} onChange={e => set('color_code', e.target.value)}
                  className="w-full h-10 border rounded-lg cursor-pointer" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Display Order</label>
                <input type="number" min="1" value={form.display_order} onChange={e => set('display_order', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Room Number</label>
                <input type="text" value={form.room_number} onChange={e => set('room_number', e.target.value)}
                  placeholder="e.g. Room 3, Counter 5"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal" />
                <p className="text-xs text-gray-400 mt-1">Use <code className="bg-gray-100 px-1 rounded">{'{room}'}</code> in voice templates to speak this.</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} className="w-4 h-4" />
                <span className="text-sm font-semibold text-gray-700">Active</span>
              </label>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving}
                  className="flex-1 bg-teal text-white py-2 rounded-lg font-semibold hover:bg-opacity-90 disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-300">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Service Types modal */}
      {catDept && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-8 w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-bold text-navy">Service Types — {catDept.name}</h2>
              <button onClick={() => setCatDept(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>

            {/* Existing categories */}
            <div className="flex-1 overflow-auto mb-5">
              {categories.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">No service types yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Est. Time</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map(cat => (
                      <tr key={cat.category_id} className={`border-b ${!cat.is_active ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-2 font-medium">{cat.name}</td>
                        <td className="px-3 py-2 text-gray-500">{cat.estimated_time_minutes} min</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${cat.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                            {cat.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-3 py-2 flex gap-1">
                          <button onClick={() => startEditCat(cat)}
                            className="px-2 py-1 bg-navy text-white rounded text-xs hover:bg-opacity-80">Edit</button>
                          <button onClick={() => deleteCat(cat)}
                            className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Add / Edit form */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-bold text-gray-700 mb-3">
                {editingCat ? `Editing: ${editingCat.name}` : 'Add New Service Type'}
              </h3>
              <form onSubmit={saveCat} className="space-y-3">
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder="Service type name *"
                    value={catForm.name}
                    onChange={e => setcf('name', e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                    required
                  />
                  <div className="flex flex-col gap-1">
                    <input
                      type="number"
                      min="1"
                      max="120"
                      placeholder="Minutes"
                      value={catForm.estimated_time_minutes}
                      onChange={e => setcf('estimated_time_minutes', parseInt(e.target.value) || 5)}
                      className="w-24 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                    />
                  </div>
                </div>
                {/* Smart suggestion from real data */}
                {editingCat && (() => {
                  const s = catStats[editingCat.category_id];
                  if (!s || s.sample_count === 0 || s.actual_avg_minutes == null) return null;
                  const diff = Math.abs(s.actual_avg_minutes - catForm.estimated_time_minutes);
                  if (diff < 2) return (
                    <p className="text-xs text-green-600 font-medium">
                      ✓ Actual avg last 30 days: {s.actual_avg_minutes} min ({s.sample_count} tickets) — your estimate is accurate.
                    </p>
                  );
                  return (
                    <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs">
                      <span className="text-amber-700 font-medium">
                        Actual avg last 30 days: <strong>{s.actual_avg_minutes} min</strong> ({s.sample_count} tickets).
                        Your estimate is {catForm.estimated_time_minutes} min.
                      </span>
                      <button
                        type="button"
                        onClick={() => setcf('estimated_time_minutes', s.actual_avg_minutes)}
                        className="shrink-0 px-2 py-1 bg-amber-500 text-white rounded font-semibold hover:bg-amber-600"
                      >
                        Use {s.actual_avg_minutes} min
                      </button>
                    </div>
                  );
                })()}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={catForm.is_active} onChange={e => setcf('is_active', e.target.checked)} className="w-4 h-4" />
                  <span className="text-sm text-gray-700">Active</span>
                </label>
                {catError && <p className="text-red-500 text-xs">{catError}</p>}
                <div className="flex gap-2">
                  <button type="submit" disabled={catSaving}
                    className="px-4 py-2 bg-teal text-white rounded-lg text-sm font-semibold hover:bg-opacity-90 disabled:opacity-50">
                    {catSaving ? 'Saving...' : editingCat ? 'Update' : 'Add'}
                  </button>
                  {editingCat && (
                    <button type="button" onClick={cancelCatEdit}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-300">
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
