const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gen', {
  state:     ()      => ipcRenderer.invoke('gen:state'),
  pickKey:   ()      => ipcRenderer.invoke('gen:pickKey'),
  mint:      (form)  => ipcRenderer.invoke('gen:mint', form),
  history:   ()      => ipcRenderer.invoke('gen:history'),
  copy:      (text)  => ipcRenderer.invoke('gen:copy', text),
  saveKey:   (entry) => ipcRenderer.invoke('gen:saveKey', entry),
  exportCsv: ()      => ipcRenderer.invoke('gen:exportCsv'),
});
