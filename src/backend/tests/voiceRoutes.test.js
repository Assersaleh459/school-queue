// Voice routes: Fresh Start guards and "delete phrase entirely". DB, license and the wipe itself
// are mocked; the voice folder is a temp folder.
process.env.JWT_SECRET = 'test-secret';
const fs = require('fs');
const os = require('os');
const path = require('path');
const mockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-routes-'));

jest.mock('../database/db', () => ({
  name: require('path').join(mockDir, 'queue.db'),
  prepare: (sql) => ({
    get: () => (sql.includes('is_active') ? { is_active: 1 } : null),
    run: () => ({ changes: 1 }),
    all: () => [],
  }),
  transaction: (fn) => (...args) => fn(...args),
}));
jest.mock('../audit', () => ({ log: jest.fn() }));
let mockPayload = null;
jest.mock('../license', () => ({ current: () => (mockPayload ? { payload: mockPayload } : null) }));
jest.mock('../wipe', () => ({ wipeAll: jest.fn(async () => ({ adminId: 2 })) }));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const express = require('express');
const { hashVoicePass } = require('../../../electron/license');
const { clipFile } = require('../voice-engine/engine');
const voiceLock = require('../voiceLock');
const { wipeAll } = require('../wipe');
const { log } = require('../audit');

const app = express();
app.use(express.json());
app.use((req, res, next) => { req.io = { emit: jest.fn(), to: () => ({ emit: jest.fn() }) }; next(); });
app.use('/api/voice', require('../routes/voice'));

const tokenFor = (role, user_id = 1) => `Bearer ${jwt.sign({ user_id, username: 'u', role }, process.env.JWT_SECRET)}`;
const SUPER = tokenFor('super_admin');
const PASS = 'Vyra#2026';
const unlocked = () => voiceLock.unlock(1, PASS).token;

beforeEach(() => { mockPayload = { voicePass: hashVoicePass(PASS) }; voiceLock.reset(); wipeAll.mockClear(); });

describe('POST /api/voice/wipe', () => {
  const wipe = (body, auth = SUPER, unlock = unlocked()) => {
    const r = request(app).post('/api/voice/wipe').set('Authorization', auth);
    if (unlock) r.set('X-Voice-Unlock', unlock);
    return r.send(body);
  };

  test('refused when the license has no voice password', async () => {
    mockPayload = {};
    const res = await wipe({ password: PASS, confirm: 'WIPE' }, SUPER, null);
    expect(res.status).toBe(403);
    expect(wipeAll).not.toHaveBeenCalled();
  });

  test('refused for an admin who is not super_admin', async () => {
    const res = await wipe({ password: PASS, confirm: 'WIPE' }, tokenFor('admin'));
    expect(res.status).toBe(403);
    expect(wipeAll).not.toHaveBeenCalled();
  });

  test('refused while Voice Recordings is locked (no unlock token)', async () => {
    const res = await wipe({ password: PASS, confirm: 'WIPE' }, SUPER, null);
    expect(res.status).toBe(423);
  });

  test('needs WIPE typed and the right password', async () => {
    expect((await wipe({ password: PASS, confirm: 'wipe' })).status).toBe(422);
    expect((await wipe({ password: 'wrong', confirm: 'WIPE' })).status).toBe(403);
    expect(wipeAll).not.toHaveBeenCalled();
  });

  test('wipes with the right password', async () => {
    const res = await wipe({ password: PASS, confirm: 'WIPE' });
    expect(res.status).toBe(200);
    expect(wipeAll).toHaveBeenCalledWith(expect.objectContaining({ voiceDir: path.join(mockDir, 'voice'), by: 'u' }));
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
