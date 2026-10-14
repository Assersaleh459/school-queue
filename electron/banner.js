// Call banner: a see-through window shown ON TOP of everything (incl. fullscreen video)
// while a ticket call or announcement plays, then faded out. It never takes focus and
// lets clicks pass through, so the video underneath keeps playing undisturbed.
const { BrowserWindow, screen } = require('electron');
const path = require('path');

const FADE_MS = 220;
const MAX_SHOW_MS = 45000;   // safety: never stays up if a hide gets lost

function createBanner() {
  let win = null;
  let hideTimer = null;
  let safetyTimer = null;

  function ensure() {
    if (win && !win.isDestroyed()) return win;
    win = new BrowserWindow({
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      webPreferences: { preload: path.join(__dirname, 'banner-preload.js'), contextIsolation: true, nodeIntegration: false },
    });
    win.setAlwaysOnTop(true, 'screen-saver');      // above fullscreen video players
    win.setVisibleOnAllWorkspaces(true);
    win.setIgnoreMouseEvents(true);
    win.loadFile(path.join(__dirname, 'banner.html'));
    return win;
  }

  // data: { kind: 'call', ticket, department, departmentAr, room, final } | { kind: 'announcement', text, textAr }
  // near: bounds of the display window — the banner goes on the same screen
  function show(data, near) {
    const w = ensure();
    clearTimeout(hideTimer);
    clearTimeout(safetyTimer);
    const area = (near ? screen.getDisplayMatching(near) : screen.getPrimaryDisplay()).workArea;
    const width = Math.round(Math.min(area.width * 0.78, 1400));
    const height = 250;
    w.setBounds({
      x: Math.round(area.x + (area.width - width) / 2),
      y: Math.round(area.y + area.height * 0.62 - height / 2),
      width,
      height,
    });
    const send = () => { w.webContents.send('banner-show', data); w.showInactive(); };
    if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send); else send();
    safetyTimer = setTimeout(hide, MAX_SHOW_MS);
  }

  function hide() {
    clearTimeout(safetyTimer);
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    win.webContents.send('banner-hide');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (win && !win.isDestroyed()) win.hide(); }, FADE_MS + 40);
  }

  // The hidden banner still counts as an open window — destroy it with the main window,
  // otherwise closing SchoolQ would leave the app running.
  function destroy() {
    clearTimeout(hideTimer);
    clearTimeout(safetyTimer);
    if (win && !win.isDestroyed()) win.destroy();
    win = null;
  }

  return { show, hide, destroy };
}

module.exports = { createBanner };
