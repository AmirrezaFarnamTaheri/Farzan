const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const esbuild = require('esbuild');
const { createBuildOptions } = require('./build.cjs');

const root = path.join(__dirname, '..');
const outdir = path.join(root, 'dist');

function walkFiles(dir, base = dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true