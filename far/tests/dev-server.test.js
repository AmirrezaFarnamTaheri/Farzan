import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function request(url, { headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'GET', headers }, (response) => {
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
    req.end();
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
});
