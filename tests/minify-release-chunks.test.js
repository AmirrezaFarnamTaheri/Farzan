import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import esbuild from 'esbuild';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'farzan-minify-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'chunks'));
  fs.mkdirSync(path.join(root, 'vendor'));
  const shared = path.join(root, 'chunks', 'shared.js');
  const entry = path.join(root, 'opencoursedeck.js');
  fs.writeFileSync(shared, [
    'export function answer() {',
    '  const unused = 999;',
    '  const first = 19;',
    '  const second = 23;',
    '  return first + second;',
    '}',
  ].join('\n'));
  fs.writeFileSync(entry, [
    "import { answer } from './chunks/shared.js';",
    'globalThis.answerFromChunk = answer();',
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'vendor', 'untouched.js'), 'var untouched = true;\n');
  fs.writeFileSync(path.join(root, 'sw.js'), 'var serviceWorker = true;\n');
  return { root, entry };
}

describe('release chunk post-optimizer', () => {
  it('reduces shipped JavaScript without hiding code or changing the chunk import graph', async () => {
    const { minifyReleaseChunks } = await import('../scripts/minify-release-chunks.cjs');
    const { root, entry } = fixture();
    const original = fs.statSync(entry).size + fs.statSync(path.join(root, 'chunks', 'shared.js')).size;
    const vendorBefore = fs.readFileSync(path.join(root, 'vendor', 'untouched.js'), 'utf8');
    const swBefore = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

    const result = await minifyReleaseChunks(root);
    const optimized = fs.statSync(entry).size + fs.statSync(path.join(root, 'chunks', 'shared.js')).size;
    expect(result.beforeBytes).toBe(original);
    expect(result.afterBytes).toBe(optimized);
    expect(optimized).toBeLessThan(original);
    expect(result.files).toBe(2);
    expect(fs.readFileSync(path.join(root, 'vendor', 'untouched.js'), 'utf8')).toBe(vendorBefore);
    expect(fs.readFileSync(path.join(root, 'sw.js'), 'utf8')).toBe(swBefore);

    // Rebundle the postprocessed files. Missing or renamed ESM exports cause
    // esbuild to fail instead of silently producing an unusable application.
    const rebuilt = await esbuild.build({
      entryPoints: [entry], bundle: true, platform: 'browser',
      format: 'iife', write: false, logLevel: 'silent',
    });
    const context = {};
    vm.runInNewContext(rebuilt.outputFiles[0].text, context);
    expect(context.answerFromChunk).toBe(42);
  });

  it('rejects malformed input instead of producing a partial release', async () => {
    const { minifyReleaseChunks } = await import('../scripts/minify-release-chunks.cjs');
    const { root, entry } = fixture();
    const before = fs.readFileSync(entry, 'utf8');
    fs.writeFileSync(path.join(root, 'chunks', 'shared.js'), 'export @@@ invalid');
    await expect(minifyReleaseChunks(root)).rejects.toThrow();
    expect(fs.readFileSync(entry, 'utf8')).toBe(before);
  });
});
