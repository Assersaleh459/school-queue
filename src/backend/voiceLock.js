// Vyra password locks carried by the school's license. Two separate locks, two passwords:
//   voice — voicePass: hides Voice Recordings; every voice admin API needs an unlock token
//           from POST /voice/unlock (header X-Voice-Unlock). Displays (manifest, clips) and
//           "Announce on display" are never locked.
//   wipe  — wipePass: Fresh Start. Off unless the key carries it. Token from POST
//           /voice/wipe/unlock (header X-Wipe-Unlock), super_admin only.
// A token only fits the lock and the password it was issued for: the voice password never opens
// Fresh Start (or the other way round), and a new key with another password locks everyone again.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const lic = require('./license');
const { checkVoicePass } = require('../../electron/license');

const UNLOCK_HOURS = 12;
const MAX_TRIES = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

// Which password a token was issued for (a fingerprint of the hash, not the hash itself)
const fingerprint = (hash) => crypto.createHash('sha256').update(hash).digest('hex').slice(0, 16);

// field: the license payload field holding the hash · claim: the marker inside the token
function makeLock({ field, claim, header, code, label }) {
  const fails = new Map();      // user_id → { count, until }
  const passHash = () => lic.current()?.payload?.[field] || null;
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
    const token = jwt.sign({ [claim]: true, user_id: userId, pw: fingerprint(hash) }, process.env.JWT_SECRET, { expiresIn: `${UNLOCK_HOURS}h` });
    return { ok: true, token };
  }

  // The token's claims if it unlocks the current password, else null
  function valid(token) {
    try {
      const hash = passHash();
      if (!hash) return null;
      const t = jwt.verify(String(token || ''), process.env.JWT_SECRET);
      return t[claim] && t.pw === fingerprint(hash) ? t : null;
    } catch { return null; }   // missing / expired / wrong
  }

  // After authMiddleware: needs the unlock token for this user while locked
  function guard(req, res, next) {
    if (!isLocked()) return next();
    const t = valid(req.get(header));
    if (t && t.user_id === req.user.user_id) return next();
    res.status(423).json({ error: `${label} is locked`, code });
  }

  // Same rule without a request (the server PC's own Electron IPC)
  const tokenOk = (token) => !isLocked() || !!valid(token);

  return { isLocked, unlock, valid, guard, tokenOk, reset: () => fails.clear() };
}

const voice = makeLock({ field: 'voicePass', claim: 'voice_unlock', header: 'X-Voice-Unlock', code: 'voice_locked', label: 'Voice Recordings' });
const wipe  = makeLock({ field: 'wipePass',  claim: 'wipe_unlock',  header: 'X-Wipe-Unlock',  code: 'wipe_locked',  label: 'Fresh Start' });

module.exports = {
  isLocked: voice.isLocked,
  unlock: voice.unlock,
  voiceGuard: voice.guard,
  tokenOk: voice.tokenOk,
  wipe,                                                    // Fresh Start's own lock
  reset: () => { voice.reset(); wipe.reset(); },
};
