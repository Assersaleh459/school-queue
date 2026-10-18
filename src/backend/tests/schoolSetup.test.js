// School setup carried with exported voices: collect at one school, add at another.
// Real in-memory SQLite with the real schema + migrations (run under Electron, like devices.test.js).
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { runMigrations } = require('../database/migrations/runner');
const { collect, summarize, apply } = require('../schoolSetup');

const ALL = { callWording: true, voices: true, departments: true, announcements: true };

function freshDb() {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8'));
  const log = console.log; console.log = () => {};
  try { runMigrations(db); } finally { console.log = log; }
  return db;
}

function sourceSchool() {
  const db = freshDb();
  const set = db.prepare('INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)');
  set.run('call_template_en', 'Attention please. Ticket Number {ticket}, {department}.');
  set.run('call_template_ar', 'تنبيه من فضلك. التذكرة رقم {ticket}، {department}.');
  set.run('voice_speaker', 'Esraa');
  set.run('voice_announce', 'Esraa');
  set.run('school_name', 'Farabi');              // not part of the setup
  db.prepare("INSERT INTO departments (name, name_ar, code, color_code, display_order, is_active, room_number) VALUES ('Accounting', 'الحسابات', 'ACC', '#5FAEB6', 1, 1, '12')").run();
  db.prepare("INSERT INTO departments (name, name_ar, code, color_code, display_order, is_active, room_number) VALUES ('Student Affairs', 'شؤون الطلبة', 'STA', '#223B73', 2, 1, NULL)").run();
  db.prepare("INSERT INTO service_categories (department_id, name, estimated_time_minutes, is_active) VALUES (1, 'Tuition Payment', 5, 1), (1, 'Refund', 10, 0), (2, 'Enrollment', 20, 1)").run();
  db.prepare("INSERT INTO announcements (message_text, message_text_ar, speak_language, display_order, is_active) VALUES ('School hours: 8 AM - 3 PM', 'الدوام من 8 إلى 3', 'both', 1, 1)").run();
  return db;
}

test('collects only the chosen parts, without ids or other settings', () => {
  const setup = collect(sourceSchool(), ALL);
  expect(setup.callWording).toEqual({
    call_template_en: 'Attention please. Ticket Number {ticket}, {department}.',
    call_template_ar: 'تنبيه من فضلك. التذكرة رقم {ticket}، {department}.',
  });
  expect(setup.voices).toEqual({ voice_speaker: 'Esraa', voice_announce: 'Esraa' });
  expect(setup.departments).toHaveLength(2);
  expect(setup.departments[0]).toMatchObject({ name: 'Accounting', name_ar: 'الحسابات', code: 'ACC', room_number: '12', services: [{ name: 'Tuition Payment' }, { name: 'Refund', is_active: 0 }] });
  expect(setup.departments[0]).not.toHaveProperty('department_id');
  expect(setup.announcements).toEqual([expect.objectContaining({ message_text: 'School hours: 8 AM - 3 PM', speak_language: 'both' })]);
  expect(collect(sourceSchool(), { departments: true })).toEqual({ departments: expect.any(Array) });
  expect(summarize(setup)).toEqual({ callWording: 2, voices: { voice_speaker: 'Esraa', voice_announce: 'Esraa' }, departments: 2, services: 3, announcements: 1 });
  expect(summarize({})).toBeNull();
});

test('a clean new school gets everything; importing again adds nothing', () => {
  const setup = collect(sourceSchool(), ALL);
  const db = freshDb();
  const done = apply(db, setup, ALL);
  expect(done).toMatchObject({ callWording: 2, voices: ['calls: Esraa', 'announcements: Esraa'], departments: 2, services: 3, announcements: 1 });
  expect(db.prepare('SELECT name, name_ar, code, room_number FROM departments ORDER BY display_order').all()).toEqual([
    { name: 'Accounting', name_ar: 'الحسابات', code: 'ACC', room_number: '12' },
    { name: 'Student Affairs', name_ar: 'شؤون الطلبة', code: 'STA', room_number: null },
  ]);
  expect(db.prepare("SELECT setting_value FROM settings WHERE setting_key = 'call_template_ar'").get().setting_value).toContain('تنبيه');
  expect(db.prepare("SELECT setting_value FROM settings WHERE setting_key = 'school_name'").get()).toBeUndefined();

  const again = apply(db, setup, ALL);
  expect(again).toMatchObject({ departments: 0, departmentsSkipped: 2, services: 0, announcements: 0, announcementsSkipped: 1 });
  expect(db.prepare('SELECT COUNT(*) AS n FROM service_categories').get().n).toBe(3);
});

test('keeps what the other school has: matches by name, adds missing services, frees a taken code', () => {
  const setup = collect(sourceSchool(), ALL);
  const db = freshDb();
  db.prepare("INSERT INTO departments (name, name_ar, code) VALUES ('accounting', NULL, 'FIN'), ('Students', 'شؤون الطلبة', 'STU'), ('Library', NULL, 'ACC')").run();
  db.prepare("INSERT INTO service_categories (department_id, name) VALUES (1, 'tuition payment')").run();
  const done = apply(db, setup, { departments: true });
  expect(done).toMatchObject({ departments: 0, departmentsSkipped: 2 });   // "accounting" by name, "شؤون الطلبة" by Arabic name
  expect(done.services).toBe(2);                                            // Refund → accounting, Enrollment → Students
  expect(db.prepare("SELECT name FROM departments WHERE code = 'FIN'").get().name).toBe('accounting');   // unchanged

  const db2 = freshDb();
  db2.prepare("INSERT INTO departments (name, code) VALUES ('Admissions', 'ACCX')").run();
  apply(db2, { departments: [{ name: 'Accounts', code: 'ADM' }, { name: 'Admin', code: 'ADM' }, { name: 'Library', code: 'ACCX' }] }, { departments: true });
  expect(db2.prepare('SELECT name, code FROM departments ORDER BY department_id').all().map(r => `${r.name}:${r.code}`))
    .toEqual(['Admissions:ACCX', 'Accounts:ADM', 'Admin:ADM2', 'Library:ACCX2']);
});

test('only the ticked parts are added, and a calls voice needs its number clips here', () => {
  const setup = collect(sourceSchool(), ALL);
  const db = freshDb();
  const done = apply(db, setup, { voices: true }, { canUseVoice: (name, use) => use === 'announcements' });
  expect(done).toMatchObject({ voices: ['announcements: Esraa'], callWording: 0, departments: 0, announcements: 0 });
  expect(db.prepare("SELECT setting_value FROM settings WHERE setting_key = 'voice_speaker'").get()).toBeUndefined();
  expect(apply(db, null, ALL)).toMatchObject({ departments: 0 });
});

test('bad values in a file are cleaned up or skipped', () => {
  const db = freshDb();
  const done = apply(db, {
    callWording: { call_template_en: '  ', call_template_ar: 42, other_key: 'x' },
    departments: [{ name: '' }, { name: 'X', code: '<b>', color_code: 'red', services: [{ name: 'S', estimated_time_minutes: -3 }] }],
    announcements: [{ message_text: 'Hi', speak_language: 'fr' }],
  }, ALL);
  expect(done).toMatchObject({ callWording: 0, departments: 1, services: 1, announcements: 1 });
  expect(db.prepare('SELECT code, color_code FROM departments').get()).toEqual({ code: 'B', color_code: '#19224A' });
  expect(db.prepare('SELECT estimated_time_minutes FROM service_categories').get().estimated_time_minutes).toBe(5);
  expect(db.prepare('SELECT speak_language FROM announcements').get().speak_language).toBe('en');
  expect(db.prepare("SELECT COUNT(*) AS n FROM settings WHERE setting_key = 'other_key'").get().n).toBe(0);
});
