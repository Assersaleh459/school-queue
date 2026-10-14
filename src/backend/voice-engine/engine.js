// Voice engine manager: generates recorded-voice clips on the school's server, in advance.
//
// The engine itself is an optional add-on (Python + VoiceTut model, ~5 GB) installed by
// install-engine.ps1 into C:\ProgramData\SchoolQ\VoiceEngine. When an admin asks for
// recordings, this module starts worker.py once (loading the model takes minutes), feeds it
// one clip at a time and stops it after it has been idle a while to free memory.
//
// Each voice has its own folder:  <voiceDir>/<Voice>/manifest.json + phrase clips
//                                 <voiceDir>/<Voice>/<lang>/<n|wn|h>/<number>.ogg
// (Sarah's numbers ship with the app under /voice/, so her folder only holds phrases.)
const { spawn } = require('child_process');
const crypto = require('crypto');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const EDGE_PUNCT = /^[\s.,،؛;:!?؟…-]+|[\s.,،؛;:!?؟…-]+$/g;
const SHIPPED_VOICE = 'Sarah';

// Must match clipKey in src/frontend/src/lib/voiceClips.js
function clipKey(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().replace(EDGE_PUNCT, '');
}

// Same naming as tools/voice/generate_voice_pack.py
function clipFile(lang, key) {
  return `${lang}-${crypto.createHash('sha1').update(key, 'utf8').digest('hex').slice(0, 12)}.ogg`;
}

// Must match number_slots() in voicegen.py — 315 clips per voice
const NUMBER_SLOTS = [];
for (let n = 1; n < 100; n++) NUMBER_SLOTS.push(['ar', 'n', n], ['ar', 'wn', n], ['en', 'n', n]);
for (let h = 100; h < 1000; h += 100) NUMBER_SLOTS.push(['ar', 'h', h], ['en', 'h', h]);

const validVoice = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v);

// Python can't read files inside app.asar — the voice-engine folder is unpacked at build time.
const HERE = __dirname.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
const DEFAULT_ENGINE_DIR = process.env.SCHOOLQ_VOICE_ENGINE
  || path.join(process.env.ProgramData || 'C:\\ProgramData', 'SchoolQ', 'VoiceEngine');

function defaultCommand(engineDir) {
  return {
    command: path.join(engineDir, 'venv', 'Scripts', 'python.exe'),
    args: ['-u', path.join(HERE, 'worker.py'), '--model', path.join(engineDir, 'model')],
    env: { PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', HF_HOME: path.join(engineDir, 'hf-cache') },
  };
}

function createEngine({ voiceDir, engineDir = DEFAULT_ENGINE_DIR, command, idleMs = 10 * 60 * 1000 } = {}) {
  const emitter = new EventEmitter();
  const cmd = command || defaultCommand(engineDir);
  const dirOf = (voice) => path.join(voiceDir, voice);

  // Before voices existed, Sarah's clips lived directly in voiceDir — move them into Sarah/
  const legacy = path.join(voiceDir, 'manifest.json');
  if (fs.existsSync(legacy) && !fs.existsSync(dirOf(SHIPPED_VOICE))) {
    fs.mkdirSync(dirOf(SHIPPED_VOICE), { recursive: true });
    for (const f of fs.readdirSync(voiceDir)) {
      if (f === 'manifest.json' || f.endsWith('.ogg')) fs.renameSync(path.join(voiceDir, f), path.join(dirOf(SHIPPED_VOICE), f));
    }
  }

  let proc = null;
  let state = 'off';            // off | starting | ready | busy
  let device = null;
  let current = null;
  let idleTimer = null;
  let lastError = null;
  let seq = 0;
  let paused = false;
  const queue = [];
  const failed = [];
  const stderrTail = [];
  let doneCount = 0;

  const readManifest = (voice) => {
    try { return JSON.parse(fs.readFileSync(path.join(dirOf(voice), 'manifest.json'), 'utf8')); } catch { return {}; }
  };
  const writeManifest = (voice, m) => {
    const file = path.join(dirOf(voice), 'manifest.json');
    fs.mkdirSync(dirOf(voice), { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(m, null, 2), 'utf8');
    fs.renameSync(file + '.tmp', file);
  };
  const numberPath = (voice, [lang, kind, n]) => path.join(dirOf(voice), lang, kind, `${n}.ogg`);

  // How many of the 315 number clips this voice has (Sarah's ship with the app)
  const numberCount = (voice) => voice === SHIPPED_VOICE
    ? NUMBER_SLOTS.length
    : NUMBER_SLOTS.filter(s => fs.existsSync(numberPath(voice, s))).length;

  const installed = () => fs.existsSync(cmd.command) && (command || fs.existsSync(path.join(engineDir, 'model', 'model.safetensors')));
  const label = (j) => ({ voice: j.voice, lang: j.lang, text: j.text });

  function status() {
    return {
      installed: !!installed(),
      engineDir,
      state,
      paused,
      device,
      current: current && label(current),
      queue: queue.map(label),
      done: doneCount,
      failed: failed.slice(-10),
      lastError,
    };
  }

  // Idle = nothing to do, or paused. The worker then exits to free memory / GPU.
  function armIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (state === 'ready' && (paused || !queue.length)) stop(); }, idleMs);
  }

  function pump() {
    if (state !== 'ready' || paused || !queue.length) { if (state === 'ready') armIdle(); return; }
    clearTimeout(idleTimer);
    current = queue.shift();
    state = 'busy';
    proc.stdin.write(JSON.stringify({
      id: current.id, speaker: current.voice, lang: current.lang, out: current.out,
      ...(current.number ? { number: current.number } : { text: current.text }),
    }) + '\n');
    emitter.emit('status');
  }

  function onEvent(ev) {
    if (ev.type === 'ready') {
      state = 'ready';
      device = ev.device;
      lastError = null;
    } else if (ev.type === 'fatal') {
      lastError = ev.error;
    } else if (ev.type === 'done' && current && ev.id === current.id) {
      if (current.key) {                     // phrase → record it in the voice's manifest
        const m = readManifest(current.voice);
        (m[current.lang] ||= {})[current.key] = current.file;
        writeManifest(current.voice, m);
      }
      doneCount++;
      current = null;
      state = 'ready';
      emitter.emit('change');
    } else if (ev.type === 'error' && current && ev.id === current.id) {
      failed.push({ ...label(current), error: ev.error });
      current = null;
      state = 'ready';
    }
    emitter.emit('status');
    pump();
  }

  function start() {
    if (proc) return;
    if (!installed()) { lastError = 'Voice engine is not installed'; emitter.emit('status'); return; }
    state = 'starting';
    lastError = null;
    proc = spawn(cmd.command, cmd.args, { env: { ...process.env, ...cmd.env }, windowsHide: true });
    readline.createInterface({ input: proc.stdout }).on('line', (line) => {
      try { onEvent(JSON.parse(line)); } catch { /* not a protocol line */ }
    });
    proc.stderr.on('data', (d) => {
      stderrTail.push(...String(d).split(/\r?\n/).filter(Boolean));
      stderrTail.splice(0, Math.max(0, stderrTail.length - 20));
    });
    proc.on('error', (err) => { lastError = err.message; });
    proc.on('exit', (code) => {
      proc = null;
      clearTimeout(idleTimer);
      if (current) { queue.unshift(current); current = null; }
      if (code && !lastError) lastError = `Voice engine stopped (exit ${code}): ${stderrTail.slice(-3).join(' | ')}`;
      state = 'off';
      emitter.emit('status');
    });
    emitter.emit('status');
  }

  function stop() {
    clearTimeout(idleTimer);
    if (proc) { proc.stdin.end(); proc.kill(); }
  }

  const queued = (voice, lang, test) =>
    [current, ...queue].some(j => j && j.voice === voice && j.lang === lang && test(j));

  function kick(added) {
    if (added && !paused) { proc ? pump() : start(); }
    emitter.emit('status');
    return added;
  }

  // Pause: the clip being recorded finishes, nothing new starts; the worker exits after idleMs.
  function pause() {
    paused = true;
    if (state === 'ready') armIdle();
    emitter.emit('status');
  }

  function resume() {
    paused = false;
    if (queue.length) { proc ? pump() : start(); }
    emitter.emit('status');
  }

  // items: [{ lang: 'ar'|'en', text }] — skips pieces already recorded or queued unless force.
  // Phrases go ahead of any queued number clips, so a single recording never waits hours
  // behind a voice preparation.
  function enqueue(items, { force = false, voice = SHIPPED_VOICE } = {}) {
    if (!validVoice(voice)) throw new Error('Invalid voice name');
    const m = readManifest(voice);
    let at = queue.findIndex(j => j.number);
    if (at === -1) at = queue.length;
    let added = 0;
    for (const item of items) {
      const lang = item.lang === 'ar' ? 'ar' : 'en';
      const key = clipKey(item.text);
      if (!key || queued(voice, lang, j => j.key === key) || (!force && m[lang]?.[key])) continue;
      const file = clipFile(lang, key);
      queue.splice(at++, 0, { id: String(++seq), voice, lang, key, text: key, file, out: path.join(dirOf(voice), file) });
      added++;
    }
    return kick(added);
  }

  // Queues the number clips this voice is still missing (resumable)
  function enqueueNumbers(voice) {
    if (!validVoice(voice)) throw new Error('Invalid voice name');
    if (voice === SHIPPED_VOICE) return 0;
    let added = 0;
    for (const slot of NUMBER_SLOTS) {
      const [lang, kind, n] = slot;
      if (fs.existsSync(numberPath(voice, slot)) || queued(voice, lang, j => j.number?.kind === kind && j.number?.n === n)) continue;
      queue.push({ id: String(++seq), voice, lang, number: { kind, n }, text: `#${n}${kind === 'wn' ? ' (و)' : ''}`, out: numberPath(voice, slot) });
      added++;
    }
    return kick(added);
  }

  function remove(lang, text, voice = SHIPPED_VOICE) {
    if (!validVoice(voice)) return false;
    const key = clipKey(text);
    const m = readManifest(voice);
    const file = m[lang]?.[key];
    if (!file) return false;
    delete m[lang][key];
    writeManifest(voice, m);
    try { fs.unlinkSync(path.join(dirOf(voice), path.basename(file))); } catch {}
    emitter.emit('change');
    return true;
  }

  return Object.assign(emitter, { status, enqueue, enqueueNumbers, remove, pause, resume, stop, readManifest, numberCount, installed });
}

module.exports = { createEngine, clipKey, clipFile, validVoice, NUMBER_SLOTS, SHIPPED_VOICE, DEFAULT_ENGINE_DIR, HERE };
