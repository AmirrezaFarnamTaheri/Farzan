import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { compareDirs, isGeneratedBundleFile } = require('../scripts/check-generated.cjs');
const tempRoots = [];

function makeDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencoursedeck-check-generated-test-'));
  tempRoots.push(dir);
  return dir;
}

function write(root, relativePath, content) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function writeBundle(root, {
  entryChunk = 'chunk-AAAA1111.js',
  secondaryChunk = 'chunk-BBBB2222.js',
  includeSecondaryMap = true,
} = {}) {
  write(root, 'opencoursedeck.js', `import "./chunks/${entryChunk}";`);
  write(root, 'opencoursedeck.js.map', '{"sources":["../src/index.js"]}');
  write(root, `chunks/${entryChunk}`, `import "./${secondaryChunk}"; export const a = 1;`);
  write(root, `chunks/${entryChunk}.map`, '{}');
  write(root, `chunks/${secondaryChunk}`, 'export const b = 2;');
  if (includeSecondaryMap) write(root, `chunks/${secondaryChunk}.map`, '{}');
}

afterEach(() => {
  for (const dir of tempRoots.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('generated artifact verification', () => {
  it('matches equivalent content-addressed chunks even when hashes differ', () => {
    const expected = makeDir();
    const actual = makeDir();
    writeBundle(expected, {
      entryChunk: 'chunk-AAAA1111.js',
      secondaryChunk: 'chunk-BBBB2222.js',
    });
    writeBundle(actual, {
      entryChunk: 'chunk-CCCC3333.js',
      secondaryChunk: 'chunk-DDDD4444.js',
    });

    expect(compareDirs(expected, actual, { filter: isGeneratedBundleFile })).toEqual({
      clean: true,
      missing: [],
      extra: [],
      duplicate: [],
      changed: [],
    });
  });

  it('reports stale chunks instead of collapsing them into duplicates', () => {
    const expected = makeDir();
    const actual = makeDir();
    write(expected, 'opencoursedeck.js', 'export {};');
    write(expected, 'opencoursedeck.js.map', '{}');
    write(actual, 'opencoursedeck.js', 'export {};');
    write(actual, 'opencoursedeck.js.map', '{}');
    write(actual, 'chunks/chunk-STALE999.js', 'export const stale = true;');
    write(actual, 'chunks/chunk-STALE999.js.map', '{}');

    const result = compareDirs(expected, actual, { filter: isGeneratedBundleFile });
    expect(result.clean).toBe(false);
    expect(result.duplicate).toEqual([]);
    expect(result.extra).toEqual(['chunks/chunk-STALE999.js']);
  });

  it('reports missing source maps for generated JavaScript', () => {
    const expected = makeDir();
    const actual = makeDir();
    writeBundle(expected);
    writeBundle(actual, { includeSecondaryMap: false });

    const result = compareDirs(expected, actual, { filter: isGeneratedBundleFile });
    expect(result.clean).toBe(false);
    expect(result.missing).toContain('chunks/chunk-BBBB2222.js.map');
  });

  it('reports changed entry content', () => {
    const expected = makeDir();
    const actual = makeDir();
    write(expected, 'opencoursedeck.js', 'export const version = 1;');
    write(expected, 'opencoursedeck.js.map', '{}');
    write(actual, 'opencoursedeck.js', 'export const version = 2;');
    write(actual, 'opencoursedeck.js.map', '{}');

    const result = compareDirs(expected, actual, { filter: isGeneratedBundleFile });
    expect(result.clean).toBe(false);
    expect(result.changed).toEqual(['opencoursedeck.js']);
  });
});
