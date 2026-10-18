// Trusted clock: turning the PC date back must not extend a license. Fake clocks and in-memory
// stores only: the real PC clock and registry are never touched.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createTrustedClock, seal, unseal } = require('../../../electron/trustedClock');
const { mintKey, activate, checkActivated } = require('../../../electron/license');

const SECRET = Buffer.from('test-secret');
const DAY = 86400000;
const T0 = Date.parse('2027-03-01T10:00:00Z');

const memStore = () => { let v = null; return { read: () => v, write: (t) => { v = t; }, peek: () => v, set: (t) => { v = t; } }; };
function env() {
  const e = { wall: T0, mono: 0, stores: [memStore(), memStore()] };
  e.make = (extra = {}) => createTrustedClock({ secret: SECRET, wallNow: () => e.wall, monoNow: () => e.mono, stores: [...e.stores], ...extra });
  return e;
}

test('setting the PC date back does not move SchoolQ time back', () => {
  const e = env();
  const c = e.make();
  expect(c.now()).toBe(T0);
  e.wall = T0 - 30 * DAY;               // clock set back a month
  expect(c.now()).toBe(T0);
  expect(c.isSetBack()).toBe(true);
  e.wall = T0 + 5 * 60000;              // fixed again
  expect(c.now()).toBe(T0 + 5 * 60000);
  expect(c.isSetBack()).toBe(false);
});

test('a small difference (under a day) is not "set back"', () => {
  const e = env();
  const c = e.make();
  e.wall = T0 - 3 * 3600000;
  expect(c.isSetBack()).toBe(false);
});

test('the timer: real running time moves SchoolQ time on even with the PC clock frozen back', () => {
  const e = env();
  const c = e.make();
  e.wall = T0 - 10 * DAY;
  e.mono += 2 * 3600000;                // 2 hours of real running time
  expect(c.now()).toBe(T0 + 2 * 3600000);
});

test('saved time survives a restart, even with the PC clock set back first', () => {
  const e = env();
  const c = e.make();
  e.mono += DAY;
  c.save();
  e.wall = T0 - 60 * DAY;               // set back, then restart SchoolQ
  e.mono = 0;
  expect(e.make().now()).toBe(T0 + DAY);
});

test('deleting one copy does not help: the other copy is used', () => {
  const e = env();
  const c = e.make();
  e.mono += DAY;
  c.save();
  e.stores[0].set(null);                // file deleted
  e.wall = T0 - 60 * DAY;
  e.mono = 0;
  expect(e.make().now()).toBe(T0 + DAY);
});

test('an edited copy is rejected (sealed)', () => {
  const e = env();
  const c = e.make();
  c.save();
  const obj = JSON.parse(Buffer.from(e.stores[0].peek(), 'base64').toString());
  obj.body = obj.body.replace(/"t":\d+/, '"t":1');
  e.stores[0].set(Buffer.from(JSON.stringify(obj)).toString('base64'));
  expect(unseal(e.stores[0].peek(), SECRET)).toBeNull();
  expect(unseal(seal({ t: 5, issued: '', mark: 0 }, Buffer.from('other-pc')), SECRET)).toBeNull();
  e.wall = T0 - 60 * DAY;
  e.mono = 0;
  expect(e.make().now()).toBe(T0);      // the untouched copy still counts
});

test('never earlier than the license issue day', () => {
  const e = env();
  e.wall = Date.parse('2020-01-01T00:00:00Z');
  const c = e.make();
  expect(c.nowFor({ issued: '2027-02-01' })).toBe(new Date('2027-02-01T00:00:00').getTime());
});

test('a newer key resets a clock that was once set far into the future; old keys do not', () => {
  const e = env();
  const c = e.make();
  c.acceptKey({ issued: '2027-01-01' });
  e.wall = Date.parse('2031-01-01T00:00:00Z');   // set to 2031 by mistake
  c.save();
  e.wall = T0;                                   // fixed again — but SchoolQ remembers 2031
  expect(c.now()).toBeGreaterThan(Date.parse('2030-12-31T00:00:00Z'));
  expect(c.acceptKey({ issued: '2027-01-01' })).toBe(false);    // re-pasting the same key: no reset
  expect(c.acceptKey({ issued: '2026-12-01' })).toBe(false);    // an older key: no reset
  expect(c.nowForNewKey({ issued: '2027-02-28' })).toBe(T0);
  expect(c.acceptKey({ issued: '2027-02-28' })).toBe(true);     // a new key from the seller
  expect(c.now()).toBe(T0);
  // copies from before the reset (older key) are ignored after a restart
  e.stores[1].set(seal({ t: Date.parse('2031-01-01T00:00:00Z'), issued: '2027-01-01', mark: 0 }, SECRET));
  e.mono = 0;
  expect(e.make().now()).toBe(T0);
});

describe('database copy and ticket evidence', () => {
  const dbStore = () => memStore();
  const tickets = (rows) => ({
    maxTicketId: () => rows.reduce((m, r) => Math.max(m, r.id), 0),
    newestTicketAfter: (id) => rows.filter(r => r.id > id).reduce((m, r) => Math.max(m, r.t), 0),
  });

  test('the newest ticket counts: wiping the file and registry copies does not help', () => {
    const e = env();
    e.wall = T0 - 90 * DAY;                     // all copies wiped and the clock set back
    const c = e.make();
    c.addStore(dbStore(), tickets([{ id: 1, t: T0 - DAY }, { id: 2, t: T0 }]));
    expect(c.now()).toBe(T0);
  });

  test('the database copy alone restores the time', () => {
    const e = env();
    const db = dbStore();
    db.set(seal({ t: T0 + 3 * DAY, issued: '2027-01-01', mark: 0 }, SECRET));
    e.wall = T0 - 90 * DAY;
    const c = e.make();
    c.addStore(db, tickets([]));
    expect(c.now()).toBe(T0 + 3 * DAY);
  });

  test('after a reset by a new key, tickets made before it stop counting', () => {
    const e = env();
    const c = e.make();
    c.acceptKey({ issued: '2027-01-01' });
    const future = Date.parse('2031-01-01T00:00:00Z');
    const rows = [{ id: 1, t: T0 - DAY }, { id: 2, t: future }];    // a ticket made while the date was 2031
    c.raise(future);
    c.acceptKey({ issued: '2027-02-28' });                          // the fix key
    expect(c.state().mark).toBeNull();                              // marked at the next backend start
    c.addStore(dbStore(), tickets(rows));
    expect(c.state().mark).toBe(2);
    expect(c.now()).toBe(T0);
    rows.push({ id: 3, t: T0 + DAY });                              // new tickets count again
    e.mono = 0;
    const again = e.make();
    again.addStore(dbStore(), tickets(rows));
    expect(again.now()).toBe(T0 + DAY);
  });

  test('wiping everything and re-pasting the same key: all tickets still count', () => {
    const e = env();
    e.wall = T0 - 90 * DAY;
    const c = e.make();
    c.acceptKey({ issued: '2027-01-01' });
    expect(c.state().mark).toBe(0);
    c.addStore(dbStore(), tickets([{ id: 7, t: T0 }]));
    expect(c.now()).toBe(T0);
  });
});

describe('with the license', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const PRIV = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const PUB = publicKey.export({ type: 'spki', format: 'pem' });
  const MACHINE = 'a'.repeat(32);
  const key = (extra) => mintKey({ v: 2, id: 'T1', type: 'subscription', school: 'Test', issued: '2027-01-01', machine: MACHINE, ...extra }, PRIV);
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clk-')); });

  test('an expired license stays expired when the PC date is set back', () => {
    const e = env();
    const c = e.make();
    expect(activate(dir, key({ expires: '2027-03-31' }), { publicKey: PUB, machine: MACHINE, clock: c })).toMatchObject({ valid: true });
    e.mono += 40 * DAY;                                   // runs past the expiry date
    e.wall = T0 + 40 * DAY;
    expect(checkActivated(dir, { publicKey: PUB, machine: MACHINE, clock: c })).toMatchObject({ ok: false, reason: /expired/ });
    e.wall = Date.parse('2027-03-15T10:00:00Z');          // date set back before the expiry
    expect(checkActivated(dir, { publicKey: PUB, machine: MACHINE, clock: c })).toMatchObject({ ok: false, reason: /expired/ });
    expect(c.isSetBack()).toBe(true);
  });

  test('grace days from the key also run on SchoolQ time', () => {
    const e = env();
    const c = e.make();
    activate(dir, key({ expires: '2027-03-31', grace: 3 }), { publicKey: PUB, machine: MACHINE, clock: c });
    e.wall = Date.parse('2027-04-02T10:00:00Z');
    expect(checkActivated(dir, { publicKey: PUB, machine: MACHINE, clock: c })).toMatchObject({ ok: true, state: { status: 'grace' } });
    e.wall = Date.parse('2027-04-04T10:00:00Z');
    expect(checkActivated(dir, { publicKey: PUB, machine: MACHINE, clock: c }).ok).toBe(false);
  });
});
