const {contextBridge,ipcRenderer} = require('electron');
const invoke = name => (...args) => ipcRenderer.invoke(`mind:${name}`,...args);
contextBridge.exposeInMainWorld('edgeeverMind',{
  load:invoke('load'),command:invoke('command'),approve:invoke('approve'),reject:invoke('reject'),
  exportBackup:invoke('export'),importBackup:invoke('import'),config:invoke('config'),saveConfig:invoke('save-config'),clearConfig:invoke('clear-config'),ask:invoke('ask'),cancel:invoke('cancel'),
  onAgentEvent(callback) { const listener = (_event,event) => callback(event); ipcRenderer.on('mind:agent-event',listener); return () => ipcRenderer.removeListener('mind:agent-event',listener); },
});
