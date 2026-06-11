#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const sourceExe = path.join(root, 'src-tauri', 'target', 'release', 'plasmadeck.exe');
const frontendIndex = path.join(root, 'dist', 'index.html');
const outDir = path.join(root, 'desktop-dist', 'PlasmaDeck-Native');
const outExe = path.join(outDir, 'PlasmaDeck.exe');
const bundleDir = path.join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
const manifestPath = path.join(outDir, 'plasmadeck-native.json');
const readmePath = path.join(outDir, 'README.txt');

if (!fs.existsSync(sourceExe)) {
  console.error(`Native release executable not found: ${sourceExe}`);
  console.error('Run `npm run tauri:build` first.');
  process.exit(1);
}

if (!fs.existsSync(frontendIndex)) {
  console.error(`Native frontend asset not found: ${frontendIndex}`);
  console.error('Run `npm run build` before staging the native executable.');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(sourceExe, outExe);

const stats = fs.statSync(outExe);
const installers = fs.existsSync(bundleDir)
  ? fs
      .readdirSync(bundleDir)
      .filter((file) => file.toLowerCase().endsWith('.exe'))
      .sort()
  : [];
const stagedInstallers = installers.map((installer) => {
  const source = path.join(bundleDir, installer);
  const destination = path.join(outDir, installer);
  fs.copyFileSync(source, destination);
  return {
    file: installer,
    source: path.relative(root, source).replaceAll(path.sep, '/'),
    bytes: fs.statSync(destination).size,
  };
});
const manifest = {
  name: 'PlasmaDeck',
  kind: 'tauri-native-executable',
  executable: 'PlasmaDeck.exe',
  source: path.relative(root, sourceExe).replaceAll(path.sep, '/'),
  bytes: stats.size,
  generatedAt: new Date().toISOString(),
  installer: {
    status: stagedInstallers.length ? 'staged' : 'pending-nsis-toolchain',
    files: stagedInstallers,
    requiredToolCache: '%LOCALAPPDATA%/tauri/NSIS',
    requiredDownloads: [
      'https://github.com/tauri-apps/binary-releases/releases/download/nsis-3.11/nsis-3.11.zip',
      'https://github.com/tauri-apps/nsis-tauri-utils/releases/download/nsis_tauri_utils-v0.5.3/nsis_tauri_utils.dll',
    ],
  },
  security: {
    wrapper: 'Tauri',
    permissions: 'deny-by-default',
    webview: 'system WebView2',
    frontend: 'embedded dist assets with index.html shell',
  },
};

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(
  readmePath,
  [
    'PlasmaDeck Native Executable',
    '',
    'Run PlasmaDeck.exe to start the browserless Tauri app.',
    '',
    stagedInstallers.length
      ? 'The NSIS installer is staged in this folder alongside the executable.'
      : 'This folder is the native executable staging output. The NSIS installer is a separate packaging step and requires the NSIS toolchain cache to be available at %LOCALAPPDATA%\\tauri\\NSIS.',
    '',
    'Verification commands:',
    '  npm run native:preflight:strict',
    '  npm run tauri:check',
    '  npm run tauri:build',
    '',
  ].join('\n')
);

console.log(`Staged native executable: ${outExe}`);
for (const installer of stagedInstallers) {
  console.log(`Staged native installer: ${path.join(outDir, installer.file)}`);
}
