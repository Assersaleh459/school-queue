// One shared, public socket that watches whether the server is reachable and hears its broadcasts.
// - ServerStatusBanner shows "can't reach the server" from it.
// - Pages call onServerEvent(...) / useLiveRefresh to reload when something changes elsewhere.
// - Pages call onReconnect(fn) to reload their data when the server comes back
//   (their own sockets rejoin the department rooms by themselves, but nothing
//   tells them what changed while the server was away).
import { io } from 'socket.io-client';

let sock = null;
let online = true;      // optimistic until the first failure, so a normal start shows nothing
let wasOffline = false;
const statusSubs = new Set();
const reconnectSubs = new Set();

function setOnline(value) {
  if (value === online) return;
  online = value;
  statusSubs.forEach(fn => fn(online));
  if (!online) wasOffline = true;
  else if (wasOffline) {
    wasOffline = false;
    reconnectSubs.forEach(fn => { try { fn(); } catch { /* one page's error must not stop the others */ } });
  }
}

export function startServerLink() {
  if (sock) return;
  sock = io(window.location.origin, { transports: ['websocket', 'polling'] });
  // join_monitor: the room every queue change is sent to, so pages can follow queue_updated
  sock.on('connect', () => { sock.emit('join_monitor'); setOnline(true); });
  sock.on('disconnect', () => setOnline(false));
  sock.on('connect_error', () => setOnline(false));
}

export function isServerOnline() { return online; }

export function onServerStatus(fn) {
  statusSubs.add(fn);
  return () => statusSubs.delete(fn);
}

// Server-wide broadcasts (voice_updated, announcements_updated, settings_updated, ...) on the
// shared socket, so a page can reload its data the moment it changes elsewhere.
export function onServerEvent(event, fn) {
  startServerLink();
  sock.on(event, fn);
  return () => sock.off(event, fn);
}

export function onReconnect(fn) {
  reconnectSubs.add(fn);
  return () => reconnectSubs.delete(fn);
}
