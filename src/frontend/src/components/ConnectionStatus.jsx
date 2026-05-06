import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

export default function ConnectionStatus() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(window.location.origin);

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    return () => socket.disconnect();
  }, []);

  return (
    <div className={`flex items-center gap-2 px-3 py-1 rounded ${connected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
      <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-600 animate-pulse' : 'bg-red-600'}`} />
      <span className="text-sm font-semibold">{connected ? 'Connected' : 'Disconnected'}</span>
    </div>
  );
}
