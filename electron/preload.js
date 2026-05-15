const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig:    ()       => ipcRenderer.sendSync('get-config'),
  saveConfig:   (config) => ipcRenderer.sendSync('save-config', config),
  getLocalIPs:  ()       => ipcRenderer.sendSync('get-local-ips'),
  getBuildMode: ()       => ipcRenderer.sendSync('get-build-mode'),
  relaunch:     ()       => ipcRenderer.send('relaunch'),
  testServer:   (ip)     => ipcRenderer.invoke('test-server', ip)
});
