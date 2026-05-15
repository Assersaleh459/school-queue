import { useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../../lib/api';

const ACTION_COLORS = {
  LOGIN:                'bg-blue-100 text-blue-800',
  CHANGE_PASSWORD:      'bg-yellow-100 text-yellow-800',
  TICKET_CREATED:       'bg-green-100 text-green-800',
  TICKET_CALLED:        'bg-teal-100 text-teal-700',
  TICKET_COMPLETED:     'bg-green-200 text-green-900',
  TICKET_RECALLED:      'bg-orange-100 text-orange-800',
  TICKET_FINAL_CALL:    'bg-red-100 text-red-700',
  TICKET_SKIPPED:       'bg-gray-200 text-gray-700',
  TICKET_NO_SHOW:       'bg-red-200 text-red-900',
  TICKET_TRANSFERRED:   'bg-purple-100 text-purple-800',
  USER_CREATED:         'bg-indigo-100 text-indigo-800',
  USER_UPDATED:         'bg-indigo-50 text-indigo-700',
  DEPT_CREATED:         'bg-teal-100 text-teal-800',
  DEPT_UPDATED:         'bg-teal-50 text-teal-700',
  SETTINGS_UPDATED:     'bg-yellow-50 text-yellow-800',
  ANNOUNCEMENT_CREATED: 'bg-pink-100 text-pink-800',
  ANNOUNCEMENT_DELETED: 'bg-pink-200 text-pink-900',
};

function formatDetails(details) {
  if (!details) return '—';
  try {
    const obj = typeof details === 'string' ? JSON.parse(details) : details;
    return Object.entries(obj)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join(' · ');
  } catch {
    return String(details);
  }
}

export default function AuditLog() {
  const [logs, setLogs]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filterAction, setFilterAction] = useState('');
  const [page, setPage]         = useState(0);
  const PAGE_SIZE = 100;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminAPI.getAuditLogs({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        action: filterAction || undefined,
      });
      setLogs(r.data);
    } catch {}
    finally { setLoading(false); }
  }, [page, filterAction]);

  useEffect(() => { load(); }, [load]);

  const uniqueActions = [...new Set(Object.keys(ACTION_COLORS))].sort();

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-navy">Audit Log</h2>
        <div className="flex gap-3 items-center">
          <select
            value={filterAction}
            onChange={e => { setFilterAction(e.target.value); setPage(0); }}
            className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
          >
            <option value="">All actions</option>
            {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={load} className="px-4 py-2 bg-navy text-white rounded-lg text-sm font-semibold hover:bg-opacity-80">
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-navy text-white">
            <tr>
              <th className="px-4 py-3 text-left">Time</th>
              <th className="px-4 py-3 text-left">User</th>
              <th className="px-4 py-3 text-left">Action</th>
              <th className="px-4 py-3 text-left">Entity</th>
              <th className="px-4 py-3 text-left">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-12 text-gray-400">Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-gray-400">No logs found</td></tr>
            ) : logs.map(l => (
              <tr key={l.log_id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-500 whitespace-nowrap font-mono text-xs">
                  {new Date(l.logged_at).toLocaleString()}
                </td>
                <td className="px-4 py-2 font-medium">
                  {l.full_name || l.username || <span className="text-gray-400">System</span>}
                </td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${ACTION_COLORS[l.action] || 'bg-gray-100 text-gray-700'}`}>
                    {l.action}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-500 text-xs">
                  {l.entity_type && `${l.entity_type}${l.entity_id ? ` #${l.entity_id}` : ''}`}
                </td>
                <td className="px-4 py-2 text-gray-500 text-xs max-w-sm break-words whitespace-normal">
                  {formatDetails(l.details)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center mt-4">
        <button
          onClick={() => setPage(p => Math.max(0, p - 1))}
          disabled={page === 0}
          className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-semibold disabled:opacity-40 hover:bg-gray-300"
        >
          ← Previous
        </button>
        <span className="text-sm text-gray-500">Page {page + 1}</span>
        <button
          onClick={() => setPage(p => p + 1)}
          disabled={logs.length < PAGE_SIZE}
          className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-semibold disabled:opacity-40 hover:bg-gray-300"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
