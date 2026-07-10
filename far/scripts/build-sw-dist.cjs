const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const indexPath = path.join(dist, 'index.html');
const swPath = path.join(dist, 'sw.js');
const cliPath = path.join(root, 'node_modules', 'workbox-cli', 'build', 'bin.js');
const configPath = path.join('scripts', 'workbox-dist.config.cjs');

function main() {
  if (!fs.existsSync(indexPath)) {
    throw new Error('Cannot generate production service worker: dist/index.html is missing');
  }
  if (!fs.existsSync(cliPath)) {
    throw new Error('Cannot generate production service worker: workbox-cli is not installed');
  }

  const result = spawnSync(process.execPath, [cliPath, 'generateSW', configPath], {
    cwd: root,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`workbox-cli exited with status ${result.status ?? 'unknown'}`);
  }
  if (!fs.existsSync(swPath) || fs.statSync(swPath).size === 0) {
    throw new Error('Production service worker was not generated at dist/sw.js');
  }

  console.log(`[build:sw:dist] generated ${path.relative(root, swPath)}`);
}

try {
  main();
} catch (error) {
  console.error('[build:sw:dist] failed', error);
  process.exitCode = 1;
}
