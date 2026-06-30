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

  it('fails reports that exceed size budgets or weaken critical CSP rules', async () => {
    const { evaluateReport } = await import('../scripts/bundle-report.cjs');

    const failures = evaluateReport({
      totals: {
        totalJsBytes: 999999,
        largestJsBytes: 999999,
        entryBytes: 999999,
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
      'CSP script-src must not include unsafe-inline',
      'CSP media-src must keep remote http:/https: support',
    ]));
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
