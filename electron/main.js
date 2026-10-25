const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path   = require('path');
const fs     = require('fs');
const net    = require('net');
const os     = require('os');
const crypto = require('crypto');
const license = require('./license');
const { clockFor } = require('./trustedClock');
const { discoverServers, testServer, findServer } = require('./discovery');
const { createMediaControl } = require('./mediaControl');
const { createBanner } = require('./banner');

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

// Pauses other apps' media during announcements; banner shown on top of it (display PC)
const media = createMediaControl(app.getPath('userData'));
const banner = createBanner();

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

// License activation (Server build). Expiry is judged on the trusted clock, not the PC date.
const licenseClock = () => clockFor(app.getPath('userData'), license.machineId());
ipcMain.on('license-status', (e) => {
  e.returnValue = { ...license.checkActivated(app.getPath('userData'), { clock: licenseClock() }), machineId: license.machineId() };
});
ipcMain.handle('activate-license', (e, key) => license.activate(app.getPath('userData'), key, { clock: licenseClock() }));
// This PC as a Staff device (same Machine ID the server's license uses)
ipcMain.on('device-info', (e) => { e.returnValue = { id: license.machineId(), name: os.hostname() }; });

// Voice engine as a file (~8 GB) — on the server PC only, since the engine lives on its disk.
// Same Voice Recordings lock as the web API (the page passes its unlock token).
const serverHere = () => !!process.env.ACTUAL_PORT;
const backend = (m) => require(path.join(__dirname, '../src/backend', m));
ipcMain.on('engine-pack-available', (e) => { e.returnValue = serverHere(); });

async function enginePackJob(e, unlockToken, job) {
  if (!serverHere()) return { error: 'Do this on the server PC' };
  if (!backend('voiceLock').tokenOk(unlockToken)) return { error: 'Voice Recordings is locked' };
  const win = BrowserWindow.fromWebContents(e.sender);
  const onProgress = (p) => { if (!e.sender.isDestroyed()) e.sender.send('engine-pack-progress', p); };
  try {
    return await job(win, onProgress);
  } catch (err) {
    return { error: err.message };
  }
}

ipcMain.handle('engine-export', (e, unlockToken) => enginePackJob(e, unlockToken, async (win, onProgress) => {
  const { DEFAULT_ENGINE_DIR } = backend('voice-engine/engine');
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Export the voice engine',
    defaultPath: 'SchoolQ Voice Engine.schoolq-engine',
    filters: [{ name: 'SchoolQ voice engine', extensions: ['schoolq-engine'] }],
  });
  if (canceled || !filePath) return { canceled: true };
  const r = await backend('voice-engine/pack').exportEngine(DEFAULT_ENGINE_DIR, filePath, { onProgress, appVersion: app.getVersion() });
  return { ok: true, file: filePath, bytes: r.bytes };
}));

ipcMain.handle('engine-import', (e, unlockToken) => enginePackJob(e, unlockToken, async (win, onProgress) => {
  const { DEFAULT_ENGINE_DIR } = backend('voice-engine/engine');
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Import a voice engine',
    filters: [{ name: 'SchoolQ voice engine', extensions: ['schoolq-engine'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths[0]) return { canceled: true };
  const info = await backend('voice-engine/pack').importEngine(filePaths[0], DEFAULT_ENGINE_DIR, { onProgress });
  return { ok: true, flavor: info.flavor };
}));

// Media: pause only what is playing, resume only what we paused
ipcMain.handle('media-pause',  () => media.pause());
ipcMain.handle('media-resume', () => media.resume());

// Call banner over other apps, on the same screen as the display window
ipcMain.on('banner-show', (e, data) => {
  const bounds = BrowserWindow.fromWebContents(e.sender)?.getBounds();
  banner.show(data && typeof data === 'object' ? data : {}, bounds);
});
ipcMain.on('banner-hide', () => banner.hide());

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

ipcMain.handle('test-server', (e, ip, port) => testServer(ip, port));
ipcMain.handle('discover-servers', () => discoverServers());

// Staff app, server went away: is it back (maybe on another port)? Returns its URL or null.
ipcMain.handle('find-server', async () => {
  const cfg = getConfig();
  if (!cfg || cfg.mode === 'server' || getBuildMode() === 'server') return null;
  const url = await findServer(cfg.serverUrl, 4000);
  let saved = null;
  try { saved = new URL(cfg.serverUrl).origin; } catch {}
  if (url && url !== saved) saveConfig({ ...cfg, serverUrl: url });
  return url;
});

// ── Network helpers ───────────────────────────────────────────────────────────

function isPortListening(port, host = '127.0.0.1') {
  return new Promise(resolve => {
    const s = new net.Socket();
    s.connect(port, host, () => { s.destroy(); resolve(true); });
    s.on('error', () => { s.destroy(); resolve(false); });
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
      if (process.env.SERVER_START_ERROR) {
        const err = new Error(process.env.SERVER_START_ERROR);
        err.portsBusy = true;
        reject(err);
        return;
      }
      if (Date.now() > deadline) { reject(new Error('Server did not start within 30 seconds')); return; }
      setTimeout(check, 200);
    };
    check();
  });
}

// ── Window ────────────────────────────────────────────────────────────────────

// True once the app is really quitting (menu, error, Windows shutdown, or the user said "Stop").
// The Server window's close button asks first, but must never block a real quit.
let quitting = false;
app.on('before-quit', () => { quitting = true; });

// reconnectOnFail: Staff window on a remote server. If the page can't load (server off or
// moved), show the "looking for the server" page instead of Chromium's error page.
// confirmClose: Server window. Closing it stops the server for the whole school, so ask first.
function createWindow(url, { reconnectOnFail = false, confirmClose = false } = {}) {
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

  if (reconnectOnFail) {
    mainWindow.webContents.on('did-fail-load', (e, code, desc, failedUrl, isMainFrame) => {
      if (!isMainFrame || code === -3 || !/^https?:/.test(failedUrl)) return;   // -3 = load cancelled
      mainWindow.loadFile(path.join(__dirname, 'reconnect.html'));
      if (!mainWindow.isVisible()) mainWindow.show();
    });
  }

  if (confirmClose) {
    let asking = false;
    mainWindow.on('session-end', () => { quitting = true; });   // Windows is shutting down
    mainWindow.on('close', (e) => {
      if (quitting) return;
      e.preventDefault();
      if (asking) return;
      asking = true;
      const win = mainWindow;
      dialog.showMessageBox(win, {
        type: 'warning',
        buttons: ['Keep the server running', 'Minimize', 'Stop the server'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
        title: 'SchoolQ Server',
        message: 'Stop the SchoolQ server?',
        detail: 'Closing this window stops the server. All Staff, Kiosk and TV Display screens will lose their connection until you start SchoolQ Server again.\n\nTo keep the school running, choose "Minimize".',
      }).then(({ response }) => {
        asking = false;
        if (response === 1) { if (win && !win.isDestroyed()) win.minimize(); }
        else if (response === 2) { quitting = true; app.quit(); }
      });
    });
  }

  mainWindow.loadURL(url);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; banner.destroy(); });
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
  if (app.isPackaged && buildMode === 'server' && !license.checkActivated(app.getPath('userData'), { clock: licenseClock() }).ok) {
    createWindow(`file://${path.join(__dirname, 'activation.html')}`);
    return;
  }

  // Start the media helper now so the first announcement isn't delayed by it
  media.warm();

  try {
    if (buildMode === 'server') {
      await startLocalServer();
      const port = await waitForActualServer(30000);
      createWindow(`http://localhost:${port}`, { confirmClose: true });
      return;
    }

    if (!config) {
      createWindow(`file://${path.join(__dirname, 'setup.html')}`);
      return;
    }

    if (config.mode === 'server') {
      await startLocalServer();
      const port = await waitForActualServer(30000);
      createWindow(`http://localhost:${port}`, { confirmClose: true });
    } else {
      const serverUrl = await findServer(config.serverUrl, 20000);
      if (serverUrl) {
        // Found it somewhere else (e.g. moved port) — remember the new address.
        if (serverUrl !== config.serverUrl) saveConfig({ ...config, serverUrl });
        createWindow(serverUrl, { reconnectOnFail: true });
      } else {
        dialog.showErrorBox(
          'Cannot Connect to Server',
          `SchoolQ could not reach the server at:\n${config.serverUrl}\n\nand found no SchoolQ Server on the network.\n\nMake sure the server machine is on and SchoolQ Server is running there, then restart this app.`
        );
        createWindow(`file://${path.join(__dirname, 'setup.html')}`);
      }
    }
  } catch (err) {
    if (err.portsBusy) {
      fatal('SchoolQ — Failed to Start',
        `${err.message}\n\nClose one of those programs (or restart this PC), then start SchoolQ Server again.`);
      return;
    }
    fatal(
      'SchoolQ — Failed to Start',
      `SchoolQ could not start the server.\n\nError: ${err.message}\n\n${err.stack || ''}\n\nTry restarting the app. If the problem persists, contact support.`
    );
  }
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => media.stop());
