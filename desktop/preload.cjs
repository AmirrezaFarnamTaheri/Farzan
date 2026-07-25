const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('OpenCourseDeckDesktop', {
  platform: process.platform,
  shell: 'electron',
});
