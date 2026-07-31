import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { assertReleaseGraph, rewriteReleaseStaticFile, stageStaticAssets } = require('../scripts/build.cjs');
const { generateReleaseServiceWorker, stripSourceMapReferences } = require('../scripts/build-sw-dist.cjs');

describe('production release staging', () => {
  it('rewrites the source-root boot import for a dist-root deployment', () => {
    const source = "await import('./dist/opencoursedeck.js');";
    const release = rewriteReleaseStaticFile('boot.js', source);
    expect(release).toContain("import('./opencoursedeck.js')");
    expect(release).not.toContain('./dist/opencoursedeck.js');
  });

  it('rewrites bundle references in the staged document', () => {
    const source = '<script type="module" src="./dist/opencoursedeck.js"></script>';
    const release = rewriteReleaseStaticFile('index.html', source);
    expect(release).toContain('src="./opencoursedeck.js"');
    expect(release).not.toContain('dist/opencoursedeck.js');
  });

  it('uses the direct Workbox build API instead of the vulnerable CLI dependency tree', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'scripts/build-sw-dist.cjs'), 'utf8');
    expect(typeof generateReleaseServiceWorker).toBe('function');
    expect(source).toContain("require('workbox-build')");
    expect(source).not.toContain('workbox-cli');
    expect(source).not.toContain('spawnSync');
  });

  it('stages classic worker assets into the self-contained production release', () => {
    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opencoursedeck-worker-source-'));
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencoursedeck-worker-dist-'));
    try {
      const workerDir = path.join(sourceRoot, 'src', 'workers');
      fs.mkdirSync(workerDir, { recursive: true });
      fs.writeFileSync(path.join(workerDir, 'search.worker.js'), 'self.onmessage = () => {};', 'utf8');
      fs.writeFileSync(path.join(workerDir, 'catalog.worker.js'), 'self.onmessage = () => {};', 'utf8');
      stageStaticAssets(sourceRoot, outputDir);
      expect(fs.readFileSync(path.join(outputDir, 'src', 'workers', 'search.worker.js'), 'utf8')).toContain('onmessage');
      expect(fs.readFileSync(path.join(outputDir, 'src', 'workers', 'catalog.worker.js'), 'utf8')).toContain('onmessage');
    } finally {
      fs.rmSync(sourceRoot, { recursive: true, force: true });
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('rejects a production release that omits a required worker asset', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencoursedeck-worker-graph-'));
    try {
      for (const file of ['index.html', 'boot.js', 'manifest.json', 'pdf-runtime.js', 'opencoursedeck.js', 'style.css']) {
        fs.writeFileSync(path.join(outputDir, file), file === 'boot.js' ? "import('./opencoursedeck.js')" : '', 'utf8');
      }
      fs.mkdirSync(path.join(outputDir, 'src', 'styles'), { recursive: true });
      fs.writeFileSync(path.join(outputDir, 'src', 'styles', 'index.css'), '', 'utf8');
      fs.mkdirSync(path.join(outputDir, 'src', 'workers'), { recursive: true });
      fs.writeFileSync(path.join(outputDir, 'src', 'workers', 'search.worker.js'), '', 'utf8');
      expect(() => assertReleaseGraph(outputDir)).toThrow(/catalog\.worker\.js/);
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('removes line and block source-map references from Workbox output', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencoursedeck-sw-'));
    const filePath = path.join(tempDir, 'sw.js');
    try {
      fs.writeFileSync(filePath, 'self.addEventListener("install",()=>{});\n//# sourceMappingURL=sw.js.map\n/*# sourceMappingURL=other.map */\n', 'utf8');
      expect(stripSourceMapReferences(filePath)).toBe(true);
      const output = fs.readFileSync(filePath, 'utf8');
      expect(output).not.toMatch(/sourceMappingURL\s*=/);
      expect(output).toContain('self.addEventListener');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
