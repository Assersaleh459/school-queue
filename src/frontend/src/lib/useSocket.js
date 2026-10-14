import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

let socket;

function forceLogoutCleanup() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login';
}

export function useSocket(departmentId, onQueueUpdate, onSettingsUpdated) {
  useEffect(() => {
    socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      auth: { token: localStorage.getItem('token') }
    });

    socket.on('connect', () => {
      console.log('✓ Socket connected');
      if (departmentId) {
        socket.emit('join_department', departmentId);
      }
    });

    socket.on('queue_updated', () => {
      console.log('Queue updated');
      onQueueUpdate();
    });

    if (onSettingsUpdated) socket.on('settings_updated', onSettingsUpdated);

    socket.on('force_logout', forceLogoutCleanup);

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    return () => {
      socket.disconnect();
    };
  }, [departmentId, onQueueUpdate, onSettingsUpdated]);

  return socket;
}

// Public display socket (no auth). handlers: { <event>: fn } for
//   ticket_called, ticket_recalled   — announce a call
//   announcement_spoken              — admin pressed "Announce on display"
//   queue_updated                    — a ticket changed → refresh the board now
//   settings_updated, voice_updated, announcements_updated — reload that data now
// Handlers live in a ref, so the socket connects once and always calls the latest ones.
const MONITOR_EVENTS = ['ticket_called', 'ticket_recalled', 'announcement_spoken', 'queue_updated',
  'settings_updated', 'voice_updated', 'announcements_updated'];

export function useMonitorSocket(handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const sock = io(window.location.origin, {
      transports: ['websocket', 'polling']
      // no auth — public display screen
    });
    socket = sock;

    sock.on('connect', () => {
      console.log('✓ Monitor socket connected');
      sock.emit('join_monitor');
    });

    sock.on('connect_error', (err) => {
      console.error('Monitor socket connect_error:', err.message);
    });

    for (const ev of MONITOR_EVENTS) sock.on(ev, (data) => ref.current[ev]?.(data));

    return () => {
      sock.disconnect();
    };
  }, []);

  return socket;
}
