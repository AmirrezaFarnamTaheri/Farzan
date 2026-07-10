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

function isGeneratedBundleFile(file) {
  return file === 'opencoursedeck.js'
    || file === 'opencoursedeck.js.map'
    || file.startsWith('chunks/');
}

function normalizeGeneratedText(text) {
  return String(text)
    .replace(/chunk-[a-z0-9]{8}/gi, 'chunk-HASH')
    .replace(/sourceMappingURL=[^\s]+/g, 'sourceMappingURL=HASH.map');
}

function hashGeneratedFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  return crypto.createHash('sha256').update(normalizeGeneratedText(content)).digest('hex');
}

function inventory(dir, { filter = null } = {}) {
  const files = walkFiles(dir).filter(file => typeof filter !== 'function' || filter(file));
  const jsFiles = files.filter(file => file.endsWith('.js') && !file.endsWith('.js.map'));
  const mapFiles = new Set(files.filter(file => file.endsWith('.js.map')));
  const chunks = jsFiles
    .filter(file => file.startsWith('chunks/'))
    .map(file => ({ file, hash: hashGeneratedFile(path.join(dir, file)) }));

  return {
    files,
    entry: jsFiles.includes('opencoursedeck.js')
      ? { file: 'opencoursedeck.js', hash: hashGeneratedFile(path.join(dir, 'opencoursedeck.js')) }
      : null,
    chunks,
    missingMaps: jsFiles.filter(file => !mapFiles.has(`${file}.map`)),
    orphanMaps: [...mapFiles].filter(file => !jsFiles.includes(file.slice(0, -4))),
  };
}

function matchByContent(expectedRecords, actualRecords) {
  const actualByHash = new Map();
  for (const record of actualRecords) {
    const list = actualByHash.get(record.hash) || [];
    list.push(record);
    actualByHash.set(record.hash, list);
  }

  const missing = [];
  for (const record of expectedRecords) {
    const matches = actualByHash.get(record.hash);
    if (matches?.length) {
      matches.shift();
      continue;
    }
    missing.push(record.file);
  }

  const extra = [];
  for (const records of actualByHash.values()) {
    for (const record of records) extra.push(record.file);
  }
  return { missing, extra };
}

function coalesceChangedFiles(missing, extra) {
  const extraSet = new Set(extra);
  const changed = missing.filter(file => extraSet.has(file));
  if (!changed.length) return { missing, extra, changed };
  const changedSet = new Set(changed);
  return {
    missing: missing.filter(file => !changedSet.has(file)),
    extra: extra.filter(file => !changedSet.has(file)),
    changed,
  };
}

function compareDirs(expectedDir, actualDir, { filter = null } = {}) {
  const expected = inventory(expectedDir, { filter });
  const actual = inventory(actualDir, { filter });
  const missing = [];
  const extra = [];
  const changed = [];

  if (expected.entry && !actual.entry) {
    missing.push(expected.entry.file);
  } else if (!expected.entry && actual.entry) {
    extra.push(actual.entry.file);
  } else if (expected.entry && actual.entry && expected.entry.hash !== actual.entry.hash) {
    changed.push(expected.entry.file);
  }

  const chunks = matchByContent(expected.chunks, actual.chunks);
  missing.push(...chunks.missing, ...actual.missingMaps.map(file => `${file}.map`));
  extra.push(...chunks.extra, ...actual.orphanMaps);

  const coalesced = coalesceChangedFiles(missing, extra);
  changed.push(...coalesced.changed);

  const result = {
    clean: coalesced.missing.length === 0 && coalesced.extra.length === 0 && changed.length === 0,
    missing: [...new Set(coalesced.missing)].sort(),
    extra: [...new Set(coalesced.extra)].sort(),
    duplicate: [],
    changed: [...new Set(changed)].sort(),
  };
  return result;
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
  normalizeGeneratedText,
};
