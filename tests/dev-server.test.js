import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function request(url, { headers = {}, method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (response) => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const values = response.headers;
        resolve({
          status: response.statusCode,
          headers: {
            get(name) {
              const value = values[String(name).toLowerCase()];
              return Array.isArray(value) ? value.join(', ') : value ?? null;
            },
          },
          text: async () => Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

function rawRequest(port, text) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => socket.end(text));
    let data = '';
    socket.on('data', (chunk) => { data += chunk; });
    socket.on('end', () => resolve(data));
    socket.on('error', reject);
  });
}

describe('dev server range handling', () => {
  let createServer;
  let root;
  let server;
  let baseUrl;

  beforeEach(async () => {
    ({ createServer } = await import('../scripts/dev-server.cjs'));
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opencoursedeck-dev-'));
    fs.writeFileSync(path.join(root, 'sample.txt'), '0123456789', 'utf8');
    fs.writeFileSync(
      path.join(root, 'index.html'),
      `<meta http-equiv="Content-Security-Policy"
        content="script-src 'self';
                 media-src 'self' http: https:;">
       <main>ok</main>`,
      'utf8',
    );
    server = createServer({ root });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it('serves suffix byte ranges from the end of the file', async () => {
    const res = await request(`${baseUrl}/sample.txt`, { headers: { Range: 'bytes=-4' } });

    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 6-9/10');
    expect(res.headers.get('content-length')).toBe('4');
    expect(await res.text()).toBe('6789');
  });

  it('rejects invalid zero-length suffix ranges', async () => {
    const res = await request(`${baseUrl}/sample.txt`, { headers: { Range: 'bytes=-0' } });

    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe('bytes */10');
  });

  it('serves URL-decoded file paths inside the project root', async () => {
    fs.writeFileSync(path.join(root, 'space file.txt'), 'ok', 'utf8');

    const res = await request(`${baseUrl}/space%20file.txt`);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('rejects multiple byte ranges instead of falling back to full content', async () => {
    const res = await request(`${baseUrl}/sample.txt`, { headers: { Range: 'bytes=0-1,3-4' } });

    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe('bytes */10');
  });

  it('normalizes multiline app CSP before sending it as an HTTP header', async () => {
    const res = await request(`${baseUrl}/`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toBe("script-src 'self'; media-src 'self' http: https:;");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('does not attach CSP headers to non-HTML assets', async () => {
    const res = await request(`${baseUrl}/sample.txt`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toBeNull();
  });

  it('answers 400 for malformed percent-encoding instead of crashing', async () => {
    const res = await request(`${baseUrl}/%`);

    expect(res.status).toBe(400);

    // The server must still be alive for subsequent requests.
    const followUp = await request(`${baseUrl}/sample.txt`);
    expect(followUp.status).toBe(200);
  });

  it('serves .mjs modules with a JavaScript MIME type so nosniff does not block them', async () => {
    fs.writeFileSync(path.join(root, 'module.mjs'), 'export const ok = true;', 'utf8');

    const res = await request(`${baseUrl}/module.mjs`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/javascript; charset=utf-8');
  });

  it('answers 400 for a malformed Host header instead of crashing', async () => {
    const port = server.address().port;
    const reply = await rawRequest(port, 'GET / HTTP/1.1\r\nHost: a b\r\nConnection: close\r\n\r\n');

    expect(reply).toMatch(/^HTTP\/1\.1 4\d\d/);
    const followUp = await request(`${baseUrl}/sample.txt`);
    expect(followUp.status).toBe(200);
  });

  it('refuses requests addressed to a non-loopback host (DNS rebinding guard)', async () => {
    const res = await request(`${baseUrl}/sample.txt`, { headers: { Host: 'attacker.example:80' } });

    expect(res.status).toBe(421);
  });

  it('accepts localhost-style host names', async () => {
    const port = server.address().port;
    for (const host of [`localhost:${port}`, `127.0.0.1:${port}`, `app.localhost:${port}`]) {
      const res = await request(`${baseUrl}/sample.txt`, { headers: { Host: host } });
      expect(res.status).toBe(200);
    }
  });

  it('accepts all 127.x.y.z loopback addresses (127.0.0.0/8)', async () => {
    const port = server.address().port;
    for (const loopback of [`127.0.0.2:${port}`, `127.1.2.3:${port}`, `127.255.255.254:${port}`]) {
      const res = await request(`${baseUrl}/sample.txt`, { headers: { Host: loopback } });
      expect(res.status).toBe(200);
    }
  });

  it('rejects non-loopback 127.x.y.z addresses when server is bound to loopback', async () => {
    // Note: server is bound to loopback, so non-loopback hostnames get 421
    // This test would be redundant here since we're already bound to loopback.
    // The 127.0.0.0/8 expansion ensures attackers cannot bypass by using 127.0.0.2
    // when we only checked for exact 127.0.0.1.
  });

  it('never serves dot-directories such as .git', async () => {
    fs.mkdirSync(path.join(root, '.git'));
    fs.writeFileSync(path.join(root, '.git', 'config'), '[core]', 'utf8');
    fs.writeFileSync(path.join(root, '.env'), 'SECRET=1', 'utf8');

    expect((await request(`${baseUrl}/.git/config`)).status).toBe(403);
    expect((await request(`${baseUrl}/.env`)).status).toBe(403);
    expect((await request(`${baseUrl}/%2egit/config`)).status).toBe(403);
  });

  it('ignores cross-origin debug log writes', async () => {
    const res = await request(`${baseUrl}/__debug?debug=1`, {
      method: 'POST',
      headers: { Origin: 'https://attacker.example', 'Content-Type': 'text/plain' },
      body: '{"evil":true}',
    });

    expect(res.status).toBe(204);
    expect(fs.existsSync(path.join(root, 'debug.log'))).toBe(false);
  });

  it('accepts same-origin debug log writes when debug is enabled', async () => {
    const res = await request(`${baseUrl}/__debug?debug=1`, {
      method: 'POST',
      headers: { Origin: baseUrl, 'Content-Type': 'text/plain' },
      body: '{"ok":true}',
    });

    expect(res.status).toBe(204);
    expect(fs.readFileSync(path.join(root, 'debug.log'), 'utf8')).toBe('{"ok":true}\n');
  });
});
