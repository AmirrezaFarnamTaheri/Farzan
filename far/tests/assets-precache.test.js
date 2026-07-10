import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseRoot = path.join(root, 'dist');

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function releaseExists(rel) {
  return fs.existsSync(path.join(releaseRoot, rel));
}

function normalizeLocalRef(ref) {
  if (!ref || ref.startsWith('#')) return null;
  if (/^(?:[a-z]+:)?\/\//i.test(ref)) return null;
  if (/^(?:mailto|tel|javascript):/i.test(ref)) return null;
  return ref.split(/[?#]/)[0].replace(/^\.\//, '');
}

describe('static assets and service worker precache', () => {
  it('keeps development and portable release service-worker commands configured', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const developmentConfig = fs.readFileSync(path.join(root, 'scripts/workbox.config.cjs'), 'utf8');
    const releaseConfig = fs.readFileSync(path.join(root, 'scripts/workbox-dist.config.cjs'), 'utf8');

    expect(exists('scripts/clean-workbox.cjs')).toBe(true);
    expect(pkg.scripts['build:sw']).toContain('scripts/clean-workbox.cjs');
    expect(pkg.scripts['build:sw']).toContain('generateSW scripts/workbox.config.cjs');
    expect(pkg.scripts['build:release']).toContain('scripts/build-sw-dist.cjs');
    expect(developmentConfig).toContain('cleanupOutdatedCaches: true');
    expect(releaseConfig).toContain('cleanupOutdatedCaches: true');
    expect(releaseConfig).toContain("globDirectory: 'dist'");
    expect(releaseConfig).toContain("swDest: 'dist/sw.js'");
    expect(releaseConfig).toContain('cacheId: `opencoursedeck-v${pkg.version}`');
  });

  it('keeps index.html local script/link references present on disk', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const refs = [...html.matchAll(/\b(?:href|src|poster)=["']([^"']+)["']/gi)]
      .map((match) => normalizeLocalRef(match[1]))
      .filter(Boolean);

    expect(refs).toContain('boot.js');
    expect(refs).toContain('style.css');
    expect(refs.filter((rel) => !exists(rel))).toEqual([]);
  });

  it('keeps stylesheet loading compatible with the strict CSP', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const csp = html.match(/Content-Security-Policy"[\s\S]*?content="([^"]+)"/)?.[1] ?? '';
    const stylesheetPreloadHandlers = [...html.matchAll(/<link\b[^>]*rel=["']preload["'][^>]*as=["']style["'][^>]*>/gi)]
      .filter((match) => /\bonload\s*=/.test(match[0]));

    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(stylesheetPreloadHandlers).toEqual([]);
    expect(html).toContain('strict CSP does not block inline preload handlers');
  });

  it('keeps required font assets and unrestricted remote media/PDF CSP available', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const csp = html.match(/Content-Security-Policy"[\s\S]*?content="([^"]+)"/)?.[1] ?? '';

    expect(exists('vendor/fonts/fonts.css')).toBe(true);
    expect(csp).toContain('img-src');
    expect(csp).toContain('media-src');
    expect(csp).toContain('connect-src');
    expect(csp).toContain('frame-src');
    expect(csp).toMatch(/media-src[^;]*http:[^;]*https:/);
    expect(csp).toMatch(/connect-src[^;]*http:[^;]*https:/);
    expect(csp).toMatch(/frame-src[^;]*http:[^;]*https:/);
    expect(csp).not.toContain('https://plasmato.s3.ir-thr-at1.arvanstorage.ir');
  });

  it('precache includes boot and active catalog files in the release directory', () => {
    const sw = fs.readFileSync(path.join(releaseRoot, 'sw.js'), 'utf8');
    const urls = [...sw.matchAll(/\{url:"([^"]+)",revision:"[^"]+"\}/g)]
      .map((match) => normalizeLocalRef(match[1]))
      .filter(Boolean);
    const pointer = JSON.parse(fs.readFileSync(path.join(root, 'data/catalog.json'), 'utf8'));
    const activeCatalog = normalizeLocalRef(pointer.currentCatalog);

    expect(releaseExists('sw.js')).toBe(true);
    expect(urls).toContain('boot.js');
    expect(urls).toContain(`data/${activeCatalog}`);
    expect(urls.filter((rel) => !releaseExists(rel))).toEqual([]);
  });

  it('uses offline-friendly runtime caching for catalog data and app bundles', () => {
    const config = fs.readFileSync(path.join(root, 'scripts/workbox-dist.config.cjs'), 'utf8');
    const sw = fs.readFileSync(path.join(releaseRoot, 'sw.js'), 'utf8');

    expect(config).toContain("cacheName: 'opencoursedeck-data'");
    expect(config).toContain("handler: 'NetworkFirst'");
    expect(config).toContain("cacheName: 'opencoursedeck-app-bundle'");
    expect(config).toContain("handler: 'StaleWhileRevalidate'");
    expect(sw).toContain('opencoursedeck-data');
    expect(sw).toContain('NetworkFirst');
    expect(sw).toContain('opencoursedeck-app-bundle');
    expect(sw).toContain('StaleWhileRevalidate');
  });

  it('lazy-loads heavy feature modules from the entrypoint', () => {
    const entry = fs.readFileSync(path.join(root, 'src/index.js'), 'utf8');

    for (const feature of ['player', 'notes', 'pdf', 'canvas', 'progress']) {
      expect(entry).not.toContain(`import '../${feature}.js';`);
      expect(entry).toContain(`${feature}: () => import('../${feature}.js')`);
    }
    expect(entry).toContain('pd.loadFeature');
    expect(entry).toContain('pd.loadFeatures');
    expect(entry).toContain("import('../app.js')");
  });

  it('initializes the command palette after the app shell import resolves', () => {
    const entry = fs.readFileSync(path.join(root, 'src/index.js'), 'utf8');
    const appImport = entry.indexOf("import('../app.js')");
    const commandInit = entry.indexOf('initCommandPalette()');

    expect(appImport).toBeGreaterThan(-1);
    expect(commandInit).toBeGreaterThan(appImport);
    expect(entry).toContain('.then(() =>');
  });

  it('documents service worker update behavior and offline-friendly catalog caching', () => {
    const troubleshooting = fs.readFileSync(path.join(root, 'docs/troubleshooting.md'), 'utf8');
    const catalogDocs = fs.readFileSync(path.join(root, 'docs/content-and-catalog.md'), 'utf8');

    expect(troubleshooting).toContain('Local development and production-like serving intentionally behave differently');
    expect(troubleshooting).toContain('unregisters the service worker once per browser session');
    expect(troubleshooting).toContain('Non-localhost HTTP(S) origins register `sw.js`');
    expect(troubleshooting).toContain('Clear service worker and reload');

    expect(catalogDocs).toContain("cache: 'no-cache'");
    expect(catalogDocs).toContain('Do not switch catalog fetches back to `no-store`');
    expect(catalogDocs).toContain('Run `npm run build:release` after changing `data/catalog.json`');
  });

  it('keeps Windows launchers identity-safe and free of stale debug timestamp placeholders', () => {
    const run = fs.readFileSync(path.join(root, 'Run-OpenCourseDeck.cmd'), 'utf8');
    const oneClick = fs.readFileSync(path.join(root, 'OpenCourseDeck-OneClick.bat'), 'utf8');
    const stop = fs.readFileSync(path.join(root, 'Stop-OpenCourseDeck.cmd'), 'utf8');

    for (const launcher of [run, oneClick]) {
      expect(launcher).toContain('Get-Date -Format o');
      expect(launcher).not.toContain('"timestamp":%RANDOM%');
      expect(launcher).toContain('node_modules\\esbuild\\package.json');
      expect(launcher).toContain('opencoursedeck-server.pid');
    }

    expect(oneClick).not.toContain('SERVER_LOG=');
    expect(stop).toContain('opencoursedeck-server.pid');
    expect(stop).toContain("CommandLine -match 'dev-server\\.cjs'");
    expect(stop).not.toMatch(/taskkill\s+\/F\s+\/PID/i);
  });
});
