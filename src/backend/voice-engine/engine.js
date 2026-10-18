// Voice engine manager: generates recorded-voice clips on the school's server, in advance.
//
// The engine itself is an optional add-on (Python + VoiceTut model, ~5 GB) installed by
// install-engine.ps1 into C:\ProgramData\SchoolQ\VoiceEngine. When an admin asks for
// recordings, this module starts worker.py once (loading the model takes minutes), feeds it
// one clip at a time and stops it after it has been idle a while to free memory.
//
// Each voice has its own folder:  <voiceDir>/<Voice>/manifest.json + phrase clips
//                                 <voiceDir>/<Voice>/<lang>/<n|wn|h>/<number>.ogg
// (Sarah's numbers ship with the app under /voice/, so her folder only holds phrases — plus
//  any of her numbers an admin re-recorded, which then replace the shipped one.)
//                                 <voiceDir>/<Voice>/takes/…     re-recordings waiting for "keep new / keep old"
//                                 <voiceDir>/<Voice>/flags.json  clips an admin marked "sounds bad"
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

  // A clip is a phrase { lang, text } or a number { lang, kind, n }
  const asNumber = (item) => {
    const lang = item.lang === 'ar' ? 'ar' : 'en';
    return NUMBER_SLOTS.find(([l, k, n]) => l === lang && k === item.kind && n === Number(item.n)) || null;
  };
  const clipId = (item) => {
    const slot = item.kind ? asNumber(item) : null;
    if (slot) return `n:${slot.join('/')}`;
    const key = clipKey(item.text);
    return key ? `p:${item.lang === 'ar' ? 'ar' : 'en'}:${key}` : null;
  };
  const takePath = (voice, item) => {
    const slot = item.kind ? asNumber(item) : null;
    return path.join(dirOf(voice), 'takes', slot ? `${slot.join('-')}.ogg` : clipFile(item.lang === 'ar' ? 'ar' : 'en', clipKey(item.text)));
  };
  const hasNumber = (voice, slot) => voice === SHIPPED_VOICE || fs.existsSync(numberPath(voice, slot));

  const readFlags = (voice) => {
    try { return new Set(JSON.parse(fs.readFileSync(path.join(dirOf(voice), 'flags.json'), 'utf8'))); } catch { return new Set(); }
  };
  const writeFlags = (voice, flags) => {
    fs.mkdirSync(dirOf(voice), { recursive: true });
    fs.writeFileSync(path.join(dirOf(voice), 'flags.json'), JSON.stringify([...flags]), 'utf8');
  };

  // How many of the 315 number clips this voice has (Sarah's ship with the app)
  const numberCount = (voice) => voice === SHIPPED_VOICE
    ? NUMBER_SLOTS.length
    : NUMBER_SLOTS.filter(s => fs.existsSync(numberPath(voice, s))).length;

  const installed = () => fs.existsSync(cmd.command) && (command || fs.existsSync(path.join(engineDir, 'model', 'model.safetensors')));
  const label = (j) => ({ voice: j.voice, lang: j.lang, text: j.text, ...(j.number && { number: j.number }), ...(j.take && { take: true }) });

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
      if (current.dropped) {                 // its phrase was deleted while it was being recorded
        try { fs.unlinkSync(current.out); } catch {}
      } else if (current.key && !current.take) {    // phrase → record it in the voice's manifest
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

  // items: [{ lang: 'ar'|'en', text } | { lang, kind: 'n'|'wn'|'h', n }] — skips clips already
  // recorded or queued unless force. Forcing a recorded clip makes a new take next to it
  // (takes/), so the old one stays in use until the admin keeps the new one.
  // These go ahead of a voice preparation, so a single recording never waits hours.
  function enqueue(items, { force = false, voice = SHIPPED_VOICE } = {}) {
    if (!validVoice(voice)) throw new Error('Invalid voice name');
    const m = readManifest(voice);
    let at = queue.findIndex(j => j.prep);
    if (at === -1) at = queue.length;
    let added = 0;
    for (const item of items) {
      const lang = item.lang === 'ar' ? 'ar' : 'en';
      let job;
      if (item.kind) {
        const slot = asNumber(item);
        if (!slot) continue;
        const [, kind, n] = slot;
        if (queued(voice, lang, j => j.number?.kind === kind && j.number?.n === n)) continue;
        const exists = hasNumber(voice, slot);
        if (!force && exists) continue;
        job = { voice, lang, number: { kind, n }, text: `#${n}${kind === 'wn' ? ' (و)' : ''}`, take: exists, out: exists ? takePath(voice, item) : numberPath(voice, slot) };
      } else {
        const key = clipKey(item.text);
        if (!key || queued(voice, lang, j => j.key === key)) continue;
        const exists = !!m[lang]?.[key];
        if (!force && exists) continue;
        const file = clipFile(lang, key);
        job = { voice, lang, key, text: key, file, take: exists, out: exists ? takePath(voice, item) : path.join(dirOf(voice), file) };
      }
      queue.splice(at++, 0, { id: String(++seq), ...job });
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
      queue.push({ id: String(++seq), voice, lang, number: { kind, n }, prep: true, text: `#${n}${kind === 'wn' ? ' (و)' : ''}`, out: numberPath(voice, slot) });
      added++;
    }
    return kick(added);
  }

  // Fresh start: drop all waiting and running work and stop the worker
  function clear() {
    queue.length = 0;
    failed.length = 0;
    current = null;            // so the worker's exit doesn't put it back in the queue
    paused = false;
    stop();
    emitter.emit('status');
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
    try { fs.unlinkSync(takePath(voice, { lang, text: key })); } catch {}
    emitter.emit('change');
    return true;
  }

  // A phrase typed by mistake: delete it from every voice (recording, new take, flag) and from
  // the queue. → { removed: number of voices it was removed from, dropped: queued jobs dropped }
  function removeEverywhere(lang, text) {
    lang = lang === 'ar' ? 'ar' : 'en';
    const key = clipKey(text);
    if (!key) return { removed: 0, dropped: 0 };
    let removed = 0;
    const voices = fs.existsSync(voiceDir) ? fs.readdirSync(voiceDir, { withFileTypes: true }) : [];
    for (const d of voices) {
      if (!d.isDirectory() || !validVoice(d.name)) continue;
      if (remove(lang, key, d.name)) removed++;
      setFlag(d.name, [{ lang, text: key }], false);
    }
    const before = queue.length;
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].lang === lang && queue[i].key === key) queue.splice(i, 1);
    let dropped = before - queue.length;
    if (current && current.lang === lang && current.key === key) { current.dropped = true; dropped++; }
    if (dropped) emitter.emit('status');
    return { removed, dropped };
  }

  // Every clip a voice has, for listening through: numbers (315) and phrases, each with
  // whether a new take is waiting and whether it's flagged.
  function listClips(voice) {
    if (!validVoice(voice)) throw new Error('Invalid voice name');
    const flags = readFlags(voice);
    const take = (item) => fs.existsSync(takePath(voice, item));
    const numbers = NUMBER_SLOTS.map(([lang, kind, n]) => {
      const item = { lang, kind, n };
      return {
        ...item,
        recorded: hasNumber(voice, [lang, kind, n]),
        edited: voice === SHIPPED_VOICE && fs.existsSync(numberPath(voice, [lang, kind, n])),   // replaces the shipped clip
        take: take(item),
        flagged: flags.has(clipId(item)),
      };
    });
    const m = readManifest(voice);
    const phrases = ['ar', 'en'].flatMap(lang => Object.entries(m[lang] || {}).map(([text, file]) => {
      const item = { lang, text };
      return { ...item, file, take: take(item), flagged: flags.has(clipId(item)) };
    }));
    return { voice, numbers, phrases };
  }

  // keep: 'new' → the new take replaces the clip in use (and the "sounds bad" flag is cleared);
  // 'old' → the new take is thrown away.
  function keepTake(voice, item, keep) {
    if (!validVoice(voice)) return false;
    const slot = item.kind ? asNumber(item) : null;
    if (item.kind && !slot) return false;
    const from = takePath(voice, item);
    if (!fs.existsSync(from)) return false;
    if (keep === 'new') {
      let to;
      if (slot) {
        to = numberPath(voice, slot);
      } else {
        const lang = item.lang === 'ar' ? 'ar' : 'en';
        const key = clipKey(item.text);
        const m = readManifest(voice);
        const file = m[lang]?.[key] || clipFile(lang, key);
        if (!m[lang]?.[key]) { (m[lang] ||= {})[key] = file; writeManifest(voice, m); }
        to = path.join(dirOf(voice), path.basename(file));
      }
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.renameSync(from, to);
      setFlag(voice, [item], false);
    } else {
      fs.unlinkSync(from);
    }
    emitter.emit('change');
    return true;
  }

  // Sarah only: drop a re-recorded number so the clip shipped with the app is used again
  function restoreNumber(voice, item) {
    const slot = asNumber(item);
    if (voice !== SHIPPED_VOICE || !slot) return false;
    try { fs.unlinkSync(numberPath(voice, slot)); } catch { return false; }
    emitter.emit('change');
    return true;
  }

  function setFlag(voice, items, flagged) {
    if (!validVoice(voice)) return 0;
    const flags = readFlags(voice);
    let changed = 0;
    for (const item of items) {
      const id = clipId(item);
      if (!id || flags.has(id) === !!flagged) continue;
      if (flagged) flags.add(id); else flags.delete(id);
      changed++;
    }
    if (changed) writeFlags(voice, flags);
    return changed;
  }

  return Object.assign(emitter, {
    status, enqueue, enqueueNumbers, remove, removeEverywhere, clear, pause, resume, stop, readManifest, numberCount, installed,
    listClips, keepTake, restoreNumber, setFlag, numberPath,
  });
}

module.exports = { createEngine, clipKey, clipFile, validVoice, NUMBER_SLOTS, SHIPPED_VOICE, DEFAULT_ENGINE_DIR, HERE };
