/**
 * Copy browser bundles from node_modules into ./vendor for offline / same-origin loading.
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

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
    from: 'dompurify/dist/purify.min.js',
    to: 'purify.min.js',
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

function bundleFuseForClassicWorker() {
  const destRel = 'fuse.min.js';
  const dest = path.join(vendor, destRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  esbuild.buildSync({
    stdin: {
      contents: "import Fuse from 'fuse.js'; globalThis.Fuse = Fuse;",
      resolveDir: root,
      sourcefile: 'fuse-classic-worker-entry.js',
      loader: 'js',
    },
    bundle: true,
    minify: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    outfile: dest,
    logLevel: 'silent',
  });
  console.log('[vendor-libs]', destRel, '<- bundled fuse.js classic-worker facade');
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
  bundleFuseForClassicWorker();
  ok += 1;

  // Keep legacy script URLs operational while loading the patched ESM build.
  // The mutable facade is required because the PDF security layer wraps getDocument.
  // PDF.js 6 owns teardown on PDFDocumentLoadingTask, so resolved document proxies
  // receive a compatibility destroy() method that delegates to the real task.
  writeText('pdf.min.js', `void import('./pdf.min.mjs').then((module) => {
  const pdfjsLib = { ...module };
  const getDocument = pdfjsLib.getDocument.bind(pdfjsLib);
  pdfjsLib.getDocument = (...args) => {
    const loadingTask = getDocument(...args);
    let documentPromise;
    return new Proxy(loadingTask, {
      get(target, property, receiver) {
        if (property === 'promise') {
          documentPromise ||= target.promise.then((documentProxy) => new Proxy(documentProxy, {
            get(documentTarget, documentProperty, documentReceiver) {
              if (documentProperty === 'destroy' && typeof documentTarget.destroy !== 'function') {
                return () => target.destroy();
              }
              const value = Reflect.get(documentTarget, documentProperty, documentReceiver);
              return typeof value === 'function' ? value.bind(documentTarget) : value;
            },
          }));
          return documentPromise;
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
      set(target, property, value) {
        return Reflect.set(target, property, value, target);
      },
    });
  };
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', document.baseURI).href;
  window.pdfjsLib = pdfjsLib;
  window.dispatchEvent(new CustomEvent('opencoursedeck:pdfjs-ready'));
}).catch((error) => {
  console.error('[OpenCourseDeck PDF] Failed to load the patched PDF.js module', error);
});
`);
  writeText('pdf.worker.min.js', `void import('./pdf.worker.min.mjs');
`);
  ok += 2;


  // Fonts: retain only used weights and WOFF2 subsets referenced by Fontsource CSS.
  // This preserves language coverage while preventing hundreds of unused italic/weight/WOFF files
  // from dominating the offline release and service-worker precache.
  const fonts = [
    // 300/900 were only referenced by unused .font-light/.font-black utilities.
    { pkg: '@fontsource/inter', out: 'fonts/inter', weights: [400, 500, 600, 700, 800] },
    { pkg: '@fontsource/jetbrains-mono', out: 'fonts/jetbrains-mono', weights: [400, 600, 700] },
    { pkg: '@fontsource/playfair-display', out: 'fonts/playfair-display', weights: [400, 700, 800] },
  ];

  const fontImports = [];
  for (const font of fonts) {
    const pkgRoot = path.join(root, 'node_modules', font.pkg);
    const outputRoot = path.join(vendor, font.out);
    if (!fs.existsSync(pkgRoot)) {
      console.error('[vendor-libs] Missing font package:', font.pkg);
      process.exit(1);
    }
    fs.rmSync(outputRoot, { recursive: true, force: true });
    fs.mkdirSync(path.join(outputRoot, 'files'), { recursive: true });

    const cssBlocks = [];
    const referenced = new Set();
    for (const weight of font.weights) {
      const cssFile = path.join(pkgRoot, `${weight}.css`);
      if (!fs.existsSync(cssFile)) throw new Error(`Missing Fontsource weight CSS: ${cssFile}`);
      let css = fs.readFileSync(cssFile, 'utf8');
      css = css.replace(/src:\s*url\(([^)]+\.woff2)\)\s*format\(['"]woff2['"]\)[^;]*;/g, (_match, woff2) => {
        const cleaned = woff2.replace(/^['"]|['"]$/g, '');
        referenced.add(cleaned.replace(/^\.\//, ''));
        return `src: url(${woff2}) format('woff2');`;
      });
      if (/\.woff(?:['")])/.test(css)) throw new Error(`Legacy WOFF source remained in ${cssFile}`);
      cssBlocks.push(css.trim());
    }

    for (const relative of [...referenced].sort()) {
      const source = path.join(pkgRoot, relative);
      const destination = path.join(outputRoot, relative.replace(/^files[\\/]/, 'files/'));
      if (!fs.existsSync(source)) throw new Error(`Missing referenced font file: ${source}`);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
    }
    writeText(`${font.out}/index.css`, `${cssBlocks.join('\n\n')}\n`);
    fontImports.push(`@import "./${path.basename(font.out)}/index.css";`);
    ok += referenced.size + 1;
  }

  writeText('fonts/fonts.css', `${fontImports.join('\n')}\n`);
  const { checkFontBudget } = require('./check-font-budget.cjs');
  const budget = checkFontBudget();
  console.log(`[vendor-libs] Font budget: ${budget.count} files / ${budget.bytes} bytes`);
  ok += 1;

  console.log('[vendor-libs] Done,', ok, 'files in', path.relative(root, vendor));
}

main();
