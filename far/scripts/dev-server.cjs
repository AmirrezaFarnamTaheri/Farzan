/**
 * PlasmaDeck dev server (same-origin debug endpoint).
 * - Serves static files from project root
 * - Accepts POST /__debug to append NDJSON logs to debug.log (opt-in)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const root = path.join(__dirname, '..');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.wasm': 'application/wasm',
};

function send(res, status, headers, body) {
  res.writeHead(status, withNoSniff(headers));
  res.end(body);
}

function safeJoin(base, requestedPath) {
  const baseResolved = path.resolve(base);
  const pResolved = path.resolve(baseResolved, requestedPath);
  const baseWithSep = baseResolved.endsWith(path.sep) ? baseResolved : baseResolved + path.sep;
  const sameRoot = pResolved === baseResolved;
  const withinRoot = pResolved.startsWith(baseWithSep);
  if (!sameRoot && !withinRoot) return null;
  return pResolved;
}

function isDebugEnabled(reqUrl) {
  try {
    const qs = reqUrl.searchParams;
    if (qs.get('debug') === '1') return true;
    return process.env.PD_DEBUG === '1';
  } catch {
    return process.env.PD_DEBUG === '1';
  }
}

function cacheControlForPath(relPath) {
  const ext = path.extname(relPath).toLowerCase();
  if (ext === '.html') return 'no-store';
  if (ext === '.js' || ext === '.css' || ext === '.map') return 'no-store';
  // Fonts/media can be cached a bit even in dev.
  if (ext === '.woff' || ext === '.woff2' || ext === '.ttf') return 'public, max-age=3600';
  if (ext === '.mp4' || ext === '.webm' || ext === '.mp3' || ext === '.ogg' || ext === '.wav' || ext === '.pdf') {
    return 'public, max-age=3600';
  }
  return 'no-store';
}

/** Reduce MIME sniffing risk on static responses */
function withNoSniff(headers) {
  return { ...headers, 'X-Content-Type-Options': 'nosniff' };
}

function streamFile(req, res, filePath, type, relPath) {
  const stat = fs.statSync(filePath);
  const range = req.headers.range;

  // HEAD: just metadata
  if (req.method === 'HEAD') {
    res.writeHead(200, withNoSniff({
      'Content-Type': type,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': cacheControlForPath(relPath),
    }));
    res.end();
    return 200;
  }

  if (range && /^bytes=\d*-\d*$/.test(range)) {
    const [startRaw, endRaw] = range.replace('bytes=', '').split('-');
    const start = startRaw ? Number(startRaw) : 0;
    const end = endRaw ? Number(endRaw) : stat.size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end >= stat.size) {
      send(res, 416, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Range': `bytes */${stat.size}` }, 'Range Not Satisfiable');
      return 416;
    }

    res.writeHead(206, withNoSniff({
      'Content-Type': type,
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': cacheControlForPath(relPath),
    }));
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return 206;
  }

  res.writeHead(200, withNoSniff({
    'Content-Type': type,
    'Content-Length': stat.size,
    'Accept-Ranges': 'bytes',
    'Cache-Control': cacheControlForPath(relPath),
  }));
  fs.createReadStream(filePath).pipe(res);
  return 200;
}

function createServer(options = {}) {
  const serverRoot = options.root ? path.resolve(options.root) : root;
  const debugLogPath = options.debugLogPath
    ? path.resolve(serverRoot, options.debugLogPath)
    : path.join(serverRoot, 'debug.log');

  return http.createServer((req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const started = Date.now();
  const finish = (status) => {
    try {
      const ms = Date.now() - started;
      console.log(`[plasmadeck] ${req.method} ${u.pathname} -> ${status} (${ms}ms)`);
    } catch {
      // ignore
    }
  };

  if (u.pathname === '/__debug') {
    if (req.method !== 'POST') {
      finish(405);
      return send(res, 405, { 'Content-Type': 'text/plain' }, 'Method Not Allowed');
    }
    if (!isDebugEnabled(u)) {
      finish(204);
      return send(res, 204, { 'Content-Type': 'text/plain' }, '');
    }
    let raw = '';
    let tooLarge = false;
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 256 * 1024) {
        tooLarge = true;
        try { req.destroy(); } catch { /* ignore */ }
      }
    });
    req.on('end', () => {
      if (tooLarge) {
        finish(413);
        return send(res, 413, { 'Content-Type': 'text/plain' }, 'Payload Too Large');
      }
      try {
        // Expect NDJSON or JSON; normalize to one-line NDJSON.
        const line = raw.includes('\n') ? raw.trim().split('\n').filter(Boolean)[0] : raw.trim();
        if (line) fs.appendFileSync(debugLogPath, line + '\n', 'utf8');
      } catch {
        // ignore
      }
      finish(204);
      send(res, 204, { 'Content-Type': 'text/plain' }, '');
    });
    return;
  }

  // Static
  const rel = u.pathname === '/' ? 'index.html' : u.pathname.replace(/^\//, '');
  const filePath = safeJoin(serverRoot, rel);
  if (!filePath) {
    finish(403);
    return send(res, 403, { 'Content-Type': 'text/plain' }, 'Forbidden');
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    finish(405);
    return send(res, 405, { 'Content-Type': 'text/plain' }, 'Method Not Allowed');
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    finish(404);
    return send(res, 404, { 'Content-Type': 'text/plain' }, 'Not found');
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = mime[ext] || 'application/octet-stream';
  try {
    const status = streamFile(req, res, filePath, type, rel);
    finish(status);
  } catch {
    finish(500);
    send(res, 500, { 'Content-Type': 'text/plain' }, 'Server error');
  }
  });
}

function startServer(options = {}) {
  const port = Number(options.port || process.env.PORT || 5173);
  const host = options.host || '127.0.0.1';
  const server = createServer(options);
  server.listen(port, host, () => {
    console.log(`[plasmadeck] dev server http://${host}:${port}/`);
  });
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createServer,
  startServer,
  safeJoin,
  cacheControlForPath,
};
