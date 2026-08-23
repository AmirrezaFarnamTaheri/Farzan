import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { IGNORED_FILES } = require(path.join(root, 'scripts/check-encoding.cjs'));

describe('encoding scan vendor boundary', () => {
  it('excludes only immutable third-party minified artifacts', () => {
    expect(IGNORED_FILES).toEqual(new Set([
      'vendor/chart.umd.js',
      'vendor/fontawesome/css/all.min.css',
      'vendor/fuse.min.js',
      'vendor/pdf.min.mjs',
      'vendor/pdf.worker.min.mjs',
      'vendor/purify.min.js',
    ]));
  });

  it('keeps app-authored compatibility wrappers in scope', () => {
    expect(IGNORED_FILES.has('vendor/pdf.min.js')).toBe(false);
    expect(IGNORED_FILES.has('vendor/pdf.worker.min.js')).toBe(false);
  });
});
