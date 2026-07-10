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

afterEach(() => {
  for (const dir of tempRoots.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('generated artifact verification', () => {
  it('treats multiple hashed chunks as distinct deterministic files', () => {
    const expected = makeDir();
    const actual = makeDir();
    const files = {
      'opencoursedeck.js': 'import "./chunks/chunk-AAAA1111.js";',
      'chunks/chunk-AAAA1111.js': 'export const a = 1;',
      'chunks/chunk-BBBB2222.js': 'export const b = 2;',
    };

    for (const [file, content] of Object.entries(files)) {
      write(expected, file, content);
      write(actual, file, content);
    }
    write(expected, 'opencoursedeck.js.map', '{"sources":["../../src/index.js"]}');
    write(actual, 'opencoursedeck.js.map', '{"sources":["../src/index.js"]}');
    write(expected, 'chunks/chunk-AAAA1111.js.map', '{"sources":["../../../src/a.js"]}');
    write(actual, 'chunks/chunk-AAAA1111.js.map', '{"sources":["../../src/a.js"]}');
    write(expected, 'chunks/chunk-BBBB2222.js.map', '{}');
    write(actual, 'chunks/chunk-BBBB2222.js.map', '{}');

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
});
