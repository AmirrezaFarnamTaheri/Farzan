const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const srcEntry = path.join(root, 'src', 'index.js');
const outdir = path.join(root, 'dist');

const isWatch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: [srcEntry],
  outdir,
  bundle: true,
  format: 'esm',
  splitting: true,
  // Inline maps remain useful during local watch mode. Production maps are
  // intentionally disabled so private source is not published or precached.
  sourcemap: isWatch ? 'inline' : false,
  minify: !isWatch,
  target: ['es2020'],
  platform: 'browser',
  // Production failures must remain observable. Do not erase warning/error
  // calls during minification; the diagnostics layer can redact them instead.
  pure: [],
  assetNames: 'assets/[name]-[hash]',
  chunkNames: 'chunks/[name]-[hash]',
  entryNames: 'opencoursedeck',
  logLevel: 'info',
};

function resetOutputDirectory() {
  fs.rmSync(outdir, { recursive: true, force: true });
  fs.mkdirSync(outdir, { recursive: true });
}

function copyDirectory(from, to) {
  if (!fs.existsSync(from)) return;
  fs.cpSync(from, to, { recursive: true, force: true });
}

function copyFile(relativePath) {
  const from = path.join(root, relativePath);
  const to = path.join(outdir, relativePath);
  if (!fs.existsSync(from)) throw new Error(`Required release source is missing: ${relativePath}`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function rewriteReleaseStaticFile(file, content) {
  if (file === 'index.html') {
    return content
      .replaceAll('./dist/opencoursedeck.js', './opencoursedeck.js')
      .replaceAll('dist/opencoursedeck.js', './opencoursedeck.js');
  }
  if (file === 'boot.js') {
    return content.replaceAll('./dist/opencoursedeck.js', './opencoursedeck.js');
  }
  return content;
}

function stageStaticAssets() {
  const staticDirs = ['assets', 'data', 'docs', 'vendor'];
  for (const dir of staticDirs) {
    copyDirectory(path.join(root, dir), path.join(outdir, dir));
  }

  // style.css imports the modular stylesheet tree at ./src/styles/index.css.
  copyDirectory(path.join(root, 'src', 'styles'), path.join(outdir, 'src', 'styles'));

  // These small ESM modules are intentionally loaded by boot.js after the main
  // bundle so safety and capability initialization is explicit and testable.
  for (const file of [
    path.join('src', 'core', 'storageSafety.js'),
    path.join('src', 'features', 'aiClient.js'),
  ]) {
    copyFile(file);
  }

  for (const file of ['index.html', 'manifest.json', 'style.css', 'boot.js']) {
    const from = path.join(root, file);
    const to = path.join(outdir, file);
    if (!fs.existsSync(from)) continue;
    const content = rewriteReleaseStaticFile(file, fs.readFileSync(from, 'utf8'));
    fs.writeFileSync(to, content, 'utf8');
  }
}

function assertReleaseGraph() {
  const requiredReleaseFiles = [
    'index.html',
    'boot.js',
    'manifest.json',
    'opencoursedeck.js',
    'style.css',
    path.join('src', 'styles', 'index.css'),
    path.join('src', 'core', 'storageSafety.js'),
    path.join('src', 'features', 'aiClient.js'),
  ];
  const missing = requiredReleaseFiles.filter(file => !fs.existsSync(path.join(outdir, file)));
  if (missing.length) {
    throw new Error(`Production build is missing required release files: ${missing.join(', ')}`);
  }

  const bootSource = fs.readFileSync(path.join(outdir, 'boot.js'), 'utf8');
  if (!bootSource.includes("./opencoursedeck.js")) {
    throw new Error('Production boot file does not reference ./opencoursedeck.js');
  }
  if (bootSource.includes("./dist/opencoursedeck.js")) {
    throw new Error('Production boot file still references the source-root bundle path');
  }
}

async function main() {
  resetOutputDirectory();

  if (isWatch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('[build] watching...');
    return;
  }

  await esbuild.build(options);
  stageStaticAssets();
  assertReleaseGraph();
  console.log('[build] done');
}

main().catch((err) => {
  console.error('[build] failed', err);
  process.exit(1);
});

module.exports = {
  assertReleaseGraph,
  rewriteReleaseStaticFile,
};
