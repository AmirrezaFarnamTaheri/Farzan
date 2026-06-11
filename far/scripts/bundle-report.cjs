const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const indexPath = path.join(root, 'index.html');

const limits = {
  totalJsBytes: 455 * 1024,
  largestJsBytes: 180 * 1024,
  entryBytes: 80 * 1024,
};

function walkFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, files);
    else if (entry.isFile()) files.push(full);
  }
  return files.sort();
}

function rel(file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function isAppBundleJs(file) {
  const normalized = rel(file);
  return normalized === 'dist/plasma.js' || normalized.startsWith('dist/chunks/');
}

function parseCsp(html) {
  const content = html.match(/Content-Security-Policy"[\s\S]*?content="([^"]+)"/)?.[1] ?? '';
  return Object.fromEntries(content
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const [name, ...values] = part.split(/\s+/);
      return [name, values];
    }));
}

function createBundleReport() {
  const files = walkFiles(dist)
    .filter(file => file.endsWith('.js') && isAppBundleJs(file))
    .map(file => {
      const bytes = fs.statSync(file).size;
      const raw = fs.readFileSync(file);
      return {
        path: rel(file),
        bytes,
        gzipBytes: zlib.gzipSync(raw).length,
      };
    });
  const totalJsBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const largest = [...files].sort((a, b) => b.bytes - a.bytes)[0] ?? null;
  const entry = files.find(file => file.path === 'dist/plasma.js') ?? null;
  const html = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
  const csp = parseCsp(html);
  return {
    generatedAt: new Date().toISOString(),
    limits,
    totals: {
      files: files.length,
      totalJsBytes,
      totalJsGzipBytes: files.reduce((sum, file) => sum + file.gzipBytes, 0),
      largestJsBytes: largest?.bytes ?? 0,
      entryBytes: entry?.bytes ?? 0,
    },
    files,
    csp,
  };
}

function evaluateReport(report) {
  const failures = [];
  if (!report.files?.some((file) => file.path === 'dist/plasma.js')) {
    failures.push('dist/plasma.js is missing from the bundle report');
  }
  if (!report.totals.files) {
    failures.push('no generated app bundle files were found');
  }
  if (report.totals.totalJsBytes > limits.totalJsBytes) {
    failures.push(`total JS ${report.totals.totalJsBytes} exceeds ${limits.totalJsBytes}`);
  }
  if (report.totals.largestJsBytes > limits.largestJsBytes) {
    failures.push(`largest JS ${report.totals.largestJsBytes} exceeds ${limits.largestJsBytes}`);
  }
  if (report.totals.entryBytes > limits.entryBytes) {
    failures.push(`entry JS ${report.totals.entryBytes} exceeds ${limits.entryBytes}`);
  }
  const csp = report.csp || {};
  if (!csp['script-src']?.includes("'self'")) failures.push("CSP script-src must include 'self'");
  if (csp['script-src']?.includes("'unsafe-inline'")) failures.push('CSP script-src must not include unsafe-inline');
  for (const directive of ['media-src', 'connect-src', 'frame-src']) {
    if (!csp[directive]?.includes('http:') || !csp[directive]?.includes('https:')) {
      failures.push(`CSP ${directive} must keep remote http:/https: support`);
    }
  }
  return failures;
}

function main() {
  const report = createBundleReport();
  const failures = evaluateReport(report);
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) {
    console.error('[bundle-report] FAIL');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.error('[bundle-report] OK');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('[bundle-report] failed', error);
    process.exit(1);
  }
}

module.exports = {
  createBundleReport,
  evaluateReport,
  isAppBundleJs,
  parseCsp,
};
