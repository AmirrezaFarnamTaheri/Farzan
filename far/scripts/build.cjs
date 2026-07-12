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
  // intentionally disabled so private source is not published or