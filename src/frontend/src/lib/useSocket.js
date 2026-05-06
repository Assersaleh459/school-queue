import { useEffect } from 'react';
import { io } from 'socket.io-client';

let socket;

export function useSocket(departmentId, onQueueUpdate) {
  useEffect(() => {
    socket = io(window.location.origin, {
      transports: ['websocket', 'polling']
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

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    return () => {
      socket.disconnect();
    };
  }, [departmentId, onQueueUpdate]);

  return socket;
}

export function useMonitorSocket(onTicketCalled, onTicketRecalled) {
  useEffect(() => {
    socket = io(window.location.origin, {
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      console.log('✓ Monitor socket connected');
      socket.emit('join_monitor');
    });

    socket.on('ticket_called', (data) => {
      console.log('Ticket called:', data);
      if (onTicketCalled) onTicketCalled(data);
    });

    socket.on('ticket_recalled', (data) => {
      console.log('Ticket recalled:', data);
      if (onTicketRecalled) onTicketRecalled(data);
    });

    return () => {
      socket.disconnect();
    };
  }, [onTicketCalled, onTicketRecalled]);

  return socket;
}
