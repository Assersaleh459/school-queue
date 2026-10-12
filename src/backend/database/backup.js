const fs = require('fs');
const path = require('path');

// Backups live next to the live DB, in a /backups subfolder.
function backupsDir(db) {
  const dir = path.join(path.dirname(db.name), 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); // 2026-07-04T13-05-22
}

// Online backup of the live SQLite DB (safe while the app is running).
async function runBackup(db, label = 'auto') {
  const dir  = backupsDir(db);
  const dest = path.join(dir, `school-queue-${label}-${timestamp()}.db`);
  await db.backup(dest);
  return dest;
}

function listBackups(db) {
  const dir = backupsDir(db);
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.db'))
    .map(f => {
      const st = fs.statSync(path.join(dir, f));
      return { file: f, size: st.size, created: st.mtime.toISOString() };
    })
    .sort((a, b) => b.created.localeCompare(a.created));
}

// Keep only the newest `keep` backups.
function prune(db, keep = 14) {
  const dir = backupsDir(db);
  const files = listBackups(db);
  files.slice(keep).forEach(f => {
    try { fs.unlinkSync(path.join(dir, f.file)); } catch {}
  });
}

// Initial backup shortly after startup, then once a day. Keeps last 14.
function scheduleBackups(db) {
  const doBackup = () => {
    runBackup(db, 'auto')
      .then(() => prune(db, 14))
      .catch(err => console.error('Auto-backup failed:', err.message));
  };
  setTimeout(doBackup, 5000);
  setInterval(doBackup, 24 * 60 * 60 * 1000);
}

module.exports = { backupsDir, runBackup, listBackups, prune, scheduleBackups };
