// Staff devices: each PC (Staff app) or browser that logs in. The license limits how many
// may be connected at once. Free: the server PC itself, and the display / kiosk screens
// (they never log in).
const crypto = require('crypto');
const db = require('./database/db');
const lic = require('./license');

const ACTIVE_MINUTES = 15;          // seen within this long (or connected) = using a slot
const TOUCH_EVERY_MS = 60 * 1000;
const lastTouch = new Map();

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const ID = /^[A-Za-z0-9-]{8,64}$/;

// { id, name, kind: 'server'|'staff'|'browser' } for this request
function identify(req) {
  const ip = req.ip || req.socket?.remoteAddress || '';
  let id = String(req.get('X-SchoolQ-Device') || '');
  let name = '';
  try { name = decodeURIComponent(String(req.get('X-SchoolQ-Device-Name') || '')).slice(0, 60); } catch {}
  let kind = req.get('X-SchoolQ-Device-Kind') === 'staff' ? 'staff' : 'browser';
  if (!ID.test(id)) {
    // no device header (old client / script): one device per address + browser
    id = 'anon-' + crypto.createHash('sha1').update(`${ip}|${req.get('User-Agent') || ''}`).digest('hex').slice(0, 16);
    name = `Browser · ${ip.replace('::ffff:', '')}`;
    kind = 'browser';
  }
  if (LOOPBACK.has(ip) || id === lic.machineId()) kind = 'server';
  return { id, name: name || (kind === 'server' ? 'Server PC' : `Device ${id.slice(0, 6)}`), kind };
}

// SQL condition: the device is using a slot (t = table alias prefix)
const ACTIVE = (t = '') => `${t}revoked = 0 AND ${t}kind != 'server' AND ${t}last_seen >= datetime('now', '-${ACTIVE_MINUTES} minutes')`;

const isActive = (id) => !!db.prepare(`SELECT 1 FROM devices WHERE device_id = ? AND ${ACTIVE()}`).get(id);
const activeCount = () => db.prepare(`SELECT COUNT(*) AS n FROM devices WHERE ${ACTIVE()}`).get()?.n || 0;

// May this device log in now? A device already using a slot always may.
function checkLogin(dev) {
  const limit = lic.deviceLimit();
  if (!limit || dev.kind === 'server' || isActive(dev.id)) return { ok: true };
  const used = activeCount();
  if (used < limit) return { ok: true };
  return {
    ok: false,
    error: `Device limit reached (${used} of ${limit} in use). Ask your admin to free a device in Admin → License.`,
  };
}

function register(dev, userId) {
  db.prepare(`INSERT INTO devices (device_id, name, kind, last_user_id, first_seen, last_seen, revoked)
              VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), 0)
              ON CONFLICT(device_id) DO UPDATE SET name = excluded.name, kind = excluded.kind,
                last_user_id = excluded.last_user_id, last_seen = excluded.last_seen, revoked = 0`)
    .run(dev.id, dev.name, dev.kind, userId);
  lastTouch.set(dev.id, Date.now());
}

// Keeps a device counted as in use (throttled to once a minute)
function touch(id) {
  if (!id || Date.now() - (lastTouch.get(id) || 0) < TOUCH_EVERY_MS) return;
  lastTouch.set(id, Date.now());
  db.prepare("UPDATE devices SET last_seen = datetime('now') WHERE device_id = ? AND revoked = 0").run(id);
}

const isRevoked = (id) => !!db.prepare('SELECT 1 FROM devices WHERE device_id = ? AND revoked = 1').get(id);

function list() {
  return db.prepare(`
    SELECT d.device_id, d.name, d.kind, d.first_seen, d.last_seen, d.revoked,
           u.full_name AS last_user, u.username AS last_username,
           CASE WHEN ${ACTIVE('d.')} THEN 1 ELSE 0 END AS active
    FROM devices d LEFT JOIN users u ON u.user_id = d.last_user_id
    WHERE d.revoked = 0
    ORDER BY active DESC, d.last_seen DESC`).all();
}

// Frees the device's slot; its session ends (see auth middleware / socket kick)
function revoke(id) {
  lastTouch.delete(id);
  return db.prepare('UPDATE devices SET revoked = 1 WHERE device_id = ? AND revoked = 0').run(id).changes > 0;
}

module.exports = { identify, checkLogin, register, touch, isRevoked, list, revoke, activeCount, ACTIVE_MINUTES };
