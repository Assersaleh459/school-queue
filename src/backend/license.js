// The server's license, as the backend sees it: Staff device limit, expiry state, renewal.
// license.json lives in the app's data folder next to the database (written by the Electron
// activation screen or by a renewal from Admin → License). No license.json = development or
// test install: no limits.
// Expiry is judged on the trusted clock (electron/trustedClock.js), never on the PC clock alone.
const path = require('path');
const fs = require('fs');
const { performance } = require('perf_hooks');
const license = require('../../electron/license');
const { clockFor } = require('../../electron/trustedClock');
const guard = require('./licenseGuard');

const dataDir = () => path.dirname(process.env.DB_PATH || path.join(__dirname, '../../database/queue.db'));
const file = () => path.join(dataDir(), 'license.json');

const CACHE_MS = 60 * 60 * 1000;   // re-read + re-verify at least hourly (expiry is recomputed on every call)
let cache = null;                  // { at (monotonic), result }
let clock = null;
let setBackLogged = false;

// The trusted clock, with the database copy and the ticket evidence added on first use
function getClock() {
  if (clock) return clock;
  clock = clockFor(dataDir(), license.machineId());
  try {
    const db = require('./database/db');
    clock.addStore({
      read: () => db.prepare("SELECT value FROM app_state WHERE key = 'license_clock'").get()?.value || null,
      write: (text) => db.prepare("INSERT INTO app_state (key, value) VALUES ('license_clock', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(text),
    }, {
      maxTicketId: () => db.prepare('SELECT COALESCE(MAX(ticket_id), 0) AS id FROM tickets').get().id,
      newestTicketAfter: (id) => {
        const t = db.prepare('SELECT MAX(created_at) AS t FROM tickets WHERE ticket_id > ?').get(id)?.t;
        return t ? Date.parse(`${String(t).replace(' ', 'T')}Z`) || 0 : 0;   // SQLite UTC, no "Z"
      },
    });
  } catch (err) {
    console.error('[LICENSE] Trusted clock database copy unavailable:', err.message);
  }
  return clock;
}

function load() {
  if (cache && performance.now() - cache.at < CACHE_MS) return cache.result;
  const result = fs.existsSync(file()) ? license.checkActivated(dataDir(), { clock: getClock() }) : null;
  cache = { at: performance.now(), result };
  return result;
}

// The PC date is more than a day behind SchoolQ's own: { pcTime, schoolqTime } (ISO), else null.
// Logged once per run in the Audit Log.
function clockSetBack() {
  if (!clock?.isSetBack()) return null;
  const info = { pcTime: new Date().toISOString(), schoolqTime: new Date(clock.now()).toISOString() };
  if (!setBackLogged) {
    setBackLogged = true;
    try { require('./audit').log(null, 'CLOCK_SET_BACK', 'system', null, info); } catch {}
  }
  return info;
}

// Short id of the installed key, for the clone guard (null when unlicensed)
function licenseId() {
  try { return guard.licenseIdOf(JSON.parse(fs.readFileSync(file(), 'utf8')).key); } catch { return null; }
}

// null when unlicensed (dev); else { blocked, reason, duplicate, state, payload, clockSetBack } —
// state is fresh for this moment; payload (the signed key contents) stays on the server
function current() {
  const r = load();
  if (!r) return null;
  const setBack = clockSetBack();
  if (!r.ok && !r.state) return { blocked: true, reason: r.reason, duplicate: false, state: null, payload: null, clockSetBack: setBack };
  const state = r.payload ? license.licenseState(r.payload, getClock().nowFor(r.payload)) : r.state;
  const dup = guard.duplicate();
  const expired = state.status === 'expired';
  return {
    blocked: expired || !!dup,
    reason: expired ? `License expired on ${state.expires}`
      : dup ? `This license is already in use by another SchoolQ Server on this network (${dup.ip})` : null,
    duplicate: !expired && !!dup,
    state,
    payload: r.payload || null,
    clockSetBack: setBack,
  };
}

// Max Staff devices connected at once; null = unlimited
const deviceLimit = () => current()?.state?.devices ?? null;

function renew(key) {
  const r = license.activate(dataDir(), key, { clock: getClock() });
  cache = null;
  if (r.valid) guard.check(licenseId).catch(() => {});   // a new key may end a clone block at once
  return r;
}

module.exports = { current, deviceLimit, renew, licenseId, machineId: license.machineId, reset: () => { cache = null; } };
