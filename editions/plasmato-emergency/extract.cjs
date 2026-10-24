#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const vm = require('node:vm');
const dir = __dirname;
const w = {};
vm.runInNewContext(fs.readFileSync(path.join(dir, 'catalog_data.js'), 'utf8'), { window: w });
const target = path.join(dir, 'plasmato_full_2026-04-11.json');
if (fs.existsSync(target) && !process.argv.includes('--overwrite')) {
  console.error('JSON already exists. Pass --overwrite to replace it.');
  process.exit(1);
}
fs.writeFileSync(target, zlib.gunzipSync(Buffer.from(w.FARZAN_EMBEDDED_CATALOG_GZIP_BASE64, 'base64')));
console.log('Created', target);
