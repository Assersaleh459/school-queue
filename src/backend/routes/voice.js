const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const db = require('../database/db');
const { authMiddleware, requireRole, requirePageAccess } = require('../middleware/auth');
const { getSetting, invalidate: invalidateSettings } = require('../settingsCache');
const { log } = require('../audit');
const { createEngine, validVoice, NUMBER_SLOTS, SHIPPED_VOICE, DEFAULT_ENGINE_DIR, HERE } = require('../voice-engine/engine');

const router = express.Router();

// Recorded-voice clips per voice (template text, department names, announcements, custom
// phrases, and — for voices other than Sarah — numbers). They live next to the database so
// they survive app updates. Sarah's number clips ship with the frontend under /voice/.
const voiceDir = path.join(path.dirname(db.name), 'voice');
const engine = createEngine({ voiceDir });
const referencesFile = path.join(DEFAULT_ENGINE_DIR, 'model', 'reference_speakers', 'references.json');

const admin = [authMiddleware, requireRole('super_admin', 'admin')];
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
    numbers: voice === SHIPPED_VOICE ? '/voice' : `/api/voice/clips/${voice}`,
    clips: `/api/voice/clips/${voice}`,
    ...engine.readManifest(voice),
    announce: { voice: aVoice, clips: `/api/voice/clips/${aVoice}`, ...engine.readManifest(aVoice) },
  });
});

router.use('/clips', express.static(voiceDir, { maxAge: '1h', index: false }));

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

// { items: [{ lang: 'ar'|'en', text }], force?: true, voice? }  — generated in the background
router.post('/generate', admin, (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items.filter(i => i && typeof i.text === 'string') : [];
  const voice = req.body.voice || activeVoice();
  if (!items.length) return res.status(422).json({ error: 'Nothing to generate' });
  if (!validVoice(voice)) return res.status(422).json({ error: 'Invalid voice' });
  if (!engine.installed()) return res.status(409).json({ error: 'Voice engine is not installed on the server' });
  const queued = engine.enqueue(items, { force: !!req.body.force, voice });
  log(req.user?.user_id, 'VOICE_GENERATE', 'voice', null, { voice, queued, texts: items.slice(0, 10).map(i => i.text) });
  res.json({ success: true, queued });
});

router.post('/remove', admin, (req, res) => {
  const { lang, text } = req.body;
  const voice = req.body.voice || activeVoice();
  if (!engine.remove(lang === 'ar' ? 'ar' : 'en', text, voice)) return res.status(404).json({ error: 'No recording for that text' });
  log(req.user?.user_id, 'VOICE_REMOVED', 'voice', null, { voice, lang, text });
  res.json({ success: true });
});

// Opens the engine installer in a visible window on the server PC (downloads ~5 GB once).
router.post('/engine/install', [authMiddleware, requireRole('super_admin')], (req, res) => {
  if (process.platform !== 'win32') return res.status(400).json({ error: 'The voice engine installer is for Windows' });
  if (engine.installed()) return res.status(409).json({ error: 'Voice engine is already installed' });
  // detached on Windows = its own console window, so the admin can watch the download
  spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(HERE, 'install-engine.ps1')],
    { detached: true, stdio: 'ignore', windowsHide: false }).unref();
  log(req.user?.user_id, 'VOICE_ENGINE_INSTALL', 'voice', null, {});
  res.json({ success: true });
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
