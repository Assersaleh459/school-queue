// Voice Recordings lock (Vyra password carried by the license)
process.env.JWT_SECRET = 'test-secret';
const { hashVoicePass } = require('../../../electron/license');
let mockPayload = null;
jest.mock('../license', () => ({ current: () => (mockPayload ? { payload: mockPayload } : null) }));
const voiceLock = require('../voiceLock');

const run = (headers = {}, user = { user_id: 1 }) => {
  const req = { user, get: (h) => headers[h] };
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  let passed = false;
  voiceLock.voiceGuard(req, res, () => { passed = true; });
  return { passed, res };
};

beforeEach(() => { mockPayload = null; voiceLock.reset(); });

test('no password in the license → voice tools open', () => {
  expect(voiceLock.isLocked()).toBe(false);
  expect(run().passed).toBe(true);
  expect(voiceLock.unlock(1, '')).toEqual({ ok: true, token: null });
});

test('locked: voice APIs answer 423 until unlocked with the right password', () => {
  mockPayload = { voicePass: hashVoicePass('Vyra#2026') };
  expect(voiceLock.isLocked()).toBe(true);
  expect(run().res).toMatchObject({ code: 423, body: { code: 'voice_locked' } });
  expect(voiceLock.unlock(1, 'wrong')).toEqual({ ok: false, error: 'Wrong password' });
  const { ok, token } = voiceLock.unlock(1, 'Vyra#2026');
  expect(ok).toBe(true);
  expect(run({ 'X-Voice-Unlock': token }).passed).toBe(true);
  expect(run({ 'X-Voice-Unlock': token }, { user_id: 2 }).passed).toBe(false);   // someone else's token
  expect(voiceLock.tokenOk(token)).toBe(true);
  expect(voiceLock.tokenOk('nonsense')).toBe(false);
});

test('5 wrong passwords → a few minutes wait, even with the right one', () => {
  mockPayload = { voicePass: hashVoicePass('Vyra#2026') };
  for (let i = 0; i < 5; i++) voiceLock.unlock(7, 'guess');
  expect(voiceLock.unlock(7, 'Vyra#2026')).toMatchObject({ ok: false, wait: true });
  expect(voiceLock.unlock(8, 'Vyra#2026').ok).toBe(true);                        // other users unaffected
});

test('a new key with another password locks everyone again at once; a key without one opens the page', () => {
  mockPayload = { voicePass: hashVoicePass('Old-pass-1') };
  const { token } = voiceLock.unlock(1, 'Old-pass-1');
  expect(run({ 'X-Voice-Unlock': token }).passed).toBe(true);
  mockPayload = { voicePass: hashVoicePass('New-pass-2') };          // school pasted the renewed key
  expect(run({ 'X-Voice-Unlock': token }).res.code).toBe(423);
  expect(voiceLock.tokenOk(token)).toBe(false);
  expect(voiceLock.unlock(1, 'Old-pass-1').ok).toBe(false);
  expect(run({ 'X-Voice-Unlock': voiceLock.unlock(1, 'New-pass-2').token }).passed).toBe(true);
  mockPayload = { };                                                  // key without a password
  expect(run().passed).toBe(true);
});
