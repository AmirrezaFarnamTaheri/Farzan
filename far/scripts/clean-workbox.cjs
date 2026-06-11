/**
 * Remove stale generated Workbox helper files before generating a fresh sw.js.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const keep = new Set(['sw.js', 'sw.js.map']);

for (const entry of fs.readdirSync(root)) {
  if (!/^workbox-[\w-]+\.(?:js|js\.map)$/.test(entry)) continue;
  if (keep.has(entry)) continue;
  fs.rmSync(path.join(root, entry), { force: true });
}
