import { describe, expect, it, vi } from 'vitest';
import { installPdfIdentityHardening } from '../src/core/pdfIdentityHardening.js';

function createStorage() {
  const values = new Map();
  return {
    getItem: vi.fn(key => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, String(value))),
    removeItem: vi.fn(key => values.delete(key)),
  };
}

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

  it('migrates only clearly page-shaped legacy fallback data', async () => {
    const localStorage = createStorage();
    localStorage.setItem('plasma-pdf-annotations', JSON.stringify({
      1: [{ id: 'page-one', page: 1, text: 'legacy' }],
    }));
    const state = {
      annotationDocId: 'doc-a',
      annotationAliases: [],
      annotations: {},
    };
    const viewer = {
      load: vi.fn(),
      _deriveCanonicalDocId: vi.fn(),
      _deriveLegacyDocIds: vi.fn(),
    };
    const root = { PlasmaPDFViewer: viewer, PlasmaPDFState: state, OpenCourseDeck: {}, localStorage };
    installPdfIdentityHardening(root);

    await viewer._loadAnnotations();
    expect(state.annotations).toEqual({ 1: [{ id: 'page-one', page: 1, text: 'legacy' }] });
    expect(localStorage.removeItem).toHaveBeenCalledWith('plasma-pdf-annotations');
    expect(JSON.parse(localStorage.getItem('plasma-pdf-annotations-by-page'))).toEqual(state.annotations);

    state.annotations = { 2: [{ id: 'page-two', page: 2 }] };
    viewer._saveAnnotations();
    expect(JSON.parse(localStorage.getItem('plasma-pdf-annotations-by-page'))).toEqual(state.annotations);
  });
});
