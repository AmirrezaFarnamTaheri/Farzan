const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const packagePath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');
const alternateLocks = ['pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'];
const errors = [];

function fail(message) {
  errors.push(message);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    fail(`Cannot parse ${path.relative(root, file)}: ${error?.message || error}`);
    return null;
  }
}

const pkg = readJson(packagePath);
const lock = readJson(lockPath);

if (!pkg) fail('package.json is required');
if (!lock) fail('package-lock.json is required for deterministic npm installs');

for (const file of alternateLocks) {
  if (fs.existsSync(path.join(root, file))) {
    fail(`Conflicting package-manager lockfile detected: ${file}`);
  }
}

if (lock) {
  if (Number(lock.lockfileVersion) < 3) {
    fail(`package-lock.json must use lockfileVersion 3 or newer; found ${lock.lockfileVersion}`);
  }
  if (lock.name !== pkg?.name || lock.version !== pkg?.version) {
    fail('package-lock.json package identity does not match package.json');
  }
}

const rootLock = lock?.packages?.[''];
if (!rootLock) {
  fail('package-lock.json is missing its root package record');
} else if (pkg) {
  for (const section of ['dependencies', 'devDependencies']) {
    const manifestEntries = pkg[section] || {};
    const lockEntries = rootLock[section] || {};
    for (const [name, version] of Object.entries(manifestEntries)) {
      if (lockEntries[name] !== version) {
        fail(`${section}.${name} differs between package.json (${version}) and package-lock.json (${lockEntries[name] ?? 'missing'})`);
      }
    }
    for (const name of Object.keys(lockEntries)) {
      if (!(name in manifestEntries)) {
        fail(`${section}.${name} exists in package-lock.json but not package.json`);
      }
    }
  }
}

if (pkg) {
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [name, version] of Object.entries(pkg[section] || {})) {
      const spec = String(version).trim();
      if (!spec || spec === '*' || /^latest$/i.test(spec)) {
        fail(`${section}.${name} uses an unbounded version specifier: ${spec || '(empty)'}`);
      }
      if (/^(?:git\+|git:|https?:|file:|link:)/i.test(spec)) {
        fail(`${section}.${name} uses a non-registry dependency source: ${spec}`);
      }
    }
  }

  const scriptText = Object.values(pkg.scripts || {}).join('\n');
  const suspicious = [
    /\bcurl\b/i,
    /\bwget\b/i,
    /powershell[^\n]*(?:-enc|-encodedcommand)/i,
    /\bInvoke-Expression\b/i,
  ];
  for (const pattern of suspicious) {
    if (pattern.test(scriptText)) fail(`Package scripts contain a disallowed command pattern: ${pattern}`);
  }
}

for (const [packagePathKey, record] of Object.entries(lock?.packages || {})) {
  if (!packagePathKey || !record || typeof record !== 'object') continue;
  const resolved = String(record.resolved || '');
  if (resolved.startsWith('http://')) {
    fail(`${packagePathKey} resolves over insecure HTTP: ${resolved}`);
  }
  if (resolved && /^https?:\/\//i.test(resolved) && !record.integrity) {
    fail(`${packagePathKey} has a remote tarball without an integrity hash`);
  }
}

if (errors.length) {
  for (const message of errors) console.error(`[audit] ${message}`);
  console.error(`[audit] Failed with ${errors.length} issue(s).`);
  process.exit(1);
}

const packageCount = Math.max(0, Object.keys(lock.packages || {}).length - 1);
console.log(`[audit] OK — npm lockfile and ${packageCount} installed package record(s) are internally consistent.`);
