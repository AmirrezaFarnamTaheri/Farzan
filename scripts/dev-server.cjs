/**
 * OpenCourseDeck dev server (same-origin debug endpoint).
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
  '.mjs': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
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

/**
 * Send an HTTP response with security headers.
 * @param {http.ServerResponse} res - The response object
 * @param {number} status - HTTP status code
 * @param {Object} headers - Response headers
 * @param {string} body - Response body
 */
function send(res, status, headers, body) {
  res.writeHead(status, withNoSniff(headers));
  res.end(body);
}

/**
 * Safely join a base directory with a requested path, preventing directory traversal.
 * Returns null if the resolved path escapes the base directory.
 * @param {string} base - Base directory path
 * @param {string} requestedPath - Requested path (possibly with ../ or other escape attempts)
 * @returns {string|null} - Resolved path if safe, null if it escapes base
 */
function safeJoin(base, requestedPath) {
  const baseResolved = path.resolve(base);
  const pResolved = path.resolve(baseResolved, requestedPath);
  const baseWithSep = baseResolved.endsWith(path.sep) ? baseResolved : baseResolved + path.sep;
  const sameRoot = pResolved === baseResolved;
  const withinRoot = pResolved.startsWith(baseWithSep);
  if (!sameRoot && !withinRoot) return null;
  return pResolved;
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Extract hostname from a Host header, stripping port and IPv6 brackets.
 * @param {string} hostHeader - The Host header value
 * @returns {string} - Hostname without port
 */
function hostnameOf(hostHeader) {
  if (typeof hostHeader !== 'string' || !hostHeader) return '';
  const value = hostHeader.trim().toLowerCase();
  if (value.startsWith('[')) return value.slice(0, value.indexOf(']') + 1);
  return value.split(':')[0];
}

/**
 * Check if a hostname is a loopback address (IPv4 127.0.0.0/8 or IPv6 ::1).
 * Recognizes localhost, 127.0.0.1, and .localhost suffix; also any 127.x.y.z address.
 * @param {string} hostname - The hostname (or Host header) to check
 * @returns {boolean} - True if loopback, false otherwise
 */
function isLoopbackAddress(hostname) {
  const name = hostnameOf(hostname);
  if (LOOPBACK_HOSTNAMES.has(name) || name.endsWith('.localhost')) return true;
  // Check IPv4 127.x.y.z range
  if (/^127(\.\d{1,3}){3}$/.test(name)) {
    const parts = name.split('.');
    return parts.slice(1).every(part => /^\d+$/.test(part) && Number(part) <= 255);
  }
  return false;
}

/**
 * DNS-rebinding guard: verify the Host header against allowed loopback names.
 * A loopback-bound server only answers requests addressed to loopback names,
 * preventing a remote page from re-pointing its hostname to 127.0.0.1 and reading local files.
 * @param {string} hostHeader - The Host header value
 * @param {boolean} allowAnyHost - If true, allow any host (for non-loopback-bound servers)
 * @returns {boolean} - True if host is allowed, false otherwise
 */
function isAllowedHost(hostHeader, allowAnyHost) {
  if (allowAnyHost) return true;
  return isLoopbackAddress(hostHeader);
}

/**
 * Detect if a relative path contains hidden files (dot-segments).
 * Dot-files like .git, .env are repository/tooling state, never app assets.
 * Exemption: .well-known is reachable for ACME and other standard metadata.
 * @param {string} relPath - Relative file path
 * @returns {boolean} - True if path contains hidden segments, false otherwise
 */
function isHiddenPath(relPath) {
  return relPath.split(/[\\/]/).some((segment) => segment.startsWith('.') && segment !== '.well-known');
}

/**
 * Verify that a POST request to the debug endpoint is same-origin.
 * Browsers attach Origin to cross-site POSTs. Non-browser clients (no Origin) are accepted.
 * @param {http.IncomingMessage} req - The request object
 * @returns {boolean} - True if same-origin or no Origin header, false if cross-origin
 */
function isSameOriginPost(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === String(req.headers.host || '').toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Check if debug logging is enabled via URL parameter or environment variable.
 * @param {URL} reqUrl - Parsed request URL
 * @returns {boolean} - True if debug logging is enabled
 */
function isDebugEnabled(reqUrl) {
  try {
    const qs = reqUrl.searchParams;
    if (qs.get('debug') === '1') return true;
    return process.env.PD_DEBUG === '1';
  } catch {
    return process.env.PD_DEBUG === '1';
  }
}

/**
 * Determine Cache-Control header value based on file extension.
 * HTML and source files are not cached; media and fonts are cached for 1 hour.
 * @param {string} relPath - Relative file path
 * @returns {string} - Cache-Control header value
 */
function cacheControlForPath(relPath) {
  const ext = path.extname(relPath).toLowerCase();
  if (ext === '.html') return 'no-store';
  if (ext === '.js' || ext === '.css' || ext === '.map') return 'no-store';
  if (ext === '.woff' || ext === '.woff2' || ext === '.ttf') return 'public, max-age=3600';
  if (ext === '.mp4' || ext === '.webm' || ext === '.mp3' || ext === '.ogg' || ext === '.wav' || ext === '.pdf') {
    return 'public, max-age=3600';
  }
  return 'no-store';
}

/**
 * Add X-Content-Type-Options: nosniff to response headers to prevent MIME-type sniffing.
 * @param {Object} headers - HTTP headers object
 * @returns {Object} - Headers object with nosniff added
 */
function withNoSniff(headers) {
  return { ...headers, 'X-Content-Type-Options': 'nosniff' };
}

/**
 * Extract the Content-Security-Policy from an HTML file's meta tag.
 * Used to enforce CSP in served HTML files.
 * @param {string} filePath - Path to the HTML file
 * @returns {string|null} - CSP value if found, null otherwise
 */
function extractCsp(filePath) {
  try {
    const html = fs.readFileSync(filePath, 'utf8');
    const value = html.match(/Content-Security-Policy"[\s\S]*?content="([^"]+)"/)?.[1];
    return value ? value.replace(/\s+/g, ' ').trim() : null;
  } catch {
    return null;
  }
}

/**
 * Stream a file to the response, handling range requests and cache headers.
 * @param {http.IncomingMessage} req - The request object
 * @param {http.ServerResponse} res - The response object
 * @param {string} filePath - Path to the file to serve
 * @param {string} type - MIME type of the file
 * @param {string} relPath - Relative path (for cache control determination)
 * @returns {number} - HTTP status code sent
 */
function streamFile(req, res, filePath, type, relPath) {
  const stat = fs.statSync(filePath);
  const range = req.headers.range;
  const cspHeader = type.startsWith('text/html') ? extractCsp(filePath) : null;
  const baseHeaders = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': cacheControlForPath(relPath),
    ...(cspHeader ? { 'Content-Security-Policy': cspHeader } : {}),
  };

  if (req.method === 'HEAD') {
    res.writeHead(200, withNoSniff({
      ...baseHeaders,
      'Content-Length': stat.size,
    }));
    res.end();
    return 200;
  }

  if (range) {
    if (!/^bytes=\d*-\d*$/.test(range) || range.includes(',')) {
      send(res, 416, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Range': `bytes */${stat.size}` }, 'Range Not Satisfiable');
      return 416;
    }
    const [startRaw, endRaw] = range.replace('bytes=', '').split('-');
    let start;
    let end;
    if (!startRaw) {
      const suffixLength = Number(endRaw);
      if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
        send(res, 416, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Range': `bytes */${stat.size}` }, 'Range Not Satisfiable');
        return 416;
      }
      start = Math.max(stat.size - suffixLength, 0);
      end = stat.size - 1;
    } else {
      start = Number(startRaw);
      end = endRaw ? Number(endRaw) : stat.size - 1;
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end >= stat.size) {
      send(res, 416, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Range': `bytes */${stat.size}` }, 'Range Not Satisfiable');
      return 416;
    }

    res.writeHead(206, withNoSniff({
      ...baseHeaders,
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
    }));
    pipeFile(filePath, res, { start, end });
    return 206;
  }

  res.writeHead(200, withNoSniff({
    ...baseHeaders,
    'Content-Length': stat.size,
  }));
  pipeFile(filePath, res);
  return 200;
}

/**
 * Stream a file from disk to the HTTP response using fs.createReadStream.
 * Handles errors by destroying the response (headers already sent).
 * @param {string} filePath - Path to the file to stream
 * @param {http.ServerResponse} res - The response object
 * @param {Object} [streamOptions] - Options for fs.createReadStream (e.g., { start, end })
 */
function pipeFile(filePath, res, streamOptions) {
  const stream = fs.createReadStream(filePath, streamOptions);
  stream.on('error', (error) => {
    // Headers are already sent; destroying the response is all we can do.
    console.error(`[opencoursedeck] Read stream failed for ${filePath}:`, error?.message || error);
    res.destroy(error);
  });
  stream.pipe(res);
}

/**
 * Create an HTTP server that serves static files from a root directory.
 * Enforces DNS-rebinding protection, blocks hidden paths (.git, .env),
 * handles HTTP range requests, and provides optional debug logging.
 * @param {Object} [options] - Server configuration
 * @param {string} [options.root] - Root directory to serve from (default: project root)
 * @param {string} [options.debugLogPath] - Path to debug log (default: debug.log)
 * @param {boolean} [options.allowAnyHost] - If true, accept any Host header
 * @returns {http.Server} - The created HTTP server (not yet listening)
 */
function createServer(options = {}) {
  const serverRoot = options.root ? path.resolve(options.root) : root;
  const debugLogPath = options.debugLogPath
    ? path.resolve(serverRoot, options.debugLogPath)
    : path.join(serverRoot, 'debug.log');

  const allowAnyHost = Boolean(options.allowAnyHost);

  return http.createServer((req, res) => {
    const started = Date.now();
    // Parse against a fixed base: the Host header is client-controlled and a
    // malformed value (e.g. "a b") would otherwise throw and kill the server.
    let u;
    try {
      u = new URL(req.url, 'http://localhost');
    } catch {
      console.log(`[opencoursedeck] ${req.method} <malformed url> -> 400`);
      return send(res, 400, { 'Content-Type': 'text/plain' }, 'Bad Request');
    }
    const finish = (status) => {
      try {
        const ms = Date.now() - started;
        console.log(`[opencoursedeck] ${req.method} ${u.pathname} -> ${status} (${ms}ms)`);
      } catch {
        // Logging is best effort.
      }
    };

    if (!isAllowedHost(req.headers.host, allowAnyHost)) {
      finish(421);
      return send(res, 421, { 'Content-Type': 'text/plain' },
        'Misdirected Request: open OpenCourseDeck via localhost or 127.0.0.1, or start the server with HOST set to the address you are using.');
    }

    if (u.pathname === '/__debug') {
      if (req.method !== 'POST') {
        finish(405);
        return send(res, 405, { 'Content-Type': 'text/plain' }, 'Method Not Allowed');
      }
      if (!isDebugEnabled(u) || !isSameOriginPost(req)) {
        finish(204);
        return send(res, 204, { 'Content-Type': 'text/plain' }, '');
      }
      let raw = '';
      let tooLarge = false;
      req.on('data', (chunk) => {
        raw += chunk;
        if (raw.length > 256 * 1024) {
          tooLarge = true;
          try { req.destroy(); } catch {}
        }
      });
      req.on('end', () => {
        if (tooLarge) {
          finish(413);
          return send(res, 413, { 'Content-Type': 'text/plain' }, 'Payload Too Large');
        }
        try {
          const line = raw.includes('\n') ? raw.trim().split('\n').filter(Boolean)[0] : raw.trim();
          if (line) fs.appendFileSync(debugLogPath, line + '\n', 'utf8');
        } catch {
          // Debug logging must not affect the app response.
        }
        finish(204);
        send(res, 204, { 'Content-Type': 'text/plain' }, '');
      });
      return;
    }

    let rel;
    try {
      rel = u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname.replace(/^\//, ''));
    } catch {
      // Malformed percent-encoding must not crash the process.
      finish(400);
      return send(res, 400, { 'Content-Type': 'text/plain' },
        'Bad Request: the URL path contains malformed percent-encoding. Remove stray "%" characters or encode them as "%25".');
    }
    const filePath = isHiddenPath(rel) ? null : safeJoin(serverRoot, rel);
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
    } catch (error) {
      console.error(`[opencoursedeck] Failed to serve ${u.pathname}:`, error?.message || error);
      finish(500);
      send(res, 500, { 'Content-Type': 'text/plain' }, 'Server error');
    }
  });
}

/**
 * Create and start the development server on the specified host and port.
 * Automatically enables DNS-rebinding protection if the server is bound to a loopback address.
 * @param {Object} [options] - Server options (passed to createServer)
 * @param {string} [options.port] - Port number (default: 5173 or PORT env var)
 * @param {string} [options.host] - Host address (default: 127.0.0.1 or HOST env var)
 * @param {string} [options.root] - Root directory to serve
 * @param {string} [options.debugLogPath] - Path to debug log
 * @returns {http.Server} - The listening HTTP server
 */
function startServer(options = {}) {
  const port = Number(options.port || process.env.PORT || 5173);
  const host = options.host || process.env.HOST || '127.0.0.1';
  const loopback = isLoopbackAddress(host);
  const server = createServer({ allowAnyHost: !loopback, ...options });
  server.listen(port, host, () => {
    console.log(`[opencoursedeck] dev server http://${host}:${port}/`);
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
  extractCsp,
  isAllowedHost,
  isHiddenPath,
  isLoopbackAddress,
};
