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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plasmadeck-generated-test-'));
    tempDirs.push(dir);
    return dir;
  }

  it('detects missing, extra, and changed generated files', async () => {
    const { compareDirs } = await import('../scripts/check-generated.cjs');
    const expected = makeTempDir();
    const actual = makeTempDir();
    fs.mkdirSync(path.join(expected, 'chunks'), { recursive: true });
    fs.mkdirSync(path.join(actual, 'chunks'), { recursive: true });
    fs.writeFileSync(path.join(expected, 'plasma.js'), 'fresh', 'utf8');
    fs.writeFileSync(path.join(actual, 'plasma.js'), 'stale', 'utf8');
    fs.writeFileSync(path.join(expected, 'chunks', 'needed.js'), 'needed', 'utf8');
    fs.writeFileSync(path.join(actual, 'extra.js'), 'extra', 'utf8');

    const result = compareDirs(expected, actual);

    expect(result.clean).toBe(false);
    expect(result.changed).toEqual(['plasma.js']);
    expect(result.missing).toEqual(['chunks/needed.js']);
    expect(result.extra).toEqual(['extra.js']);
  });

  it('normalizes hashed chunk names while detecting duplicate stale bundles', async () => {
    const { compareDirs } = await import('../scripts/check-generated.cjs');
    const expected = makeTempDir();
    const actual = makeTempDir();
    fs.mkdirSync(path.join(expected, 'chunks'), { recursive: true });
    fs.mkdirSync(path.join(actual, 'chunks'), { recursive: true });
    fs.writeFileSync(path.join(expected, 'chunks', 'app-ABCDEFGH.js'), 'import "./notes-HASH.js";\n//# sourceMappingURL=app-HASH.js.map', 'utf8');
    fs.writeFileSync(path.join(actual, 'chunks', 'app-IJKLMNOP.js'), 'import "./notes-HASH.js";\n//# sourceMappingURL=app-DIFF.js.map', 'utf8');
    fs.writeFileSync(path.join(actual, 'chunks', 'app-QRSTUVWX.js'), 'stale duplicate', 'utf8');

    const result = compareDirs(expected, actual);

    expect(result.clean).toBe(false);
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual([]);
    expect(result.duplicate).toEqual(['chunks/app-HASH.js']);
  });

  it('keeps generated drift checks in the package CI script', async () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));

    expect(packageJson.scripts['check:generated']).toBe('node scripts/check-generated.cjs');
    expect(packageJson.scripts.ci).toContain('npm run check:generated');
  });

  it('keeps CI service-worker generation before generated-file and service-worker tests', async () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    const steps = packageJson.scripts.ci.split('&&').map(step => step.trim());

    expect(steps.indexOf('npm run build')).toBeLessThan(steps.indexOf('npm run build:sw'));
    expect(steps.indexOf('npm run build:sw')).toBeLessThan(steps.indexOf('npm run check:generated'));
    expect(steps.indexOf('npm run build:sw')).toBeLessThan(steps.indexOf('npm test'));
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
    expect(buildScript).toContain("replaceAll('./dist/plasma.js', './plasma.js')");
    expect(buildScript).toContain("throw new Error('Production build did not stage dist/index.html')");
  });
});
