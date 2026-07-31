import { describe, expect, it, vi } from 'vitest';
import { installPdfIdentityHardening } from '../src/core/pdfIdentityHardening.js';

describe('PDF identity hardening', () => {
  it('hashes preserved bytes after the transport buffer is detached', async () => {
    const derive = vi.fn(async (_source, _document, bytes) => (
      [...new Uint8Array(bytes.buffer || bytes, bytes.byteOffset || 0, bytes.byteLength)].join('-')
    ));
    const viewer = {
      async load(source) {
        structuredClone(source, { transfer: [source] });
        return this._deriveCanonicalDocId(source, {}, source);
      },
      _deriveCanonicalDocId: derive,
      _deriveLegacyDocIds: vi.fn(() => ['file:local:0']),
    };
    const root = { PlasmaPDFViewer: viewer, OpenCourseDeck: {} };
    installPdfIdentityHardening(root);

    const first = new Uint8Array([1, 2, 3, 4]).buffer;
    const second = new Uint8Array([4, 3, 2, 1]).buffer;

    await expect(viewer.load(first)).resolves.toBe('1-2-3-4');
    await expect(viewer.load(second)).resolves.toBe('4-3-2-1');
    expect(first.byteLength).toBe(4);
    expect(second.byteLength).toBe(4);
    expect(viewer._deriveLegacyDocIds(first)).toEqual([]);
    expect(viewer._deriveLegacyDocIds(new Uint8Array(first))).toEqual([]);
  });
});
