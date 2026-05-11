/**
 * Static checks: vendor assets + Node syntax parse for project JS (no node_modules).
 */
const fs = require('fs');
const path = require('path');
const espree = require('espree');

const root = path.join(__dirname, '..');
const requiredVendor = [
  'chart.umd.js',
  'pdf.min.js',
  'pdf.worker.min.js',
  'marked.min.js',
  'purify.min.js',
  'fuse.min.js',
];

let errors = 0;
for (const f of requiredVendor) {
  const p = path.join(root, 'vendor', f);
  if (!fs.existsSync(p)) {
    console.error('[validate] Missing vendor file:', f);
    errors++;
  }
}
for (const f of ['index.html', 'boot.js', 'manifest.json']) {
  if (!fs.existsSync(path.join(root, f))) {
    console.error('[validate] Missing', f);
    errors++;
  }
}

const jsFiles = fs
  .readdirSync(root)
  .filter((n) => n.endsWith('.js') && !n.startsWith('.'));

for (const f of jsFiles) {
  const p = path.join(root, f);
  try {
    espree.parse(fs.readFileSync(p, 'utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowHashBang: true,
    });
  } catch (err) {
    console.error('[validate] Syntax error:', f, err?.message || err);
    errors++;
  }
}

if (errors) {
  console.error('[validate] Failed with', errors, 'error(s).');
  process.exit(1);
}
console.log('[validate] OK — vendor bundle(s) +', jsFiles.length, 'root JS file(s) parse clean.');
