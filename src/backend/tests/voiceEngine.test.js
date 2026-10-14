// Voice engine manager with a fake worker process (same protocol as worker.py, no model).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createEngine, clipKey, clipFile, NUMBER_SLOTS } = require('../voice-engine/engine');

const FAKE = path.join(__dirname, 'fixtures', 'fake-voice-worker.js');
let dir, engine;

function make(opts = {}) {
  dir = dir || fs.mkdtempSync(path.join(os.tmpdir(), 'voice-'));
  engine = createEngine({ voiceDir: dir, command: { command: process.execPath, args: [FAKE], env: {} }, ...opts });
  return engine;
}
const until = (cond, ms = 10000) => new Promise((resolve, reject) => {
  const t0 = Date.now();
  const tick = () => (cond() ? resolve() : Date.now() - t0 > ms ? reject(new Error('timeout')) : setTimeout(tick, 20));
  tick();
});
const manifest = (voice = 'Sarah') => JSON.parse(fs.readFileSync(path.join(dir, voice, 'manifest.json'), 'utf8'));

beforeEach(() => { dir = null; });
afterEach(() => { engine?.stop(); });

test('clipKey and clipFile match the frontend and the dev tool', () => {
  expect(clipKey('  ، القسم  ')).toBe('القسم');
  expect(clipFile('ar', 'تنبيه من فضلك. التذكرة رقم')).toBe('ar-624d29101b2d.ogg');   // same as the generated Al-Noor pack
  expect(NUMBER_SLOTS.length).toBe(315);
});

test('generates queued pieces into the voice folder and updates its manifest', async () => {
  make();
  const changes = [];
  engine.on('change', () => changes.push(1));
  expect(engine.enqueue([{ lang: 'ar', text: ' المدرسة تغلق اليوم. ' }, { lang: 'en', text: 'School closes early' }])).toBe(2);
  await until(() => engine.status().done === 2);

  expect(manifest()).toEqual({
    ar: { 'المدرسة تغلق اليوم': clipFile('ar', 'المدرسة تغلق اليوم') },
    en: { 'School closes early': clipFile('en', 'School closes early') },
  });
  expect(fs.readFileSync(path.join(dir, 'Sarah', clipFile('en', 'School closes early')), 'utf8')).toBe('clip:Sarah:en:School closes early');
  expect(changes.length).toBe(2);
  expect(engine.status()).toMatchObject({ state: 'ready', device: 'fake', queue: [], current: null });
});

test('each voice keeps its own recordings', async () => {
  make();
  engine.enqueue([{ lang: 'en', text: 'Hello' }]);
  engine.enqueue([{ lang: 'en', text: 'Hello' }], { voice: 'Yasmin' });   // same text, other voice → still queued
  await until(() => engine.status().done === 2);
  expect(fs.readFileSync(path.join(dir, 'Yasmin', clipFile('en', 'Hello')), 'utf8')).toBe('clip:Yasmin:en:Hello');
  expect(manifest('Yasmin').en.Hello).toBeDefined();
  expect(manifest('Sarah').en.Hello).toBeDefined();
});

test('skips pieces already recorded or queued, unless forced', async () => {
  make();
  engine.enqueue([{ lang: 'en', text: 'Hello' }]);
  await until(() => engine.status().done === 1);
  expect(engine.enqueue([{ lang: 'en', text: 'Hello.' }, { lang: 'en', text: 'Hello' }])).toBe(0);
  expect(engine.enqueue([{ lang: 'en', text: 'Hello' }], { force: true })).toBe(1);
  await until(() => engine.status().done === 2);
});

test('preparing a voice records all 315 number clips, and resumes where it stopped', async () => {
  make();
  expect(engine.numberCount('Yasmin')).toBe(0);
  fs.mkdirSync(path.join(dir, 'Yasmin', 'ar', 'n'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'Yasmin', 'ar', 'n', '25.ogg'), 'already made');   // e.g. an earlier run
  expect(engine.enqueueNumbers('Yasmin')).toBe(314);
  expect(engine.enqueueNumbers('Yasmin')).toBe(0);                                    // already queued
  await until(() => engine.numberCount('Yasmin') === 315, 30000);
  expect(fs.readFileSync(path.join(dir, 'Yasmin', 'ar', 'wn', '25.ogg'), 'utf8')).toBe('clip:Yasmin:ar:wn25');
  expect(fs.readFileSync(path.join(dir, 'Yasmin', 'en', 'h', '300.ogg'), 'utf8')).toBe('clip:Yasmin:en:h300');
});

test('Sarah needs no preparing — her numbers ship with the app', () => {
  make();
  expect(engine.numberCount('Sarah')).toBe(315);
  expect(engine.enqueueNumbers('Sarah')).toBe(0);
});

test('moves pre-voices recordings (Al-Noor 1.7.0 layout) into Sarah/', () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-'));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ ar: { 'القسم': 'ar-6cb992d5a3b3.ogg' } }));
  fs.writeFileSync(path.join(dir, 'ar-6cb992d5a3b3.ogg'), 'old clip');
  make();
  expect(manifest('Sarah')).toEqual({ ar: { 'القسم': 'ar-6cb992d5a3b3.ogg' } });
  expect(fs.readFileSync(path.join(dir, 'Sarah', 'ar-6cb992d5a3b3.ogg'), 'utf8')).toBe('old clip');
  expect(fs.existsSync(path.join(dir, 'manifest.json'))).toBe(false);
});

test('rejects unsafe voice names', () => {
  make();
  expect(() => engine.enqueue([{ lang: 'en', text: 'x' }], { voice: '../evil' })).toThrow('Invalid voice name');
  expect(() => engine.enqueueNumbers('a/b')).toThrow('Invalid voice name');
  expect(engine.remove('en', 'x', '..')).toBe(false);
});

test('a failed piece is reported and the queue keeps going', async () => {
  make();
  engine.enqueue([{ lang: 'en', text: 'FAIL' }, { lang: 'en', text: 'After' }]);
  await until(() => engine.status().done === 1);
  expect(engine.status().failed).toEqual([{ voice: 'Sarah', lang: 'en', text: 'FAIL', error: 'generated audio was silent' }]);
  expect(manifest().en.After).toBeDefined();
  expect(manifest().en.FAIL).toBeUndefined();
});

test('worker crash mid-job puts the job back and reports the error', async () => {
  make();
  engine.enqueue([{ lang: 'en', text: 'CRASH' }]);
  await until(() => engine.status().state === 'off' && engine.status().lastError);
  expect(engine.status().lastError).toMatch(/exit 3/);
  expect(engine.status().queue).toEqual([{ voice: 'Sarah', lang: 'en', text: 'CRASH' }]);
});

test('remove deletes the clip and its manifest entry', async () => {
  make();
  engine.enqueue([{ lang: 'ar', text: 'الحسابات' }]);
  await until(() => engine.status().done === 1);
  const file = path.join(dir, 'Sarah', clipFile('ar', 'الحسابات'));
  expect(fs.existsSync(file)).toBe(true);
  expect(engine.remove('ar', 'الحسابات')).toBe(true);
  expect(fs.existsSync(file)).toBe(false);
  expect(manifest().ar['الحسابات']).toBeUndefined();
  expect(engine.remove('ar', 'الحسابات')).toBe(false);
});

test('stops the worker after it has been idle', async () => {
  make({ idleMs: 150 });
  engine.enqueue([{ lang: 'en', text: 'Hi' }]);
  await until(() => engine.status().done === 1);
  await until(() => engine.status().state === 'off', 3000);
});

test('reports when the engine is not installed', () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-'));
  engine = createEngine({ voiceDir: dir, engineDir: path.join(dir, 'no-engine-here') });
  expect(engine.status().installed).toBe(false);
  engine.enqueue([{ lang: 'en', text: 'Hi' }]);
  expect(engine.status().lastError).toBe('Voice engine is not installed');
});

test('a single phrase jumps ahead of a voice preparation', () => {
  make();
  engine.pause();                                    // hold the queue so we can inspect its order
  engine.enqueueNumbers('Yasmin');
  engine.enqueue([{ lang: 'ar', text: 'إعلان عاجل' }], { voice: 'Yasmin' });
  const q = engine.status().queue;
  expect(q.length).toBe(316);
  expect(q[0]).toEqual({ voice: 'Yasmin', lang: 'ar', text: 'إعلان عاجل' });
  expect(engine.status().state).toBe('off');         // paused → the engine was never started
});

test('pause stops new work, resume finishes it', async () => {
  make();
  engine.pause();
  engine.enqueue([{ lang: 'en', text: 'One' }, { lang: 'en', text: 'Two' }]);
  await new Promise(r => setTimeout(r, 300));
  expect(engine.status()).toMatchObject({ paused: true, done: 0 });
  expect(engine.status().queue.length).toBe(2);
  engine.resume();
  await until(() => engine.status().done === 2);
  expect(engine.status()).toMatchObject({ paused: false, queue: [] });
});

test('pausing mid-run lets the current clip finish and frees the worker', async () => {
  make({ idleMs: 150 });
  engine.enqueueNumbers('Omnia');
  await until(() => engine.status().done >= 3);
  engine.pause();
  await until(() => engine.status().state === 'off', 5000);   // worker exited while paused
  const doneAtPause = engine.status().done;
  await new Promise(r => setTimeout(r, 300));
  expect(engine.status().done).toBe(doneAtPause);            // nothing more was made
  expect(engine.status().queue.length).toBeGreaterThan(0);   // work kept for later
  engine.resume();
  await until(() => engine.numberCount('Omnia') === 315, 30000);
});
