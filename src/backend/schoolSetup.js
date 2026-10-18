// School setup that travels with exported voices (Voice Recordings → Backup & move), so the
// recordings are used straight away at the other school: a recording only plays when its exact
// text is there — the ticket-call wording, the department names and the announcements.
//
// Import only adds: departments (matched by English or Arabic name; a taken code gets a number),
// their services (by name) and
// announcements (by text) that already exist are skipped. Call wording and voice choices replace.
const WORDING_KEYS = ['call_template_en', 'call_template_ar', 'recall_template_en', 'recall_template_ar'];
const VOICE_KEYS = ['voice_speaker', 'voice_announce'];
const PARTS = ['callWording', 'voices', 'departments', 'announcements'];

const settingsOf = (db, keys) => Object.fromEntries(
  db.prepare(`SELECT setting_key, setting_value FROM settings WHERE setting_key IN (${keys.map(() => '?').join(',')})`).all(...keys)
    .filter(r => r.setting_value !== '')
    .map(r => [r.setting_key, r.setting_value]),
);

// parts: { callWording, voices, departments, announcements } (true = include)
function collect(db, parts = {}) {
  const setup = {};
  if (parts.callWording) setup.callWording = settingsOf(db, WORDING_KEYS);
  if (parts.voices) setup.voices = settingsOf(db, VOICE_KEYS);
  if (parts.departments) {
    const services = db.prepare('SELECT department_id, name, estimated_time_minutes, is_active FROM service_categories ORDER BY category_id').all();
    setup.departments = db.prepare('SELECT department_id, name, name_ar, code, color_code, display_order, is_active, room_number FROM departments ORDER BY display_order, department_id').all()
      .map(({ department_id: id, ...d }) => ({
        ...d,
        services: services.filter(s => s.department_id === id).map(({ department_id: _d, ...s }) => s),
      }));
  }
  if (parts.announcements) {
    setup.announcements = db.prepare('SELECT message_text, message_text_ar, speak_language, display_order, is_active FROM announcements ORDER BY display_order, announcement_id').all();
  }
  return setup;
}

// What a file holds, for the import screen
function summarize(setup) {
  if (!setup || typeof setup !== 'object') return null;
  const s = {};
  if (setup.callWording && Object.keys(setup.callWording).length) s.callWording = Object.keys(setup.callWording).length;
  if (setup.voices && Object.keys(setup.voices).length) s.voices = setup.voices;
  if (Array.isArray(setup.departments) && setup.departments.length) {
    s.departments = setup.departments.length;
    s.services = setup.departments.reduce((n, d) => n + (Array.isArray(d.services) ? d.services.length : 0), 0);
  }
  if (Array.isArray(setup.announcements) && setup.announcements.length) s.announcements = setup.announcements.length;
  return Object.keys(s).length ? s : null;
}

const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

// A free department code: "ADM", else "ADM2", "ADM3", …
function freeCode(db, wanted) {
  const base = (str(wanted, 10) || 'DEP').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'DEP';
  const taken = (c) => !!db.prepare('SELECT 1 FROM departments WHERE code = ?').get(c);
  if (!taken(base)) return base;
  for (let i = 2; i < 100; i++) if (!taken(`${base}${i}`)) return `${base}${i}`;
  return `${base}${Date.now() % 100}`;
}

// parts: which parts to bring in. canUseVoice(name, 'calls'|'announcements') → may this voice be
// chosen here (calls need all number clips). → what was done, for the toast and the audit log.
function apply(db, setup, parts = {}, { canUseVoice = () => true } = {}) {
  const done = { callWording: 0, voices: [], departments: 0, departmentsSkipped: 0, services: 0, announcements: 0, announcementsSkipped: 0 };
  if (!setup || typeof setup !== 'object') return done;
  const setSetting = db.prepare(`INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
                                 ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value`);

  db.transaction(() => {
    if (parts.callWording && setup.callWording) {
      for (const key of WORDING_KEYS) {
        const v = str(setup.callWording[key], 500);
        if (v) { setSetting.run(key, v); done.callWording++; }
      }
    }

    if (parts.voices && setup.voices) {
      const want = [['voice_speaker', 'calls'], ['voice_announce', 'announcements']];
      for (const [key, use] of want) {
        const v = str(setup.voices[key], 40);
        if (v && canUseVoice(v, use)) { setSetting.run(key, v); done.voices.push(`${use}: ${v}`); }
      }
    }

    if (parts.departments && Array.isArray(setup.departments)) {
      const all = () => db.prepare('SELECT department_id, name, name_ar FROM departments').all();
      for (const d of setup.departments) {
        const name = str(d?.name, 100);
        if (!name) continue;
        const nameAr = str(d.name_ar, 100);
        let dept = all().find(x => same(x.name, name) || (nameAr && same(x.name_ar, nameAr)));
        if (dept) done.departmentsSkipped++;
        else {
          const r = db.prepare('INSERT INTO departments (name, name_ar, code, color_code, display_order, is_active, room_number) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(name, nameAr, freeCode(db, d.code), /^#[0-9a-f]{6}$/i.test(d.color_code || '') ? d.color_code : '#19224A',
              Number.isInteger(d.display_order) ? d.display_order : 99, d.is_active === 0 ? 0 : 1, str(d.room_number, 20));
          dept = { department_id: r.lastInsertRowid };
          done.departments++;
        }
        const have = db.prepare('SELECT name FROM service_categories WHERE department_id = ?').all(dept.department_id);
        for (const s of Array.isArray(d.services) ? d.services : []) {
          const sName = str(s?.name, 100);
          if (!sName || have.some(h => same(h.name, sName))) continue;
          db.prepare('INSERT INTO service_categories (department_id, name, estimated_time_minutes, is_active) VALUES (?, ?, ?, ?)')
            .run(dept.department_id, sName, Number.isInteger(s.estimated_time_minutes) && s.estimated_time_minutes > 0 ? s.estimated_time_minutes : 5, s.is_active === 0 ? 0 : 1);
          have.push({ name: sName });
          done.services++;
        }
      }
    }

    if (parts.announcements && Array.isArray(setup.announcements)) {
      const have = db.prepare('SELECT message_text FROM announcements').all();
      for (const a of setup.announcements) {
        const text = str(a?.message_text, 1000);
        if (!text) continue;
        if (have.some(h => same(h.message_text, text))) { done.announcementsSkipped++; continue; }
        db.prepare('INSERT INTO announcements (message_text, message_text_ar, speak_language, display_order, is_active) VALUES (?, ?, ?, ?, ?)')
          .run(text, str(a.message_text_ar, 1000), ['en', 'ar', 'both'].includes(a.speak_language) ? a.speak_language : 'en',
            Number.isInteger(a.display_order) ? a.display_order : null, a.is_active === 0 ? 0 : 1);
        have.push({ message_text: text });
        done.announcements++;
      }
    }
  })();
  return done;
}

module.exports = { collect, summarize, apply, PARTS, WORDING_KEYS, VOICE_KEYS };
