require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const { runMigrations } = require('./migrations/runner');

// In Electron production, DB_PATH is set to app.getPath('userData') to avoid
// writing inside read-only Program Files.
const dbPath = process.env.DB_PATH || path.join(__dirname, '../../../database/queue.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
    db.exec(seed);

    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare(
      `INSERT OR IGNORE INTO users (user_id, username, password_hash, full_name, role, department_id, is_active, created_at)
       VALUES (1, 'admin', ?, 'System Admin', 'super_admin', NULL, 1, datetime('now'))`
    ).run(hash);

    console.log('✓ Database seeded');
  }

  runMigrations(db);
  console.log('✓ Database initialized');
}

initDatabase();

// Daily automatic backups (keeps last 14) — safe online copies of the DB file.
try {
  require('./backup').scheduleBackups(db);
} catch (err) {
  console.error('Backup scheduler not started:', err.message);
}

module.exports = db;
