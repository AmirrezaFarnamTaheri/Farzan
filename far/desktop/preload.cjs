const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('PlasmaDeckDesktop', {
  platform: process.platform,
  shell: 'electron',
});
