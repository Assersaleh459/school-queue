// Fresh Start (Vyra only): puts the server back to a new install — one admin (admin / admin123),
// the seed settings, no departments, tickets, users, announcements, devices or voice recordings.
// Kept: the license, the trusted clock (app_state), the voice engine, the JWT secret, config.json.
// A copy of the database and the voice folder go to <userData>/backups/before-wipe/ first
// (a subfolder, so the daily backup pruning never deletes them).
const fs = require('fs');
const path = require('path');
const { backupsDir } = require('./database/backup');
const { seedFresh } = require('./database/seed');

const TABLES = ['transfers', 'tickets', 'service_categories', 'announcements', 'audit_logs', 'devices', 'users', 'departments', 'settings'];

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// The stopped voice worker can hold a clip open for a moment, so retry
async function moveDir(from, to) {
  for (let i = 0; ; i++) {
    try { return fs.renameSync(from, to); } catch (err) {
      if (i >= 10 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
      await sleep(300);
    }
  }
}

// → { adminId, backup, voiceBackup }
async function wipeAll({ db, voiceDir, engine, by = null }) {
  const ts = timestamp();
  const dir = path.join(backupsDir(db), 'before-wipe');
  fs.mkdirSync(dir, { recursive: true });
  const backup = path.join(dir, `school-queue-${ts}.db`);
  await db.backup(backup);

  engine?.clear();
  let voiceBackup = null;
  if (voiceDir && fs.existsSync(voiceDir)) {
    voiceBackup = path.join(dir, `voice-${ts}`);
    await moveDir(voiceDir, voiceBackup);
  }

  const adminId = db.transaction(() => {
    db.pragma('defer_foreign_keys = ON');
    for (const t of TABLES) db.prepare(`DELETE FROM ${t}`).run();
    // Numbering starts again (tickets, departments…) — except users, so the new admin gets a
    // new user_id and every old login token stops working at once
    const reset = TABLES.filter(t => t !== 'users');
    db.prepare(`DELETE FROM sqlite_sequence WHERE name IN (${reset.map(() => '?').join(', ')})`).run(...reset);
    const id = seedFresh(db);
    db.prepare('INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)')
      .run(null, 'DATA_WIPED', 'system', null, JSON.stringify({ by, backup: path.basename(backup) }));
    return Number(id);
  })();

  return { adminId, backup, voiceBackup };
}

module.exports = { wipeAll, TABLES };
