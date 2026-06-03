const MIGRATIONS = [
  {
    id: '001_add_speak_language',
    sql: "ALTER TABLE announcements ADD COLUMN speak_language TEXT DEFAULT 'en'",
  },
  {
    id: '002_add_allowed_pages',
    sql: 'ALTER TABLE users ADD COLUMN allowed_pages TEXT DEFAULT NULL',
  },
  {
    id: '003_add_dept_name_ar',
    sql: 'ALTER TABLE departments ADD COLUMN name_ar TEXT DEFAULT NULL',
  },
  {
    id: '004_add_dept_room_number',
    sql: 'ALTER TABLE departments ADD COLUMN room_number TEXT DEFAULT NULL',
  },
];

function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // If the table was created by an old version with INTEGER PRIMARY KEY,
  // the text-ID insert will fail. Detect and recreate with correct schema.
  const idType = (db.prepare('PRAGMA table_info(migrations)').all()
    .find(c => c.name === 'id') || {}).type || '';
  if (idType.toUpperCase() !== 'TEXT') {
    db.exec('DROP TABLE IF EXISTS migrations');
    db.exec(`
      CREATE TABLE migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  const applied = new Set(
    db.prepare('SELECT id FROM migrations').all().map(r => r.id)
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    try {
      db.exec(migration.sql);
    } catch (err) {
      if (!err.message.includes('duplicate column name')) throw err;
    }
    db.prepare('INSERT INTO migrations (id) VALUES (?)').run(migration.id);
    console.log(`✓ Migration applied: ${migration.id}`);
  }
}

module.exports = { runMigrations };
