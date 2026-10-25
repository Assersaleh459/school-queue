// Offline license verification (Ed25519). The app ships only the PUBLIC key and
// verifies signed license keys locally — no license server, works fully offline.
// License keys are minted by the seller (License Generator / tools/generate-license.js)
// with the matching PRIVATE key, which is never shipped.
//
// Key = base64(JSON({ ...payload, sig })).
//   v1 (≤1.11): { v:1, type, school, issued, expires? }   — signature covers v|type|school|issued only
//   v2:         { v:2, id, type, school, issued, expires?, grace?, devices?, machine?, voicePass?, wipePass? }
//               — signature covers every field. grace = days it keeps working after expires
//                 (omitted = 0: stops the day after expires); devices omitted = unlimited Staff devices;
//                 machine = the server PC's Machine ID the key is locked to;
//                 voicePass = scrypt hash of the Vyra password that opens Voice Recordings;
//                 wipePass  = scrypt hash of a DIFFERENT Vyra password that opens Fresh Start (omitted = off).
// Used by the Electron main process (activation gate), the backend (device limit, License
// tab) and the License Generator.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAz4ghMS505i//hZvy9iW4TJt7jXWsEun/hP2mfRioqcU=
-----END PUBLIC KEY-----`;

const DAY = 24 * 60 * 60 * 1000;
const WARN_DAYS = 30;       // amber from here
const CRITICAL_DAYS = 7;    // red from here
const MAX_GRACE_DAYS = 60;  // grace (days after expiry) is set per key in the License Generator

// The exact bytes that get signed
function canonical(p) {
  if (p.v === 1) return `v${p.v}|${p.type}|${p.school}|${p.issued}`;
  const sorted = {};
  for (const k of Object.keys(p).sort()) if (k !== 'sig' && p[k] !== undefined) sorted[k] = p[k];
  return JSON.stringify(sorted);
}

// Seller side: payload → key string. privateKey is a PEM string (never stored by this module).
function mintKey(payload, privateKey) {
  const sig = crypto.sign(null, Buffer.from(canonical(payload)), privateKey).toString('base64');
  return Buffer.from(JSON.stringify({ ...payload, sig })).toString('base64');
}

// True when a private key PEM belongs to the public key built into SchoolQ
function matchesPublicKey(privateKey) {
  try {
    const pub = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString().trim();
    return pub === PUBLIC_KEY.trim();
  } catch {
    return false;
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MACHINE = /^[0-9a-f]{32}$/;
const VOICE_PASS = /^s1\$[A-Za-z0-9+/=]{24}\$[A-Za-z0-9+/=]{44}$/;

// Voice Recordings password, stored in the key only as a salted scrypt hash: "s1$<salt>$<hash>"
function hashVoicePass(password) {
  const salt = crypto.randomBytes(16);
  return `s1$${salt.toString('base64')}$${crypto.scryptSync(String(password), salt, 32).toString('base64')}`;
}

function checkVoicePass(hash, password) {
  const [, salt, want] = String(hash || '').split('$');
  if (!salt || !want) return false;
  const got = crypto.scryptSync(String(password), Buffer.from(salt, 'base64'), 32);
  const expected = Buffer.from(want, 'base64');
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

// Verify a license key string. Returns { valid, payload } or { valid:false, reason }.
// Expiry is not judged here — see licenseState(). (publicKey: tests only — they use their own pair.)
function verifyKey(keyString, publicKey = PUBLIC_KEY) {
  try {
    const json = Buffer.from(String(keyString).trim(), 'base64').toString('utf8');
    const { sig, ...payload } = JSON.parse(json);
    if (!sig || !payload.school || !payload.issued || !payload.type || ![1, 2].includes(payload.v)) {
      return { valid: false, reason: 'Malformed license key' };
    }
    if (payload.v === 2 && ((payload.expires && !DATE.test(payload.expires))
        || (payload.grace !== undefined && !(Number.isInteger(payload.grace) && payload.grace >= 0 && payload.grace <= MAX_GRACE_DAYS))
        || (payload.devices !== undefined && !(Number.isInteger(payload.devices) && payload.devices > 0))
        || (payload.machine !== undefined && !MACHINE.test(payload.machine))
        || (payload.voicePass !== undefined && !VOICE_PASS.test(payload.voicePass))
        || (payload.wipePass !== undefined && !VOICE_PASS.test(payload.wipePass)))) {
      return { valid: false, reason: 'Malformed license key' };
    }
    const ok = crypto.verify(null, Buffer.from(canonical(payload)), publicKey, Buffer.from(sig, 'base64'));
    if (!ok) return { valid: false, reason: 'Invalid license signature' };
    return { valid: true, payload };
  } catch {
    return { valid: false, reason: 'Unreadable license key' };
  }
}

const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Where a license stands today:
//   ok (no expiry, or > 30 days left) · warning (≤ 30) · critical (≤ 7) ·
//   grace (expired, within the key's grace days — still works) · expired (stops)
function licenseState(payload, now) {
  if (now == null) now = Date.now();
  const base = {
    id: payload.id || null,
    school: payload.school,
    type: payload.type,
    issued: payload.issued,
    expires: payload.expires || null,
    grace: payload.v === 2 && payload.grace ? payload.grace : 0,
    devices: payload.v === 2 && payload.devices ? payload.devices : null,   // null = unlimited
    machineLocked: !!payload.machine,
    voiceLocked: !!payload.voicePass,
    wipeEnabled: !!payload.wipePass,
    version: payload.v,
  };
  if (!payload.expires) return { ...base, status: 'ok', daysLeft: null, graceUntil: null };
  const endOfDay = new Date(`${payload.expires}T23:59:59.999`).getTime();
  const graceUntil = base.grace ? addDays(payload.expires, base.grace) : null;
  const daysLeft = Math.ceil((endOfDay - now) / DAY) - 1;    // 0 = expires today
  let status;
  if (now <= endOfDay) status = daysLeft <= CRITICAL_DAYS ? 'critical' : daysLeft <= WARN_DAYS ? 'warning' : 'ok';
  else status = graceUntil && now <= new Date(`${graceUntil}T23:59:59.999`).getTime() ? 'grace' : 'expired';
  return { ...base, status, daysLeft, graceUntil };
}

// Stable per-machine id (Windows MachineGuid), hashed. Falls back to hostname.
let cachedMachineId = null;
function machineId() {
  if (cachedMachineId) return cachedMachineId;
  let raw = '';
  try {
    const out = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', { windowsHide: true }).toString();
    const m = out.match(/MachineGuid\s+REG_SZ\s+([\w-]+)/i);
    if (m) raw = m[1];
  } catch {}
  if (!raw) raw = os.hostname() + '|' + (os.networkInterfaces()['Ethernet']?.[0]?.mac || '');
  cachedMachineId = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
  return cachedMachineId;
}

function licenseFile(userDataDir) {
  return path.join(userDataDir, 'license.json');
}

// Activate (or renew / upgrade): verify the key, check it is for this PC and not past its
// grace period, then store it — replacing any earlier license.
// opts.clock: the trusted clock (electron/trustedClock.js) — judges expiry and is reset by a
// newer key. Without it: opts.now or the PC clock. (opts.publicKey / opts.machine: tests only)
function activate(userDataDir, keyString, opts = {}) {
  const thisMachine = opts.machine || machineId();
  const result = verifyKey(keyString, opts.publicKey);
  if (!result.valid) return result;
  const { payload } = result;
  if (payload.machine && payload.machine !== thisMachine) {
    return { valid: false, reason: 'This license is for another PC — check the Machine ID you sent' };
  }
  const state = licenseState(payload, opts.clock ? opts.clock.nowForNewKey(payload) : opts.now);
  if (state.status === 'expired') return { valid: false, reason: `License expired on ${payload.expires}` };
  const record = {
    key: String(keyString).trim(),
    school: payload.school,
    type: payload.type,
    machineId: thisMachine,
    activatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(licenseFile(userDataDir), JSON.stringify(record, null, 2), 'utf8');
  opts.clock?.acceptKey(payload);
  return { valid: true, payload, state };
}

// Current license of this PC: valid signature, same machine, not past its grace period.
// { ok, school, type, state } or { ok:false, reason, state? }
function checkActivated(userDataDir, opts = {}) {
  const thisMachine = opts.machine || machineId();
  let record;
  try {
    record = JSON.parse(fs.readFileSync(licenseFile(userDataDir), 'utf8'));
  } catch {
    return { ok: false, reason: 'Not activated' };
  }
  const result = verifyKey(record.key, opts.publicKey);
  if (!result.valid) return { ok: false, reason: result.reason };
  if (record.machineId !== thisMachine || (result.payload.machine && result.payload.machine !== thisMachine)) {
    return { ok: false, reason: 'License is activated on a different machine' };
  }
  const state = licenseState(result.payload, opts.clock ? opts.clock.nowFor(result.payload) : opts.now);
  if (state.status === 'expired') return { ok: false, reason: `License expired on ${state.expires}`, state };
  return { ok: true, school: record.school, type: record.type, payload: result.payload, state };
}

module.exports = {
  hashVoicePass, checkVoicePass,
  verifyKey, machineId, activate, checkActivated, licenseState, mintKey, canonical, matchesPublicKey,
  PUBLIC_KEY, WARN_DAYS, CRITICAL_DAYS, MAX_GRACE_DAYS,
};
