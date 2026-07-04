import { useEffect } from 'react';
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

export function useMonitorSocket(onTicketCalled, onTicketRecalled) {
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

    sock.on('ticket_called', (data) => {
      if (onTicketCalled) onTicketCalled(data);
    });

    sock.on('ticket_recalled', (data) => {
      if (onTicketRecalled) onTicketRecalled(data);
    });

    return () => {
      sock.disconnect();
    };
  }, [onTicketCalled, onTicketRecalled]);

  return socket;
}
