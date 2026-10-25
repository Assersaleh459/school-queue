const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig:    ()       => ipcRenderer.sendSync('get-config'),
  saveConfig:   (config) => ipcRenderer.sendSync('save-config', config),
  getLocalIPs:  ()       => ipcRenderer.sendSync('get-local-ips'),
  getBuildMode: ()       => ipcRenderer.sendSync('get-build-mode'),
  relaunch:     ()       => ipcRenderer.send('relaunch'),
  testServer:      (ip, port) => ipcRenderer.invoke('test-server', ip, port),
  discoverServers: ()         => ipcRenderer.invoke('discover-servers'),
  findServer:      ()         => ipcRenderer.invoke('find-server'),     // Staff app: saved server, else search the LAN → URL or null
  mediaPause:      ()         => ipcRenderer.invoke('media-pause'),    // → { paused: n }
  mediaResume:     ()         => ipcRenderer.invoke('media-resume'),
  showBanner:      (data)     => ipcRenderer.send('banner-show', data),
  hideBanner:      ()         => ipcRenderer.send('banner-hide'),
  openBackups:     ()         => ipcRenderer.invoke('open-backups'),
  restoreDatabase: ()         => ipcRenderer.invoke('restore-database'),
  licenseStatus:   ()         => ipcRenderer.sendSync('license-status'),
  deviceInfo:      ()         => ipcRenderer.sendSync('device-info'),   // → { id, name } — counts toward the license's Staff devices
  // Voice engine as a file — server PC only
  enginePackAvailable: ()     => ipcRenderer.sendSync('engine-pack-available'),
  engineExport:    (unlock)   => ipcRenderer.invoke('engine-export', unlock),
  engineImport:    (unlock)   => ipcRenderer.invoke('engine-import', unlock),
  onEnginePackProgress: (cb)  => {
    const h = (e, p) => cb(p);
    ipcRenderer.on('engine-pack-progress', h);
    return () => ipcRenderer.removeListener('engine-pack-progress', h);
  },
  activateLicense: (key)      => ipcRenderer.invoke('activate-license', key)
});
