import { describe, expect, it } from 'vitest';

describe('smoke-test script helpers', () => {
  it('extracts unique lazy chunk paths from the production entry bundle', async () => {
    const { extractChunkPaths } = await import('../scripts/smoke-test.cjs');

    const paths = extractChunkPaths(`
      const app = () => import("./chunks/app-ABCDEFGH.js");
      const notes = () => import("./chunks/notes-IJKLMNOP.js");
      const duplicate = () => import("./chunks/app-ABCDEFGH.js");
    `);

    expect(paths).toEqual([
      '/dist/chunks/app-ABCDEFGH.js',
      '/dist/chunks/notes-IJKLMNOP.js',
    ]);
  });

  it('recursively collects nested lazy chunk paths', async () => {
    const { collectChunkPaths } = await import('../scripts/smoke-test.cjs');
    const bodies = new Map([
      ['/dist/chunks/app-ABCDEFGH.js', 'const pdfRoute = () => import("./pdfRoute-QRSTUVWX.js");'],
      ['/dist/chunks/pdfRoute-QRSTUVWX.js', 'export const mounted = true;'],
    ]);
    const fetchText = async (url) => {
      const path = new URL(url).pathname;
      return { status: bodies.has(path) ? 200 : 404, body: bodies.get(path) || '' };
    };

    const paths = await collectChunkPaths(
      'http://127.0.0.1:52000',
      'const app = () => import("./chunks/app-ABCDEFGH.js");',
      fetchText
    );

    expect(paths).toEqual([
      '/dist/chunks/app-ABCDEFGH.js',
      '/dist/chunks/pdfRoute-QRSTUVWX.js',
    ]);
  });
});
