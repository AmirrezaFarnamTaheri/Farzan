import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

describe('vendored browser libraries', () => {
  it('bundles Fuse as a classic-worker-compatible global', () => {
    const vendorScript = fs.readFileSync(path.join(root, 'scripts/vendor-libs.cjs'), 'utf8');
    expect(vendorScript).toContain("globalThis.Fuse = Fuse");
    expect(vendorScript).toContain("format: 'iife'");
    expect(vendorScript).not.toContain("fuse.js/dist/fuse.min.js");

    const bundlePath = path.join(root, 'vendor/fuse.min.js');
    expect(fs.existsSync(bundlePath)).toBe(true);
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(bundlePath, 'utf8'), context);
    expect(typeof context.Fuse).toBe('function');

    const workerSource = fs.readFileSync(path.join(root, 'src/workers/search.worker.js'), 'utf8');
    expect(workerSource).toContain("importScripts('../../vendor/fuse.min.js')");
  });

  it('adapts PDF.js document destruction to the loading task', () => {
    const vendorScript = fs.readFileSync(path.join(root, 'scripts/vendor-libs.cjs'), 'utf8');
    expect(vendorScript).toContain("documentProperty === 'destroy'");
    expect(vendorScript).toContain('return () => target.destroy()');
    expect(vendorScript).toContain('new Proxy(loadingTask');

    const compatibilityScript = fs.readFileSync(path.join(root, 'vendor/pdf.min.js'), 'utf8');
    expect(compatibilityScript).toContain("documentProperty === 'destroy'");
    expect(compatibilityScript).toContain('target.destroy()');
  });
});
