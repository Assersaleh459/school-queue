const db = require('./database/db');

const insert = db.prepare(
  'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)'
);

function log(userId, action, entityType = null, entityId = null, details = null) {
  try {
    insert.run(userId ?? null, action, entityType, entityId, details ? JSON.stringify(details) : null);
  } catch (err) {
    console.error('[AUDIT] Failed to write audit log:', action, err.message);
  }
}

module.exports = { log };
