const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { createServer } = require('../scripts/dev-server.cjs');

const root = path.join(__dirname, '..');

function browserCandidates() {
  const vars = process.env;
  return [
    vars.PLASMADECK_BROWSER,
    path.join(vars.ProgramFiles || '', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(vars['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(vars.LOCALAPPDATA || '', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(vars.ProgramFiles || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(vars['ProgramFiles(x86)'] || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(vars.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  ].filter(Boolean);
}

function findBrowser() {
  return browserCandidates().find(candidate => fs.existsSync(candidate));
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off?.('error', reject);
      resolve(server.address());
    });
  });
}

async function main() {
  const browser = findBrowser();
  if (!browser) {
    console.error('[desktop] Could not find Microsoft Edge or Google Chrome. Install Electron and use `npm run desktop`, or set PLASMADECK_BROWSER to a Chromium-compatible executable.');
    process.exit(1);
  }

  const server = createServer({ root });
  const address = await listen(server);
  const url = `http://127.0.0.1:${address.port}/`;
  const userDataDir = path.join(os.tmpdir(), 'plasmadeck-app-window');
  const child = spawn(browser, [
    `--app=${url}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--disable-default-apps',
  ], { stdio: 'ignore', windowsHide: false });

  const shutdown = () => server.close(() => process.exit(0));
  child.on('exit', shutdown);
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[desktop] App-window launch failed:', err?.message || err);
  process.exit(1);
});
