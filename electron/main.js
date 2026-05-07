const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const net  = require('net');
const os   = require('os');

let mainWindow;
const configPath = path.join(app.getPath('userData'), 'config.json');

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
  if (await isPortListening(3000)) return; // already running (dev mode)

  process.env.DB_PATH     = path.join(app.getPath('userData'), 'school-queue.db');
  process.env.PORT        = '3000';
  process.env.NODE_ENV    = 'production';
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
  require(path.join(__dirname, '../src/backend/server.js'));
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800,
    minWidth: 1024, minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false,
    title: 'SchoolQ — Queue Management'
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

app.on('ready', async () => {
  const buildMode = getBuildMode();
  const config    = getConfig();

  try {
    if (buildMode === 'server') {
      await startLocalServer();
      await waitForServer(3000, '127.0.0.1', 30000);
      createWindow('http://localhost:3000');
      return;
    }

    if (!config) {
      createWindow(`file://${path.join(__dirname, 'setup.html')}`);
      return;
    }

    if (config.mode === 'server') {
      await startLocalServer();
      await waitForServer(3000, '127.0.0.1', 30000);
      createWindow('http://localhost:3000');
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
      `SchoolQ could not start the server.\n\nError: ${err.message}\n\nTry restarting the app. If the problem persists, check that port 3000 is not in use by another program.`
    );
  }
});

app.on('window-all-closed', () => app.quit());
