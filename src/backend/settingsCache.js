const db = require('./database/db');

const TTL_MS = 30 * 1000; // 30 seconds
let cache = null;
let cacheAt = 0;

function getSettings() {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;
  const rows = db.prepare('SELECT setting_key, setting_value FROM settings').all();
  cache = Object.fromEntries(rows.map(r => [r.setting_key, r.setting_value]));
  cacheAt = Date.now();
  return cache;
}

function getSetting(key, fallback = null) {
  return getSettings()[key] ?? fallback;
}

function invalidate() {
  cache = null;
}

module.exports = { getSettings, getSetting, invalidate };
