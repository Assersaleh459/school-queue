import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { departmentAPI, queueAPI } from '../lib/api';
import useAuthStore from '../store/useAuthStore';
import { useSocket } from '../lib/useSocket';
import ConnectionStatus from '../components/ConnectionStatus';

export default function QueueDashboard() {
  const [queue, setQueue]               = useState([]);
  const [allDepts, setAllDepts]         = useState([]);
  const [currentTicket, setCurrentTicket] = useState(null);
  const [stats, setStats]               = useState({ waiting_count: 0, serving_count: 0, served_today: 0 });
  const [notes, setNotes]               = useState('');

  // Modals
  const [skipModal, setSkipModal]       = useState(false);
  const [skipReason, setSkipReason]     = useState('');
  const [transferModal, setTransferModal] = useState(false);
  const [transferDept, setTransferDept] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [noShowModal, setNoShowModal]   = useState(false);

  const user         = useAuthStore(state => state.user);
  const logout       = useAuthStore(state => state.logout);
  const navigate     = useNavigate();
  const departmentId = user?.department_id;

  const fetchQueue = useCallback(async () => {
    if (!departmentId) return;
    try {
      const [queueRes, statsRes] = await Promise.all([
        departmentAPI.getQueue(departmentId),
        departmentAPI.getStats(departmentId)
      ]);
      setQueue(queueRes.data);
      setStats(statsRes.data);
    } catch (err) {
      console.error('Failed to fetch queue:', err);
    }
  }, [departmentId]);

  useEffect(() => {
    if (!departmentId) return;
    fetchQueue();
    queueAPI.getCurrent(departmentId)
      .then(res => { if (res.data.ticket) setCurrentTicket(res.data.ticket); })
      .catch(() => {});
    departmentAPI.getAll()
      .then(res => setAllDepts(res.data.filter(d => d.department_id !== departmentId)))
      .catch(() => {});
  }, [departmentId, fetchQueue]);

  useSocket(departmentId, fetchQueue);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleCallNext = async () => {
    try {
      const res = await queueAPI.callNext(departmentId, user.user_id);
      setCurrentTicket(res.data.ticket);
      fetchQueue();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to call next ticket');
    }
  };

  const handleComplete = async () => {
    if (!currentTicket) return;
    try {
      await queueAPI.complete(currentTicket.ticket_id, notes);
      setCurrentTicket(null);
      setNotes('');
      fetchQueue();
    } catch {
      alert('Failed to complete ticket');
    }
  };

  const handleRecall = async () => {
    if (!currentTicket) return;
    try {
      const res = await queueAPI.recall(currentTicket.ticket_id);
      setCurrentTicket(res.data.ticket);
    } catch {
      alert('Failed to recall ticket');
    }
  };

  const confirmSkip = async () => {
    if (!skipReason.trim()) return;
    try {
      await queueAPI.skip(currentTicket.ticket_id, skipReason.trim());
      setCurrentTicket(null);
      setSkipModal(false);
      setSkipReason('');
      fetchQueue();
    } catch {
      alert('Failed to skip ticket');
    }
  };

  const confirmNoShow = async () => {
    try {
      await queueAPI.noShow(currentTicket.ticket_id);
      setCurrentTicket(null);
      setNoShowModal(false);
      fetchQueue();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to mark no-show');
    }
  };

  const confirmTransfer = async () => {
    if (!transferDept || !transferReason.trim()) return;
    try {
      await queueAPI.transfer(currentTicket.ticket_id, parseInt(transferDept), transferReason.trim(), user.user_id);
      setCurrentTicket(null);
      setTransferModal(false);
      setTransferDept('');
      setTransferReason('');
      fetchQueue();
    } catch {
      alert('Failed to transfer ticket');
    }
  };

  const calculateWaitTime = (createdAt) => {
    const minutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
    return `${minutes} min`;
  };

  if (!departmentId) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow text-center">
          <p className="text-xl text-gray-600 mb-4">No department assigned to your account.</p>
          <p className="text-gray-500">Contact your administrator to assign you to a department.</p>
          <button onClick={() => logout()} className="mt-6 bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700">Logout</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-navy text-white py-4 px-8 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/home')} className="text-teal hover:text-white text-sm font-semibold">← Home</button>
          <h1 className="text-2xl font-bold">Queue Dashboard</h1>
        </div>
        <div className="flex items-center gap-4">
          <ConnectionStatus />
          <span className="text-sm text-gray-300">{user?.full_name}</span>
          <button onClick={() => logout()} className="bg-red-600 px-4 py-2 rounded hover:bg-red-700 text-sm">Logout</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-8">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-gray-600 text-sm">Waiting</p>
            <p className="text-4xl font-bold text-blue-600">{stats.waiting_count}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-gray-600 text-sm">Serving Now</p>
            <p className="text-4xl font-bold text-green-600">{stats.serving_count}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-gray-600 text-sm">Served Today</p>
            <p className="text-4xl font-bold text-teal">{stats.served_today}</p>
          </div>
        </div>

        {/* Active Service Panel */}
        {currentTicket ? (
          <div className="bg-white border-4 border-green-500 rounded-lg p-6 mb-8">
            <h2 className="text-2xl font-bold mb-2">CURRENTLY SERVING: {currentTicket.ticket_number}</h2>
            <p className="text-lg mb-1">Parent: <strong>{currentTicket.parent_name}</strong> | Student: <strong>{currentTicket.student_name}</strong></p>
            <p className="text-base text-gray-500 mb-4">Service: {currentTicket.category_name || 'General'}</p>

            <div className="flex flex-wrap gap-2 mb-4">
              <button onClick={handleComplete}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold">
                COMPLETE
              </button>
              <button onClick={() => { setTransferDept(''); setTransferReason(''); setTransferModal(true); }}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold">
                TRANSFER
              </button>
              <button onClick={handleRecall}
                className="px-6 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-semibold">
                RECALL ({currentTicket.call_count}×)
              </button>
              <button onClick={() => { setSkipReason(''); setSkipModal(true); }}
                className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-semibold">
                SKIP
              </button>
              <button
                onClick={() => setNoShowModal(true)}
                disabled={currentTicket.call_count < 3}
                title={currentTicket.call_count < 3 ? `Must call 3× before no-show (called ${currentTicket.call_count}×)` : 'Mark as no-show'}
                className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                NO-SHOW {currentTicket.call_count < 3 && `(${currentTicket.call_count}/3)`}
              </button>
            </div>

            <div>
              <label className="block text-gray-700 font-semibold mb-2">Service Notes:</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg"
                rows="2"
                placeholder="Add service notes..."
              />
            </div>
          </div>
        ) : (
          <div className="bg-gray-200 border-2 border-dashed border-gray-400 rounded-lg p-6 mb-8 text-center">
            <p className="text-gray-600 text-lg">No ticket being served</p>
          </div>
        )}

        {/* Call Next */}
        <div className="mb-8">
          <button
            onClick={handleCallNext}
            disabled={queue.length === 0 || !!currentTicket}
            title={currentTicket ? 'Complete or skip the current ticket first' : ''}
            className="w-full bg-teal text-white py-6 rounded-lg hover:bg-opacity-90 font-bold text-2xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            CALL NEXT PARENT ({queue.length} waiting)
          </button>
        </div>

        {/* Waiting Queue Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="bg-navy text-white py-3 px-6">
            <h2 className="text-xl font-bold">Waiting Queue</h2>
          </div>
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left">Ticket #</th>
                <th className="px-4 py-3 text-left">Parent</th>
                <th className="px-4 py-3 text-left">Student</th>
                <th className="px-4 py-3 text-left">Service</th>
                <th className="px-4 py-3 text-left">Wait Time</th>
                <th className="px-4 py-3 text-left">Priority</th>
              </tr>
            </thead>
            <tbody>
              {queue.length === 0 ? (
                <tr><td colSpan="6" className="px-4 py-8 text-center text-gray-500">No waiting tickets</td></tr>
              ) : queue.map(ticket => (
                <tr key={ticket.ticket_id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold">{ticket.ticket_number}</td>
                  <td className="px-4 py-3">{ticket.parent_name}</td>
                  <td className="px-4 py-3">{ticket.student_name}</td>
                  <td className="px-4 py-3">{ticket.category_name || '-'}</td>
                  <td className="px-4 py-3">{calculateWaitTime(ticket.created_at)}</td>
                  <td className="px-4 py-3">
                    {ticket.priority !== 'regular' && (
                      <span className="text-xs font-bold uppercase px-2 py-1 rounded bg-yellow-100 text-yellow-800">
                        {ticket.priority}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* ── Skip Modal ── */}
      {skipModal && (
        <Modal title="Skip Ticket" onClose={() => setSkipModal(false)}>
          <p className="text-gray-600 mb-4">
            Ticket <strong>{currentTicket?.ticket_number}</strong> will be moved to the end of the queue.
          </p>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Reason for skipping *</label>
          <input
            autoFocus
            type="text"
            value={skipReason}
            onChange={e => setSkipReason(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && confirmSkip()}
            placeholder="e.g. Parent not present"
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 mb-4"
          />
          <div className="flex gap-3">
            <button onClick={confirmSkip} disabled={!skipReason.trim()}
              className="flex-1 bg-orange-600 text-white py-2 rounded-lg font-semibold hover:bg-orange-700 disabled:opacity-40">
              Skip Ticket
            </button>
            <button onClick={() => setSkipModal(false)}
              className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-300">
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ── Transfer Modal ── */}
      {transferModal && (
        <Modal title="Transfer Ticket" onClose={() => setTransferModal(false)}>
          <p className="text-gray-600 mb-4">
            Transfer <strong>{currentTicket?.ticket_number}</strong> to another department.
          </p>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Transfer to *</label>
          <select
            autoFocus
            value={transferDept}
            onChange={e => setTransferDept(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 mb-3"
          >
            <option value="">Select department…</option>
            {allDepts.map(d => (
              <option key={d.department_id} value={d.department_id}>{d.name}</option>
            ))}
          </select>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Reason *</label>
          <input
            type="text"
            value={transferReason}
            onChange={e => setTransferReason(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && confirmTransfer()}
            placeholder="e.g. Wrong department"
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 mb-4"
          />
          <div className="flex gap-3">
            <button onClick={confirmTransfer} disabled={!transferDept || !transferReason.trim()}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-40">
              Transfer
            </button>
            <button onClick={() => setTransferModal(false)}
              className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-300">
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ── No-Show Modal ── */}
      {noShowModal && (
        <Modal title="Mark as No-Show" onClose={() => setNoShowModal(false)}>
          <p className="text-gray-600 mb-6">
            Mark ticket <strong>{currentTicket?.ticket_number}</strong> as no-show?
            This ticket has been called <strong>{currentTicket?.call_count} times</strong>.
          </p>
          <div className="flex gap-3">
            <button onClick={confirmNoShow}
              className="flex-1 bg-red-600 text-white py-2 rounded-lg font-semibold hover:bg-red-700">
              Yes, Mark No-Show
            </button>
            <button onClick={() => setNoShowModal(false)}
              className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-300">
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

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
