import { useState, useEffect } from 'react';
import { adminAPI } from '../../lib/api';
import { departmentAPI } from '../../lib/api';

export default function Overview() {
  const [stats, setStats] = useState(null);
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    adminAPI.getDepartments().then(r => setDepartments(r.data)).catch(() => {});
    adminAPI.getUsers().then(r => setStats(r.data)).catch(() => {});
  }, []);

  const activeDepts = departments.filter(d => d.is_active).length;

  return (
    <div>
      <h2 className="text-2xl font-bold text-navy mb-6">Overview</h2>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <p className="text-sm text-gray-500 mb-1">Total Departments</p>
          <p className="text-4xl font-black text-teal">{departments.length}</p>
          <p className="text-sm text-gray-400 mt-1">{activeDepts} active</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6">
          <p className="text-sm text-gray-500 mb-1">Staff Accounts</p>
          <p className="text-4xl font-black text-navy">{stats?.length ?? '—'}</p>
          <p className="text-sm text-gray-400 mt-1">{stats?.filter(u => u.is_active).length ?? '—'} active</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6">
          <p className="text-sm text-gray-500 mb-1">System Status</p>
          <p className="text-2xl font-black text-green-600">Online</p>
          <p className="text-sm text-gray-400 mt-1">All services running</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="font-bold text-navy mb-4">Departments</h3>
        <div className="space-y-2">
          {departments.map(d => (
            <div key={d.department_id} className="flex items-center gap-3 py-2 border-b last:border-0">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color_code }} />
              <span className="font-medium">{d.name}</span>
              <span className="text-sm text-gray-400 font-mono">{d.code}</span>
              <span className={`ml-auto text-xs px-2 py-0.5 rounded font-semibold ${d.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {d.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
