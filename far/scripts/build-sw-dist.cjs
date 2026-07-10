const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const indexPath = path.join(dist, 'index.html');
const swPath = path.join(dist, 'sw.js');
const cliPath = path.join(root, 'node_modules', 'workbox-cli', 'build', 'bin.js');
const configPath = path.join('scripts', 'workbox-dist.config.cjs');

function assertFile(filePath, message) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(message);
  }
}

function main() {
  assertFile(indexPath, 'Cannot generate release service worker: dist/index.html is missing');
  assertFile(cliPath, 'Cannot generate release service worker: workbox-cli is not installed');

  const result = spawnSync(process.execPath, [cliPath, 'generateSW', configPath], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  });

  if (result.error) throw result.error;
  if (result.signal) throw new Error(`workbox-cli terminated by signal ${result.signal}`);
  if (result.status !== 0) {
    throw new Error(`workbox-cli exited with status ${result.status ?? 'unknown'}`);
  }

  assertFile(swPath, 'Release service worker was not generated at dist/sw.js');
  if (fs.statSync(swPath).size === 0) {
    throw new Error('Release service worker at dist/sw.js is empty');
  }

  console.log(`[build:release] generated ${path.relative(root, swPath)}`);
}

try {
  main();
} catch (error) {
  console.error('[build:release] failed', error);
  process.exitCode = 1;
}
