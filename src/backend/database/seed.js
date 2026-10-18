const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

// A new install's starting data: the seed settings and one admin (admin / admin123 — the app
// makes them choose a new password at the first sign-in). Used on first start and by Fresh Start.
// adminId: null → the next free id, so old login tokens (another user_id) stop working.
function seedFresh(db, { adminId = null } = {}) {
  db.exec(fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8'));
  const hash = bcrypt.hashSync('admin123', 10);
  return db.prepare(
    `INSERT OR IGNORE INTO users (user_id, username, password_hash, full_name, role, department_id, is_active, created_at)
     VALUES (?, 'admin', ?, 'System Admin', 'super_admin', NULL, 1, datetime('now'))`
  ).run(adminId, hash).lastInsertRowid;
}

module.exports = { seedFresh };
