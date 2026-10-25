// License keys (v1 + v2), expiry states and activation — with a throwaway test keypair,
// never the real signing key.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { verifyKey, mintKey, licenseState, activate, checkActivated, canonical } = require('../../../electron/license');

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const PRIV = privateKey.export({ type: 'pkcs8', format: 'pem' });
const PUB = publicKey.export({ type: 'spki', format: 'pem' });
const MACHINE = 'a'.repeat(32);
const DAY = 86400000;
const ymd = (offsetDays) => { const d = new Date(Date.now() + offsetDays * DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const v2 = (extra = {}) => ({ v: 2, id: 'ABCD1234', type: 'perpetual', school: 'Al-Noor International School', issued: '2026-10-16', devices: 5, machine: MACHINE, ...extra });
const tamper = (key, change) => {
  const obj = JSON.parse(Buffer.from(key, 'base64').toString('utf8'));
  change(obj);
  return Buffer.from(JSON.stringify(obj)).toString('base64');
};

test('a v2 key verifies, with every field signed', () => {
  const key = mintKey(v2({ type: 'subscription', expires: '2027-06-30' }), PRIV);
  expect(verifyKey(key, PUB)).toMatchObject({ valid: true, payload: { devices: 5, machine: MACHINE, expires: '2027-06-30' } });
  // the 1.11 hole: removing "expires" turned a subscription into a perpetual license
  expect(verifyKey(tamper(key, o => { delete o.expires; }), PUB).valid).toBe(false);
  expect(verifyKey(tamper(key, o => { o.expires = '2099-01-01'; }), PUB).valid).toBe(false);
  expect(verifyKey(tamper(key, o => { o.devices = 50; }), PUB).valid).toBe(false);
  expect(verifyKey(tamper(key, o => { delete o.devices; }), PUB).valid).toBe(false);
  expect(verifyKey(tamper(key, o => { o.machine = 'b'.repeat(32); }), PUB).valid).toBe(false);
  expect(verifyKey(tamper(key, o => { o.school = 'Other School'; }), PUB).valid).toBe(false);
});

test('keys signed with another private key are refused', () => {
  const other = crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
  expect(verifyKey(mintKey(v2(), other), PUB)).toEqual({ valid: false, reason: 'Invalid license signature' });
  expect(verifyKey('not a key', PUB).valid).toBe(false);
  expect(verifyKey(mintKey(v2({ devices: 0 }), PRIV), PUB).reason).toBe('Malformed license key');
});

test('v1 keys from earlier versions still work (perpetual, unlimited devices)', () => {
  const p = { v: 1, type: 'perpetual', school: 'Farabi Language School', issued: '2026-10-12' };
  expect(canonical(p)).toBe('v1|perpetual|Farabi Language School|2026-10-12');
  const key = mintKey(p, PRIV);
  expect(verifyKey(key, PUB).valid).toBe(true);
  expect(licenseState(verifyKey(key, PUB).payload)).toMatchObject({ status: 'ok', devices: null, machineLocked: false, version: 1 });
});

test('expiry: ok → warning (30 d) → critical (7 d) → expired the next day (no grace by default)', () => {
  const at = (days) => licenseState(v2({ type: 'subscription', expires: ymd(days) }));
  expect(at(35)).toMatchObject({ status: 'ok', daysLeft: 35 });
  expect(at(30)).toMatchObject({ status: 'warning', daysLeft: 30 });
  expect(at(8)).toMatchObject({ status: 'warning' });
  expect(at(7)).toMatchObject({ status: 'critical', daysLeft: 7 });
  expect(at(0)).toMatchObject({ status: 'critical', daysLeft: 0 });     // last day
  expect(at(-1)).toMatchObject({ status: 'expired', grace: 0, graceUntil: null });
  expect(licenseState(v2())).toMatchObject({ status: 'ok', daysLeft: null, expires: null, devices: 5, machineLocked: true });
});

test('grace days come from the signed key', () => {
  const at = (days, grace) => licenseState(v2({ type: 'subscription', expires: ymd(days), grace }));
  expect(at(-3, 5)).toMatchObject({ status: 'grace', grace: 5, graceUntil: ymd(2) });
  expect(at(-5, 5)).toMatchObject({ status: 'grace' });                 // last grace day
  expect(at(-6, 5)).toMatchObject({ status: 'expired' });
  expect(at(-1, 0)).toMatchObject({ status: 'expired' });
  // v1 keys and keys without grace get none
  expect(licenseState({ v: 1, type: 'subscription', school: 'X', issued: '2026-01-01', expires: ymd(-1) }).status).toBe('expired');
  // grace is signed and range-checked
  const key = mintKey(v2({ type: 'subscription', expires: ymd(30), grace: 3 }), PRIV);
  expect(verifyKey(key, PUB).valid).toBe(true);
  expect(verifyKey(tamper(key, o => { o.grace = 30; }), PUB).valid).toBe(false);
  expect(verifyKey(tamper(key, o => { delete o.grace; }), PUB).valid).toBe(false);
  expect(verifyKey(mintKey(v2({ grace: 61 }), PRIV), PUB).reason).toBe('Malformed license key');
  expect(verifyKey(mintKey(v2({ grace: 1.5 }), PRIV), PUB).reason).toBe('Malformed license key');
});

describe('activation', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lic-')); });
  const opts = { publicKey: PUB, machine: MACHINE };

  test('activates on the PC it was made for, and only there', () => {
    const key = mintKey(v2(), PRIV);
    expect(activate(dir, key, { publicKey: PUB, machine: 'c'.repeat(32) })).toMatchObject({ valid: false, reason: expect.stringMatching(/another PC/) });
    expect(activate(dir, key, opts)).toMatchObject({ valid: true });
    expect(checkActivated(dir, opts)).toMatchObject({ ok: true, school: 'Al-Noor International School', state: { devices: 5 } });
    expect(checkActivated(dir, { publicKey: PUB, machine: 'c'.repeat(32) }).ok).toBe(false);   // license.json copied to another PC
  });

  test('a renewal replaces the license; an expired key is refused; grace from the key still runs', () => {
    activate(dir, mintKey(v2({ type: 'subscription', expires: ymd(5) }), PRIV), opts);
    expect(checkActivated(dir, opts).state.status).toBe('critical');
    expect(activate(dir, mintKey(v2({ type: 'subscription', expires: ymd(-10) }), PRIV), opts)).toMatchObject({ valid: false, reason: /expired/ });
    activate(dir, mintKey(v2({ type: 'subscription', expires: ymd(365), devices: 8 }), PRIV), opts);
    expect(checkActivated(dir, opts)).toMatchObject({ ok: true, state: { status: 'ok', devices: 8 } });
    expect(activate(dir, mintKey(v2({ type: 'subscription', expires: ymd(-2) }), PRIV), opts)).toMatchObject({ valid: false, reason: /expired/ });
    activate(dir, mintKey(v2({ type: 'subscription', expires: ymd(-2), grace: 7 }), PRIV), opts);
    expect(checkActivated(dir, opts)).toMatchObject({ ok: true, state: { status: 'grace' } });
  });

  test('past the grace period the server stops (activation screen)', () => {
    const record = { key: mintKey(v2({ type: 'subscription', expires: ymd(-9) }), PRIV), machineId: MACHINE };
    fs.writeFileSync(path.join(dir, 'license.json'), JSON.stringify(record));
    expect(checkActivated(dir, opts)).toMatchObject({ ok: false, reason: /expired/, state: { status: 'expired' } });
  });
});

test('voice password: only a hash goes in the key, it is signed, and it checks the password', () => {
  const { hashVoicePass, checkVoicePass } = require('../../../electron/license');
  const hash = hashVoicePass('Vyra#2026');
  expect(hash).not.toContain('Vyra');
  expect(checkVoicePass(hash, 'Vyra#2026')).toBe(true);
  expect(checkVoicePass(hash, 'vyra#2026')).toBe(false);
  expect(checkVoicePass(null, '')).toBe(false);
  const key = mintKey(v2({ voicePass: hash }), PRIV);
  expect(licenseState(verifyKey(key, PUB).payload).voiceLocked).toBe(true);
  expect(verifyKey(tamper(key, o => { delete o.voicePass; }), PUB).valid).toBe(false);            // can't unlock by removing it
  expect(verifyKey(tamper(key, o => { o.voicePass = hashVoicePass('mine'); }), PUB).valid).toBe(false);
  expect(verifyKey(mintKey(v2({ voicePass: 'plain text' }), PRIV), PUB).reason).toBe('Malformed license key');
  // Fresh Start password: same protection, separate field
  const wipe = hashVoicePass('Fresh#Start9');
  const key2 = mintKey(v2({ voicePass: hash, wipePass: wipe }), PRIV);
  expect(verifyKey(key2, PUB).valid).toBe(true);
  expect(verifyKey(tamper(key2, o => { delete o.wipePass; }), PUB).valid).toBe(false);               // can't switch it off by removing it
  expect(verifyKey(tamper(key2, o => { o.wipePass = hashVoicePass('mine'); }), PUB).valid).toBe(false);
  expect(verifyKey(mintKey(v2({ wipePass: 'plain text' }), PRIV), PUB).reason).toBe('Malformed license key');
});
