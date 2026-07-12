import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { rewriteReleaseStaticFile } = require('../scripts/build.cjs');

describe('production release staging', () => {
  it('rewrites the source-root boot import for a dist-root deployment', () => {
    const source = "await import('./dist/opencoursedeck.js');";
    const release = rewriteReleaseStaticFile('boot.js', source);

    expect(release).toContain("import('./opencoursedeck.js')");
    expect(release).not.toContain("./dist/opencoursedeck.js");
  });

  it('rewrites bundle references in the staged document', () => {
    const source = '<script type="module" src="./dist/opencoursedeck.js"></script>';
    const release = rewriteReleaseStaticFile('index.html', source);

    expect(release).toContain('src="./opencoursedeck.js"');
    expect(release).not.toContain('dist/opencoursedeck.js');
  });
});
