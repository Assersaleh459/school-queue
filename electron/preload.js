const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig:    ()       => ipcRenderer.sendSync('get-config'),
  saveConfig:   (config) => ipcRenderer.sendSync('save-config', config),
  getLocalIPs:  ()       => ipcRenderer.sendSync('get-local-ips'),
  getBuildMode: ()       => ipcRenderer.sendSync('get-build-mode'),
  relaunch:     ()       => ipcRenderer.send('relaunch'),
  testServer:      (ip, port) => ipcRenderer.invoke('test-server', ip, port),
  mediaPlayPause:  ()         => ipcRenderer.invoke('media-play-pause'),
  openBackups:     ()         => ipcRenderer.invoke('open-backups'),
  restoreDatabase: ()         => ipcRenderer.invoke('restore-database'),
  licenseStatus:   ()         => ipcRenderer.sendSync('license-status'),
  activateLicense: (key)      => ipcRenderer.invoke('activate-license', key)
});
