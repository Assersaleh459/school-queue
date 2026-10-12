const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path   = require('path');
const fs     = require('fs');
const net    = require('net');
const os     = require('os');
const http   = require('http');
const crypto = require('crypto');
const license = require('./license');

Menu.setApplicationMenu(null);

// Server and Staff share one codebase. Pick the app name from the bundled build
// marker so each build gets its own data dir and the two can run side by side on
// one machine (Server keeps the 'SchoolQ' dir + its DB).
const buildRole = getBuildMode(); // 'server' | 'client' | null (dev)
app.setName(buildRole === 'client' ? 'SchoolQ Staff' : 'SchoolQ');

// Display screen plays call/recall announcements without a click, so allow
// audio to autoplay without a user gesture.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Stop Chromium from capturing the hardware Media Play/Pause key for its own
// TTS audio. Otherwise the key we send to pause background music is grabbed by
// Chromium (pausing our announcement) instead of reaching the music app. With
// this disabled, the key flows through to Spotify/YouTube/etc. and our TTS —
// which no longer registers a media session — plays unaffected.
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService');

// Single-instance lock applies to the SERVER build only. Two Server copies would
// each start a server on a different port (3000, 3001, …) sharing one database —
// polling still works, but live socket events (ticket calls/recalls) only reach
// the instance that emitted them, breaking real-time announcements. A second
// Server launch focuses the existing window. Staff (client) builds are exempt —
// multiple staff windows on one machine are fine (they just connect to the server).
const gotInstanceLock = buildRole === 'client' ? true : app.requestSingleInstanceLock();
if (!gotInstanceLock) app.quit();

let mainWindow;
const configPath = path.join(app.getPath('userData'), 'config.json');

// Path to the media-key PowerShell script (written once at startup)
let mediaKeyScript = null;

// ── Config helpers ────────────────────────────────────────────────────────────

function getConfig() {
  try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
  catch { return null; }
}

function getBuildMode() {
  try {
    const p = app.isPackaged
      ? path.join(process.resourcesPath, 'build-mode.json')
      : null;
    if (p && fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')).forcedMode || null;
  } catch {}
  return null;
}

function saveConfig(config) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function getLocalIPs() {
  const ips = [];
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) ips.push(addr.address);
    }
  }
  return ips;
}

// ── IPC ───────────────────────────────────────────────────────────────────────

ipcMain.on('get-config',     (e)       => { e.returnValue = getConfig(); });
ipcMain.on('save-config',    (e, cfg)  => { saveConfig(cfg); e.returnValue = true; });
ipcMain.on('get-local-ips',  (e)       => { e.returnValue = getLocalIPs(); });
ipcMain.on('get-build-mode', (e)       => { e.returnValue = getBuildMode(); });
ipcMain.on('relaunch',       ()        => { app.relaunch(); app.exit(0); });

// License activation (Server build)
ipcMain.on('license-status', (e) => {
  e.returnValue = { ...license.checkActivated(app.getPath('userData')), machineId: license.machineId() };
});
ipcMain.handle('activate-license', (e, key) => license.activate(app.getPath('userData'), key));

// Send Media Play/Pause key — pauses/resumes whatever audio app is playing
ipcMain.handle('media-play-pause', () => new Promise(resolve => {
  if (!mediaKeyScript) return resolve();
  const { execFile } = require('child_process');
  execFile('powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', mediaKeyScript],
    { windowsHide: true },
    () => resolve()
  );
}));

// ── Backups / Restore ─────────────────────────────────────────────────────────

function backupsDir() {
  const dir = path.join(app.getPath('userData'), 'backups');
  try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch {}
  return dir;
}

ipcMain.handle('open-backups', () => shell.openPath(backupsDir()));

// Pick a .db backup, stage it, and relaunch. The staged file is swapped in on the
// next startup (in startLocalServer) before the database is opened.
ipcMain.handle('restore-database', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Restore SchoolQ backup',
    defaultPath: backupsDir(),
    filters: [{ name: 'SchoolQ Backup', extensions: ['db'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths[0]) return { ok: false };

  const confirm = dialog.showMessageBoxSync({
    type: 'warning',
    buttons: ['Restore & Restart', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'Restore Database',
    message: 'Replace the current data with this backup?',
    detail: 'The app will restart. Current data will be overwritten by the selected backup.',
  });
  if (confirm !== 0) return { ok: false };

  try {
    fs.copyFileSync(filePaths[0], path.join(app.getPath('userData'), 'restore-pending.db'));
    app.relaunch();
    app.exit(0);
    return { ok: true };
  } catch (err) {
    dialog.showErrorBox('Restore Failed', err.message);
    return { ok: false };
  }
});

ipcMain.handle('test-server', (e, ip, port = 3000) => new Promise(resolve => {
  const req = http.get(
    { host: ip, port: parseInt(port) || 3000, path: '/api/settings/public', timeout: 5000 },
    res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { JSON.parse(data); resolve({ ok: true }); } catch { resolve({ ok: false }); } });
    }
  );
  req.on('error', () => resolve({ ok: false }));
  req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
}));

// ── Network helpers ───────────────────────────────────────────────────────────

function isPortListening(port, host = '127.0.0.1') {
  return new Promise(resolve => {
    const s = new net.Socket();
    s.connect(port, host, () => { s.destroy(); resolve(true); });
    s.on('error', () => { s.destroy(); resolve(false); });
  });
}

function waitForServer(port, host, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const try_ = () => {
      if (Date.now() > deadline) {
        reject(new Error(`Cannot reach ${host}:${port} after ${timeoutMs / 1000}s`));
        return;
      }
      const s = new net.Socket();
      s.connect(port, host, () => { s.destroy(); resolve(); });
      s.on('error', () => { s.destroy(); setTimeout(try_, 500); });
    };
    try_();
  });
}

// ── Server startup (server-mode only) ────────────────────────────────────────

async function startLocalServer() {
  // Dev mode: if something is already on port 3000 assume it's the dev server
  if (!app.isPackaged && await isPortListening(3000)) return;

  const dbPath = path.join(app.getPath('userData'), 'school-queue.db');

  // If a restore was staged, swap it in before the database is opened.
  const pending = path.join(app.getPath('userData'), 'restore-pending.db');
  if (fs.existsSync(pending)) {
    try {
      for (const ext of ['-wal', '-shm']) {
        const f = dbPath + ext;
        if (fs.existsSync(f)) fs.unlinkSync(f);
      }
      fs.copyFileSync(pending, dbPath);
      fs.unlinkSync(pending);
    } catch (err) {
      dialog.showErrorBox('Restore Failed', `Could not restore the backup:\n\n${err.message}`);
    }
  }

  process.env.DB_PATH  = dbPath;
  process.env.PORT     = '3000';
  process.env.NODE_ENV = 'production';

  const secretPath = path.join(app.getPath('userData'), 'jwt-secret.txt');
  if (!fs.existsSync(secretPath)) {
    fs.writeFileSync(secretPath, crypto.randomBytes(64).toString('hex'), 'utf8');
  }
  process.env.JWT_SECRET = fs.readFileSync(secretPath, 'utf8').trim();

  require(path.join(__dirname, '../src/backend/server.js'));
}

// Poll until server.js sets ACTUAL_PORT and the port is reachable
function waitForActualServer(timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      const port = process.env.ACTUAL_PORT ? parseInt(process.env.ACTUAL_PORT) : null;
      if (port && !isNaN(port)) { resolve(port); return; }
      if (Date.now() > deadline) { reject(new Error('Server did not start within 30 seconds')); return; }
      setTimeout(check, 200);
    };
    check();
  });
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800,
    minWidth: 1024, minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // Display plays call/recall announcements from socket events (no click),
      // so audio must be allowed to start without a user gesture. The per-window
      // setting is authoritative — the command-line switch alone is overridden here.
      autoplayPolicy: 'no-user-gesture-required'
    },
    show: false,
  });

  mainWindow.loadURL(url);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

function fatal(title, detail) {
  dialog.showErrorBox(title, detail);
  app.quit();
}

process.on('uncaughtException', (err) => {
  fatal('SchoolQ — Startup Error', `An unexpected error occurred:\n\n${err.message}\n\n${err.stack || ''}`);
});

// A second launch focuses the existing window instead of starting a new server.
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('ready', async () => {
  if (!gotInstanceLock) return; // second instance is quitting — do not start a server
  const buildMode = getBuildMode();
  const config    = getConfig();

  // License gate — the Server build must be activated before it runs. The Staff
  // (client) build and dev mode are exempt.
  if (app.isPackaged && buildMode === 'server' && !license.checkActivated(app.getPath('userData')).ok) {
    createWindow(`file://${path.join(__dirname, 'activation.html')}`);
    return;
  }

  // Write the media-key script to userData so it persists between launches
  try {
    mediaKeyScript = path.join(app.getPath('userData'), 'media-key.ps1');
    fs.writeFileSync(mediaKeyScript,
      'Add-Type -MemberDefinition \'[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);\' -Name U32 -Namespace Win32 -PassThru | Out-Null\r\n' +
      '[Win32.U32]::keybd_event(0xB3, 0, 0, 0)\r\n' +
      '[Win32.U32]::keybd_event(0xB3, 0, 2, 0)\r\n',
      'utf8'
    );
  } catch { mediaKeyScript = null; }

  try {
    if (buildMode === 'server') {
      await startLocalServer();
      const port = await waitForActualServer(30000);
      createWindow(`http://localhost:${port}`);
      return;
    }

    if (!config) {
      createWindow(`file://${path.join(__dirname, 'setup.html')}`);
      return;
    }

    if (config.mode === 'server') {
      await startLocalServer();
      const port = await waitForActualServer(30000);
      createWindow(`http://localhost:${port}`);
    } else {
      let url;
      try { url = new URL(config.serverUrl); }
      catch { url = new URL('http://localhost:3000'); }

      try {
        await waitForServer(parseInt(url.port) || 3000, url.hostname, 20000);
        createWindow(config.serverUrl);
      } catch {
        dialog.showErrorBox(
          'Cannot Connect to Server',
          `SchoolQ could not reach the server at:\n${config.serverUrl}\n\nMake sure the server machine is on and SchoolQ Server is running there, then restart this app.`
        );
        createWindow(`file://${path.join(__dirname, 'setup.html')}`);
      }
    }
  } catch (err) {
    fatal(
      'SchoolQ — Failed to Start',
      `SchoolQ could not start the server.\n\nError: ${err.message}\n\n${err.stack || ''}\n\nTry restarting the app. If the problem persists, contact support.`
    );
  }
});

app.on('window-all-closed', () => app.quit());
