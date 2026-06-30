#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = process.cwd();
const repoRootCargo = path.resolve(root, '..', '.cargo');
const args = new Set(process.argv.slice(2));
const strict = args.has('--strict');
const resolveCargo = strict || args.has('--resolve-cargo');

const checks = [];

function rel(...parts) {
  return path.join(root, ...parts);
}

function exists(...parts) {
  return fs.existsSync(rel(...parts));
}

function readText(...parts) {
  return fs.readFileSync(rel(...parts), 'utf8');
}

function readJson(...parts) {
  return JSON.parse(readText(...parts));
}

function add(status, label, detail = '') {
  checks.push({ status, label, detail });
}

function commandVersion(command, versionArgs = ['--version']) {
  const env = { ...process.env };
  if (fs.existsSync(path.join(repoRootCargo, 'registry'))) {
    env.CARGO_HOME = repoRootCargo;
  }
  const result = spawnSync(command, versionArgs, {
    cwd: root,
    env,
    encoding: 'utf8',
    shell: false,
    timeout: 15000,
  });
  if (result.error) {
    return { ok: false, output: result.error.message };
  }
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  return { ok: result.status === 0, output };
}

function cargoMetadataOffline() {
  const env = { ...process.env };
  if (fs.existsSync(path.join(repoRootCargo, 'registry'))) {
    env.CARGO_HOME = repoRootCargo;
  }
  return spawnSync('cargo', ['metadata', '--offline', '--locked', '--manifest-path', 'src-tauri/Cargo.toml', '--format-version', '1'], {
    cwd: root,
    env,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 128 * 1024 * 1024,
    timeout: 30000,
  });
}

function compactOutput(result) {
  const output = `${result.stdout || ''}${result.stderr || ''}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return output.slice(0, 8).join(' ');
}

function parseLockedRegistryPackages(lockText) {
  const packages = [];
  for (const block of lockText.split(/\r?\n\r?\n/)) {
    if (!block.includes('source = "registry+')) {
      continue;
    }
    const name = block.match(/^name = "([^"]+)"/m)?.[1];
    const version = block.match(/^version = "([^"]+)"/m)?.[1];
    if (name && version) {
      packages.push({ name, version });
    }
  }
  return packages;
}

function cacheIndexRoots() {
  const cacheRoot = path.join(repoRootCargo, 'registry', 'cache');
  if (!fs.existsSync(cacheRoot)) {
    return [];
  }
  return fs
    .readdirSync(cacheRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(cacheRoot, entry.name));
}

function srcIndexRoots() {
  const srcRoot = path.join(repoRootCargo, 'registry', 'src');
  if (!fs.existsSync(srcRoot)) {
    return [];
  }
  return fs
    .readdirSync(srcRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(srcRoot, entry.name));
}

function registryPackageAvailable(pkg) {
  const crateName = `${pkg.name}-${pkg.version}.crate`;
  const sourceName = `${pkg.name}-${pkg.version}`;
  const hasCrate = cacheIndexRoots().some((cacheRoot) => fs.existsSync(path.join(cacheRoot, crateName)));
  const hasSource = srcIndexRoots().some((srcRoot) => fs.existsSync(path.join(srcRoot, sourceName)));
  return hasCrate || hasSource;
}

function missingLockedRegistryPackages() {
  const lockPath = rel('src-tauri', 'Cargo.lock');
  if (!fs.existsSync(lockPath) || !fs.existsSync(path.join(repoRootCargo, 'registry'))) {
    return [];
  }
  const packages = parseLockedRegistryPackages(fs.readFileSync(lockPath, 'utf8'));
  return packages.filter((pkg) => !registryPackageAvailable(pkg));
}

function writeMissingCargoReport(packages) {
  if (!packages.length) {
    return '';
  }
  const reportPath = rel('desktop-dist', 'native-cargo-missing.txt');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const lines = [
    'OpenCourseDeck missing locked Cargo registry packages',
    '',
    'These packages are listed in src-tauri/Cargo.lock but are not present as .crate archives or unpacked sources in the repo-root .cargo cache.',
    'Provide a complete cargo vendor directory or a Cargo registry cache generated from the same lockfile to avoid resolving them one by one.',
    '',
    ...packages.map((pkg) => `${pkg.name}-${pkg.version}`),
    '',
  ];
  fs.writeFileSync(reportPath, lines.join('\n'));
  return path.relative(root, reportPath).replaceAll(path.sep, '/');
}

let packageJson = null;
let tauriConfig = null;
let tauriCapabilities = null;
let cargoToml = '';

try {
  packageJson = readJson('package.json');
  add('ok', 'package.json is readable');
} catch (error) {
  add('fail', 'package.json is readable', error.message);
}

try {
  tauriConfig = readJson('src-tauri', 'tauri.conf.json');
  add('ok', 'Tauri config is readable');
} catch (error) {
  add('fail', 'Tauri config is readable', error.message);
}

try {
  tauriCapabilities = readJson('src-tauri', 'capabilities', 'default.json');
  add('ok', 'Tauri capability file is readable');
} catch (error) {
  add('fail', 'Tauri capability file is readable', error.message);
}

try {
  cargoToml = readText('src-tauri', 'Cargo.toml');
  add('ok', 'Tauri Cargo manifest is readable');
} catch (error) {
  add('fail', 'Tauri Cargo manifest is readable', error.message);
}

if (packageJson) {
  const scripts = packageJson.scripts || {};
  add(scripts.desktop ? 'ok' : 'fail', 'desktop launcher script is declared', scripts.desktop || 'missing');
  add(scripts['desktop:package'] ? 'ok' : 'fail', 'portable desktop package script is declared', scripts['desktop:package'] || 'missing');
  add(scripts['tauri:check'] ? 'ok' : 'fail', 'Tauri check script is declared', scripts['tauri:check'] || 'missing');
  add(scripts['tauri:bundle'] ? 'ok' : 'fail', 'Tauri bundle script is declared', scripts['tauri:bundle'] || 'missing');
  add(scripts['native:package'] ? 'ok' : 'fail', 'native package script is declared', scripts['native:package'] || 'missing');
}

add(exists('desktop', 'main.cjs') ? 'ok' : 'fail', 'Electron shell exists');
add(exists('desktop', 'package-portable.cjs') ? 'ok' : 'fail', 'portable desktop packager exists');
add(exists('src-tauri', 'src', 'main.rs') ? 'ok' : 'fail', 'Tauri Rust entrypoint exists');
add(exists('src-tauri', 'src', 'lib.rs') ? 'ok' : 'fail', 'Tauri Rust library entrypoint exists');
add(exists('src-tauri', 'icons', 'icon.ico') ? 'ok' : 'fail', 'Windows desktop icon exists');
add(exists('tauri-dev', 'tauri-dev', 'crates', 'tauri') ? 'ok' : 'fail', 'local Tauri source tree exists');
add(exists('tauri-dev', 'tauri-dev', 'Cargo.lock') ? 'ok' : 'warn', 'local Tauri source lockfile exists');
add(exists('src-tauri', 'Cargo.lock') ? 'ok' : 'warn', 'Tauri wrapper lockfile exists');
add(fs.existsSync(path.join(repoRootCargo, 'registry')) ? 'ok' : 'warn', 'repo-root Cargo cache is available');

const missingLockedPackages = missingLockedRegistryPackages();
if (missingLockedPackages.length) {
  const missingReport = writeMissingCargoReport(missingLockedPackages);
  const firstMissing = missingLockedPackages
    .slice(0, 24)
    .map((pkg) => `${pkg.name}-${pkg.version}`)
    .join(', ');
  const suffix = missingLockedPackages.length > 24 ? `, and ${missingLockedPackages.length - 24} more` : '';
  const reportSuffix = missingReport ? `. Full list: ${missingReport}` : '';
  add('warn', 'repo-root Cargo cache covers locked registry packages', `${missingLockedPackages.length} missing: ${firstMissing}${suffix}${reportSuffix}`);
} else if (exists('src-tauri', 'Cargo.lock') && fs.existsSync(path.join(repoRootCargo, 'registry'))) {
  add('ok', 'repo-root Cargo cache covers locked registry packages');
}

if (cargoToml) {
  add(cargoToml.includes('../tauri-dev/tauri-dev/crates/tauri') ? 'ok' : 'fail', 'Tauri dependency uses local source path');
  add(cargoToml.includes('../tauri-dev/tauri-dev/crates/tauri-build') ? 'ok' : 'fail', 'Tauri build dependency uses local source path');
  add(cargoToml.includes('tauri/custom-protocol') ? 'ok' : 'warn', 'release build enables custom protocol feature');
}

if (tauriConfig) {
  add(tauriConfig.productName === 'OpenCourseDeck' ? 'ok' : 'fail', 'Tauri product name is OpenCourseDeck');
  add(tauriConfig.build?.frontendDist === '../dist' ? 'ok' : 'fail', 'Tauri uses built dist frontend');
  add(Array.isArray(tauriConfig.bundle?.targets) && tauriConfig.bundle.targets.includes('nsis') ? 'ok' : 'fail', 'Tauri bundle targets Windows NSIS');
  add(tauriConfig.app?.security?.freezePrototype === true ? 'ok' : 'warn', 'Tauri freezes prototypes');
  add(tauriConfig.build?.removeUnusedCommands === true ? 'ok' : 'warn', 'Tauri removes unused commands');
}

if (tauriCapabilities) {
  add(Array.isArray(tauriCapabilities.permissions) && tauriCapabilities.permissions.length === 0 ? 'ok' : 'warn', 'Tauri permissions are deny-by-default');
}

const rustc = commandVersion('rustc');
add(rustc.ok ? 'ok' : 'fail', 'rustc is available', rustc.output);

const cargo = commandVersion('cargo');
add(cargo.ok ? 'ok' : 'fail', 'cargo is available', cargo.output);

if (resolveCargo) {
  const metadata = cargoMetadataOffline();
  add(
    metadata.status === 0 ? 'ok' : strict ? 'fail' : 'warn',
    'Cargo dependencies resolve offline',
    metadata.status === 0 ? 'offline dependency graph resolved' : compactOutput(metadata)
  );
} else {
  add('warn', 'Cargo dependency resolution was not executed', 'run `npm run native:preflight:strict` for an offline dependency check');
}

const symbols = { ok: '[ok]', warn: '[warn]', fail: '[fail]' };
console.log('OpenCourseDeck native preflight');
for (const check of checks) {
  const detail = check.detail ? ` - ${check.detail}` : '';
  console.log(`${symbols[check.status]} ${check.label}${detail}`);
}

const failed = checks.filter((check) => check.status === 'fail');
const warned = checks.filter((check) => check.status === 'warn');

if (failed.length) {
  console.log(`\n${failed.length} required native readiness check(s) failed.`);
}

if (warned.length) {
  console.log(`\n${warned.length} native readiness warning(s) remain.`);
}

if (failed.length || warned.length) {
  console.log('Next native packaging step: provide the missing Cargo registry/cache or a vendored Cargo source directory, then rerun `npm run native:preflight:strict` and `npm run tauri:check`.');
}

process.exit(strict && failed.length ? 1 : 0);
