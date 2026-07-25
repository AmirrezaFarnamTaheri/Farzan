const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'desktop-dist', 'OpenCourseDeck');

const manifest = {
  name: 'OpenCourseDeck',
  version: require(path.join(root, 'package.json')).version,
  entry: 'desktop/main.cjs',
  fallbackEntry: 'desktop/app-window.cjs',
  generatedAt: new Date().toISOString(),
  runtime: {
    preferred: 'electron',
    fallback: 'chromium-app-window',
  },
  security: {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    externalNavigation: 'open-http-https-in-os',
    permissions: 'deny-by-default',
  },
};

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'opencoursedeck-desktop.json'), `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, 'README.txt'), [
  'OpenCourseDeck portable desktop staging folder',
  '',
  'Run from the repository root:',
  '  npm run desktop',
  '',
  'Fallback without Electron:',
  '  npm run desktop:app-window',
  '',
  'This staging folder records the desktop shell contract. A signed installer can be produced once the Electron runtime is installed.',
  '',
].join('\n'));

console.log(`[desktop-package] wrote ${path.relative(root, outDir)}`);
