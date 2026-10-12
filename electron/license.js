// Offline license verification (Ed25519). The app ships only the PUBLIC key and
// verifies signed license keys locally — no license server, works fully offline.
// License keys are minted by the seller with tools/generate-license.js using the
// matching PRIVATE key (kept in .keys/, never shipped).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAlZqWiHMoaXiwxSVyM04Q6QaoQspvnQUr6uSGpszqkGk=
-----END PUBLIC KEY-----`;

// Canonical message that gets signed — must match tools/generate-license.js exactly.
function canonical(p) {
  return `v${p.v}|${p.type}|${p.school}|${p.issued}`;
}

// Verify a license key string. Returns { valid, payload } or { valid:false, reason }.
function verifyKey(keyString) {
  try {
    const json = Buffer.from(String(keyString).trim(), 'base64').toString('utf8');
    const obj  = JSON.parse(json);
    const { sig, ...payload } = obj;
    if (!sig || !payload.school || !payload.issued || !payload.type) {
      return { valid: false, reason: 'Malformed license key' };
    }
    const ok = crypto.verify(null, Buffer.from(canonical(payload)), PUBLIC_KEY, Buffer.from(sig, 'base64'));
    if (!ok) return { valid: false, reason: 'Invalid license signature' };
    if (payload.expires && Date.now() > Date.parse(payload.expires)) {
      return { valid: false, reason: 'License expired' };
    }
    return { valid: true, payload };
  } catch {
    return { valid: false, reason: 'Unreadable license key' };
  }
}

// Stable per-machine id (Windows MachineGuid), hashed. Falls back to hostname.
function machineId() {
  let raw = '';
  try {
    const out = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', { windowsHide: true }).toString();
    const m = out.match(/MachineGuid\s+REG_SZ\s+([\w-]+)/i);
    if (m) raw = m[1];
  } catch {}
  if (!raw) raw = os.hostname() + '|' + (os.networkInterfaces()['Ethernet']?.[0]?.mac || '');
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

function licenseFile(userDataDir) {
  return path.join(userDataDir, 'license.json');
}

// Activate: verify the key and bind it to this machine.
function activate(userDataDir, keyString) {
  const result = verifyKey(keyString);
  if (!result.valid) return result;
  const record = {
    key: String(keyString).trim(),
    school: result.payload.school,
    type: result.payload.type,
    machineId: machineId(),
    activatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(licenseFile(userDataDir), JSON.stringify(record, null, 2), 'utf8');
  return { valid: true, payload: result.payload };
}

// Check current activation state: valid signature + machine still matches.
function checkActivated(userDataDir) {
  try {
    const record = JSON.parse(fs.readFileSync(licenseFile(userDataDir), 'utf8'));
    const result = verifyKey(record.key);
    if (!result.valid) return { ok: false, reason: result.reason };
    if (record.machineId !== machineId()) {
      return { ok: false, reason: 'License is activated on a different machine' };
    }
    return { ok: true, school: record.school, type: record.type };
  } catch {
    return { ok: false, reason: 'Not activated' };
  }
}

module.exports = { verifyKey, machineId, activate, checkActivated };
