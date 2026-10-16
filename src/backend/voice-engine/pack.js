// Backup & move: voices and the voice engine as single files, so a new school's server gets
// them without the 5 GB download and hours of voice preparation.
//
//   *.schoolq-voices   tar: pack.json + <Voice>/ folders (recordings, manifest, flags — no pending takes)
//   *.schoolq-engine   tar: VoiceEngine/{python,uv,venv,model,hf-cache} + VoiceEngine/schoolq-engine.json
//                      (download caches are left out). The engine is self-contained; only the
//                      venv's pyvenv.cfg holds an absolute path, which import rewrites.
// Uses Windows' own tar.exe (bsdtar), which handles multi-GB archives and refuses unsafe paths.
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { validVoice, NUMBER_SLOTS, SHIPPED_VOICE } = require('./engine');

const TAR = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'tar.exe') : 'tar';
const ENGINE_PARTS = ['python', 'uv', 'venv', 'model', 'hf-cache'];

function runTar(args, { input, output } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(TAR, args, { windowsHide: true, stdio: [input ? 'pipe' : 'ignore', output ? 'pipe' : 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    if (input) input.pipe(p.stdin);
    if (output) p.stdout.pipe(output);
    p.on('error', reject);
    p.on('close', (code) => (code ? reject(new Error(err.trim() || `tar exited with ${code}`)) : resolve()));
  });
}

// ── Voices ───────────────────────────────────────────────────────────────────

function describeVoice(dir, name) {
  let phrases = 0;
  try { phrases = Object.values(JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))).reduce((n, m) => n + Object.keys(m || {}).length, 0); } catch {}
  const numbers = NUMBER_SLOTS.filter(([l, k, n]) => fs.existsSync(path.join(dir, l, k, `${n}.ogg`))).length;
  return { name, phrases, numbers: name === SHIPPED_VOICE ? NUMBER_SLOTS.length : numbers };
}

// Streams a .schoolq-voices archive of the given voices to `output` (a writable stream)
async function exportVoices(voiceDir, voices, output, { appVersion } = {}) {
  const names = voices.filter(v => validVoice(v) && fs.existsSync(path.join(voiceDir, v)));
  if (!names.length) throw new Error('None of these voices has recordings on this PC');
  const meta = fs.mkdtempSync(path.join(voiceDir, '.export-'));
  try {
    fs.writeFileSync(path.join(meta, 'pack.json'), JSON.stringify({
      kind: 'schoolq-voices', version: 1, appVersion: appVersion || null, exportedAt: new Date().toISOString(),
      voices: names.map(n => describeVoice(path.join(voiceDir, n), n)),
    }, null, 2));
    await runTar(['-c', '-f', '-', '--exclude', '*/takes', '-C', meta, 'pack.json', '-C', voiceDir, ...names], { output });
  } finally {
    fs.rmSync(meta, { recursive: true, force: true });
  }
}

// Step 1 of an import: unpack into a staging folder next to the voices (same disk, so step 2
// is a rename). → { id, voices: [{ name, phrases, numbers, exists }] }
async function stageVoices(voiceDir, input) {
  fs.mkdirSync(voiceDir, { recursive: true });
  const id = crypto.randomBytes(6).toString('hex');
  const dir = path.join(voiceDir, `.import-${id}`);
  fs.mkdirSync(dir);
  try {
    await runTar(['-x', '-f', '-', '-C', dir], { input });
    const pack = JSON.parse(fs.readFileSync(path.join(dir, 'pack.json'), 'utf8'));
    if (pack.kind !== 'schoolq-voices') throw new Error('not a voices file');
    const voices = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory() && validVoice(e.name))
      .map(e => ({ ...describeVoice(path.join(dir, e.name), e.name), exists: fs.existsSync(path.join(voiceDir, e.name)) }));
    if (!voices.length) throw new Error('no voices inside');
    return { id, voices };
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error(`This is not a SchoolQ voices file (${err.message})`);
  }
}

// Step 2: the chosen voices replace the same voices on this PC; others are kept.
function applyVoices(voiceDir, id, names) {
  if (!/^[0-9a-f]{12}$/.test(id)) throw new Error('Unknown import');
  const dir = path.join(voiceDir, `.import-${id}`);
  if (!fs.existsSync(dir)) throw new Error('This import has expired — choose the file again');
  const done = [];
  for (const name of names) {
    if (!validVoice(name) || !fs.existsSync(path.join(dir, name))) continue;
    const target = path.join(voiceDir, name);
    const old = path.join(voiceDir, `.old-${name}-${id}`);
    if (fs.existsSync(target)) fs.renameSync(target, old);
    fs.renameSync(path.join(dir, name), target);
    fs.rmSync(old, { recursive: true, force: true });
    done.push(name);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return done;
}

// Staged imports nobody finished (older than maxAgeMs)
function cleanStaged(voiceDir, maxAgeMs = 30 * 60 * 1000) {
  try {
    for (const e of fs.readdirSync(voiceDir, { withFileTypes: true })) {
      if (!e.isDirectory() || !/^\.(import|export)-/.test(e.name)) continue;
      const p = path.join(voiceDir, e.name);
      if (Date.now() - fs.statSync(p).mtimeMs > maxAgeMs) fs.rmSync(p, { recursive: true, force: true });
    }
  } catch {}
}

// ── Engine ───────────────────────────────────────────────────────────────────

function dirSize(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += dirSize(p);
    else if (e.isFile()) total += fs.statSync(p).size;
  }
  return total;
}

function engineFlavor(engineDir) {
  try {
    const site = path.join(engineDir, 'venv', 'Lib', 'site-packages');
    const torch = fs.readdirSync(site).find(f => /^torch-.*\.dist-info$/.test(f));
    return /\+cu\d+/.test(torch || '') ? 'gpu' : 'cpu';
  } catch { return 'unknown'; }
}

// Writes the engine to `file`. onProgress(fraction 0..1) while writing.
async function exportEngine(engineDir, file, { onProgress, appVersion } = {}) {
  const parts = ENGINE_PARTS.filter(p => fs.existsSync(path.join(engineDir, p)));
  if (!parts.includes('venv') || !parts.includes('model')) throw new Error('The voice engine is not installed on this PC');
  const name = path.basename(engineDir);
  fs.writeFileSync(path.join(engineDir, 'schoolq-engine.json'), JSON.stringify({
    kind: 'schoolq-engine', version: 1, appVersion: appVersion || null, exportedAt: new Date().toISOString(),
    flavor: engineFlavor(engineDir), sourceDir: engineDir,
  }, null, 2));
  const total = parts.reduce((n, p) => n + dirSize(path.join(engineDir, p)), 0) || 1;
  const timer = onProgress && setInterval(() => {
    try { onProgress(Math.min(0.99, fs.statSync(file).size / total)); } catch {}
  }, 500);
  try {
    await runTar(['-c', '-f', file, '-C', path.dirname(engineDir), `${name}/schoolq-engine.json`, ...parts.map(p => `${name}/${p}`)]);
  } catch (err) {
    fs.rmSync(file, { force: true });
    if (/too large|EFBIG|File size limit/i.test(err.message)) {
      throw new Error('This drive cannot hold files over 4 GB (FAT32). Use an external disk, or a USB drive formatted exFAT or NTFS.');
    }
    if (/No space|ENOSPC/i.test(err.message)) throw new Error('Not enough free space on that drive (about 8 GB needed)');
    throw err;
  } finally {
    clearInterval(timer);
  }
  onProgress?.(1);
  return { bytes: fs.statSync(file).size };
}

// Unpacks an engine file into engineDir (which must not exist yet) and points the Python
// environment at its new location.
async function importEngine(file, engineDir, { onProgress } = {}) {
  if (fs.existsSync(path.join(engineDir, 'venv'))) throw new Error('A voice engine is already installed on this PC');
  const parent = path.dirname(engineDir);
  fs.mkdirSync(parent, { recursive: true });
  const stage = fs.mkdtempSync(path.join(parent, '.engine-import-'));
  const total = fs.statSync(file).size || 1;
  const timer = onProgress && setInterval(() => {
    try { onProgress(Math.min(0.99, dirSize(stage) / total)); } catch {}
  }, 1500);
  try {
    await runTar(['-x', '-f', file, '-C', stage]);
    const top = fs.readdirSync(stage).find(n => fs.existsSync(path.join(stage, n, 'schoolq-engine.json')));
    if (!top) throw new Error('This is not a SchoolQ engine file');
    const info = JSON.parse(fs.readFileSync(path.join(stage, top, 'schoolq-engine.json'), 'utf8'));
    if (info.kind !== 'schoolq-engine') throw new Error('This is not a SchoolQ engine file');
    if (fs.existsSync(engineDir)) fs.rmSync(engineDir, { recursive: true, force: true });   // leftovers without a venv
    fs.renameSync(path.join(stage, top), engineDir);
    // pyvenv.cfg: "home = <old engine dir>\python\cpython-…" → this PC's engine dir
    const cfg = path.join(engineDir, 'venv', 'pyvenv.cfg');
    if (fs.existsSync(cfg)) {
      const text = fs.readFileSync(cfg, 'utf8').replace(/^(home\s*=\s*).*?([\\/]python[\\/][^\r\n]*)$/m, (m, key, rest) => `${key}${engineDir}${rest}`);
      fs.writeFileSync(cfg, text);
    }
    onProgress?.(1);
    return info;
  } finally {
    clearInterval(timer);
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

module.exports = { exportVoices, stageVoices, applyVoices, cleanStaged, exportEngine, importEngine, engineFlavor, TAR };
