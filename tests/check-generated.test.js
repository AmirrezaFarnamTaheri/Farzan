import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { checkStaticArtifacts, compareDirs, isGeneratedBundleFile } = require('../scripts/check-generated.cjs');
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
  entryChunk = 'player-AAAA1111.js',
  secondaryChunk = 'notes-BBBB2222.js',
  includeSecondary = true,
} = {}) {
  write(root, 'opencoursedeck.js', `import "./chunks/${entryChunk}";`);
  write(root, `chunks/${entryChunk}`, `import "./${secondaryChunk}"; export const a = 1;`);
  if (includeSecondary) write(root, `chunks/${secondaryChunk}`, 'export const b = 2;');
}

afterEach(() => {
  for (const dir of tempRoots.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('generated artifact verification', () => {
  it('matches equivalent named content-addressed chunks when hashes differ', () => {
    const expected = makeDir();
    const actual = makeDir();
    writeBundle(expected, {
      entryChunk: 'player-AAAA1111.js',
      secondaryChunk: 'notes-BBBB2222.js',
    });
    writeBundle(actual, {
      entryChunk: 'player-CCCC3333.js',
      secondaryChunk: 'notes-DDDD4444.js',
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
    write(actual, 'opencoursedeck.js', 'export {};');
    write(actual, 'chunks/chunk-STALE999.js', 'export const stale = true;');

    const result = compareDirs(expected, actual, { filter: isGeneratedBundleFile });
    expect(result.clean).toBe(false);
    expect(result.duplicate).toEqual([]);
    expect(result.extra).toEqual(['chunks/chunk-STALE999.js']);
  });

  it('reports missing generated JavaScript chunks', () => {
    const expected = makeDir();
    const actual = makeDir();
    writeBundle(expected);
    writeBundle(actual, { includeSecondary: false });

    const result = compareDirs(expected, actual, { filter: isGeneratedBundleFile });
    expect(result.clean).toBe(false);
    expect(result.missing).toContain('chunks/notes-BBBB2222.js');
  });

  it('reports changed entry content', () => {
    const expected = makeDir();
    const actual = makeDir();
    write(expected, 'opencoursedeck.js', 'export const version = 1;');
    write(actual, 'opencoursedeck.js', 'export const version = 2;');

    const result = compareDirs(expected, actual, { filter: isGeneratedBundleFile });
    expect(result.clean).toBe(false);
    expect(result.changed).toEqual(['opencoursedeck.js']);
  });
});

describe('static release artifact verification', () => {
  it('accepts a staged copy that matches source (including release rewrites and stripped source maps)', () => {
    const rootDir = makeDir();
    const outDir = makeDir();
    write(rootDir, 'boot.js', "import('./dist/opencoursedeck.js');\n");
    write(outDir, 'boot.js', "import('./opencoursedeck.js');\n");
    write(rootDir, 'vendor/lib.js', 'export const x = 1;\n//# sourceMappingURL=lib.js.map\n');
    write(outDir, 'vendor/lib.js', 'export const x = 1;\n');
    write(rootDir, 'data/catalog.json', '{"currentCatalog":"data/starter.json"}');
    write(outDir, 'data/catalog.json', '{"currentCatalog":"data/starter.json"}');

    const result = checkStaticArtifacts({ rootDir, actualOutdir: outDir });
    expect(result).toEqual({ clean: true, missing: [], changed: [] });
  });

  it('reports staged static files that drifted from their source', () => {
    const rootDir = makeDir();
    const outDir = makeDir();
    write(rootDir, 'data/catalog.json', '{"currentCatalog":"data/starter.json"}');
    write(outDir, 'data/catalog.json', '{"currentCatalog":"data/old-catalog.json"}');
    write(rootDir, 'docs/guide.md', 'current docs');

    const result = checkStaticArtifacts({ rootDir, actualOutdir: outDir });
    expect(result.clean).toBe(false);
    expect(result.changed).toEqual(['data/catalog.json']);
    expect(result.missing).toEqual(['docs/guide.md']);
  });
});
