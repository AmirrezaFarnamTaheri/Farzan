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

async function main() {
  if (isWatch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('[build] watching...');
    return;
  }

  await esbuild.build(options);
  const staticDirs = ['assets', 'data', 'docs', 'vendor'];
  for (const dir of staticDirs) {
    const from = path.join(root, dir);
    const to = path.join(outdir, dir);
    if (fs.existsSync(from)) fs.cpSync(from, to, { recursive: true, force: true });
  }
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
  if (!fs.existsSync(path.join(outdir, 'index.html'))) {
    throw new Error('Production build did not stage dist/index.html');
  }
  console.log('[build] done');
}

main().catch((err) => {
  console.error('[build] failed', err);
  process.exit(1);
});

