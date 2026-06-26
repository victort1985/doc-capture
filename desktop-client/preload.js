const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vixorDesktop', {
  getServerUrl: () => ipcRenderer.invoke('get-server-url'),
  setServerUrl: (url) => ipcRenderer.invoke('set-server-url', url),
  platform: process.platform,
  version: process.env.npm_package_version || '1.0.0',
});
