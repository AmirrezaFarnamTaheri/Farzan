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

  it('attributes actual emitted bytes on the static bootstrap chunk graph without charging lazy chunks', () => {
    const report = summarizeBundleConsumers({
      inputs: { 'src/index.js': { imports: [] } },
      outputs: {
        'dist/opencoursedeck.js': {
          entryPoint: 'src/index.js', bytes: 110,
          imports: [
            { path: 'dist/chunks/shared-ONE.js', kind: 'import-statement' },
            { path: 'dist/chunks/feature-LAZY.js', kind: 'dynamic-import' },
          ],
        },
        'dist/chunks/shared-ONE.js': {
          bytes: 90,
          imports: [{ path: 'dist/chunks/shared-TWO.js', kind: 'import-statement' }],
        },
        'dist/chunks/shared-TWO.js': {
          bytes: 40,
          imports: [{ path: 'dist/chunks/shared-ONE.js', kind: 'import-statement' }],
        },
        'dist/chunks/feature-LAZY.js': {
          bytes: 600,
          entryPoint: 'src/features/optional.js',
          imports: [{ path: 'dist/chunks/shared-TWO.js', kind: 'import-statement' }],
        },
        'dist/chunks/unused.js': { bytes: 12, imports: [] },
      },
    });
    expect(report.totalJsBytes).toBe(852);
    expect(report.bootstrapStatic.path).toEqual([
      'dist/chunks/shared-ONE.js',
      'dist/chunks/shared-TWO.js',
      'dist/opencoursedeck.js',
    ]);
    expect(report.bootstrapStatic.bytes).toBe(240);
    expect(report.bootstrapStatic.dynamicImports).toEqual(['dist/chunks/feature-LAZY.js']);
    expect(report.deferredJsBytes).toBe(612);
    expect(report.entry.bytes).toBe(110);
  });

  it('fails when an emitted static import is missing instead of inventing a zero-byte startup graph', () => {
    const invalid = structuredClone(fixture);
    invalid.outputs['dist/opencoursedeck.js'].imports = [
      { path: 'dist/chunks/missing.js', kind: 'import-statement' },
    ];
    expect(() => summarizeBundleConsumers(invalid)).toThrow(/missing|unresolved/i);
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
