const path = require('path');
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
  assetNames: 'assets/[name]-[hash]',
  chunkNames: 'chunks/[name]-[hash]',
  entryNames: 'plasma',
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
  console.log('[build] done');
}

main().catch((err) => {
  console.error('[build] failed', err);
  process.exit(1);
});

