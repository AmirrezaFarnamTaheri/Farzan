const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const srcEntry = path.join(root, 'src', 'index.js');
const outdir = path.join(root, 'dist');

function buildOptionsFor(outputDir) {
  return {
    entryPoints: [srcEntry],
    outdir: outputDir,
    bundle: true,
    format: 'esm',
    splitting: true,
    sourcemap: true,
    minify: true,
    target: ['es2020'],
    platform: 'browser',
    pure: ['console.warn', 'console.error'],
    assetNames: 'assets/[name]-[hash]',
    chunkNames: 'chunks/[name]-[hash]',
    entryNames: 'plasma',
    logLevel: 'silent',
  };
}

function walkFiles(dir, base = dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, base, files);
    } else if (entry.isFile()) {
      files.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return files.sort();
}

function canonicalPath(file) {
  return file.replace(/-[A-Z0-9]{8}(?=\.(?:js|css)(?:\.map)?$|\.map$)/g, '-HASH');
}

function fileMap(dir) {
  const map = new Map();
  const duplicates = [];
  for (const file of walkFiles(dir)) {
    const canonical = canonicalPath(file);
    if (map.has(canonical)) duplicates.push(canonical);
    map.set(canonical, file);
  }
  return { map, duplicates: [...new Set(duplicates)].sort() };
}

function isGeneratedBundleFile(file) {
  return file === 'plasma.js'
    || file === 'plasma.js.map'
    || file.startsWith('chunks/');
}

function normalizeGeneratedText(text) {
  return text
    .replace(/-[A-Z0-9]{8}(?=\.(?:js|css)(?:\.map)?\b|\.map\b)/g, '-HASH')
    .replace(/sourceMappingURL=.*$/gm, 'sourceMappingURL=HASH.map');
}

function hashGeneratedFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  return crypto.createHash('sha256').update(normalizeGeneratedText(content)).digest('hex');
}

function compareDirs(expectedDir, actualDir, { filter = null } = {}) {
  const expected = fileMap(expectedDir);
  const actual = fileMap(actualDir);
  if (typeof filter === 'function') {
    for (const key of [...expected.map.keys()]) {
      if (!filter(key)) expected.map.delete(key);
    }
    for (const key of [...actual.map.keys()]) {
      if (!filter(key)) actual.map.delete(key);
    }
    actual.duplicates = actual.duplicates.filter(filter);
  }
  const expectedFiles = new Set(expected.map.keys());
  const actualFiles = new Set(actual.map.keys());
  const missing = [...expectedFiles].filter(file => !actualFiles.has(file));
  const extra = [...actualFiles].filter(file => !expectedFiles.has(file));
  const duplicate = actual.duplicates;
  const changed = [...expectedFiles]
    .filter(file => actualFiles.has(file))
    .filter(file => !file.endsWith('.map'))
    .filter(file => hashGeneratedFile(path.join(expectedDir, expected.map.get(file))) !== hashGeneratedFile(path.join(actualDir, actual.map.get(file))));
  return {
    clean: missing.length === 0 && extra.length === 0 && duplicate.length === 0 && changed.length === 0,
    missing,
    extra,
    duplicate,
    changed,
  };
}

async function checkGenerated({ actualOutdir = outdir } = {}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'plasmadeck-generated-'));
  const tempOutdir = path.join(tempRoot, 'dist');
  try {
    await esbuild.build(buildOptionsFor(tempOutdir));
    return compareDirs(tempOutdir, actualOutdir, { filter: isGeneratedBundleFile });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function main() {
  if (!fs.existsSync(outdir)) {
    console.error('[check-generated] dist/ is missing. Run npm run build.');
    process.exit(1);
  }
  const result = await checkGenerated();
  if (result.clean) {
    console.log('[check-generated] dist/ matches a fresh production build.');
    return;
  }
  console.error('[check-generated] dist/ is stale. Run npm run build.');
  if (result.missing.length) console.error(`  Missing: ${result.missing.join(', ')}`);
  if (result.extra.length) console.error(`  Extra: ${result.extra.join(', ')}`);
  if (result.duplicate.length) console.error(`  Duplicate: ${result.duplicate.join(', ')}`);
  if (result.changed.length) console.error(`  Changed: ${result.changed.join(', ')}`);
  process.exit(1);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[check-generated] failed', error);
    process.exit(1);
  });
}

module.exports = {
  buildOptionsFor,
  checkGenerated,
  compareDirs,
  isGeneratedBundleFile,
};
