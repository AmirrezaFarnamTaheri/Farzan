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
  sourcemap: isWatch ? 'inline' : true,
  minify: !isWatch,
  target: ['es2020'],
  platform: 'browser',
  pure: isWatch ? [] : ['console.warn', 'console.error'],
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

function stageStaticAssets() {
  const staticDirs = ['assets', 'data', 'docs', 'vendor'];
  for (const dir of staticDirs) {
    copyDirectory(path.join(root, dir), path.join(outdir, dir));
  }

  // style.css imports the modular stylesheet tree at ./src/styles/index.css.
  // Stage that tree so the release is actually self-contained.
  copyDirectory(path.join(root, 'src', 'styles'), path.join(outdir, 'src', 'styles'));

  for (const file of ['index.html', 'manifest.json', 'style.css', 'boot.js']) {
    const from = path.join(root, file);
    const to = path.join(outdir, file);
    if (!fs.existsSync(from)) continue;
    let content = fs.readFileSync(from, 'utf8');
    if (file === 'index.html') {
      content = content
        .replaceAll('./dist/opencoursedeck.js', './opencoursedeck.js')
        .replaceAll('dist/opencoursedeck.js', './opencoursedeck.js');
    }
    fs.writeFileSync(to, content, 'utf8');
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

  const requiredReleaseFiles = [
    'index.html',
    'opencoursedeck.js',
    'style.css',
    path.join('src', 'styles', 'index.css'),
  ];
  const missing = requiredReleaseFiles.filter(file => !fs.existsSync(path.join(outdir, file)));
  if (missing.length) {
    throw new Error(`Production build is missing required release files: ${missing.join(', ')}`);
  }
  console.log('[build] done');
}

main().catch((err) => {
  console.error('[build] failed', err);
  process.exit(1);
});
