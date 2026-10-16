// SELLER-ONLY tool. Mints a signed license key for one customer.
// Requires the private key in .keys/license-private.pem (never ship this file).
// (The License Generator app — npm run dist:generator — does the same with a form and history.)
//
// Usage:
//   node tools/generate-license.js "Al-Noor International School" --machine <MachineID> --devices 5
//   node tools/generate-license.js "Some School" --machine <MachineID> --devices 3 --expires 2027-01-01
//
//   --machine   the Machine ID shown on the school's activation screen (locks the key to that PC)
//   --devices   how many Staff PCs / browser logins may be connected at once (omit = unlimited)
//   --expires   subscription end date (omit = perpetual)
//   --voice-pass  password that unlocks the Voice Recordings page (omit = page open)
//
// Give the printed KEY to the customer; they paste it into the activation screen
// (or Admin → License → Renew for a renewal / upgrade).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { mintKey, verifyKey, matchesPublicKey, hashVoicePass } = require('../electron/license');

const PRIVATE_KEY_PATH = path.join(__dirname, '..', '.keys', 'license-private.pem');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : null; };
const school = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!school) {
  console.error('Usage: node tools/generate-license.js "School Name" [--machine ID] [--devices N] [--expires YYYY-MM-DD]');
  process.exit(1);
}
const expires = opt('--expires');
const devices = opt('--devices');
const machine = opt('--machine');
const voicePass = opt('--voice-pass');

if (!fs.existsSync(PRIVATE_KEY_PATH)) {
  console.error(`Private key not found at ${PRIVATE_KEY_PATH}`);
  process.exit(1);
}
const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
if (!matchesPublicKey(privateKey)) {
  console.error('This private key does not match the public key built into SchoolQ (electron/license.js).');
  process.exit(1);
}

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const payload = {
  v: 2,
  id: crypto.randomBytes(4).toString('hex').toUpperCase(),
  type: expires ? 'subscription' : 'perpetual',
  school,
  issued: today(),
  ...(expires && { expires }),
  ...(devices && { devices: Number(devices) }),
  ...(machine && { machine: machine.trim().toLowerCase() }),
  ...(voicePass && { voicePass: hashVoicePass(voicePass) }),
};

const key = mintKey(payload, privateKey);
const check = verifyKey(key);
if (!check.valid) {
  console.error('Could not make a valid key:', check.reason);
  process.exit(1);
}

console.log('\nLicense for:', school, ` (No. ${payload.id})`);
console.log('Type       :', payload.type + (expires ? ` (expires ${expires})` : ''));
console.log('Devices    :', payload.devices || 'unlimited');
console.log('Locked to  :', payload.machine || 'any PC (no Machine ID given)');
console.log('Voice page :', voicePass ? 'locked with the password you gave' : 'open');
console.log('\n--- LICENSE KEY (give this to the customer) ---\n');
console.log(key);
console.log('');
