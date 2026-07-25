import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { rewriteReleaseStaticFile } = require('../scripts/build.cjs');
const { stripSourceMapReferences } = require('../scripts/build-sw-dist.cjs');

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

  it('removes line and block source-map references from Workbox output', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencoursedeck-sw-'));
    const filePath = path.join(tempDir, 'sw.js');
    try {
      fs.writeFileSync(
        filePath,
        'self.addEventListener("install",()=>{});\n//# sourceMappingURL=sw.js.map\n/*# sourceMappingURL=other.map */\n',
        'utf8',
      );

      expect(stripSourceMapReferences(filePath)).toBe(true);
      const output = fs.readFileSync(filePath, 'utf8');
      expect(output).not.toMatch(/sourceMappingURL\s*=/);
      expect(output).toContain('self.addEventListener');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
