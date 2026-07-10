const fs = require('fs');
const path = require('path');
const { generateSW } = require('workbox-build');
const config = require('./workbox-dist.config.cjs');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

async function main() {
  const indexPath = path.join(dist, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error('Cannot generate production service worker: dist/index.html is missing');
  }

  const { count, size, warnings } = await generateSW({
    ...config,
    globDirectory: path.join(root, config.globDirectory),
    swDest: path.join(root, config.swDest),
  });

  for (const warning of warnings) {
    console.warn(`[build:sw:dist] ${warning}`);
  }

  const swPath = path.join(dist, 'sw.js');
  if (!fs.existsSync(swPath) || fs.statSync(swPath).size === 0) {
    throw new Error('Production service worker was not generated at dist/sw.js');
  }

  console.log(`[build:sw:dist] precached ${count} files (${size} bytes)`);
}

main().catch((error) => {
  console.error('[build:sw:dist] failed', error);
  process.exitCode = 1;
});
