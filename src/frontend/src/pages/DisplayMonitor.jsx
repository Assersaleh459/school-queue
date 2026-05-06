import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { queueAPI } from '../lib/api';

export default function DisplayMonitor() {
  const [displayData, setDisplayData] = useState({
    now_calling: [],
    queue_counts: [],
    announcements: [],
    school_name: 'Al-Noor School'
  });
  const [time, setTime] = useState(new Date());
  const [flashTicket, setFlashTicket] = useState(null);
  const socketRef = useRef(null);
  const announcementRef = useRef(0);
  const [announcementIndex, setAnnouncementIndex] = useState(0);

  useEffect(() => {
    fetchDisplayData();

    socketRef.current = io(window.location.origin);
    socketRef.current.emit('join_monitor');

    socketRef.current.on('ticket_called', (data) => {
      setFlashTicket(data);
      setTimeout(() => setFlashTicket(null), 5000);
      fetchDisplayData();
    });

    socketRef.current.on('ticket_recalled', (data) => {
      setFlashTicket({ ...data, recalled: true });
      setTimeout(() => setFlashTicket(null), 5000);
      fetchDisplayData();
    });

    socketRef.current.on('queue_updated', () => {
      fetchDisplayData();
    });

    const clockInterval = setInterval(() => setTime(new Date()), 1000);
    const refreshInterval = setInterval(fetchDisplayData, 30000);

    return () => {
      socketRef.current?.disconnect();
      clearInterval(clockInterval);
      clearInterval(refreshInterval);
    };
  }, []);

  useEffect(() => {
    if (displayData.announcements.length <= 1) return;
    const interval = setInterval(() => {
      setAnnouncementIndex(i => (i + 1) % displayData.announcements.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [displayData.announcements.length]);

  const fetchDisplayData = async () => {
    try {
      const res = await queueAPI.getDisplayData();
      setDisplayData(res.data);
    } catch {
      // silently retry on next interval
    }
  };

  const announcement = displayData.announcements[announcementIndex]?.message_text || '';

  return (
    <div className="min-h-screen bg-navy text-white flex flex-col select-none" style={{ fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <header className="flex justify-between items-center px-12 py-6 border-b border-white border-opacity-20">
        <div>
          <h1 className="text-4xl font-bold tracking-wide">{displayData.school_name}</h1>
          <p className="text-teal text-lg mt-1">Queue Management System</p>
        </div>
        <div className="text-right">
          <p className="text-5xl font-mono font-bold">
            {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
          <p className="text-teal text-lg mt-1">
            {time.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* NOW CALLING — left panel */}
        <div className="flex-1 flex flex-col p-8">
          <h2 className="text-2xl font-bold text-teal mb-6 uppercase tracking-widest">Now Calling</h2>

          {/* Flash animation for newly called ticket */}
          {flashTicket && (
            <div className="mb-6 rounded-2xl p-6 text-center animate-pulse"
              style={{ backgroundColor: 'rgba(95,174,182,0.3)', border: '3px solid #5FAEB6' }}>
              <p className="text-lg text-teal uppercase tracking-wider mb-1">
                {flashTicket.recalled ? '🔔 Re-calling' : '📢 Now Calling'}
              </p>
              <p className="text-8xl font-black tracking-wider">{flashTicket.ticket_number}</p>
              <p className="text-2xl text-teal mt-2">{flashTicket.department_name}</p>
              <p className="text-xl text-gray-300">{flashTicket.counter}</p>
            </div>
          )}

          {/* Current serving list */}
          <div className="flex-1 overflow-auto space-y-3">
            {displayData.now_calling.length === 0 ? (
              <div className="flex items-center justify-center h-48 rounded-2xl border-2 border-dashed border-white border-opacity-20">
                <p className="text-gray-400 text-xl">Waiting for next call...</p>
              </div>
            ) : (
              displayData.now_calling.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl px-8 py-5"
                  style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                >
                  <div>
                    <p className="text-5xl font-black tracking-wide">{item.ticket_number}</p>
                    <p className="text-teal text-lg mt-1">{item.department_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-semibold text-gray-300">{item.counter}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Queue Counts — right panel */}
        <div className="w-80 border-l border-white border-opacity-20 p-8 flex flex-col">
          <h2 className="text-2xl font-bold text-teal mb-6 uppercase tracking-widest">Queue</h2>

          <div className="space-y-4 flex-1">
            {displayData.queue_counts.map((dept, i) => (
              <div
                key={i}
                className="rounded-xl p-5 flex justify-between items-center"
                style={{ backgroundColor: dept.color_code + '33', borderLeft: `4px solid ${dept.color_code}` }}
              >
                <div>
                  <p className="font-bold text-lg">{dept.name}</p>
                  <p className="text-gray-400 text-sm">{dept.code}</p>
                </div>
                <div className="text-right">
                  <p className="text-4xl font-black">{dept.waiting}</p>
                  <p className="text-gray-400 text-xs">waiting</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Announcement ticker */}
      {announcement && (
        <footer className="bg-teal text-navy px-12 py-4 text-center">
          <p className="text-xl font-semibold">{announcement}</p>
        </footer>
      )}
    </div>
  );
}
