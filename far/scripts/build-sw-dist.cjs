const fs = require('fs');
const path = require('path');
const { generateSW } = require('workbox-build');
const { removeProductionSourceMaps } = require('./build.cjs');
const workboxConfig = require('./workbox-dist.config.cjs');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const indexPath = path.join(dist, 'index.html');
const swPath = path.join(dist, 'sw.js');

function assertFile(filePath, message) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(message);
  }
}

function walkFiles(directory, files = []) {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, files);
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function stripSourceMapText(source) {
  return String(source)
    .replace(/\r?\n?\/\/# sourceMappingURL=[^\r\n]*(?:\r?\n|$)/g, '\n')
    .replace(/\r?\n?\/\*# sourceMappingURL=[\s\S]*?\*\/\s*$/g, '\n');
}

function stripSourceMapReferences(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const source = fs.readFileSync(filePath, 'utf8');
  const cleaned = stripSourceMapText(source);
  if (cleaned === source) return false;
  fs.writeFileSync(filePath, cleaned, 'utf8');
  return true;
}

function finalizeServiceWorkerArtifacts() {
  const javascriptFiles = walkFiles(dist).filter(file => file.endsWith('.js'));
  for (const file of javascriptFiles) stripSourceMapReferences(file);
  removeProductionSourceMaps();

  const remainingMaps = walkFiles(dist).filter(file => file.endsWith('.map'));
  if (remainingMaps.length) {
    throw new Error(`Release service worker left source maps: ${remainingMaps.join(', ')}`);
  }

  const danglingReferences = javascriptFiles.filter(file =>
    /(?:\/\/#|\/\*#) sourceMappingURL=/.test(fs.readFileSync(file, 'utf8'))
  );
  if (danglingReferences.length) {
    throw new Error(`Release JavaScript contains source-map references: ${danglingReferences.join(', ')}`);
  }
}

async function generateReleaseServiceWorker(config = workboxConfig) {
  const result = await generateSW(config);
  for (const warning of result.warnings || []) {
    console.warn(`[build:release] Workbox warning: ${warning}`);
  }
  return result;
}

async function main() {
  assertFile(indexPath, 'Cannot generate release service worker: dist/index.html is missing');

  const result = await generateReleaseServiceWorker();
  finalizeServiceWorkerArtifacts();
  assertFile(swPath, 'Release service worker was not generated at dist/sw.js');
  if (fs.statSync(swPath).size === 0) {
    throw new Error('Release service worker at dist/sw.js is empty');
  }

  console.log(
    `[build:release] generated ${path.relative(root, swPath)} ` +
    `for ${result.count ?? 'unknown'} precached files (${result.size ?? 'unknown'} bytes) without source maps`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[build:release] failed', error);
    process.exitCode = 1;
  });
}

module.exports = {
  finalizeServiceWorkerArtifacts,
  generateReleaseServiceWorker,
  main,
  stripSourceMapReferences,
  stripSourceMapText,
};
