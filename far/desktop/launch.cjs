const path = require('path');
const { spawn } = require('child_process');

function resolveElectron() {
  try {
    return require('electron');
  } catch {
    return null;
  }
}

const electron = resolveElectron();
if (!electron) {
  console.error('[desktop] Electron is not installed. Run `npm install --save-dev electron` when network access is available, then run `npm run desktop`.');
  process.exit(1);
}

const child = spawn(electron, [path.join(__dirname, 'main.cjs')], {
  stdio: 'inherit',
  windowsHide: false,
});

child.on('exit', (code) => process.exit(code ?? 0));
