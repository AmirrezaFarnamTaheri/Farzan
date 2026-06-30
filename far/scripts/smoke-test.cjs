/**
 * End-to-end HTTP smoke test for the local dev server.
 * Starts the dev server in-process, probes critical URLs, then terminates it.
 */
const http = require('http');
const path = require('path');
const { createServer } = require('./dev-server.cjs');

const root = path.join(__dirname, '..');
const port = 52000 + Math.floor(Math.random() * 2000);
const server = createServer({ root });

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

async function waitForReady() {
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 80; i++) {
    try {
      const code = await getStatus(url);
      if (code === 200) return;
    } catch {
      // still starting
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Server did not respond 200 at ${url}`);
}

async function main() {
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.off?.('error', reject);
        resolve();
      });
    });

    await waitForReady();
    const paths = [
      '/',
      '/index.html',
      '/style.css',
      '/manifest.json',
      '/boot.js',
      '/dist/opencoursedeck.js',
      '/sw.js',
      '/vendor/purify.min.js',
      '/vendor/marked.min.js',
    ];
    for (const p of paths) {
      const code = await getStatus(`http://127.0.0.1:${port}${p}`);
      if (code !== 200) throw new Error(`${p} -> HTTP ${code}`);
    }

    const entry = await defaultFetchText(`http://127.0.0.1:${port}/dist/opencoursedeck.js`);
    const chunks = await collectChunkPaths(`http://127.0.0.1:${port}`, entry.body);
    for (const p of chunks) {
      const code = await getStatus(`http://127.0.0.1:${port}${p}`);
      if (code !== 200) throw new Error(`${p} -> HTTP ${code}`);
    }

    const headCss = await request('HEAD', `http://127.0.0.1:${port}/style.css`);
    if (headCss !== 200) throw new Error(`HEAD /style.css -> HTTP ${headCss}`);

    const missing = await getStatus(`http://127.0.0.1:${port}/__pd_smoke_missing_file_404`);
    if (missing !== 404) throw new Error(`missing asset -> expected 404, got ${missing}`);

    const badDebug = await request('GET', `http://127.0.0.1:${port}/__debug`);
    if (badDebug !== 405) throw new Error(`GET /__debug -> expected 405, got ${badDebug}`);

    console.log('[smoke] OK —', paths.length + 4, 'checks on port', port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[smoke] FAIL:', err?.message || err);
    try { server.close(); } catch { /* ignore */ }
    process.exit(1);
  });
}

module.exports = {
  collectChunkPaths,
  extractChunkPaths,
  main,
};
