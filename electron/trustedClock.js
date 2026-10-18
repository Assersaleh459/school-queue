// Trusted clock for the license. SchoolQ's own "latest time seen", which only moves forward,
// so setting the PC's date back does not extend a license.
//
//   now() = the later of the PC clock and the saved time + real running time since it was
//           loaded (a monotonic timer that changing the Windows date does not affect).
//
// The state is saved every 10 minutes, sealed (HMAC tied to this PC), in up to three places:
// a file next to license.json, the Windows registry (HKCU) and the database (the backend adds
// that copy). Loading takes the latest valid copy, so deleting or editing one does not help.
// The backend also adds evidence: the newest ticket's time.
//
// A license key issued later than any key seen before resets the clock to that key's issue
// day: the fix when a PC's date was once set far into the future by mistake. Only the seller
// can make such a key. The tickets made before that reset no longer count as evidence.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { performance } = require('perf_hooks');

const SAVE_EVERY_MS = 10 * 60 * 1000;
const SET_BACK_MS = 24 * 60 * 60 * 1000;   // PC clock this far behind SchoolQ's = "set back"
const REG_KEY = 'HKCU\\Software\\SchoolQ';
const REG_VALUE = 'ClockState';

const dayStart = (ymd) => (ymd ? new Date(`${ymd}T00:00:00`).getTime() : 0);

// state: { t: ms, issued: 'YYYY-MM-DD' of the newest key seen, mark: ticket id — tickets up to
// it don't count as evidence; null = set it at the next backend start }
function seal(state, secret) {
  const body = JSON.stringify({ t: state.t, issued: state.issued, mark: state.mark });
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64');
  return Buffer.from(JSON.stringify({ body, mac })).toString('base64');
}

function unseal(text, secret) {
  try {
    const { body, mac } = JSON.parse(Buffer.from(String(text), 'base64').toString('utf8'));
    const want = crypto.createHmac('sha256', secret).update(body).digest();
    const got = Buffer.from(mac, 'base64');
    if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
    const s = JSON.parse(body);
    if (!Number.isFinite(s.t) || typeof s.issued !== 'string') return null;
    return { t: s.t, issued: s.issued, mark: s.mark === null || Number.isInteger(s.mark) ? s.mark : 0 };
  } catch {
    return null;
  }
}

const fileStore = (file) => ({
  read: () => { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } },
  write: (text) => {
    fs.writeFileSync(file + '.tmp', text, 'utf8');
    fs.renameSync(file + '.tmp', file);
  },
});

const registryStore = {
  read: () => {
    try {
      const out = execFileSync('reg', ['query', REG_KEY, '/v', REG_VALUE], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      return out.match(/REG_SZ\s+(\S+)/)?.[1] || null;
    } catch { return null; }
  },
  write: (text) => {
    execFileSync('reg', ['add', REG_KEY, '/v', REG_VALUE, '/t', 'REG_SZ', '/d', text, '/f'], { windowsHide: true, stdio: 'ignore' });
  },
};

// Newest key wins; among copies of that key, the latest time. Copies from before a reset
// (an older key) are ignored.
function merge(states) {
  const valid = states.filter(Boolean);
  if (!valid.length) return null;
  const issued = valid.reduce((m, s) => (s.issued > m ? s.issued : m), '');
  const same = valid.filter(s => s.issued === issued);
  const marks = same.map(s => s.mark).filter(m => m !== null);
  return { t: Math.max(...same.map(s => s.t)), issued, mark: marks.length ? Math.max(...marks) : null };
}

// opts (tests): wallNow, monoNow, stores (replaces file + registry)
function createTrustedClock({ dir, secret, registry = false, wallNow = () => Date.now(), monoNow = () => performance.now(), stores } = {}) {
  const all = stores || [fileStore(path.join(dir, 'clock.dat')), ...(registry ? [registryStore] : [])];
  const found = merge(all.map(s => unseal(s.read(), secret)));
  let state = found || { t: 0, issued: '', mark: 0 };
  let base = Math.max(wallNow(), state.t);
  let monoBase = monoNow();
  let timer = null;

  // The latest time ever seen: if the PC clock is ahead, follow it from there on
  const now = () => {
    const wall = wallNow();
    const mono = monoNow();
    if (wall > base + (mono - monoBase)) { base = wall; monoBase = mono; }
    return base + (mono - monoBase);
  };
  const raise = (ms) => { if (ms > now()) { base = ms; monoBase = monoNow(); } };

  function save() {
    state = { ...state, t: now() };
    const text = seal(state, secret);
    for (const s of all) { try { s.write(text); } catch {} }
  }

  return {
    now,
    raise,
    save,
    // Trusted time for judging this key: never before the day it was issued
    nowFor: (payload) => Math.max(now(), dayStart(payload.issued)),
    // Time to judge a key being activated: a newer key than any seen starts from its issue day
    nowForNewKey: (payload) => (payload.issued > state.issued
      ? Math.max(wallNow(), dayStart(payload.issued))
      : Math.max(now(), dayStart(payload.issued))),
    // Called once a key is activated
    acceptKey(payload) {
      if (!(payload.issued > state.issued)) return false;
      const hadState = !!state.issued;
      base = Math.max(wallNow(), dayStart(payload.issued));
      monoBase = monoNow();
      state = { t: base, issued: payload.issued, mark: hadState ? null : 0 };
      save();
      return true;
    },
    // Backend: the database copy, and ticket evidence (see the top of this file)
    addStore(store, { maxTicketId, newestTicketAfter }) {
      all.push(store);
      const merged = merge([state, unseal(store.read(), secret)]);
      if (merged.issued !== state.issued || merged.t > state.t || merged.mark !== state.mark) {
        state = merged;
        raise(merged.t);
      }
      if (state.mark === null) state = { ...state, mark: maxTicketId() };
      else raise(newestTicketAfter(state.mark) || 0);
      save();
    },
    setBackBy: () => Math.max(0, now() - wallNow()),
    isSetBack() { return this.setBackBy() > SET_BACK_MS; },
    start() {
      if (!timer) { timer = setInterval(save, SAVE_EVERY_MS); timer.unref?.(); }
      save();
    },
    stop() { if (timer) clearInterval(timer); timer = null; },
    state: () => ({ ...state }),
  };
}

// One clock per data folder for the whole app (the Electron main process and the backend
// run in the same process and share it).
const clocks = new Map();
function clockFor(dir, machineId) {
  dir = path.resolve(dir);
  if (!clocks.has(dir)) {
    const secret = crypto.createHash('sha256').update(`SchoolQ-clock-v1|${machineId}`).digest();
    // Registry copy only in the installed app (code inside app.asar) — never from dev or test runs
    const registry = process.platform === 'win32' && __dirname.includes('app.asar');
    const clock = createTrustedClock({ dir, secret, registry });
    clock.start();
    clocks.set(dir, clock);
  }
  return clocks.get(dir);
}

module.exports = { createTrustedClock, clockFor, seal, unseal, SET_BACK_MS, SAVE_EVERY_MS };
