import { describe, expect, it } from 'vitest';
import { summarizeBundleConsumers } from '../scripts/bundle-consumers.cjs';
import { createBuildOptions } from '../scripts/build.cjs';

const fixture = {
  inputs: {
    'src/index.js': { bytes: 100, imports: [
      { path: 'src/features/chart.js', kind: 'import-statement' },
      { path: 'src/features/lazy.js', kind: 'dynamic-import' },
    ] },
    'src/features/chart.js': { bytes: 200, imports: [] },
    'src/features/lazy.js': { bytes: 600, imports: [] },
  },
  outputs: {
    'dist/opencoursedeck.js': {
      bytes: 180,
      entryPoint: 'src/index.js',
      imports: [{ path: 'dist/chunks/lazy-123.js', kind: 'dynamic-import' }],
      inputs: {
        'src/index.js': { bytesInOutput: 40 },
        'src/features/chart.js': { bytesInOutput: 140 },
      },
    },
    'dist/chunks/lazy-123.js': {
      bytes: 270,
      entryPoint: 'src/features/lazy.js',
      imports: [],
      inputs: { 'src/features/lazy.js': { bytesInOutput: 270 } },
    },
  },
};

describe('bundle consumer provenance', () => {
  it('distinguishes shipped entry bytes from a deferred JS chunk', () => {
    const report = summarizeBundleConsumers(fixture);
    expect(report.totalJsBytes).toBe(450);
    expect(report.entry.bytes).toBe(180);
    expect(report.lazyChunks).toHaveLength(1);
    expect(report.lazyChunks[0].bytes).toBe(270);
    expect(report.entry.topInputs[0]).toEqual({ input: 'src/features/chart.js', bytes: 140 });
  });

  it('enumerates actual source importers without treating a named export as downloaded code', () => {
    const report = summarizeBundleConsumers(fixture);
    expect(report.inputConsumers['src/features/chart.js']).toEqual([
      { importer: 'src/index.js', kind: 'import-statement' },
    ]);
    expect(report.inputConsumers['src/features/lazy.js']).toEqual([
      { importer: 'src/index.js', kind: 'dynamic-import' },
    ]);
  });

  it('rejects malformed or empty emitted graphs rather than reporting imaginary savings', () => {
    expect(() => summarizeBundleConsumers(null)).toThrow();
    expect(() => summarizeBundleConsumers({ inputs: {}, outputs: {} })).toThrow();
  });

  it('records esbuild provenance during production builds without changing JavaScript output', () => {
    const opts = createBuildOptions('/tmp/farzan-dist', false);
    expect(opts.metafile).toBe(true);
    expect(opts.sourcemap).toBe(false);
  });
});
