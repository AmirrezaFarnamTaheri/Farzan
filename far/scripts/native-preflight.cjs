#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = process.cwd();
const strict = new Set(process.argv.slice(2)).has('--strict');
const checks = [];

function rel(...parts) {
  return path.join(root, ...parts);
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

function command(commandName, args, timeout = 180000) {
  const result = spawnSync(commandName, args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 128 * 1024 * 1024,
    timeout,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  return {
    ok: !result.error && result.status === 0,
    output: result.error?.message || output,
  };
}

function compact(output) {
  return String(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .join(' ');
}

let packageJson;
let tauriConfig;
let capabilities;
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
  capabilities = readJson('src-tauri', 'capabilities', 'default.json');
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

for (const file of ['build.rs', 'src/main.rs', 'src/lib.rs']) {
  add(fs.existsSync(rel('src-tauri', file)) ? 'ok' : 'fail', `Tauri ${file} exists`);
}

const cargoLockExists = fs.existsSync(rel('src-tauri', 'Cargo.lock'));
add(cargoLockExists ? 'ok' : strict ? 'fail' : 'warn', 'Tauri Cargo lockfile exists');
add(fs.existsSync(rel('assets', 'icon-192.svg')) ? 'ok' : 'fail', 'Native icon source exists');
const generatedIcon = rel('src-tauri', 'icons', 'icon.png');
const generatedIconReady = fs.existsSync(generatedIcon) && fs.statSync(generatedIcon).size >= 512;
add(
  generatedIconReady ? 'ok' : strict ? 'fail' : 'warn',
  'Generated Windows desktop icon exists',
  generatedIconReady ? `${fs.statSync(generatedIcon).size} bytes` : 'run `npm run native:prepare` before strict verification or native compilation',
);

if (packageJson) {
  const scripts = packageJson.scripts || {};
  add(scripts['native:prepare'] === 'node scripts/prepare-native-assets.cjs' ? 'ok' : 'fail', 'Native asset preparation script is declared');
  add(scripts['tauri:check'] === 'node scripts/native-cargo.cjs check --manifest-path src-tauri/Cargo.toml' ? 'ok' : 'fail', 'Tauri check script is declared');
  add(scripts['tauri:build'] === 'npm run native:prepare && node scripts/native-cargo.cjs build --manifest-path src-tauri/Cargo.toml --release' ? 'ok' : 'fail', 'Tauri release build prepares assets and compiles through the pinned wrapper');
  add(scripts['tauri:bundle'] === 'npm run native:prepare && tauri build --config src-tauri/tauri.conf.json' ? 'ok' : 'fail', 'Tauri bundle script prepares assets and uses the official CLI');
  add(scripts['native:package'] === 'npm run tauri:bundle && node scripts/stage-native-exe.cjs' ? 'ok' : 'fail', 'native package script stages the verified executable');
}

if (cargoToml) {
  add(cargoToml.includes('tauri = { version = "=2.11.5"') ? 'ok' : 'fail', 'Tauri runtime version is pinned');
  add(cargoToml.includes('tauri-build = { version = "=2.6.3"') ? 'ok' : 'fail', 'Tauri build helper version is pinned');
  add(cargoToml.includes('custom-protocol = ["tauri/custom-protocol"]') ? 'ok' : 'fail', 'release build enables the custom protocol');
  add(!/\bpath\s*=/.test(cargoToml) ? 'ok' : 'fail', 'Tauri dependencies use registry releases instead of missing local paths');
}

if (tauriConfig) {
  add(tauriConfig.productName === 'OpenCourseDeck' ? 'ok' : 'fail', 'Tauri product name is OpenCourseDeck');
  add(tauriConfig.version === packageJson?.version ? 'ok' : 'fail', 'Tauri and package versions match');
  add(tauriConfig.identifier === 'app.opencoursedeck.desktop' ? 'ok' : 'fail', 'Tauri bundle identifier is stable');
  add(tauriConfig.build?.frontendDist === '../dist' ? 'ok' : 'fail', 'Tauri embeds the production dist frontend');
  add(tauriConfig.build?.beforeBuildCommand === 'npm run build:release' ? 'ok' : 'fail', 'Tauri rebuilds the production frontend before bundling');
  add(tauriConfig.build?.removeUnusedCommands === true ? 'ok' : 'warn', 'Tauri removes unused commands');
  add(tauriConfig.app?.security?.freezePrototype === true ? 'ok' : 'warn', 'Tauri freezes JavaScript prototypes');

  const csp = tauriConfig.app?.security?.csp;
  const requiredCspDirectives = [
    "default-src 'self'",
    "script-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ];
  add(
    typeof csp === 'string' && requiredCspDirectives.every((directive) => csp.includes(directive)) ? 'ok' : 'fail',
    'Tauri enforces a restrictive Content Security Policy',
  );

  add(Array.isArray(tauriConfig.bundle?.targets) && tauriConfig.bundle.targets.includes('nsis') ? 'ok' : 'fail', 'Tauri bundle targets Windows NSIS');
  add(Array.isArray(tauriConfig.bundle?.icon) && tauriConfig.bundle.icon.includes('icons/icon.png') ? 'ok' : 'fail', 'Tauri bundle uses the generated native icon');
}

if (capabilities) {
  add(Array.isArray(capabilities.windows) && capabilities.windows.includes('main') ? 'ok' : 'fail', 'Tauri capability is scoped to the main window');
  add(Array.isArray(capabilities.permissions) && capabilities.permissions.length === 0 ? 'ok' : 'fail', 'Tauri permissions are deny-by-default');
}

const rustc = command('rustc', ['--version', '--verbose'], 15000);
add(rustc.ok ? 'ok' : 'fail', 'rustc is available', compact(rustc.output));
const cargo = command('cargo', ['--version', '--verbose'], 15000);
add(cargo.ok ? 'ok' : 'fail', 'cargo is available', compact(cargo.output));

if (strict && cargoLockExists && cargoToml) {
  const metadata = command('cargo', [
    'metadata',
    '--locked',
    '--manifest-path',
    'src-tauri/Cargo.toml',
    '--format-version',
    '1',
  ]);
  add(metadata.ok ? 'ok' : 'fail', 'Cargo dependencies resolve from the committed lockfile', compact(metadata.output));
} else if (!strict) {
  add('warn', 'Cargo dependency resolution was not executed', 'run `npm run native:preflight:strict` for a locked dependency check');
}

const symbols = { ok: '[ok]', warn: '[warn]', fail: '[fail]' };
console.log('OpenCourseDeck native preflight');
for (const check of checks) {
  const detail = check.detail ? ` - ${check.detail}` : '';
  console.log(`${symbols[check.status]} ${check.label}${detail}`);
}

const failed = checks.filter((check) => check.status === 'fail');
const warned = checks.filter((check) => check.status === 'warn');
if (failed.length) console.log(`\n${failed.length} required native readiness check(s) failed.`);
if (warned.length) console.log(`\n${warned.length} native readiness warning(s) remain.`);
if (failed.length || warned.length) {
  console.log('Next native packaging step: resolve the reported asset, scaffold, lockfile, toolchain, or signing gap and rerun `npm run native:preflight:strict`.');
}

process.exit(strict && failed.length ? 1 : 0);
