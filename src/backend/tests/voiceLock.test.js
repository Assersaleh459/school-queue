// Voice Recordings lock and Fresh Start lock (two Vyra passwords carried by the license)
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

describe('Fresh Start lock is separate from the Voice Recordings lock', () => {
  const runWipe = (headers = {}, user = { user_id: 1 }) => {
    const req = { user, get: (h) => headers[h] };
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    let passed = false;
    voiceLock.wipe.guard(req, res, () => { passed = true; });
    return { passed, res };
  };

  test('no Fresh Start password in the key -> not locked (the route itself refuses to wipe)', () => {
    mockPayload = { voicePass: hashVoicePass('Vyra#2026') };
    expect(voiceLock.wipe.isLocked()).toBe(false);
  });

  test('each password opens only its own lock', () => {
    mockPayload = { voicePass: hashVoicePass('Vyra#2026'), wipePass: hashVoicePass('Fresh#Start9') };
    expect(voiceLock.unlock(1, 'Fresh#Start9').ok).toBe(false);
    expect(voiceLock.wipe.unlock(1, 'Vyra#2026').ok).toBe(false);
    const voiceToken = voiceLock.unlock(1, 'Vyra#2026').token;
    const wipeToken = voiceLock.wipe.unlock(1, 'Fresh#Start9').token;
    expect(run({ 'X-Voice-Unlock': voiceToken }).passed).toBe(true);
    expect(run({ 'X-Voice-Unlock': wipeToken }).passed).toBe(false);          // a wipe token is not a voice token
    expect(runWipe({ 'X-Wipe-Unlock': wipeToken }).passed).toBe(true);
    expect(runWipe({ 'X-Wipe-Unlock': voiceToken }).res).toMatchObject({ code: 423, body: { code: 'wipe_locked' } });
    expect(runWipe({ 'X-Wipe-Unlock': wipeToken }, { user_id: 2 }).passed).toBe(false);   // someone else's token
  });

  test('a new key with another Fresh Start password locks it again at once', () => {
    mockPayload = { wipePass: hashVoicePass('Old-wipe-1') };
    const { token } = voiceLock.wipe.unlock(1, 'Old-wipe-1');
    expect(runWipe({ 'X-Wipe-Unlock': token }).passed).toBe(true);
    mockPayload = { wipePass: hashVoicePass('New-wipe-2') };
    expect(runWipe({ 'X-Wipe-Unlock': token }).res.code).toBe(423);
  });

  test('wrong tries on one lock never lock the other', () => {
    mockPayload = { voicePass: hashVoicePass('Vyra#2026'), wipePass: hashVoicePass('Fresh#Start9') };
    for (let i = 0; i < 5; i++) voiceLock.wipe.unlock(7, 'guess');
    expect(voiceLock.wipe.unlock(7, 'Fresh#Start9')).toMatchObject({ ok: false, wait: true });
    expect(voiceLock.unlock(7, 'Vyra#2026').ok).toBe(true);
  });
});
