// SELLER-ONLY tool. Mints a signed license key for one customer.
// Requires the private key in .keys/license-private.pem (never ship this file).
//
// Usage:
//   node tools/generate-license.js "Al-Noor International School"
//   node tools/generate-license.js "Some School" --expires 2027-01-01   (subscription)
//
// Give the printed KEY to the customer; they paste it into the activation screen.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PRIVATE_KEY_PATH = path.join(__dirname, '..', '.keys', 'license-private.pem');

function canonical(p) {
  return `v${p.v}|${p.type}|${p.school}|${p.issued}`;
}

const args = process.argv.slice(2);
const school = args.find(a => !a.startsWith('--'));
if (!school) {
  console.error('Usage: node tools/generate-license.js "School Name" [--expires YYYY-MM-DD]');
  process.exit(1);
}
const expiresIdx = args.indexOf('--expires');
const expires = expiresIdx !== -1 ? args[expiresIdx + 1] : null;

if (!fs.existsSync(PRIVATE_KEY_PATH)) {
  console.error(`Private key not found at ${PRIVATE_KEY_PATH}`);
  process.exit(1);
}
const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');

const payload = {
  v: 1,
  type: expires ? 'subscription' : 'perpetual',
  school,
  issued: new Date().toISOString().slice(0, 10),
};
if (expires) payload.expires = expires;

const sig = crypto.sign(null, Buffer.from(canonical(payload)), privateKey).toString('base64');
const key = Buffer.from(JSON.stringify({ ...payload, sig })).toString('base64');

console.log('\nLicense for:', school);
console.log('Type       :', payload.type + (expires ? ` (expires ${expires})` : ''));
console.log('\n--- LICENSE KEY (give this to the customer) ---\n');
console.log(key);
console.log('');
