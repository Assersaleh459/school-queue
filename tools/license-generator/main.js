// SchoolQ License Generator — SELLER ONLY (Vyra Systems). Never give this app to a school.
// Mints signed license keys with the private key file you pick on first run. The key is read
// from that file each time a license is made; it is never copied into the app or the history.
const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { mintKey, verifyKey, matchesPublicKey, hashVoicePass, MAX_GRACE_DAYS } = require('../../electron/license');

// Own data folder (%APPDATA%\SchoolQ License Generator) — never the SchoolQ server's.
// SCHOOLQ_GEN_DATA: tests point it at a scratch folder.
app.setName('SchoolQ License Generator');
if (process.env.SCHOOLQ_GEN_DATA) app.setPath('userData', process.env.SCHOOLQ_GEN_DATA);

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const historyFile = () => path.join(app.getPath('userData'), 'history.json');
const readJson = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; } };
const writeJson = (f, data) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(f + '.tmp', f);
};

function keyState() {
  const { keyPath } = readJson(settingsFile(), {});
  if (!keyPath) return { keyPath: null, keyOk: false, reason: 'No signing key selected yet' };
  try {
    const ok = matchesPublicKey(fs.readFileSync(keyPath, 'utf8'));
    return { keyPath, keyOk: ok, reason: ok ? null : 'This key does not match SchoolQ (wrong .pem file)' };
  } catch {
    return { keyPath, keyOk: false, reason: 'Signing key file not found — is the USB stick plugged in?' };
  }
}

// Installed: the generator's own version (config/eb-generator.json); from source: "dev"
ipcMain.handle('gen:state', () => ({ ...keyState(), version: app.isPackaged ? app.getVersion() : 'dev' }));

ipcMain.handle('gen:pickKey', async (e) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
    title: 'Select license-private.pem',
    filters: [{ name: 'Private key', extensions: ['pem'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths[0]) return keyState();
  let ok = false;
  try { ok = matchesPublicKey(fs.readFileSync(filePaths[0], 'utf8')); } catch {}
  if (!ok) return { ...keyState(), pickError: 'That file is not the SchoolQ signing key.' };
  writeJson(settingsFile(), { ...readJson(settingsFile(), {}), keyPath: filePaths[0] });
  return keyState();
});

// Local date (YYYY-MM-DD) — the school sees dates in its own time zone
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MACHINE = /^[0-9a-f]{32}$/;

// form: { school, machine, devices (number|null = unlimited), expires (YYYY-MM-DD|null), grace (days), voicePass, wipePass, notes }
ipcMain.handle('gen:mint', (e, form) => {
  const st = keyState();
  if (!st.keyOk) return { error: st.reason };
  const school = String(form.school || '').trim();
  const machine = String(form.machine || '').trim().toLowerCase();
  const devices = form.devices == null ? null : Number(form.devices);
  const expires = form.expires || null;
  const grace = expires && form.grace !== '' && form.grace != null ? Number(form.grace) : 0;
  const voicePass = String(form.voicePass || '');
  const wipePass = String(form.wipePass || '');
  if (!school) return { error: 'Enter the school name' };
  if (!MACHINE.test(machine)) return { error: 'The Machine ID is 32 characters (0-9, a-f) — copy it from the school\'s activation screen' };
  if (devices !== null && !(Number.isInteger(devices) && devices >= 1 && devices <= 999)) return { error: 'Staff devices must be a whole number from 1 to 999' };
  if (expires && (!DATE.test(expires) || expires <= today())) return { error: 'The expiry date must be in the future' };
  if (!(Number.isInteger(grace) && grace >= 0 && grace <= MAX_GRACE_DAYS)) return { error: `The grace period must be a whole number of days from 0 to ${MAX_GRACE_DAYS}` };
  if (voicePass && voicePass.length < 6) return { error: 'The Voice Recordings password needs at least 6 characters' };
  if (wipePass && wipePass.length < 6) return { error: 'The Fresh Start password needs at least 6 characters' };
  if (wipePass && wipePass === voicePass) return { error: 'The Fresh Start password must be different from the Voice Recordings password' };

  const payload = {
    v: 2,
    id: crypto.randomBytes(4).toString('hex').toUpperCase(),
    type: expires ? 'subscription' : 'perpetual',
    school,
    issued: today(),
    ...(expires && { expires }),
    ...(grace && { grace }),
    ...(devices && { devices }),
    machine,
    ...(voicePass && { voicePass: hashVoicePass(voicePass) }),   // only the hashes go to the school
    ...(wipePass && { wipePass: hashVoicePass(wipePass) }),
  };
  const key = mintKey(payload, fs.readFileSync(st.keyPath, 'utf8'));
  if (!verifyKey(key).valid) return { error: 'The key did not verify — check the signing key file' };

  // History (on this PC only) keeps the readable password, so you can look it up and renew with it
  const { voicePass: _hash, wipePass: _wipeHash, ...rest } = payload;
  const entry = { ...rest, voicePassword: voicePass || null, wipePassword: wipePass || null, notes: String(form.notes || '').trim(), key, createdAt: new Date().toISOString() };
  writeJson(historyFile(), [entry, ...readJson(historyFile(), [])]);
  return { entry };
});

ipcMain.handle('gen:history', () => readJson(historyFile(), []));

ipcMain.handle('gen:copy', (e, text) => { clipboard.writeText(String(text)); return true; });

ipcMain.handle('gen:saveKey', async (e, entry) => {
  const safe = entry.school.replace(/[^\w\- ]+/g, '').trim() || 'license';
  const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
    title: 'Save license key',
    defaultPath: `SchoolQ License - ${safe} - ${entry.id}.txt`,
    filters: [{ name: 'Text', extensions: ['txt'] }],
  });
  if (canceled || !filePath) return false;
  fs.writeFileSync(filePath, [
    `SchoolQ license for ${entry.school}`,
    `License No.: ${entry.id}`,
    `Type: ${entry.type}${entry.expires ? ` (valid until ${entry.expires})` : ''}`,
    ...(entry.expires ? [`Grace after expiry: ${entry.grace ? `${entry.grace} days` : 'none (stops the day after)'}`] : []),
    `Staff devices: ${entry.devices || 'unlimited'}`,
    `Server Machine ID: ${entry.machine}`,
    `Voice Recordings page: ${entry.voicePassword ? 'locked (password from Vyra Systems)' : 'open'}`,
    `Fresh Start: ${entry.wipePassword ? 'on (own password from Vyra Systems)' : 'off'}`,
    '',
    'Paste this key on the SchoolQ Server activation screen (or Admin > License > Renew):',
    '',
    entry.key,
    '',
  ].join('\r\n'), 'utf8');
  return true;
});

ipcMain.handle('gen:exportCsv', async (e) => {
  const rows = readJson(historyFile(), []);
  const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
    title: 'Export license history',
    defaultPath: `SchoolQ licenses ${today()}.csv`,
    filters: [{ name: 'CSV (Excel)', extensions: ['csv'] }],
  });
  if (canceled || !filePath) return false;
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['License No.', 'School', 'Type', 'Issued', 'Expires', 'Grace days', 'Staff devices', 'Machine ID', 'Voice password', 'Fresh Start password', 'Notes', 'Key'];
  const lines = rows.map(r => [r.id, r.school, r.type, r.issued, r.expires || '', r.expires ? (r.grace || 0) : '', r.devices || 'unlimited', r.machine, r.voicePassword || '', r.wipePassword || '', r.notes, r.key].map(cell).join(','));
  fs.writeFileSync(filePath, '﻿' + [head.map(cell).join(','), ...lines].join('\r\n'), 'utf8');   // BOM: Excel reads Arabic names
  return true;
});

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1100, height: 820, minWidth: 900, minHeight: 640,
    title: 'SchoolQ License Generator',
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.js') },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
});

app.on('window-all-closed', () => app.quit());
