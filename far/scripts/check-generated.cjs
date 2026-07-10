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
    entryNames: 'opencoursedeck',
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

function fileMap(dir) {
  return new Map(walkFiles(dir).map(file => [file, file]));
}

function isGeneratedBundleFile(file) {
  return file === 'opencoursedeck.js'
    || file === 'opencoursedeck.js.map'
    || file.startsWith('chunks/');
}

function hashGeneratedFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function compareDirs(expectedDir, actualDir, { filter = null } = {}) {
  const expected = fileMap(expectedDir);
  const actual = fileMap(actualDir);
  if (typeof filter === 'function') {
    for (const key of [...expected.keys()]) {
      if (!filter(key)) expected.delete(key);
    }
    for (const key of [...actual.keys()]) {
      if (!filter(key)) actual.delete(key);
    }
  }

  const expectedFiles = new Set(expected.keys());
  const actualFiles = new Set(actual.keys());
  const missing = [...expectedFiles].filter(file => !actualFiles.has(file));
  const extra = [...actualFiles].filter(file => !expectedFiles.has(file));
  const changed = [...expectedFiles]
    .filter(file => actualFiles.has(file))
    .filter(file => !file.endsWith('.map'))
    .filter(file => hashGeneratedFile(path.join(expectedDir, file)) !== hashGeneratedFile(path.join(actualDir, file)));

  return {
    clean: missing.length === 0 && extra.length === 0 && changed.length === 0,
    missing,
    extra,
    duplicate: [],
    changed,
  };
}

async function checkGenerated({ actualOutdir = outdir } = {}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opencoursedeck-generated-'));
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
