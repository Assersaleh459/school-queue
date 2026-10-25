// Voice routes: Fresh Start guards (its own password, separate from Voice Recordings) and "delete phrase entirely". DB, license and the wipe itself
// are mocked; the voice folder is a temp folder.
process.env.JWT_SECRET = 'test-secret';
const fs = require('fs');
const os = require('os');
const path = require('path');
const mockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-routes-'));

let mockAnnouncement = null;   // the row 'SELECT * FROM announcements …' returns
jest.mock('../database/db', () => ({
  name: require('path').join(mockDir, 'queue.db'),
  prepare: (sql) => ({
    get: () => (sql.includes('FROM announcements') ? mockAnnouncement : sql.includes('is_active') ? { is_active: 1 } : null),
    run: () => ({ changes: 1 }),
    all: () => [],
  }),
  transaction: (fn) => (...args) => fn(...args),
}));
jest.mock('../audit', () => ({ log: jest.fn() }));
jest.mock('../announceSeries', () => ({ start: jest.fn(), stop: jest.fn(() => null), status: jest.fn(() => null) }));
let mockPayload = null;
jest.mock('../license', () => ({ current: () => (mockPayload ? { payload: mockPayload } : null) }));
jest.mock('../wipe', () => ({ wipeAll: jest.fn(async () => ({ adminId: 2 })) }));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const express = require('express');
const { hashVoicePass } = require('../../../electron/license');
const { clipFile } = require('../voice-engine/engine');
const voiceLock = require('../voiceLock');
const announceSeries = require('../announceSeries');
const { wipeAll } = require('../wipe');
const { log } = require('../audit');

const io = { emit: jest.fn(), to: jest.fn(() => io) };   // io.to('public_monitor').emit(...) lands in io.emit too
const app = express();
app.use(express.json());
app.use((req, res, next) => { req.io = io; next(); });
app.use('/api/voice', require('../routes/voice'));

const tokenFor = (role, user_id = 1) => `Bearer ${jwt.sign({ user_id, username: 'u', role }, process.env.JWT_SECRET)}`;
const SUPER = tokenFor('super_admin');
const PASS = 'Vyra#2026';          // Voice Recordings password
const WIPE = 'Fresh#Start9';       // Fresh Start password (a different one)
const unlocked = () => voiceLock.unlock(1, PASS).token;
const wipeUnlocked = () => voiceLock.wipe.unlock(1, WIPE).token;

beforeEach(() => { mockPayload = { voicePass: hashVoicePass(PASS), wipePass: hashVoicePass(WIPE) }; voiceLock.reset(); wipeAll.mockClear(); });

describe('Fresh Start lock: /api/voice/wipe/lock and /wipe/unlock', () => {
  const unlock = (body, auth = SUPER) => request(app).post('/api/voice/wipe/unlock').set('Authorization', auth).send(body);

  test('reports whether the license has a Fresh Start password', async () => {
    expect((await request(app).get('/api/voice/wipe/lock').set('Authorization', SUPER)).body).toEqual({ enabled: true });
    mockPayload = { voicePass: hashVoicePass(PASS) };                     // an older key: voice password only
    expect((await request(app).get('/api/voice/wipe/lock').set('Authorization', SUPER)).body).toEqual({ enabled: false });
  });

  test('the Fresh Start password gives a token; the Voice Recordings password does not', async () => {
    const ok = await unlock({ password: WIPE });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
    expect((await unlock({ password: PASS })).status).toBe(403);
    expect(log).toHaveBeenCalledWith(1, 'WIPE_UNLOCK_FAILED', 'system', null, {});
  });

  test('super_admin only, and only when the key has the password', async () => {
    expect((await unlock({ password: WIPE }, tokenFor('admin'))).status).toBe(403);
    mockPayload = { voicePass: hashVoicePass(PASS) };
    expect((await unlock({ password: WIPE })).status).toBe(403);
  });

  test('5 wrong tries lock Fresh Start for a few minutes, but not Voice Recordings', async () => {
    for (let i = 0; i < 5; i++) await unlock({ password: 'guess' });
    expect((await unlock({ password: WIPE })).status).toBe(429);
    expect(voiceLock.unlock(1, PASS).ok).toBe(true);
  });
});

describe('POST /api/voice/wipe', () => {
  const wipe = (body, auth = SUPER, unlock = wipeUnlocked()) => {
    const r = request(app).post('/api/voice/wipe').set('Authorization', auth);
    if (unlock) r.set('X-Wipe-Unlock', unlock);
    return r.send(body);
  };

  test('refused when the license has no Fresh Start password (even with a voice password)', async () => {
    const voiceToken = unlocked();
    mockPayload = { voicePass: hashVoicePass(PASS) };
    const res = await request(app).post('/api/voice/wipe').set('Authorization', SUPER).set('X-Voice-Unlock', voiceToken).send({ password: PASS, confirm: 'WIPE' });
    expect(res.status).toBe(403);
    expect(wipeAll).not.toHaveBeenCalled();
  });

  test('refused for an admin who is not super_admin', async () => {
    const res = await wipe({ password: WIPE, confirm: 'WIPE' }, tokenFor('admin'));
    expect(res.status).toBe(403);
    expect(wipeAll).not.toHaveBeenCalled();
  });

  test('refused while Fresh Start is locked (no unlock token)', async () => {
    const res = await wipe({ password: WIPE, confirm: 'WIPE' }, SUPER, null);
    expect(res.status).toBe(423);
    expect(res.body.code).toBe('wipe_locked');
  });

  test('a Voice Recordings unlock does not open Fresh Start', async () => {
    const res = await request(app).post('/api/voice/wipe').set('Authorization', SUPER)
      .set('X-Voice-Unlock', unlocked()).set('X-Wipe-Unlock', unlocked()).send({ password: PASS, confirm: 'WIPE' });
    expect(res.status).toBe(423);
    expect(wipeAll).not.toHaveBeenCalled();
  });

  test('needs WIPE typed and the Fresh Start password (not the voice one)', async () => {
    expect((await wipe({ password: WIPE, confirm: 'wipe' })).status).toBe(422);
    expect((await wipe({ password: 'wrong', confirm: 'WIPE' })).status).toBe(403);
    expect((await wipe({ password: PASS, confirm: 'WIPE' })).status).toBe(403);
    expect(wipeAll).not.toHaveBeenCalled();
  });

  test('wipes with the right password', async () => {
    const res = await wipe({ password: WIPE, confirm: 'WIPE' });
    expect(res.status).toBe(200);
    expect(wipeAll).toHaveBeenCalledWith(expect.objectContaining({ voiceDir: path.join(mockDir, 'voice'), by: 'u' }));
  });
});

describe('📢 /api/voice/announce — repeat series (the loop itself is tested in announceSeries.test.js)', () => {
  const row = { announcement_id: 5, message_text: 'Doors close at 2 PM', message_text_ar: 'الأبواب تغلق', speak_language: 'both', repeat_count: 3, repeat_gap_minutes: 5 };
  const announce = () => request(app).post('/api/voice/announce/5').set('Authorization', SUPER);
  beforeEach(() => { mockAnnouncement = { ...row }; jest.clearAllMocks(); });

  test('starts a server-side series from the saved boxes; speaking goes to the displays', async () => {
    const res = await announce();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, repeat_count: 3, repeat_gap_minutes: 5 });
    expect(announceSeries.start).toHaveBeenCalledWith(expect.objectContaining({ announcement_id: 5, count: 3, gapMs: 5 * 60000 }));
    const { speak } = announceSeries.start.mock.calls[0][0];
    expect(speak(1)).toBe(true);
    expect(io.to).toHaveBeenCalledWith('public_monitor');
    expect(io.emit).toHaveBeenCalledWith('announcement_spoken', { text_en: 'Doors close at 2 PM', text_ar: 'الأبواب تغلق', speak_language: 'both' });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(1, 'ANNOUNCEMENT_SPOKEN', 'announcement', 5, expect.objectContaining({ repeat_count: 3, repeat_gap_minutes: 5 }));
  });

  test('each repeat re-reads the row: edited text is used; deleted, or count lowered below the repeats done → stops', async () => {
    await announce();
    const { speak } = announceSeries.start.mock.calls[0][0];
    mockAnnouncement = { ...row, message_text: 'Doors close at 3 PM' };
    expect(speak(2)).toBe(true);
    expect(io.emit).toHaveBeenLastCalledWith('announcement_spoken', expect.objectContaining({ text_en: 'Doors close at 3 PM' }));
    mockAnnouncement = { ...row, repeat_count: 1 };
    expect(speak(2)).toBe(false);
    mockAnnouncement = null;
    expect(speak(1)).toBe(false);
  });

  test('rows from before the boxes speak once; out-of-range values are clamped', async () => {
    mockAnnouncement = { announcement_id: 5, message_text: 'Hi', repeat_count: null, repeat_gap_minutes: null };
    expect((await announce()).body).toMatchObject({ repeat_count: 1, repeat_gap_minutes: 5 });
    mockAnnouncement = { announcement_id: 5, message_text: 'Hi', repeat_count: 99, repeat_gap_minutes: 400 };
    expect((await announce()).body).toMatchObject({ repeat_count: 10, repeat_gap_minutes: 60 });
  });

  test('404 for an unknown announcement', async () => {
    mockAnnouncement = null;
    expect((await announce()).status).toBe(404);
    expect(announceSeries.start).not.toHaveBeenCalled();
  });

  test('GET shows the running series; DELETE (⏹ Stop) ends it and audits', async () => {
    const running = { announcement_id: 5, done: 1, total: 3, next_at: '2026-10-25T12:00:00.000Z' };
    announceSeries.status.mockReturnValueOnce(running);
    expect((await request(app).get('/api/voice/announce').set('Authorization', SUPER)).body).toEqual(running);
    expect((await request(app).get('/api/voice/announce').set('Authorization', SUPER)).body).toBeNull();

    announceSeries.stop.mockReturnValueOnce(running);
    const res = await request(app).delete('/api/voice/announce').set('Authorization', SUPER);
    expect(res.body).toEqual({ success: true, stopped: true });
    expect(log).toHaveBeenCalledWith(1, 'ANNOUNCEMENT_STOPPED', 'announcement', 5, { done: 1, total: 3 });
    expect((await request(app).delete('/api/voice/announce').set('Authorization', SUPER)).body).toEqual({ success: true, stopped: false });
  });

  test('Fresh Start stops a running series', async () => {
    const res = await request(app).post('/api/voice/wipe').set('Authorization', SUPER).set('X-Wipe-Unlock', wipeUnlocked()).send({ password: WIPE, confirm: 'WIPE' });
    expect(res.status).toBe(200);
    expect(announceSeries.stop).toHaveBeenCalled();
  });
});

describe('POST /api/voice/remove { everywhere }', () => {
  const put = (voice, lang, text) => {
    const d = path.join(mockDir, 'voice', voice);
    fs.mkdirSync(d, { recursive: true });
    const file = clipFile(lang, text);
    fs.writeFileSync(path.join(d, file), 'clip');
    fs.writeFileSync(path.join(d, 'manifest.json'), JSON.stringify({ [lang]: { [text]: file, Keep: 'x.ogg' } }));
  };
  const manifest = (voice) => JSON.parse(fs.readFileSync(path.join(mockDir, 'voice', voice, 'manifest.json'), 'utf8'));
  const remove = (body) => request(app).post('/api/voice/remove').set('Authorization', SUPER).set('X-Voice-Unlock', unlocked()).send(body);

  test('removes the phrase from every voice', async () => {
    put('Sarah', 'en', 'Typo phrase');
    put('Esraa', 'en', 'Typo phrase');
    const res = await remove({ lang: 'en', text: 'Typo phrase', everywhere: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ removed: 2 });
    expect(manifest('Sarah').en).toEqual({ Keep: 'x.ogg' });
    expect(manifest('Esraa').en).toEqual({ Keep: 'x.ogg' });
    expect(fs.existsSync(path.join(mockDir, 'voice', 'Esraa', clipFile('en', 'Typo phrase')))).toBe(false);
    expect(log).toHaveBeenCalledWith(1, 'VOICE_PHRASE_DELETED', 'voice', null, expect.objectContaining({ voices: 2 }));
  });

  test('404 when no voice has it', async () => {
    expect((await remove({ lang: 'en', text: 'Never recorded', everywhere: true })).status).toBe(404);
  });
});
