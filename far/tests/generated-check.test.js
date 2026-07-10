import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

describe('generated output drift checks', () => {
  const tempDirs = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeTempDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencoursedeck-generated-test-'));
    tempDirs.push(dir);
    return dir;
  }

  function write(root, relativePath, content) {
    const file = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
  }

  it('detects missing, extra, and changed generated files', async () => {
    const { compareDirs } = await import('../scripts/check-generated.cjs');
    const expected = makeTempDir();
    const actual = makeTempDir();
    write(expected, 'opencoursedeck.js', 'fresh');
    write(expected, 'opencoursedeck.js.map', '{}');
    write(actual, 'opencoursedeck.js', 'stale');
    write(actual, 'opencoursedeck.js.map', '{}');
    write(expected, 'chunks/needed.js', 'needed');
    write(expected, 'chunks/needed.js.map', '{}');
    write(actual, 'extra.js', 'extra');
    write(actual, 'extra.js.map', '{}');

    const result = compareDirs(expected, actual);

    expect(result.clean).toBe(false);
    expect(result.changed).toEqual(['opencoursedeck.js']);
    expect(result.missing).toEqual(['chunks/needed.js']);
    expect(result.extra).toEqual(['extra.js']);
  });

  it('normalizes hashed chunk names while reporting stale content as extra', async () => {
    const { compareDirs } = await import('../scripts/check-generated.cjs');
    const expected = makeTempDir();
    const actual = makeTempDir();
    write(expected, 'chunks/app-ABCDEFGH.js', 'import "./notes-ABCDEFGH.js";\n//# sourceMappingURL=app-ABCDEFGH.js.map');
    write(expected, 'chunks/app-ABCDEFGH.js.map', '{}');
    write(actual, 'chunks/app-IJKLMNOP.js', 'import "./notes-IJKLMNOP.js";\n//# sourceMappingURL=app-IJKLMNOP.js.map');
    write(actual, 'chunks/app-IJKLMNOP.js.map', '{}');
    write(actual, 'chunks/app-QRSTUVWX.js', 'stale duplicate');
    write(actual, 'chunks/app-QRSTUVWX.js.map', '{}');

    const result = compareDirs(expected, actual);

    expect(result.clean).toBe(false);
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual(['chunks/app-QRSTUVWX.js']);
    expect(result.duplicate).toEqual([]);
  });

  it('keeps generated drift checks in the package CI script', async () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));

    expect(packageJson.scripts['check:generated']).toBe('node scripts/check-generated.cjs');
    expect(packageJson.scripts.ci).toContain('npm run check:generated');
  });

  it('keeps release generation before generated-file and service-worker tests', async () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    const steps = packageJson.scripts.ci.split('&&').map(step => step.trim());

    expect(steps.indexOf('npm run build:release')).toBeGreaterThan(-1);
    expect(steps.indexOf('npm run build:release')).toBeLessThan(steps.indexOf('npm run check:generated'));
    expect(steps.indexOf('npm run build:release')).toBeLessThan(steps.indexOf('npm test'));
  });

  it('keeps production builds warning-free without changing watch diagnostics', () => {
    const buildScript = fs.readFileSync(path.join(process.cwd(), 'scripts', 'build.cjs'), 'utf8');
    const generatedCheckScript = fs.readFileSync(path.join(process.cwd(), 'scripts', 'check-generated.cjs'), 'utf8');

    expect(buildScript).toContain("pure: isWatch ? [] : ['console.warn', 'console.error']");
    expect(generatedCheckScript).toContain("pure: ['console.warn', 'console.error']");
  });

  it('stages a self-contained static shell for native and production builds', () => {
    const buildScript = fs.readFileSync(path.join(process.cwd(), 'scripts', 'build.cjs'), 'utf8');

    expect(buildScript).toContain("'index.html'");
    expect(buildScript).toContain("const staticDirs = ['assets', 'data', 'docs', 'vendor']");
    expect(buildScript).toContain("replaceAll('./dist/opencoursedeck.js', './opencoursedeck.js')");
    expect(buildScript).toContain("throw new Error('Production build did not stage dist/index.html')");
  });
});
