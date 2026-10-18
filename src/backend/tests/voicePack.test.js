// Backup & move: voices and the voice engine as files (real tar.exe, scratch folders).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { exportVoices, stageVoices, applyVoices, exportEngine, importEngine, engineFlavor } = require('../voice-engine/pack');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pack-'));
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const read = (file) => fs.readFileSync(file, 'utf8');

async function toFile(fn, file) {
  const out = fs.createWriteStream(file);
  await fn(out);
  await new Promise(r => out.end(r));
}

function makeVoices(dir) {
  write(path.join(dir, 'Sarah', 'manifest.json'), JSON.stringify({ ar: { 'القسم': 'ar-1.ogg' }, en: { Hello: 'en-1.ogg' } }));
  write(path.join(dir, 'Sarah', 'ar-1.ogg'), 'sarah-ar');
  write(path.join(dir, 'Sarah', 'takes', 'ar-1.ogg'), 'pending take');
  write(path.join(dir, 'Esraa', 'manifest.json'), JSON.stringify({ en: { Hello: 'en-1.ogg' } }));
  write(path.join(dir, 'Esraa', 'en-1.ogg'), 'esraa-en');
  write(path.join(dir, 'Esraa', 'en', 'n', '7.ogg'), 'esraa-7');
  write(path.join(dir, 'Esraa', 'flags.json'), '["n:en/n/7"]');
}

test('voices: export → import on another PC, choosing which voices (merge)', async () => {
  const from = tmp(); const to = tmp(); const file = path.join(tmp(), 'v.schoolq-voices');
  makeVoices(from);
  await toFile(out => exportVoices(from, ['Sarah', 'Esraa', 'Nobody', '../etc'], out, { appVersion: '1.13.0' }), file);

  // the other PC already has its own Sarah and a voice that isn't in the file
  write(path.join(to, 'Sarah', 'manifest.json'), '{"en":{"Old":"x.ogg"}}');
  write(path.join(to, 'Omnia', 'manifest.json'), '{}');
  const staged = await stageVoices(to, fs.createReadStream(file));
  expect(staged.voices).toEqual(expect.arrayContaining([
    { name: 'Sarah', phrases: 2, numbers: 315, exists: true },
    { name: 'Esraa', phrases: 1, numbers: 1, exists: false },
  ]));
  expect(staged.voices).toHaveLength(2);

  expect(applyVoices(to, staged.id, ['Esraa'])).toEqual(['Esraa']);
  expect(read(path.join(to, 'Esraa', 'en', 'n', '7.ogg'))).toBe('esraa-7');
  expect(read(path.join(to, 'Esraa', 'flags.json'))).toBe('["n:en/n/7"]');
  expect(read(path.join(to, 'Sarah', 'manifest.json'))).toBe('{"en":{"Old":"x.ogg"}}');   // not chosen → kept
  expect(fs.existsSync(path.join(to, 'Omnia'))).toBe(true);
  expect(fs.readdirSync(to).filter(n => n.startsWith('.'))).toEqual([]);                    // staging cleaned up
  expect(() => applyVoices(to, staged.id, ['Sarah'])).toThrow(/expired/);
});

test('voices: an imported voice replaces the same voice; pending takes are not exported', async () => {
  const from = tmp(); const to = tmp(); const file = path.join(tmp(), 'v.schoolq-voices');
  makeVoices(from);
  await toFile(out => exportVoices(from, ['Sarah'], out), file);
  write(path.join(to, 'Sarah', 'manifest.json'), '{"en":{"Old":"x.ogg"}}');
  write(path.join(to, 'Sarah', 'x.ogg'), 'old');
  const staged = await stageVoices(to, fs.createReadStream(file));
  applyVoices(to, staged.id, ['Sarah']);
  expect(read(path.join(to, 'Sarah', 'ar-1.ogg'))).toBe('sarah-ar');
  expect(fs.existsSync(path.join(to, 'Sarah', 'x.ogg'))).toBe(false);
  expect(fs.existsSync(path.join(to, 'Sarah', 'takes'))).toBe(false);
});

test('voices: the school setup travels in the file and can be read before the import is applied', async () => {
  const { stagedSetup } = require('../voice-engine/pack');
  const from = tmp(); const to = tmp(); const file = path.join(tmp(), 'v.schoolq-voices');
  makeVoices(from);
  const setup = { callWording: { call_template_ar: 'تنبيه من فضلك' }, departments: [{ name: 'الحسابات', code: 'ACC', services: [] }] };
  await toFile(out => exportVoices(from, ['Sarah'], out, { appVersion: '1.14.0', setup }), file);
  const staged = await stageVoices(to, fs.createReadStream(file));
  expect(staged.setup).toEqual(setup);
  expect(stagedSetup(to, staged.id)).toEqual(setup);
  expect(stagedSetup(to, '../../etc')).toBeNull();
  applyVoices(to, staged.id, ['Sarah']);
  expect(stagedSetup(to, staged.id)).toBeNull();   // folder gone after the import

  // a file without setup (older SchoolQ, or nothing ticked)
  const plain = path.join(tmp(), 'p.schoolq-voices');
  await toFile(out => exportVoices(from, ['Sarah'], out, { setup: {} }), plain);
  expect((await stageVoices(tmp(), fs.createReadStream(plain))).setup).toBeNull();
});

test('voices: a file that is not a voices pack is refused', async () => {
  const to = tmp(); const bad = path.join(tmp(), 'bad.schoolq-voices');
  write(bad, 'definitely not a tar file');
  await expect(stageVoices(to, fs.createReadStream(bad))).rejects.toThrow(/not a SchoolQ voices file/);
  expect(fs.readdirSync(to)).toEqual([]);
  await expect(exportVoices(tmp(), ['Sarah'], fs.createWriteStream(path.join(tmp(), 'x')))).rejects.toThrow(/None of these voices/);
});

function makeEngine(dir) {
  write(path.join(dir, 'python', 'cpython-3.10.18-windows-x86_64-none', 'python.exe'), 'py');
  write(path.join(dir, 'uv', 'uv.exe'), 'uv');
  write(path.join(dir, 'venv', 'pyvenv.cfg'), `home = ${dir}\\python\\cpython-3.10.18-windows-x86_64-none\r\nimplementation = CPython\r\nversion_info = 3.10.18\r\n`);
  write(path.join(dir, 'venv', 'Lib', 'site-packages', 'torch-2.7.1+cu126.dist-info', 'METADATA'), 'm');
  write(path.join(dir, 'model', 'model.safetensors'), 'weights'.repeat(1000));
  write(path.join(dir, 'hf-cache', 'x'), 'h');
  write(path.join(dir, 'downloads', 'torch.whl'), 'big download');   // left out
  write(path.join(dir, 'cache', 'uv-cache'), 'cache');                // left out
}

test('engine: export → import elsewhere; Python environment points at the new place', async () => {
  const src = path.join(tmp(), 'VoiceEngine'); const file = path.join(tmp(), 'e.schoolq-engine');
  makeEngine(src);
  expect(engineFlavor(src)).toBe('gpu');
  const progress = [];
  await exportEngine(src, file, { onProgress: p => progress.push(p), appVersion: '1.13.0' });
  expect(progress.at(-1)).toBe(1);

  const dest = path.join(tmp(), 'SchoolQ', 'VoiceEngine');
  const info = await importEngine(file, dest);
  expect(info).toMatchObject({ kind: 'schoolq-engine', flavor: 'gpu', appVersion: '1.13.0' });
  expect(read(path.join(dest, 'model', 'model.safetensors'))).toBe('weights'.repeat(1000));
  expect(read(path.join(dest, 'venv', 'pyvenv.cfg'))).toMatch(new RegExp(`^home = ${dest.replace(/\\/g, '\\\\')}\\\\python\\\\cpython-3\\.10\\.18-windows-x86_64-none\\r?$`, 'm'));
  expect(fs.existsSync(path.join(dest, 'downloads'))).toBe(false);
  expect(fs.existsSync(path.join(dest, 'cache'))).toBe(false);
  expect(fs.readdirSync(path.dirname(dest))).toEqual(['VoiceEngine']);   // staging cleaned up

  await expect(importEngine(file, dest)).rejects.toThrow(/already installed/);
});

test('engine: refuses to export what is not installed, or import a wrong file', async () => {
  await expect(exportEngine(path.join(tmp(), 'VoiceEngine'), path.join(tmp(), 'x'))).rejects.toThrow(/not installed/);
  const voicesFile = path.join(tmp(), 'v.schoolq-voices'); const from = tmp();
  makeVoices(from);
  await toFile(out => exportVoices(from, ['Sarah'], out), voicesFile);
  const dest = path.join(tmp(), 'VoiceEngine');
  await expect(importEngine(voicesFile, dest)).rejects.toThrow(/not a SchoolQ engine file/);
  expect(fs.existsSync(dest)).toBe(false);
});
