// Clone guard: one license = one running server per network. A copied (cloned) server PC has
// the same Machine ID, so its license would pass every other check. Every server tells LAN
// discovery a short id of its license key; if another server on the network answers with the
// same id, the one that has been running for less time stops (license screen) and the one
// that was already running keeps working. Checked at start and every 2 minutes.
const crypto = require('crypto');
const { performance } = require('perf_hooks');
const { discoverServers } = require('../../electron/discovery');

const INSTANCE = crypto.randomBytes(8).toString('hex');   // this run of this server
const CHECK_EVERY_MS = 2 * 60 * 1000;

let duplicateOf = null;   // { ip, port } of the server that keeps the license
let timer = null;

const uptime = () => Math.round(performance.now());
const licenseIdOf = (key) => (key ? crypto.createHash('sha256').update(String(key).trim()).digest('hex').slice(0, 16) : null);

// Of two servers with the same license, the one that has run longer keeps it
const yieldsTo = (me, other) => other.up > me.up || (other.up === me.up && other.inst < me.inst);

async function check(licenseId, discover = discoverServers) {
  const id = licenseId();
  if (!id) { duplicateOf = null; return null; }
  const me = { up: uptime(), inst: INSTANCE };
  const found = await discover();
  const other = found.find(s => s.lic === id && s.inst && s.inst !== INSTANCE && Number.isFinite(s.up) && yieldsTo(me, s));
  duplicateOf = other ? { ip: other.ip, port: other.port } : null;
  return duplicateOf;
}

function start(licenseId, discover) {
  if (timer) return;
  check(licenseId, discover).catch(() => {});
  timer = setInterval(() => check(licenseId, discover).catch(() => {}), CHECK_EVERY_MS);
  timer.unref?.();
}

// What this server adds to its LAN discovery reply
const announce = (licenseId) => ({ lic: licenseId() || undefined, inst: INSTANCE, up: uptime() });

module.exports = { start, check, announce, licenseIdOf, duplicate: () => duplicateOf, INSTANCE, CHECK_EVERY_MS };
