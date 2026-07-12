const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const esbuild = require('esbuild');
const { createBuildOptions } = require('./build.cjs');

const root = path.join(__dirname, '..');
const outdir = path.join(root, 'dist');

function walkFiles(dir, base = dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, base, files);
    else if (entry.isFile()) files.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return files.sort();
}

function isGeneratedBundleFile(file) {
  return file === 'opencoursedeck.js' || file.startsWith('chunks/');
}

function normalizeGeneratedText(text) {
  return String(text).replace(/-[a-z0-9]{8}(?=\.js\b)/gi, '-HASH');
}

function hashText(text) {
  return crypto.createHash('sha256').update(normalizeGeneratedText(text)).digest('hex');
}

function inventoryDirectory(dir, { filter = isGeneratedBundleFile } = {}) {
  const files = walkFiles(dir).filter(file => typeof filter !== 'function' || filter(file));
  return new Map(files.map((file) => [file, hashText(fs.readFileSync(path.join(dir, file), 'utf8'))]));
}

function inventoryOutputFiles(outputFiles) {
  const inventory = new Map();
  for (const output of outputFiles || []) {
    const file = path.relative(outdir, output.path).split(path.sep).join('/');
    if (!isGeneratedBundleFile(file)) continue;
    inventory.set(file, hashText(output.text));
  }
  return inventory;
}

function compareInventories(expected, actual) {
  const missing = [];
  const extra = [];
  const changed = [];

  for (const [file, hash] of expected) {
    if (!actual.has(file)) missing.push(file);
    else if (actual.get(file) !== hash) changed.push(file);
  }
  for (const file of actual.keys()) {
    if (!expected.has(file)) extra.push(file);
  }

  return {
    clean: missing.length === 0 && extra.length === 0 && changed.length === 0,
    missing: missing.sort(),
    extra: extra.sort(),
    duplicate: [],
    changed: changed.sort(),
  };
}

function contentMatch(expectedRecords, actualRecords) {
  const available = new Map();
  for (const record of actualRecords) {
    const records = available.get(record.hash) || [];
    records.push(record.file);
    available.set(record.hash, records);
  }
  const missing = [];
  for (const record of expectedRecords) {
    const matches = available.get(record.hash);
    if (matches?.length) matches.shift();
    else missing.push(record.file);
  }
  const extra = [];
  for (const matches of available.values()) extra.push(...matches);
  return { missing, extra };
}

function compareDirs(expectedDir, actualDir, { filter = file => file.endsWith('.js') } = {}) {
  const expectedFiles = walkFiles(expectedDir).filter(filter);
  const actualFiles = walkFiles(actualDir).filter(filter);
  const expected = expectedFiles.map(file => ({ file, hash: hashText(fs.readFileSync(path.join(expectedDir, file), 'utf8')) }));
  const actual = actualFiles.map(file => ({ file, hash: hashText(fs.readFileSync(path.join(actualDir, file), 'utf8')) }));
  const missing = [];
  const extra = [];
  const changed = [];

  const expectedEntry = expected.find(record => record.file === 'opencoursedeck.js');
  const actualEntry = actual.find(record => record.file === 'opencoursedeck.js');
  if (expectedEntry && !actualEntry) missing.push(expectedEntry.file);
  else if (!expectedEntry && actualEntry) extra.push(actualEntry.file);
  else if (expectedEntry && actualEntry && expectedEntry.hash !== actualEntry.hash) changed.push(expectedEntry.file);

  const expectedChunks = expected.filter(record => record.file.startsWith('chunks/'));
  const actualChunks = actual.filter(record => record.file.startsWith('chunks/'));
  const chunks = contentMatch(expectedChunks, actualChunks);
  missing.push(...chunks.missing);
  extra.push(...chunks.extra);

  const handled = new Set([
    'opencoursedeck.js',
    ...expectedChunks.map(record => record.file),
    ...actualChunks.map(record => record.file),
  ]);
  const expectedOther = new Map(expected.filter(record => !handled.has(record.file)).map(record => [record.file, record.hash]));
  const actualOther = new Map(actual.filter(record => !handled.has(record.file)).map(record => [record.file, record.hash]));
  const others = compareInventories(expectedOther, actualOther);
  missing.push(...others.missing);
  extra.push(...others.extra);
  changed.push(...others.changed);

  return {
    clean: missing.length === 0 && extra.length === 0 && changed.length === 0,
    missing: [...new Set(missing)].sort(),
    extra: [...new Set(extra)].sort(),
    duplicate: [],
    changed: [...new Set(changed)].sort(),
  };
}

async function checkGenerated({ actualOutdir = outdir } = {}) {
  const options = {
    ...createBuildOptions(outdir, false),
    write: false,
    logLevel: 'silent',
  };
  const result = await esbuild.build(options);
  return compareInventories(inventoryOutputFiles(result.outputFiles), inventoryDirectory(actualOutdir));
}

async function main() {
  if (!fs.existsSync(outdir)) {
    console.error('[check-generated] dist/ is missing. Run npm run build.');
    process.exit(1);
  }

  const sourceMaps = walkFiles(outdir).filter((file) => file.endsWith('.map'));
  if (sourceMaps.length) {
    console.error(`[check-generated] production source maps are not allowed: ${sourceMaps.join(', ')}`);
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
  checkGenerated,
  compareDirs,
  compareInventories,
  inventoryDirectory,
  inventoryOutputFiles,
  isGeneratedBundleFile,
  normalizeGeneratedText,
};
