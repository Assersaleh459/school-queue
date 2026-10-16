// The server's license, as the backend sees it: Staff device limit, expiry state, renewal.
// license.json lives in the app's data folder next to the database (written by the Electron
// activation screen or by a renewal from Admin → License). No license.json = development or
// test install: no limits.
const path = require('path');
const fs = require('fs');
const license = require('../../electron/license');

const dataDir = () => path.dirname(process.env.DB_PATH || path.join(__dirname, '../../database/queue.db'));
const file = () => path.join(dataDir(), 'license.json');

const CACHE_MS = 60 * 60 * 1000;   // re-read + re-verify at least hourly (expiry is recomputed on every call)
let cache = null;                  // { at, result }

function load() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.result;
  const result = fs.existsSync(file()) ? license.checkActivated(dataDir()) : null;
  cache = { at: Date.now(), result };
  return result;
}

// null when unlicensed (dev); else { blocked, reason, state, payload } — state is fresh for this
// moment; payload (the signed key contents) stays on the server
function current() {
  const r = load();
  if (!r) return null;
  if (!r.ok && !r.state) return { blocked: true, reason: r.reason, state: null, payload: null };
  const state = r.payload ? license.licenseState(r.payload) : r.state;
  return {
    blocked: state.status === 'expired',
    reason: state.status === 'expired' ? `License expired on ${state.expires}` : null,
    state,
    payload: r.payload || null,
  };
}

// Max Staff devices connected at once; null = unlimited
const deviceLimit = () => current()?.state?.devices ?? null;

function renew(key) {
  const r = license.activate(dataDir(), key);
  cache = null;
  return r;
}

module.exports = { current, deviceLimit, renew, machineId: license.machineId, reset: () => { cache = null; } };
