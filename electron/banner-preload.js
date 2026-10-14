const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('banner', {
  onShow: (cb) => ipcRenderer.on('banner-show', (e, data) => cb(data)),
  onHide: (cb) => ipcRenderer.on('banner-hide', () => cb()),
});
