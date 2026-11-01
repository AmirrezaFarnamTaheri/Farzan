import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('bundle and CSP reporting', () => {
  it('parses CSP directives into a reportable shape', async () => {
    const { parseCsp } = await import('../scripts/bundle-report.cjs');

    const csp = parseCsp('<meta http-equiv="Content-Security-Policy" content="script-src \'self\'; media-src \'self\' http: https:;">');

    expect(csp['script-src']).toEqual(["'self'"]);
    expect(csp['media-src']).toEqual(["'self'", 'http:', 'https:']);
  });

  it('fails reports that exceed raw or compressed size budgets or weaken critical CSP rules', async () => {
    const { evaluateReport } = await import('../scripts/bundle-report.cjs');

    const failures = evaluateReport({
      files: [{ path: 'dist/opencoursedeck.js' }],
      totals: {
        totalJsBytes: 2 * 1024 * 1024,
        largestJsBytes: 2 * 1024 * 1024,
        entryBytes: 2 * 1024 * 1024,
        entryGzipBytes: 2 * 1024 * 1024,
      },
      csp: {
        'script-src': ["'self'", "'unsafe-inline'"],
        'media-src': ["'self'"],
        'connect-src': ["'self'", 'http:', 'https:'],
        'frame-src': ["'self'", 'http:', 'https:'],
      },
    });

    expect(failures).toEqual(expect.arrayContaining([
      expect.stringContaining('total JS'),
      expect.stringContaining('largest JS'),
      expect.stringContaining('entry JS'),
      expect.stringContaining('entry gzip JS'),
      'CSP script-src must not include unsafe-inline',
      'CSP media-src must keep remote http:/https: support',
    ]));
  });

  it('adds exactly 400 KiB of aggregate JS capacity while preserving entry, chunk and gzip caps', async () => {
    const { createBundleReport } = await import('../scripts/bundle-report.cjs');
    const { limits } = createBundleReport();
    expect(limits).toEqual({
      totalJsBytes: (1280 + 400) * 1024,
      largestJsBytes: 320 * 1024,
      entryBytes: 240 * 1024,
      entryGzipBytes: 80 * 1024,
    });
  });

  it('still rejects a total JS bundle one byte over the enlarged allowance', async () => {
    const { createBundleReport, evaluateReport } = await import('../scripts/bundle-report.cjs');
    const { limits } = createBundleReport();
    const report = {
      files: [{ path: 'dist/opencoursedeck.js' }],
      totals: {
        files: 1,
        totalJsBytes: limits.totalJsBytes,
        largestJsBytes: 1024,
        entryBytes: 1024,
        entryGzipBytes: 512,
      },
      csp: {
        'script-src': ["'self'"],
        'media-src': ["'self'", 'http:', 'https:'],
        'connect-src': ["'self'", 'http:', 'https:'],
        'frame-src': ["'self'", 'http:', 'https:'],
      },
    };
    expect(evaluateReport(report)).toEqual([]);
    expect(evaluateReport({
      ...report,
      totals: { ...report.totals, totalJsBytes: limits.totalJsBytes + 1 },
    })).toContain(`total JS ${limits.totalJsBytes + 1} exceeds ${limits.totalJsBytes}`);
  });

  it('measures actual Workbox precache source bytes without treating deferred chunks as absent', async () => {
    const os = await import('node:os');
    const { measurePrecacheArtifacts } = await import('../scripts/bundle-report.cjs');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'farzan-precache-'));
    try {
      fs.mkdirSync(path.join(root, 'chunks'), { recursive: true });
      fs.writeFileSync(path.join(root, 'index.html'), 'abc');
      fs.writeFileSync(path.join(root, 'opencoursedeck.js'), 'entry');
      fs.writeFileSync(path.join(root, 'chunks', 'lazy.js'), '1234567');
      fs.writeFileSync(path.join(root, 'sw.js'), [
        'precacheAndRoute([{url:"index.html",revision:"a"},',
        '{url:"opencoursedeck.js",revision:"b"},',
        '{url:"chunks/lazy.js",revision:"c"}]);',
      ].join(''));
      const data = measurePrecacheArtifacts(root);
      expect(data.count).toBe(3);
      expect(data.totalBytes).toBe(3 + 5 + 7);
      expect(data.jsBytes).toBe(5 + 7);
      expect(data.files.map(item => item.path)).toEqual([
        'chunks/lazy.js', 'index.html', 'opencoursedeck.js',
      ]);
      expect(data.missing).toEqual([]);
      expect(data.files.find(item => item.path === 'chunks/lazy.js')?.bytes).toBe(7);
      fs.unlinkSync(path.join(root, 'chunks/lazy.js'));
      const missing = measurePrecacheArtifacts(root);
      expect(missing.missing).toEqual(['chunks/lazy.js']);
      expect(missing.count).toBe(3);
      expect(missing.totalBytes).toBe(8);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects invalid or absent service worker precache evidence rather than claiming an empty install', async () => {
    const os = await import('node:os');
    const { measurePrecacheArtifacts } = await import('../scripts/bundle-report.cjs');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'farzan-invalid-precache-'));
    try {
      expect(() => measurePrecacheArtifacts(root)).toThrow(/service worker|precache/i);
      fs.writeFileSync(path.join(root, 'sw.js'), 'this is not a Workbox manifest');
      expect(() => measurePrecacheArtifacts(root)).toThrow(/precache|manifest/i);
      fs.writeFileSync(path.join(root, 'sw.js'), 'precacheAndRoute([{url:"../outside.js",revision:"x"}]);');
      expect(() => measurePrecacheArtifacts(root)).toThrow(/unsafe|outside|path/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps the bundle report gate wired into CI', async () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));

    expect(packageJson.scripts['report:bundle']).toBe('node scripts/bundle-report.cjs');
    expect(packageJson.scripts.ci).toContain('npm run report:bundle');
  });

  it('budgets first-party generated chunks without counting staged static vendor assets', async () => {
    const { isAppBundleJs } = await import('../scripts/bundle-report.cjs');
    const cwd = process.cwd();

    expect(isAppBundleJs(path.join(cwd, 'dist', 'opencoursedeck.js'))).toBe(true);
    expect(isAppBundleJs(path.join(cwd, 'dist', 'chunks', 'app-HASH.js'))).toBe(true);
    expect(isAppBundleJs(path.join(cwd, 'dist', 'boot.js'))).toBe(false);
    expect(isAppBundleJs(path.join(cwd, 'dist', 'vendor', 'pdf.worker.min.js'))).toBe(false);
    expect(isAppBundleJs(path.join(cwd, 'dist', 'sw.js'))).toBe(false);
  });
});
