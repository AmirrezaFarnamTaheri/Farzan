const path = require('path');
const { app, BrowserWindow, shell } = require('electron');
const { createServer } = require('../scripts/dev-server.cjs');

const root = path.join(__dirname, '..');
let server;
let mainWindow;

function listen(serverInstance) {
  return new Promise((resolve, reject) => {
    serverInstance.once('error', reject);
    serverInstance.listen(0, '127.0.0.1', () => {
      serverInstance.off?.('error', reject);
      resolve(serverInstance.address());
    });
  });
}

async function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return mainWindow;
  }
  server = createServer({ root });
  const address = await listen(server);
  const url = `http://127.0.0.1:${address.port}/`;
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    title: 'PlasmaDeck',
    backgroundColor: '#111827',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow = win;

  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//i.test(target)) shell.openExternal(target);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, target) => {
    if (!target.startsWith(url)) event.preventDefault();
  });
  win.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  win.on('closed', () => {
    mainWindow = null;
  });
  await win.loadURL(url);
  return win;
}

app.setName('PlasmaDeck');
app.setPath('userData', path.join(app.getPath('appData'), 'PlasmaDeck'));
const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(createMainWindow);
}
app.on('window-all-closed', () => app.quit());
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
app.on('before-quit', () => {
  server?.close?.();
});
