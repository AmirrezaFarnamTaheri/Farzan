/**
 * Copy browser bundles from node_modules into ./vendor for offline / same-origin loading.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const vendor = path.join(root, 'vendor');

const copies = [
  {
    from: 'chart.js/dist/chart.umd.js',
    to: 'chart.umd.js',
  },
  {
    from: 'pdfjs-dist/build/pdf.min.mjs',
    to: 'pdf.min.mjs',
  },
  {
    from: 'pdfjs-dist/build/pdf.worker.min.mjs',
    to: 'pdf.worker.min.mjs',
  },
  {
    from: 'marked/marked.min.js',
    to: 'marked.min.js',
  },
  {
    from: 'dompurify/dist/purify.min.js',
    to: 'purify.min.js',
  },
  {
    from: 'fuse.js/dist/fuse.min.js',
    to: 'fuse.min.js',
  },
];

function copyFileFromNodeModules(from, destRel) {
  const src = path.join(root, 'node_modules', from);
  const dest = path.join(vendor, destRel);
  if (!fs.existsSync(src)) {
    console.error('[vendor-libs] Missing source file:', src);
    console.error('  Run npm install from the project root first.');
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log('[vendor-libs]', destRel, '<-', from);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else if (ent.isFile()) fs.copyFileSync(s, d);
  }
}

function writeText(destRel, text) {
  const dest = path.join(vendor, destRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, text, 'utf8');
}

function main() {
  fs.mkdirSync(vendor, { recursive: true });
  let ok = 0;
  for (const { from, to } of copies) {
    copyFileFromNodeModules(from, to);
    ok += 1;
  }

  // Font Awesome (CSS + webfonts)
  copyFileFromNodeModules(
    '@fortawesome/fontawesome-free/css/all.min.css',
    'fontawesome/css/all.min.css'
  );
  copyDir(
    path.join(root, 'node_modules', '@fortawesome', 'fontawesome-free', 'webfonts'),
    path.join(vendor, 'fontawesome', 'webfonts')
  );
  ok += 1;

  // Fonts (fontsource packages). We vendor `index.css` + `files/` for each.
  const fonts = [
    { pkg: '@fontsource/inter', out: 'fonts/inter' },
    { pkg: '@fontsource/jetbrains-mono', out: 'fonts/jetbrains-mono' },
    { pkg: '@fontsource/playfair-display', out: 'fonts/playfair-display' },
  ];

  const fontImports = [];
  for (const f of fonts) {
    const pkgRoot = path.join(root, 'node_modules', f.pkg);
    if (!fs.existsSync(pkgRoot)) {
      console.error('[vendor-libs] Missing font package:', f.pkg);
      process.exit(1);
    }
    copyFileFromNodeModules(`${f.pkg}/index.css`, `${f.out}/index.css`);
    copyDir(path.join(pkgRoot, 'files'), path.join(vendor, f.out, 'files'));
    fontImports.push(`@import "./${f.out}/index.css";`);
    ok += 1;
  }

  writeText('fonts/fonts.css', `${fontImports.join('\n')}\n`);
  ok += 1;

  console.log('[vendor-libs] Done,', ok, 'files in', path.relative(root, vendor));
}

main();
