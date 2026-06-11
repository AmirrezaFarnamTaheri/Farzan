/**
 * Repository hygiene guard.
 *
 * This does not delete anything. It verifies that generated output, native
 * targets, downloaded tool source trees, and local debug artifacts are fenced
 * away from first-party validation and version-control intent.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let errors = 0;

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function fail(message) {
  console.error(`[repo-hygiene] ${message}`);
  errors += 1;
}

function requirePattern(file, pattern, label = pattern) {
  const text = read(file);
  if (!text.includes(pattern)) fail(`${file} is missing ${label}`);
}

function requireAnyPattern(file, patterns, label) {
  const text = read(file);
  if (!patterns.some((pattern) => text.includes(pattern))) fail(`${file} is missing ${label}`);
}

function validateGitignore() {
  const required = [
    'node_modules/',
    '.npm-cache/',
    'dist/',
    'desktop-dist/',
    'src-tauri/target/',
    'tauri-dev/',
    'electron-builder-master/',
    'Electron.NET-main/',
    'sw.js',
    'workbox-*.js',
    'debug.log',
    'server-*.log',
    'plasmadeck-server.pid',
  ];
  for (const pattern of required) requirePattern('.gitignore', pattern);
}

function validateToolingExcludes() {
  const excluded = [
    'desktop-dist',
    'tauri-dev',
    'electron-builder-master',
    'Electron.NET-main',
  ];
  for (const token of excluded) {
    requirePattern('eslint.config.js', token);
    requirePattern(path.join('scripts', 'validate.cjs'), token);
  }
  requirePattern('eslint.config.js', 'src-tauri/target');
  requireAnyPattern(path.join('scripts', 'validate.cjs'), ['src-tauri/target', "'target'"], 'src-tauri/target or generic target exclusion');
}

function validateDocsNativeFirst() {
  requirePattern('README.md', 'Native App');
  requirePattern('README.md', 'browserless Tauri app');
  requirePattern(path.join('desktop', 'NATIVE_STRATEGY.md'), 'Tauri native app');
  requirePattern(path.join('desktop', 'README.md'), 'preferred native path');
}

validateGitignore();
validateToolingExcludes();
validateDocsNativeFirst();

if (errors) {
  console.error(`[repo-hygiene] Failed with ${errors} issue(s).`);
  process.exit(1);
}

console.log('[repo-hygiene] OK - generated outputs, local tool trees, and docs are fenced.');
