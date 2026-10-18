// Fresh Start: real SQLite file with the real schema + migrations (run under Electron, like devices.test.js).
const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');
const { runMigrations } = require('../database/migrations/runner');
const { seedFresh } = require('../database/seed');
const { wipeAll } = require('../wipe');

let dir, db;

function school() {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wipe-'));
  db = new Database(path.join(dir, 'queue.db'));
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8'));
  seedFresh(db, { adminId: 1 });
  const log = console.log; console.log = () => {};
  try { runMigrations(db); } finally { console.log = log; }
  db.prepare("UPDATE settings SET setting_value = 'Farabi' WHERE setting_key = 'school_name'").run();
  db.prepare("INSERT INTO settings (setting_key, setting_value) VALUES ('voice_speaker', 'Esraa')").run();
  db.prepare("INSERT INTO users (username, password_hash, full_name, role) VALUES ('sara', 'x', 'Sara', 'staff')").run();
  db.prepare("INSERT INTO departments (name, code) VALUES ('Accounting', 'ACC')").run();
  db.prepare("INSERT INTO service_categories (department_id, name) VALUES (1, 'Fees')").run();
  db.prepare("INSERT INTO tickets (ticket_number, department_id, category_id, parent_name, served_by_user_id) VALUES ('ACC-1', 1, 1, 'Ali', 2)").run();
  db.prepare("INSERT INTO transfers (original_ticket_id, new_ticket_id, from_dept_id, to_dept_id) VALUES (1, 1, 1, 1)").run();
  db.prepare("INSERT INTO announcements (message_text) VALUES ('Hello')").run();
  db.prepare("INSERT INTO audit_logs (user_id, action) VALUES (1, 'LOGIN')").run();
  db.prepare("INSERT INTO devices (device_id) VALUES ('dev-12345678')").run();
  db.prepare("INSERT INTO app_state (key, value) VALUES ('license_clock', 'sealed')").run();
  const voiceDir = path.join(dir, 'voice');
  fs.mkdirSync(path.join(voiceDir, 'Esraa'), { recursive: true });
  fs.writeFileSync(path.join(voiceDir, 'Esraa', 'manifest.json'), '{}');
  return voiceDir;
}

afterEach(() => { db?.close(); });

const count = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;

test('puts the school back to a new install, with a backup first', async () => {
  const voiceDir = school();
  const engine = { clear: jest.fn() };
  const r = await wipeAll({ db, voiceDir, engine, by: 'admin' });

  expect(engine.clear).toHaveBeenCalled();
  const users = db.prepare('SELECT * FROM users').all();
  expect(users).toHaveLength(1);
  expect(users[0]).toMatchObject({ username: 'admin', role: 'super_admin', is_active: 1 });
  expect(users[0].user_id).toBe(r.adminId);
  expect(r.adminId).toBeGreaterThan(2);                       // new id → old login tokens fail
  expect(bcrypt.compareSync('admin123', users[0].password_hash)).toBe(true);

  for (const t of ['departments', 'service_categories', 'tickets', 'transfers', 'announcements', 'devices']) expect(count(t)).toBe(0);
  expect(db.prepare("SELECT setting_value FROM settings WHERE setting_key = 'school_name'").get().setting_value).toBe('My School');
  expect(db.prepare("SELECT 1 FROM settings WHERE setting_key = 'voice_speaker'").get()).toBeUndefined();
  expect(db.prepare('SELECT action, user_id FROM audit_logs').all()).toEqual([{ action: 'DATA_WIPED', user_id: null }]);
  expect(db.prepare("SELECT value FROM app_state WHERE key = 'license_clock'").get().value).toBe('sealed');
  expect(count('migrations')).toBeGreaterThan(0);

  // Numbering starts again for the new school
  db.prepare("INSERT INTO departments (name, code) VALUES ('Admissions', 'ADM')").run();
  expect(db.prepare('SELECT department_id FROM departments').get().department_id).toBe(1);

  // Backups: the old DB still has its data; the voice folder was moved, not deleted
  const old = new Database(r.backup, { readonly: true });
  expect(old.prepare('SELECT COUNT(*) AS n FROM tickets').get().n).toBe(1);
  old.close();
  expect(path.dirname(r.backup)).toBe(path.join(dir, 'backups', 'before-wipe'));
  expect(fs.existsSync(voiceDir)).toBe(false);
  expect(fs.existsSync(path.join(r.voiceBackup, 'Esraa', 'manifest.json'))).toBe(true);
});

test('works when there are no voice recordings', async () => {
  school();
  fs.rmSync(path.join(dir, 'voice'), { recursive: true });
  const r = await wipeAll({ db, voiceDir: path.join(dir, 'voice') });
  expect(r.voiceBackup).toBeNull();
  expect(count('users')).toBe(1);
});
