const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const srcEntry = path.join(root, 'src', 'index.js');
const outdir = path.join(root, 'dist');
const isWatch = process.argv.includes('--watch');

function createBuildOptions(outputDir = outdir, watch = false) {
  return {
    entryPoints: [srcEntry],
    outdir: outputDir,
    bundle: true,
    format: 'esm',
    splitting: true,
    sourcemap: watch ? 'inline' : false,
    minify: !watch,
    target: ['es2020'],
    platform: 'browser',
    pure: [],
    assetNames: 'assets/[name]-[hash]',
    chunkNames: 'chunks/[name]-[hash]',
    entryNames: 'opencoursedeck',
    logLevel: watch ? 'info' : 'info',
  };
}

function resetOutputDirectory() {
  fs.rmSync(outdir, { recursive: true, force: true });
  fs.mkdirSync(outdir, { recursive: true });
}

function copyDirectory(from, to) {
  if (!fs.existsSync(from)) return;
  fs.cpSync(from, to, { recursive: true, force: true });
}

function walkFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, files);
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function removeProductionSourceMaps() {
  for (const file of walkFiles(outdir)) {
    if (file.endsWith('.map')) fs.rmSync(file, { force: true });
  }
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
  copyDirectory(path.join(root, 'src', 'styles'), path.join(outdir, 'src', 'styles'));

  for (const file of ['index.html', 'manifest.json', 'style.css', 'boot.js', 'pdf-runtime.js']) {
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
    'pdf-runtime.js',
    'opencoursedeck.js',
    'style.css',
    path.join('src', 'styles', 'index.css'),
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
  if (/import\(['"]\.\/src\//.test(bootSource)) {
    throw new Error('Production boot file references unstaged source modules');
  }

  const sourceMaps = walkFiles(outdir).filter(file => file.endsWith('.map'));
  if (sourceMaps.length) {
    throw new Error(`Production build contains forbidden source maps: ${sourceMaps.join(', ')}`);
  }
}

async function main() {
  resetOutputDirectory();
  const options = createBuildOptions(outdir, isWatch);

  if (isWatch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('[build] watching...');
    return;
  }

  await esbuild.build(options);
  stageStaticAssets();
  removeProductionSourceMaps();
  assertReleaseGraph();
  console.log('[build] done');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[build] failed', err);
    process.exit(1);
  });
}

module.exports = {
  assertReleaseGraph,
  createBuildOptions,
  main,
  removeProductionSourceMaps,
  rewriteReleaseStaticFile,
};
