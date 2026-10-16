// Voice Recordings lock: when the school's license carries a Vyra password (voicePass), the
// voice tools are hidden and every voice admin API needs an unlock token from POST /voice/unlock.
// The displays (manifest, clips) and "Announce on display" are never locked.
// An unlock token only fits the password it was given for: a new key with another password
// locks everyone again at once.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const lic = require('./license');
const { checkVoicePass } = require('../../electron/license');

const UNLOCK_HOURS = 12;
const MAX_TRIES = 5;
const LOCKOUT_MS = 5 * 60 * 1000;
const fails = new Map();      // user_id → { count, until }

const passHash = () => lic.current()?.payload?.voicePass || null;
const isLocked = () => !!passHash();
// Which password a token was issued for (a fingerprint of the hash, not the hash itself)
const fingerprint = (hash) => crypto.createHash('sha256').update(hash).digest('hex').slice(0, 16);

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
  const token = jwt.sign({ voice_unlock: true, user_id: userId, pw: fingerprint(hash) }, process.env.JWT_SECRET, { expiresIn: `${UNLOCK_HOURS}h` });
  return { ok: true, token };
}

// The token's claims if it unlocks the current password, else null
function valid(token) {
  try {
    const t = jwt.verify(String(token || ''), process.env.JWT_SECRET);
    return t.voice_unlock && t.pw === fingerprint(passHash()) ? t : null;
  } catch { return null; }   // missing / expired / wrong
}

// After authMiddleware: voice admin APIs need the unlock token while locked
function voiceGuard(req, res, next) {
  if (!isLocked()) return next();
  const t = valid(req.get('X-Voice-Unlock'));
  if (t && t.user_id === req.user.user_id) return next();
  res.status(423).json({ error: 'Voice Recordings is locked', code: 'voice_locked' });
}

// For the server PC's own engine export / import (Electron IPC): same rule, no request
const tokenOk = (token) => !isLocked() || !!valid(token);

module.exports = { isLocked, unlock, voiceGuard, tokenOk, reset: () => fails.clear() };
