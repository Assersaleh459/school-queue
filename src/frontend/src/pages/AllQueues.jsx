import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { queueAPI, settingsAPI } from '../lib/api';
import useAuthStore from '../store/useAuthStore';
import { toast } from '../store/useToastStore';
import TicketReceipt from '../components/TicketReceipt';

const PRIORITY_BADGE = {
  urgent: 'bg-red-100 text-red-700 border border-red-200',
  elderly: 'bg-orange-100 text-orange-700 border border-orange-200',
  vip: 'bg-purple-100 text-purple-700 border border-purple-200',
  regular: ''
};

function waitMinutes(createdAt, now) {
  return Math.floor((now - new Date(createdAt + 'Z').getTime()) / 60000);
}

export default function AllQueues() {
  const [departments, setDepartments]     = useState([]);
  const [loading, setLoading]             = useState(true);
  const [now, setNow]                     = useState(Date.now());
  const [maxWait, setMaxWait]             = useState(null);
  const [ticketSettings, setTicketSettings] = useState({});
  const [schoolName, setSchoolName]       = useState('Al-Noor School');

  // Reprint
  const [reprintTicket, setReprintTicket] = useState(null);

  // Skip modal
  const [skipModal, setSkipModal]   = useState(null);
  const [skipReason, setSkipReason] = useState('');

  // Transfer modal
  const [transferModal, setTransferModal]   = useState(null);
  const [transferDept, setTransferDept]     = useState('');
  const [transferReason, setTransferReason] = useState('');

  // Cancel modal
  const [cancelModal, setCancelModal]   = useState(null);
  const [cancelReason, setCancelReason] = useState('');

  const [acting, setActing] = useState(false);

  const user     = useAuthStore(s => s.user);
  const logout   = useAuthStore(s => s.logout);
  const navigate = useNavigate();
  const socketRef = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      const res = await queueAPI.getAll();
      setDepartments(res.data);
    } catch { /* silently ignore refresh errors */ }
    finally { setLoading(false); }
  }, []);

  // Fetch settings once on mount
  useEffect(() => {
    settingsAPI.getPublic().then(res => {
      setTicketSettings(res.data);
      if (res.data.school_name) setSchoolName(res.data.school_name);
      if (res.data.max_wait_alert_minutes) setMaxWait(parseInt(res.data.max_wait_alert_minutes));
    }).catch(() => {});
  }, []);

  // Initial load + polling fallback
  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 8000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // Tick `now` every 30 s so wait times stay live without re-fetching
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Socket: instant updates from all dept rooms
  useEffect(() => {
    const socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      auth: { token: localStorage.getItem('token') }
    });
    socketRef.current = socket;
    socket.on('queue_updated', fetchAll);
    socket.on('settings_updated', () => {
      settingsAPI.getPublic().then(res => {
        setTicketSettings(res.data);
        if (res.data.school_name) setSchoolName(res.data.school_name);
        if (res.data.max_wait_alert_minutes) setMaxWait(parseInt(res.data.max_wait_alert_minutes));
      }).catch(() => {});
    });
    socket.on('force_logout', () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    });
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [fetchAll]);

  // Join all dept rooms once we have the list
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || departments.length === 0) return;
    const join = () => departments.forEach(d => socket.emit('join_department', d.department_id));
    if (socket.connected) join();
    else { socket.on('connect', join); return () => socket.off('connect', join); }
  }, [departments]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleSkip = async () => {
    if (!skipModal || !skipReason.trim()) return;
    setActing(true);
    try {
      await queueAPI.skip(skipModal.ticket_id, skipReason.trim());
      toast.success(`Ticket ${skipModal.ticket_number} skipped`);
      setSkipModal(null); setSkipReason('');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to skip ticket');
    } finally { setActing(false); }
  };

  const handleTransfer = async () => {
    if (!transferModal || !transferDept) return;
    setActing(true);
    try {
      await queueAPI.transfer(transferModal.ticket_id, parseInt(transferDept), transferReason.trim() || 'Transferred', user.user_id);
      toast.success(`Ticket ${transferModal.ticket_number} transferred`);
      setTransferModal(null); setTransferDept(''); setTransferReason('');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to transfer ticket');
    } finally { setActing(false); }
  };

  const handleCancel = async () => {
    if (!cancelModal || !cancelReason.trim()) return;
    setActing(true);
    try {
      await queueAPI.cancel(cancelModal.ticket_id, cancelReason.trim());
      toast.success(`Ticket ${cancelModal.ticket_number} cancelled`);
      setCancelModal(null); setCancelReason('');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to cancel ticket');
    } finally { setActing(false); }
  };

  const openSkip = (ticket) => { setSkipModal(ticket); setSkipReason(''); };
  const openTransfer = (ticket) => { setTransferModal(ticket); setTransferDept(''); setTransferReason(''); };
  const openCancel = (ticket) => { setCancelModal(ticket); setCancelReason(''); };

  const transferTargets = transferModal
    ? departments.filter(d => d.department_id !== transferModal.department_id)
    : [];

  const totalWaiting  = departments.reduce((s, d) => s + d.waiting.length, 0);
  const totalServing  = departments.filter(d => d.serving).length;
  const totalAlerting = departments.reduce((s, d) => {
    const check = (t) => maxWait && waitMinutes(t.created_at, now) > maxWait;
    return s + d.waiting.filter(check).length + (d.serving && check(d.serving) ? 1 : 0);
  }, 0);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-navy text-white py-4 px-8 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/home')} className="text-teal hover:text-white text-sm font-semibold">← Home</button>
          <div>
            <h1 className="text-2xl font-bold">All Queues</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {totalWaiting} waiting &bull; {totalServing} serving &bull; {departments.reduce((s, d) => s + d.served_today, 0)} served today
              {totalAlerting > 0 && (
                <span className="ml-2 text-red-400 font-bold">⚠ {totalAlerting} over {maxWait}min</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-300">{user?.full_name}</span>
          <button onClick={() => logout()} className="bg-red-600 px-4 py-2 rounded hover:bg-red-700 text-sm">Logout</button>
        </div>
      </header>

      <main className="p-6">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-xl shadow-sm p-5 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-1/2 mb-4" />
                <div className="h-16 bg-gray-100 rounded mb-3" />
                <div className="space-y-2">
                  {[1, 2].map(j => <div key={j} className="h-10 bg-gray-100 rounded" />)}
                </div>
              </div>
            ))}
          </div>
        ) : departments.length === 0 ? (
          <div className="text-center text-gray-400 py-20 text-lg">No active departments found.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {departments.map(dept => (
              <DeptCard
                key={dept.department_id}
                dept={dept}
                now={now}
                maxWait={maxWait}
                onSkip={openSkip}
                onTransfer={openTransfer}
                onCancel={openCancel}
                onReprint={setReprintTicket}
              />
            ))}
          </div>
        )}
      </main>

      {/* Skip Modal */}
      {skipModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-navy mb-1">Skip Ticket</h3>
            <p className="text-sm text-gray-500 mb-4">
              Ticket <span className="font-semibold text-navy">{skipModal.ticket_number}</span> — {skipModal.parent_name}
            </p>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Reason *</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy mb-4"
              placeholder="Enter skip reason"
              value={skipReason}
              onChange={e => setSkipReason(e.target.value)}
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={handleSkip} disabled={acting || !skipReason.trim()}
                className="flex-1 bg-orange-500 text-white py-2 rounded-lg font-semibold disabled:opacity-50 hover:bg-orange-600 text-sm">
                {acting ? 'Skipping…' : 'Skip Ticket'}
              </button>
              <button onClick={() => setSkipModal(null)}
                className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-200 text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {transferModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-navy mb-1">Transfer Ticket</h3>
            <p className="text-sm text-gray-500 mb-4">
              Ticket <span className="font-semibold text-navy">{transferModal.ticket_number}</span> — {transferModal.parent_name}
            </p>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Transfer to *</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy mb-3"
              value={transferDept} onChange={e => setTransferDept(e.target.value)}
            >
              <option value="">Select department</option>
              {transferTargets.map(d => (
                <option key={d.department_id} value={d.department_id}>{d.name}</option>
              ))}
            </select>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Reason</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy mb-4"
              placeholder="Reason (optional)"
              value={transferReason} onChange={e => setTransferReason(e.target.value)}
            />
            <div className="flex gap-3">
              <button onClick={handleTransfer} disabled={acting || !transferDept}
                className="flex-1 bg-teal text-white py-2 rounded-lg font-semibold disabled:opacity-50 hover:bg-opacity-90 text-sm">
                {acting ? 'Transferring…' : 'Transfer'}
              </button>
              <button onClick={() => setTransferModal(null)}
                className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-200 text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-navy mb-1">Cancel Ticket — Customer Left</h3>
            <p className="text-sm text-gray-500 mb-1">
              Ticket <span className="font-semibold text-navy">{cancelModal.ticket_number}</span> — {cancelModal.parent_name}
            </p>
            <p className="text-xs text-gray-400 mb-4">This permanently removes the ticket from the queue.</p>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Reason *</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy mb-4"
              placeholder="e.g. Parent left the premises"
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={handleCancel} disabled={acting || !cancelReason.trim()}
                className="flex-1 bg-gray-700 text-white py-2 rounded-lg font-semibold disabled:opacity-50 hover:bg-gray-800 text-sm">
                {acting ? 'Cancelling…' : 'Cancel Ticket'}
              </button>
              <button onClick={() => setCancelModal(null)}
                className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-200 text-sm">
                Keep in Queue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reprint overlay */}
      {reprintTicket && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 no-print">
          <TicketReceipt
            ticket={reprintTicket}
            schoolName={schoolName}
            ticketSettings={ticketSettings}
            closeLabel="Close"
            onClose={() => setReprintTicket(null)}
          />
        </div>
      )}
    </div>
  );
}

function WaitBadge({ createdAt, now, maxWait }) {
  const mins = waitMinutes(createdAt, now);
  const alert = maxWait && mins > maxWait;
  if (mins < 1) return <span className="text-xs text-gray-400">&lt;1 min</span>;
  return (
    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
      alert ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-gray-100 text-gray-500'
    }`}>
      {alert && '⚠ '}{mins} min
    </span>
  );
}

function DeptCard({ dept, now, maxWait, onSkip, onTransfer, onCancel, onReprint }) {
  const { serving, waiting, served_today } = dept;

  const isAlert = (t) => maxWait && waitMinutes(t.created_at, now) > maxWait;

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      {/* Department header */}
      <div className="bg-navy px-5 py-3 flex justify-between items-center">
        <div>
          <p className="text-white font-bold text-base">{dept.name}</p>
          <p className="text-teal text-xs">{dept.code}</p>
        </div>
        <div className="text-right">
          <p className="text-white text-xs">
            <span className="font-bold text-lg text-teal">{waiting.length}</span> waiting
          </p>
          <p className="text-gray-400 text-xs">{served_today} served today</p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Currently Serving */}
        {serving ? (
          <div className={`rounded-lg p-3 border ${isAlert(serving)
            ? 'bg-red-50 border-red-300'
            : 'bg-teal bg-opacity-10 border-teal border-opacity-30'}`}>
            <div className="flex items-center justify-between mb-1">
              <p className={`text-xs font-bold uppercase tracking-wide ${isAlert(serving) ? 'text-red-600' : 'text-teal'}`}>
                Now Serving
              </p>
              <WaitBadge createdAt={serving.created_at} now={now} maxWait={maxWait} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-2xl font-black text-navy">{serving.ticket_number}</p>
                <p className="text-xs text-gray-600 truncate">{serving.parent_name}</p>
                {serving.student_name && <p className="text-xs text-gray-400 truncate">{serving.student_name}</p>}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={() => onReprint(serving)}
                  className="px-3 py-1 bg-gray-100 text-gray-700 text-xs rounded font-semibold hover:bg-gray-200 text-center">
                  🖨 Print
                </button>
                <button onClick={() => onSkip(serving)}
                  className="px-3 py-1 bg-orange-500 text-white text-xs rounded font-semibold hover:bg-orange-600">
                  Skip
                </button>
                <button onClick={() => onTransfer(serving)}
                  className="px-3 py-1 bg-navy text-white text-xs rounded font-semibold hover:bg-opacity-80">
                  Transfer
                </button>
                <button onClick={() => onCancel(serving)}
                  className="px-3 py-1 bg-gray-600 text-white text-xs rounded font-semibold hover:bg-gray-700">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="border border-dashed border-gray-200 rounded-lg p-3 text-center text-xs text-gray-400">
            No ticket currently serving
          </div>
        )}

        {/* Waiting Queue */}
        {waiting.length > 0 ? (
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {waiting.map((ticket, idx) => {
              const alert = isAlert(ticket);
              return (
                <div key={ticket.ticket_id}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                    alert ? 'bg-red-50 border border-red-200' : 'bg-gray-50'
                  }`}>
                  <span className="text-xs font-bold text-gray-400 w-5 shrink-0">#{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-sm font-bold ${alert ? 'text-red-700' : 'text-navy'}`}>
                        {ticket.ticket_number}
                      </p>
                      <WaitBadge createdAt={ticket.created_at} now={now} maxWait={maxWait} />
                    </div>
                    <p className="text-xs text-gray-500 truncate">{ticket.parent_name}</p>
                  </div>
                  {ticket.priority !== 'regular' && (
                    <span className={`text-xs px-1.5 py-0.5 rounded capitalize shrink-0 ${PRIORITY_BADGE[ticket.priority]}`}>
                      {ticket.priority}
                    </span>
                  )}
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => onReprint(ticket)}
                      className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded font-semibold hover:bg-gray-200"
                      title="Reprint ticket">
                      🖨
                    </button>
                    <button onClick={() => onSkip(ticket)}
                      className={`px-2 py-1 text-xs rounded font-semibold ${
                        alert ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                      }`}>
                      Skip
                    </button>
                    <button onClick={() => onTransfer(ticket)}
                      className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded font-semibold hover:bg-gray-300">
                      Transfer
                    </button>
                    <button onClick={() => onCancel(ticket)}
                      className="px-2 py-1 bg-gray-600 text-white text-xs rounded font-semibold hover:bg-gray-700"
                      title="Customer left">
                      Cancel
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-gray-400 text-center py-2">Queue is empty</p>
        )}
      </div>
    </div>
  );
}
