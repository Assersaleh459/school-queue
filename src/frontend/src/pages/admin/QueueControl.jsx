import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { departmentAPI, queueAPI, settingsAPI } from '../../lib/api';
import useAuthStore from '../../store/useAuthStore';

const PRIORITY_COLORS = {
  urgent:  'bg-red-100 text-red-800',
  elderly: 'bg-orange-100 text-orange-800',
  vip:     'bg-purple-100 text-purple-800',
};

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-8 w-full max-w-md">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-bold text-navy">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function QueueControl() {
  const user = useAuthStore(s => s.user);
  const [departments, setDepartments] = useState([]);
  const [deptData, setDeptData]       = useState({});
  const [noShowLimit, setNoShowLimit] = useState(3);

  const [skipModal,      setSkipModal]      = useState(null);
  const [skipReason,     setSkipReason]     = useState('');
  const [transferModal,  setTransferModal]  = useState(null);
  const [transferDept,   setTransferDept]   = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [noShowModal,    setNoShowModal]    = useState(null);

  const socketRef  = useRef(null);
  const deptsRef   = useRef([]);

  const loadAll = useCallback(async (depts) => {
    const entries = await Promise.all(
      depts.map(async d => {
        try {
          const [qRes, sRes, cRes] = await Promise.all([
            departmentAPI.getQueue(d.department_id),
            departmentAPI.getStats(d.department_id),
            queueAPI.getCurrent(d.department_id),
          ]);
          return [d.department_id, { queue: qRes.data, stats: sRes.data, current: cRes.data.ticket || null }];
        } catch {
          return [d.department_id, { queue: [], stats: {}, current: null }];
        }
      })
    );
    setDeptData(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    departmentAPI.getAll().then(res => {
      const depts = res.data;
      deptsRef.current = depts;
      setDepartments(depts);
      loadAll(depts);

      const socket = io(window.location.origin, { transports: ['websocket', 'polling'] });
      socketRef.current = socket;
      socket.on('connect', () => depts.forEach(d => socket.emit('join_department', d.department_id)));
      socket.on('queue_updated', () => loadAll(deptsRef.current));
    }).catch(() => {});

    settingsAPI.getPublic()
      .then(r => { if (r.data.no_show_after_calls) setNoShowLimit(parseInt(r.data.no_show_after_calls)); })
      .catch(() => {});

    return () => socketRef.current?.disconnect();
  }, [loadAll]);

  // ── Actions ───────────────────────────────────────────────────────────────────

  const callNext = async (dept) => {
    try { await queueAPI.callNext(dept.department_id, user.user_id); }
    catch (err) { alert(err.response?.data?.error || 'Failed to call next'); }
  };

  const complete = async (ticket) => {
    try { await queueAPI.complete(ticket.ticket_id, ''); }
    catch { alert('Failed to complete'); }
  };

  const recall = async (ticket) => {
    try { await queueAPI.recall(ticket.ticket_id); }
    catch { alert('Failed to recall'); }
  };

  const confirmSkip = async () => {
    if (!skipReason.trim()) return;
    try {
      await queueAPI.skip(skipModal.ticket_id, skipReason.trim());
      setSkipModal(null); setSkipReason('');
    } catch { alert('Failed to skip'); }
  };

  const confirmNoShow = async () => {
    try {
      await queueAPI.noShow(noShowModal.ticket_id);
      setNoShowModal(null);
    } catch (err) { alert(err.response?.data?.error || 'Failed to mark no-show'); }
  };

  const confirmTransfer = async () => {
    if (!transferDept || !transferReason.trim()) return;
    try {
      await queueAPI.transfer(transferModal.ticket.ticket_id, parseInt(transferDept), transferReason.trim(), user.user_id);
      setTransferModal(null); setTransferDept(''); setTransferReason('');
    } catch { alert('Failed to transfer'); }
  };

  const otherDepts = (deptId) => departments.filter(d => d.department_id !== deptId);

  const cols = Math.min(departments.length || 1, 3);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-navy">Queue Control</h2>
        <button
          onClick={() => loadAll(deptsRef.current)}
          className="px-4 py-2 bg-navy text-white rounded-lg text-sm font-semibold hover:bg-opacity-80"
        >
          Refresh
        </button>
      </div>

      {departments.length === 0 ? (
        <p className="text-gray-400 text-center py-12">No active departments.</p>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {departments.map(dept => {
            const d     = deptData[dept.department_id] || { queue: [], stats: {}, current: null };
            const color = dept.color_code || '#5FAEB6';
            return (
              <div key={dept.department_id} className="bg-white rounded-xl shadow-sm flex flex-col overflow-hidden"
                style={{ borderTop: `4px solid ${color}` }}>

                {/* Dept header */}
                <div className="px-5 py-3 shrink-0" style={{ backgroundColor: color + '18' }}>
                  <h3 className="font-black text-lg leading-tight" style={{ color }}>{dept.name}</h3>
                  {dept.name_ar && <p className="text-sm text-gray-500 text-right" dir="rtl">{dept.name_ar}</p>}
                  <div className="flex gap-4 text-xs text-gray-500 mt-1">
                    <span>Waiting: <b className="text-gray-800">{d.stats.waiting_count ?? 0}</b></span>
                    <span>Served today: <b className="text-gray-800">{d.stats.served_today ?? 0}</b></span>
                  </div>
                </div>

                {/* Current ticket */}
                <div className="px-5 py-4 border-b flex-1">
                  {d.current ? (
                    <>
                      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Now Serving</p>
                      <p className="text-2xl font-black mb-0.5" style={{ color }}>{d.current.ticket_number}</p>
                      <p className="text-sm text-gray-600 mb-3">{d.current.parent_name}</p>
                      <div className="flex flex-wrap gap-1">
                        <button onClick={() => complete(d.current)}
                          className="px-3 py-1 bg-green-600 text-white rounded text-xs font-semibold hover:bg-green-700">
                          Complete
                        </button>
                        <button onClick={() => recall(d.current)}
                          className="px-3 py-1 bg-yellow-500 text-white rounded text-xs font-semibold hover:bg-yellow-600">
                          Recall ({d.current.call_count}×)
                        </button>
                        <button onClick={() => { setTransferModal({ ticket: d.current, deptId: dept.department_id }); setTransferDept(''); setTransferReason(''); }}
                          className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700">
                          Transfer
                        </button>
                        <button onClick={() => { setSkipModal(d.current); setSkipReason(''); }}
                          className="px-3 py-1 bg-orange-500 text-white rounded text-xs font-semibold hover:bg-orange-600">
                          Skip
                        </button>
                        <button
                          onClick={() => setNoShowModal(d.current)}
                          disabled={d.current.call_count < noShowLimit}
                          title={d.current.call_count < noShowLimit ? `Must recall ${noShowLimit}× first (${d.current.call_count}/${noShowLimit})` : ''}
                          className="px-3 py-1 bg-red-600 text-white rounded text-xs font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed">
                          No-Show
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="text-center text-3xl text-gray-200 font-black py-3">— — —</p>
                  )}
                </div>

                {/* Call Next button */}
                <div className="px-5 py-3 shrink-0">
                  <button
                    onClick={() => callNext(dept)}
                    disabled={!!d.current || (d.stats.waiting_count ?? 0) === 0}
                    style={{ backgroundColor: color }}
                    className="w-full text-white py-2 rounded-lg text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                  >
                    {d.current
                      ? 'Serving...'
                      : (d.stats.waiting_count ?? 0) === 0
                        ? 'Queue Empty'
                        : `Call Next (${d.stats.waiting_count} waiting)`}
                  </button>
                </div>

                {/* Up-next preview */}
                {d.queue.length > 0 && (
                  <div className="px-5 pb-4 shrink-0">
                    <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Up Next</p>
                    {d.queue.slice(0, 3).map(t => (
                      <div key={t.ticket_id} className="flex items-center gap-2 text-sm py-0.5">
                        <span className="font-mono font-semibold text-gray-700 shrink-0">{t.ticket_number}</span>
                        <span className="text-gray-500 truncate flex-1">{t.parent_name}</span>
                        {t.priority !== 'regular' && (
                          <span className={`px-1.5 rounded text-xs font-bold shrink-0 ${PRIORITY_COLORS[t.priority] || ''}`}>
                            {t.priority}
                          </span>
                        )}
                      </div>
                    ))}
                    {d.queue.length > 3 && (
                      <p className="text-xs text-gray-400 mt-1">+{d.queue.length - 3} more waiting</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Skip Modal */}
      {skipModal && (
        <Modal title="Skip Ticket" onClose={() => setSkipModal(null)}>
          <p className="text-gray-600 mb-4">
            Ticket <strong>{skipModal.ticket_number}</strong> will be moved to the end of the queue.
          </p>
          <input autoFocus type="text" value={skipReason} onChange={e => setSkipReason(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && confirmSkip()}
            placeholder="Reason for skipping *"
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 mb-4" />
          <div className="flex gap-3">
            <button onClick={confirmSkip} disabled={!skipReason.trim()}
              className="flex-1 bg-orange-600 text-white py-2 rounded-lg font-semibold hover:bg-orange-700 disabled:opacity-40">
              Skip
            </button>
            <button onClick={() => setSkipModal(null)}
              className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-300">
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* Transfer Modal */}
      {transferModal && (
        <Modal title="Transfer Ticket" onClose={() => setTransferModal(null)}>
          <p className="text-gray-600 mb-4">
            Transfer <strong>{transferModal.ticket.ticket_number}</strong> to another department.
          </p>
          <select value={transferDept} onChange={e => setTransferDept(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 mb-3">
            <option value="">Select department…</option>
            {otherDepts(transferModal.deptId).map(d => (
              <option key={d.department_id} value={d.department_id}>{d.name}</option>
            ))}
          </select>
          <input type="text" value={transferReason} onChange={e => setTransferReason(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && confirmTransfer()}
            placeholder="Reason for transfer *"
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 mb-4" />
          <div className="flex gap-3">
            <button onClick={confirmTransfer} disabled={!transferDept || !transferReason.trim()}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-40">
              Transfer
            </button>
            <button onClick={() => setTransferModal(null)}
              className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-300">
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* No-Show Modal */}
      {noShowModal && (
        <Modal title="Mark as No-Show" onClose={() => setNoShowModal(null)}>
          <p className="text-gray-600 mb-6">
            Mark <strong>{noShowModal.ticket_number}</strong> as no-show?
            Called <strong>{noShowModal.call_count}</strong> time(s).
          </p>
          <div className="flex gap-3">
            <button onClick={confirmNoShow}
              className="flex-1 bg-red-600 text-white py-2 rounded-lg font-semibold hover:bg-red-700">
              Yes, No-Show
            </button>
            <button onClick={() => setNoShowModal(null)}
              className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-300">
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
