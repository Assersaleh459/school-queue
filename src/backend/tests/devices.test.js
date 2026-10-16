// Staff device limit (license): in-memory SQLite, license limit stubbed.
jest.mock('../database/db', () => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE users (user_id INTEGER PRIMARY KEY, username TEXT, full_name TEXT);
           INSERT INTO users VALUES (1, 'reem', 'Reem Hassan'), (2, 'omar', 'Omar Adel');`);
  const { MIGRATIONS } = jest.requireActual('../database/migrations/runner');
  db.exec(MIGRATIONS.find(m => m.id === '007_add_devices').sql);
  return db;
});
let mockLimit = 2;
jest.mock('../license', () => ({ deviceLimit: () => mockLimit, machineId: () => 'f'.repeat(32) }));

const db = require('../database/db');
const devices = require('../devices');

const req = (headers = {}, ip = '192.168.1.20') => ({ ip, get: (h) => headers[h] });
const staffPC = (id, name = `PC ${id}`) => req({ 'X-SchoolQ-Device': `pc-${id}-000000`, 'X-SchoolQ-Device-Name': encodeURIComponent(name), 'X-SchoolQ-Device-Kind': 'staff' });
const login = (r, user = 1) => {
  const dev = devices.identify(r);
  const ok = devices.checkLogin(dev);
  if (ok.ok) devices.register(dev, user);
  return ok;
};

beforeEach(() => { db.exec('DELETE FROM devices'); mockLimit = 2; });

test('identifies Staff PCs, browsers, header-less clients and the server PC', () => {
  expect(devices.identify(staffPC('a', 'استقبال 1'))).toEqual({ id: 'pc-a-000000', name: 'استقبال 1', kind: 'staff' });
  expect(devices.identify(req({ 'X-SchoolQ-Device': 'b1b2b3b4-0000' })).kind).toBe('browser');
  const anon = devices.identify(req({ 'User-Agent': 'Mozilla' }));
  expect(anon).toMatchObject({ kind: 'browser', name: 'Browser · 192.168.1.20' });
  expect(anon.id).toMatch(/^anon-[0-9a-f]{16}$/);
  expect(devices.identify(req({ 'X-SchoolQ-Device': 'pc-x-000000' }, '::1')).kind).toBe('server');           // on the server PC
  expect(devices.identify(req({ 'X-SchoolQ-Device': 'f'.repeat(32) })).kind).toBe('server');                // Staff app on the server PC
});

test('refuses a new device once the limit is reached; devices already in use may log in again', () => {
  expect(login(staffPC('a'))).toEqual({ ok: true });
  expect(login(staffPC('b'))).toEqual({ ok: true });
  expect(login(staffPC('c'))).toMatchObject({ ok: false, error: expect.stringMatching(/Device limit reached \(2 of 2/) });
  expect(login(staffPC('a'), 2)).toEqual({ ok: true });         // another user on a PC already in use
  expect(devices.activeCount()).toBe(2);
});

test('the server PC is free', () => {
  login(staffPC('a')); login(staffPC('b'));
  expect(login(req({ 'X-SchoolQ-Device': 'pc-srv-000000' }, '127.0.0.1'))).toEqual({ ok: true });
  expect(devices.activeCount()).toBe(2);
});

test('freeing a slot signs that device out and lets another one in', () => {
  login(staffPC('a')); login(staffPC('b'));
  expect(devices.revoke('pc-a-000000')).toBe(true);
  expect(devices.isRevoked('pc-a-000000')).toBe(true);
  expect(login(staffPC('c'))).toEqual({ ok: true });
  expect(login(staffPC('a'))).toMatchObject({ ok: false });       // no slot left for it now
  expect(devices.list().map(d => d.device_id).sort()).toEqual(['pc-b-000000', 'pc-c-000000']);
});

test('a device unused for 15 minutes no longer holds a slot', () => {
  login(staffPC('a')); login(staffPC('b'));
  db.prepare("UPDATE devices SET last_seen = datetime('now', '-16 minutes') WHERE device_id = 'pc-a-000000'").run();
  expect(login(staffPC('c'))).toEqual({ ok: true });
  const list = devices.list();
  expect(list.find(d => d.device_id === 'pc-a-000000')).toMatchObject({ active: 0, last_user: 'Reem Hassan' });
});

test('no device limit in the license (or no license) = unlimited', () => {
  mockLimit = null;
  for (const id of ['a', 'b', 'c', 'd']) expect(login(staffPC(id))).toEqual({ ok: true });
});
