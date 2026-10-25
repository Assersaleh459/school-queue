// One shared, public socket that only watches whether the server is reachable.
// - ServerStatusBanner shows "can't reach the server" from it.
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
  sock.on('connect', () => setOnline(true));
  sock.on('disconnect', () => setOnline(false));
  sock.on('connect_error', () => setOnline(false));
}

export function isServerOnline() { return online; }

export function onServerStatus(fn) {
  statusSubs.add(fn);
  return () => statusSubs.delete(fn);
}

export function onReconnect(fn) {
  reconnectSubs.add(fn);
  return () => reconnectSubs.delete(fn);
}
