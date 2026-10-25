const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const db = require('../database/db');
const { authMiddleware, requireRole, requirePageAccess } = require('../middleware/auth');
const { getSetting, invalidate: invalidateSettings } = require('../settingsCache');
const { log } = require('../audit');
const { createEngine, validVoice, NUMBER_SLOTS, SHIPPED_VOICE, DEFAULT_ENGINE_DIR, HERE } = require('../voice-engine/engine');
const pack = require('../voice-engine/pack');
const schoolSetup = require('../schoolSetup');
const voiceLock = require('../voiceLock');
const { wipeAll } = require('../wipe');
const socketHandlers = require('../socket/handlers');
const jwt = require('jsonwebtoken');
const APP_VERSION = require('../../../package.json').version;

const router = express.Router();

// Recorded-voice clips per voice (template text, department names, announcements, custom
// phrases, and — for voices other than Sarah — numbers). They live next to the database so
// they survive app updates. Sarah's number clips ship with the frontend under /voice/.
const voiceDir = path.join(path.dirname(db.name), 'voice');
const engine = createEngine({ voiceDir });
const referencesFile = path.join(DEFAULT_ENGINE_DIR, 'model', 'reference_speakers', 'references.json');

// Voice tools: admins — and, when the license carries a Vyra password, only once unlocked
const admin = [authMiddleware, requireRole('super_admin', 'admin'), voiceLock.voiceGuard];
const canAnnounce = [authMiddleware, requirePageAccess('announcements', 'super_admin', 'admin')];

// Voice for ticket calls (needs all 315 number clips) …
const activeVoice = () => {
  const v = getSetting('voice_speaker', SHIPPED_VOICE);
  return validVoice(v) ? v : SHIPPED_VOICE;
};
// … and for announcements (whole sentences only — no numbers needed). Defaults to the calls voice.
const announceVoice = () => {
  const v = getSetting('voice_announce', null);
  return validVoice(v) ? v : activeVoice();
};

// Voices the installed model offers: [{ name, gender, audio }]. Sarah is always available.
function modelVoices() {
  try {
    return JSON.parse(fs.readFileSync(referencesFile, 'utf8'))
      .map(s => ({ name: s.speaker_name, gender: s.gender, audio: s.audio_path }))
      .filter(s => validVoice(s.name));
  } catch {
    return [{ name: SHIPPED_VOICE, gender: 'female', audio: null }];
  }
}

// Public, like the display screen: the calls voice's recordings, plus the announcement voice's
// { voice, numbers: "<url base for number clips>", clips: "<url base for phrase clips>", ar: { text: file }, en: { ... },
//   announce: { voice, clips, ar, en } }
router.get('/manifest', (req, res) => {
  const voice = activeVoice();
  const aVoice = announceVoice();
  res.json({
    voice,
    numbers: `/api/voice/numbers/${voice}`,
    clips: `/api/voice/clips/${voice}`,
    ...engine.readManifest(voice),
    announce: { voice: aVoice, clips: `/api/voice/clips/${aVoice}`, ...engine.readManifest(aVoice) },
  });
});

// No max-age: a clip that was re-recorded keeps its file name, so displays must re-check it
// (a quick 304 when unchanged) instead of playing a cached old take.
router.use('/clips', express.static(voiceDir, { maxAge: 0, index: false }));

// Number clips: a re-recorded one on the server, else (Sarah) the one shipped with the app
router.get('/numbers/:voice/:lang/:kind/:n.ogg', (req, res) => {
  const { voice, lang, kind, n } = req.params;
  const slot = NUMBER_SLOTS.find(([l, k, x]) => l === lang && k === kind && String(x) === n);
  if (!validVoice(voice) || !slot) return res.status(404).end();
  const file = engine.numberPath(voice, slot);
  if (fs.existsSync(file)) return res.sendFile(file, { maxAge: 0 });
  if (voice === SHIPPED_VOICE) return res.redirect(302, `/voice/${lang}/${kind}/${n}.ogg`);
  res.status(404).end();
});

// ── Voices ───────────────────────────────────────────────────────────────────

router.get('/voices', admin, (req, res) => {
  const active = activeVoice();
  const aVoice = announceVoice();
  res.json(modelVoices().map(v => {
    const numbers = engine.numberCount(v.name);
    const m = engine.readManifest(v.name);
    return {
      name: v.name,
      gender: v.gender,
      hasSample: !!v.audio,
      numbers,
      numbersTotal: NUMBER_SLOTS.length,
      ready: numbers === NUMBER_SLOTS.length,
      phrases: Object.values(m).reduce((n, items) => n + Object.keys(items || {}).length, 0),
      active: v.name === active,           // used for ticket calls
      announcing: v.name === aVoice,       // used for announcements
    };
  }));
});

// The speaker's own reference recording — what the voice sounds like
router.get('/voices/:name/sample', admin, (req, res) => {
  const v = modelVoices().find(x => x.name === req.params.name);
  if (!v?.audio) return res.status(404).json({ error: 'No sample for this voice' });
  res.sendFile(path.join(path.dirname(referencesFile), '..', v.audio));
});

// Record everything a voice needs: its 315 number clips + the given phrases ({ items })
router.post('/voices/:name/prepare', admin, (req, res) => {
  const voice = req.params.name;
  if (!modelVoices().some(v => v.name === voice)) return res.status(404).json({ error: 'Unknown voice' });
  if (!engine.installed()) return res.status(409).json({ error: 'Voice engine is not installed on the server' });
  const items = Array.isArray(req.body.items) ? req.body.items.filter(i => i && typeof i.text === 'string') : [];
  const queued = engine.enqueueNumbers(voice) + engine.enqueue(items, { voice });
  log(req.user?.user_id, 'VOICE_PREPARE', 'voice', null, { voice, queued });
  res.json({ success: true, queued });
});

// { for: 'calls' | 'announcements' }
// Calls: only once all its numbers are recorded, so a call never mixes voices.
// Announcements: any voice — they're whole sentences, recorded on demand.
router.post('/voices/:name/use', admin, (req, res) => {
  const voice = req.params.name;
  const forAnnouncements = req.body.for === 'announcements';
  if (!modelVoices().some(v => v.name === voice)) return res.status(404).json({ error: 'Unknown voice' });
  if (!forAnnouncements && engine.numberCount(voice) < NUMBER_SLOTS.length) {
    return res.status(409).json({ error: `${voice} is not ready for ticket calls yet — prepare the voice first` });
  }
  const key = forAnnouncements ? 'voice_announce' : 'voice_speaker';
  db.prepare(`INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
              ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value`).run(key, voice);
  invalidateSettings();
  req.io.emit('voice_updated');
  log(req.user?.user_id, 'VOICE_SELECTED', 'voice', null, { voice, for: forAnnouncements ? 'announcements' : 'calls' });
  res.json({ success: true, voice });
});

// ── Recordings (the calls voice unless { voice } is given) ───────────────────

router.get('/engine', admin, (req, res) => res.json({ ...engine.status(), voice: activeVoice(), announceVoice: announceVoice() }));

router.post('/engine/pause', admin, (req, res) => {
  engine.pause();
  log(req.user?.user_id, 'VOICE_ENGINE_PAUSED', 'voice', null, {});
  res.json({ success: true });
});

router.post('/engine/resume', admin, (req, res) => {
  engine.resume();
  log(req.user?.user_id, 'VOICE_ENGINE_RESUMED', 'voice', null, {});
  res.json({ success: true });
});

// { items: [{ lang: 'ar'|'en', text } | { lang, kind, n }], force?: true, voice? }  — generated in
// the background. force on a recorded clip makes a new take to compare (see /takes).
const clipItems = (body) => (Array.isArray(body.items) ? body.items : [])
  .filter(i => i && (typeof i.text === 'string' || (typeof i.kind === 'string' && i.n != null)))
  .map(i => (i.kind ? { lang: i.lang, kind: i.kind, n: Number(i.n) } : { lang: i.lang, text: i.text }));

router.post('/generate', admin, (req, res) => {
  const items = clipItems(req.body);
  const voice = req.body.voice || activeVoice();
  if (!items.length) return res.status(422).json({ error: 'Nothing to generate' });
  if (!validVoice(voice)) return res.status(422).json({ error: 'Invalid voice' });
  if (!engine.installed()) return res.status(409).json({ error: 'Voice engine is not installed on the server' });
  const queued = engine.enqueue(items, { force: !!req.body.force, voice });
  log(req.user?.user_id, 'VOICE_GENERATE', 'voice', null, { voice, queued, texts: items.slice(0, 10).map(i => i.text) });
  res.json({ success: true, queued });
});

// { lang, text, voice? } deletes that voice's recording; { lang, text, everywhere: true } deletes the
// phrase from every voice (and the queue) — for a phrase typed by mistake
router.post('/remove', admin, (req, res) => {
  const { lang, text } = req.body;
  if (req.body.everywhere) {
    const r = engine.removeEverywhere(lang, text);
    if (!r.removed && !r.dropped) return res.status(404).json({ error: 'No recording for that text' });
    log(req.user?.user_id, 'VOICE_PHRASE_DELETED', 'voice', null, { lang, text, voices: r.removed });
    return res.json({ success: true, ...r });
  }
  const voice = req.body.voice || activeVoice();
  if (!engine.remove(lang === 'ar' ? 'ar' : 'en', text, voice)) return res.status(404).json({ error: 'No recording for that text' });
  log(req.user?.user_id, 'VOICE_REMOVED', 'voice', null, { voice, lang, text });
  res.json({ success: true });
});

// ── Listen & fix ─────────────────────────────────────────────────────────────

// Every clip of a voice: { voice, numbers: [{ lang, kind, n, recorded, edited, take, flagged }],
//                          phrases: [{ lang, text, file, take, flagged }] }
router.get('/voices/:name/clips', admin, (req, res) => {
  if (!validVoice(req.params.name)) return res.status(422).json({ error: 'Invalid voice' });
  res.json(engine.listClips(req.params.name));
});

// { voice, items, keep: 'new' | 'old' } — after "redo": use the new take, or throw it away
router.post('/takes', admin, (req, res) => {
  const { voice, keep } = req.body;
  if (!validVoice(voice) || !['new', 'old'].includes(keep)) return res.status(422).json({ error: 'Invalid request' });
  const items = clipItems(req.body);
  const done = items.filter(i => engine.keepTake(voice, i, keep)).length;
  if (!done) return res.status(404).json({ error: 'No new take to keep' });
  log(req.user?.user_id, keep === 'new' ? 'VOICE_TAKE_KEPT' : 'VOICE_TAKE_DISCARDED', 'voice', null, { voice, count: done });
  res.json({ success: true, done });
});

// { voice, items, flagged } — mark clips that sound bad, to redo them together later
router.post('/flags', admin, (req, res) => {
  const { voice } = req.body;
  if (!validVoice(voice)) return res.status(422).json({ error: 'Invalid voice' });
  res.json({ success: true, changed: engine.setFlag(voice, clipItems(req.body), !!req.body.flagged) });
});

// { lang, kind, n } — Sarah: go back to the number clip shipped with the app
router.post('/voices/:name/restore', admin, (req, res) => {
  const { lang, kind, n } = req.body;
  if (!engine.restoreNumber(req.params.name, { lang, kind, n: Number(n) })) return res.status(404).json({ error: 'Nothing to restore' });
  log(req.user?.user_id, 'VOICE_NUMBER_RESTORED', 'voice', null, { voice: req.params.name, lang, kind, n });
  res.json({ success: true });
});

// Opens the engine installer in a visible window on the server PC (downloads ~5 GB once).
router.post('/engine/install', [authMiddleware, requireRole('super_admin'), voiceLock.voiceGuard], (req, res) => {
  if (process.platform !== 'win32') return res.status(400).json({ error: 'The voice engine installer is for Windows' });
  if (engine.installed()) return res.status(409).json({ error: 'Voice engine is already installed' });
  // detached on Windows = its own console window, so the admin can watch the download
  spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(HERE, 'install-engine.ps1')],
    { detached: true, stdio: 'ignore', windowsHide: false }).unref();
  log(req.user?.user_id, 'VOICE_ENGINE_INSTALL', 'voice', null, {});
  res.json({ success: true });
});

// ── Lock (Vyra password from the license) ───────────────────────────────────

router.get('/lock', authMiddleware, (req, res) => res.json({ locked: voiceLock.isLocked() }));

router.post('/unlock', [authMiddleware, requireRole('super_admin', 'admin')], (req, res) => {
  const r = voiceLock.unlock(req.user.user_id, req.body.password);
  log(req.user.user_id, r.ok ? 'VOICE_UNLOCKED' : 'VOICE_UNLOCK_FAILED', 'voice', null, {});
  if (!r.ok) return res.status(r.wait ? 429 : 403).json({ error: r.error });
  res.json({ success: true, token: r.token });
});

// ── Fresh start (Vyra only) ──────────────────────────────────────────────────
// Its own password (wipePass in the license), separate from the Voice Recordings one.
// Without it in the key, Fresh Start is off: any admin could otherwise erase the school.

const wipeLock = voiceLock.wipe;

router.get('/wipe/lock', authMiddleware, (req, res) => res.json({ enabled: wipeLock.isLocked() }));

router.post('/wipe/unlock', [authMiddleware, requireRole('super_admin')], (req, res) => {
  if (!wipeLock.isLocked()) return res.status(403).json({ error: 'Fresh Start needs a license with a Fresh Start password' });
  const r = wipeLock.unlock(req.user.user_id, req.body.password);
  log(req.user.user_id, r.ok ? 'WIPE_UNLOCKED' : 'WIPE_UNLOCK_FAILED', 'system', null, {});
  if (!r.ok) return res.status(r.wait ? 429 : 403).json({ error: r.error });
  res.json({ success: true, token: r.token });
});

// { password, confirm: 'WIPE' } — puts the server back to a new install (see wipe.js). Needs the
// Fresh Start unlock, and the Fresh Start password is asked again.
router.post('/wipe', [authMiddleware, requireRole('super_admin'), (req, res, next) => {
  if (!wipeLock.isLocked()) return res.status(403).json({ error: 'Fresh Start needs a license with a Fresh Start password' });
  wipeLock.guard(req, res, next);
}], async (req, res) => {
  if (req.body.confirm !== 'WIPE') return res.status(422).json({ error: 'Type WIPE to confirm' });
  const r = wipeLock.unlock(req.user.user_id, req.body.password);
  if (!r.ok) {
    log(req.user.user_id, 'DATA_WIPE_FAILED', 'system', null, {});
    return res.status(r.wait ? 429 : 403).json({ error: r.error });
  }
  try {
    await wipeAll({ db, voiceDir, engine, by: req.user.username });
  } catch (err) {
    console.error('Fresh start failed:', err);
    return res.status(500).json({ error: `Fresh start failed: ${err.message}` });
  }
  invalidateSettings();
  res.json({ success: true });
  socketHandlers.forceLogoutAll();
  req.io.emit('settings_updated');
  req.io.emit('voice_updated');
  req.io.emit('announcements_updated');
  req.io.emit('queue_updated');
});

// ── Backup & move: voices as a file ──────────────────────────────────────────

// Downloads are plain links (the browser saves them), so they carry a 5-minute token
const linkFor = (req, payload) => `/api/voice/export?t=${encodeURIComponent(jwt.sign({ ...payload, user_id: req.user.user_id }, process.env.JWT_SECRET, { expiresIn: '5m' }))}`;

// Which parts of the school setup a request asks for: { callWording, voices, departments, announcements }
const setupParts = (body) => Object.fromEntries(schoolSetup.PARTS.map(p => [p, !!body?.[p]]));

// { voices: [names], setup: { callWording, voices, departments, announcements } } → { url }
router.post('/export-link', admin, (req, res) => {
  const voices = (Array.isArray(req.body.voices) ? req.body.voices : []).filter(validVoice);
  if (!voices.length) return res.status(422).json({ error: 'Choose at least one voice' });
  res.json({ url: linkFor(req, { dl: 'voices', voices, setup: setupParts(req.body.setup) }) });
});

// Counts for the export choices: { departments, services, announcements, callWording, voices }
router.get('/export-setup', admin, (req, res) => {
  res.json(schoolSetup.summarize(schoolSetup.collect(db, setupParts({ callWording: 1, voices: 1, departments: 1, announcements: 1 }))) || {});
});

router.get('/export', async (req, res) => {
  let t;
  try { t = jwt.verify(String(req.query.t || ''), process.env.JWT_SECRET); } catch { return res.status(401).json({ error: 'Download link expired' }); }
  if (t.dl !== 'voices') return res.status(400).json({ error: 'Bad link' });
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="SchoolQ voices ${new Date().toISOString().slice(0, 10)}.schoolq-voices"`);
  try {
    const setup = schoolSetup.collect(db, t.setup || {});
    await pack.exportVoices(voiceDir, t.voices, res, { appVersion: APP_VERSION, setup });
    log(t.user_id, 'VOICES_EXPORTED', 'voice', null, { voices: t.voices, setup: schoolSetup.summarize(setup) });
    res.end();
  } catch (err) {
    if (!res.headersSent) res.status(422).json({ error: err.message });
    else res.destroy(err);
  }
});

// Step 1: upload the file (raw body) → which voices and which school setup it holds
router.post('/import', admin, async (req, res) => {
  pack.cleanStaged(voiceDir);
  try {
    const staged = await pack.stageVoices(voiceDir, req);
    res.json({ ...staged, setup: schoolSetup.summarize(staged.setup) });
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

// Step 2: { voices: [names], setup: { callWording, voices, departments, announcements } } — the
// voices replace the same voices here (others are kept); the setup is added (see schoolSetup.js)
router.post('/import/:id', admin, (req, res) => {
  try {
    const parts = setupParts(req.body.setup);
    const setup = pack.stagedSetup(voiceDir, req.params.id);
    const done = pack.applyVoices(voiceDir, req.params.id, Array.isArray(req.body.voices) ? req.body.voices : []);
    const added = schoolSetup.apply(db, setup, parts, {
      canUseVoice: (name, use) => validVoice(name)
        && (use === 'calls' ? engine.numberCount(name) >= NUMBER_SLOTS.length : name === SHIPPED_VOICE || fs.existsSync(path.join(voiceDir, name))),
    });
    invalidateSettings();
    engine.emit('change');
    req.io.emit('voice_updated');
    req.io.emit('settings_updated');
    req.io.emit('announcements_updated');
    log(req.user.user_id, 'VOICES_IMPORTED', 'voice', null, { voices: done, setup: added });
    res.json({ success: true, imported: done, setup: added });
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

// ── Spoken announcements ─────────────────────────────────────────────────────

// Plays an announcement on the display(s) now — recorded voice if available, else online voice.
router.post('/announce/:id', canAnnounce, (req, res) => {
  const a = db.prepare('SELECT * FROM announcements WHERE announcement_id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Announcement not found' });
  req.io.to('public_monitor').emit('announcement_spoken', {
    text_en: a.message_text,
    text_ar: a.message_text_ar || null,
    speak_language: a.speak_language || 'en',
  });
  log(req.user?.user_id, 'ANNOUNCEMENT_SPOKEN', 'announcement', a.announcement_id, { message_text: a.message_text });
  res.json({ success: true });
});

module.exports = router;
module.exports.engine = engine;
