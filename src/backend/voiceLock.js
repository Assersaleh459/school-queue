// Voice Recordings lock: when the school's license carries a Vyra password (voicePass), the
// voice tools are hidden and every voice admin API needs an unlock token from POST /voice/unlock.
// The displays (manifest, clips) and "Announce on display" are never locked.
const jwt = require('jsonwebtoken');
const lic = require('./license');
const { checkVoicePass } = require('../../electron/license');

const UNLOCK_HOURS = 12;
const MAX_TRIES = 5;
const LOCKOUT_MS = 5 * 60 * 1000;
const fails = new Map();      // user_id → { count, until }

const passHash = () => lic.current()?.payload?.voicePass || null;
const isLocked = () => !!passHash();

// → { ok, token } | { ok:false, error, wait? }
function unlock(userId, password) {
  const hash = passHash();
  if (!hash) return { ok: true, token: null };
  const f = fails.get(userId);
  if (f?.until > Date.now()) return { ok: false, error: 'Too many wrong passwords — try again in a few minutes', wait: true };
  if (!checkVoicePass(hash, password || '')) {
    const count = (f?.until && f.until <= Date.now() ? 0 : f?.count || 0) + 1;
    fails.set(userId, { count, until: count >= MAX_TRIES ? Date.now() + LOCKOUT_MS : 0 });
    return { ok: false, error: 'Wrong password' };
  }
  fails.delete(userId);
  return { ok: true, token: jwt.sign({ voice_unlock: true, user_id: userId }, process.env.JWT_SECRET, { expiresIn: `${UNLOCK_HOURS}h` }) };
}

// After authMiddleware: voice admin APIs need the unlock token while locked
function voiceGuard(req, res, next) {
  if (!isLocked()) return next();
  try {
    const t = jwt.verify(String(req.get('X-Voice-Unlock') || ''), process.env.JWT_SECRET);
    if (t.voice_unlock && t.user_id === req.user.user_id) return next();
  } catch { /* missing / expired / wrong */ }
  res.status(423).json({ error: 'Voice Recordings is locked', code: 'voice_locked' });
}

// For the server PC's own engine export / import (Electron IPC): same rule, no request
function tokenOk(token) {
  if (!isLocked()) return true;
  try { return !!jwt.verify(String(token || ''), process.env.JWT_SECRET).voice_unlock; } catch { return false; }
}

module.exports = { isLocked, unlock, voiceGuard, tokenOk, reset: () => fails.clear() };
