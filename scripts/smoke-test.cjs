/**
 * End-to-end HTTP smoke test for both the source development root and the
 * portable release root. Each server binds to an ephemeral port.
 */
const http = require('http');
const path = require('path');
const { createServer } = require('./dev-server.cjs');

const root = path.join(__dirname, '..');
const releaseRoot = path.join(root, 'dist');

function request(method, url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method,
      timeout: 8000,
    };
    const req = http.request(opts, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.end();
  });
}

function getStatus(url) {
  return request('GET', url);
}

function extractChunkPaths(source, basePath = '/dist/opencoursedeck.js') {
  const paths = new Set();
  const baseDir = path.posix.dirname(basePath);
  for (const match of String(source || '').matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) continue;
    const normalized = path.posix.normalize(path.posix.join(baseDir, specifier));
    paths.add(normalized.startsWith('/') ? normalized : `/${normalized}`);
  }
  return [...paths].sort();
}

async function defaultFetchText(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname + u.search,
      method: 'GET',
      timeout: 8000,
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.end();
  });
}

async function collectChunkPaths(origin, entrySource, fetchText = defaultFetchText, entryPath = '/dist/opencoursedeck.js') {
  const seen = new Set();
  const queue = extractChunkPaths(entrySource, entryPath);
  while (queue.length) {
    const chunkPath = queue.shift();
    if (seen.has(chunkPath)) continue;
    seen.add(chunkPath);
    const response = await fetchText(new URL(chunkPath, origin).href);
    if (response.status !== 200) continue;
    for (const nested of extractChunkPaths(response.body, chunkPath)) {
      if (!seen.has(nested)) queue.push(nested);
    }
  }
  return [...seen].sort();
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off?.('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Server did not expose an address');
  return `http://127.0.0.1:${address.port}`;
}

async function close(server) {
  if (!server?.listening) return;
  await new Promise((resolve) => server.close(resolve));
}

async function assertPaths(origin, paths) {
  for (const resourcePath of paths) {
    const code = await getStatus(`${origin}${resourcePath}`);
    if (code !== 200) throw new Error(`${resourcePath} -> HTTP ${code}`);
  }
}

async function assertChunks(origin, entryPath) {
  const entry = await defaultFetchText(`${origin}${entryPath}`);
  if (entry.status !== 200) throw new Error(`${entryPath} -> HTTP ${entry.status}`);
  const chunks = await collectChunkPaths(origin, entry.body, defaultFetchText, entryPath);
  await assertPaths(origin, chunks);
  return chunks.length;
}

async function smokeSourceRoot() {
  const server = createServer({ root });
  try {
    const origin = await listen(server);
    const paths = [
      '/',
      '/index.html',
      '/style.css',
      '/manifest.json',
      '/boot.js',
      '/dist/opencoursedeck.js',
      '/dist/sw.js',
      '/vendor/purify.min.js',
      '/vendor/fuse.min.js',
      '/vendor/chart.umd.js',
      '/vendor/pdf.min.mjs',
      '/vendor/pdf.worker.min.mjs',
      '/vendor/fonts/fonts.css',
      '/pdf-runtime.js',
      '/data/catalog.json',
      '/data/opencoursedeck-starter.json',
    ];
    await assertPaths(origin, paths);
    const chunkCount = await assertChunks(origin, '/dist/opencoursedeck.js');

    const headCss = await request('HEAD', `${origin}/style.css`);
    if (headCss !== 200) throw new Error(`HEAD /style.css -> HTTP ${headCss}`);

    const missing = await getStatus(`${origin}/__pd_smoke_missing_file_404`);
    if (missing !== 404) throw new Error(`missing asset -> expected 404, got ${missing}`);

    const badDebug = await request('GET', `${origin}/__debug`);
    if (badDebug !== 405) throw new Error(`GET /__debug -> expected 405, got ${badDebug}`);

    return paths.length + chunkCount + 3;
  } finally {
    await close(server);
  }
}

async function smokeReleaseRoot() {
  const server = createServer({ root: releaseRoot });
  try {
    const origin = await listen(server);
    const paths = [
      '/',
      '/index.html',
      '/style.css',
      '/manifest.json',
      '/boot.js',
      '/opencoursedeck.js',
      '/sw.js',
      '/vendor/purify.min.js',
      '/vendor/fuse.min.js',
      '/vendor/chart.umd.js',
      '/vendor/pdf.min.mjs',
      '/vendor/pdf.worker.min.mjs',
      '/vendor/fonts/fonts.css',
      '/pdf-runtime.js',
      '/data/catalog.json',
      '/data/opencoursedeck-starter.json',
    ];
    await assertPaths(origin, paths);
    const chunkCount = await assertChunks(origin, '/opencoursedeck.js');
    return paths.length + chunkCount;
  } finally {
    await close(server);
  }
}

async function main() {
  const sourceChecks = await smokeSourceRoot();
  const releaseChecks = await smokeReleaseRoot();
  console.log('[smoke] OK —', sourceChecks + releaseChecks, 'development and release checks passed.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[smoke] FAIL:', error?.message || error);
    process.exit(1);
  });
}

module.exports = {
  collectChunkPaths,
  extractChunkPaths,
  main,
  smokeReleaseRoot,
  smokeSourceRoot,
};
