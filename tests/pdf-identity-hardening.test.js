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

  it('migrates page-shaped legacy fallback data even when records include document identity', async () => {
    const localStorage = createStorage();
    localStorage.setItem('plasma-pdf-annotations', JSON.stringify({
      1: [{ id: 'page-one', page: 1, docId: 'doc-a', text: 'legacy' }],
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
    expect(state.annotations).toEqual({
      1: [{ id: 'page-one', page: 1, docId: 'doc-a', text: 'legacy' }],
    });
    expect(localStorage.removeItem).toHaveBeenCalledWith('plasma-pdf-annotations');
    expect(JSON.parse(localStorage.getItem('plasma-pdf-annotations-by-page'))).toEqual(state.annotations);

    state.annotations = { 2: [{ id: 'page-two', page: 2, docId: 'doc-a' }] };
    viewer._saveAnnotations();
    expect(JSON.parse(localStorage.getItem('plasma-pdf-annotations-by-page'))).toEqual(state.annotations);
  });

  it('retains successful database reads when alias cleanup fails', async () => {
    const localStorage = createStorage();
    localStorage.setItem('plasma-pdf-annotations-by-page', JSON.stringify({
      1: [{ id: 'fallback', page: 1, text: 'stale fallback' }],
    }));
    const state = {
      annotationDocId: 'sha256:current',
      annotationAliases: ['url:legacy'],
      annotations: {},
    };
    const migrationFailures = [];
    const viewer = {
      load: vi.fn(),
      _deriveCanonicalDocId: vi.fn(),
      _deriveLegacyDocIds: vi.fn(),
    };
    const root = {
      PlasmaPDFViewer: viewer,
      PlasmaPDFState: state,
      localStorage,
      DB: {
        getAnnotations: vi.fn(async (docId) => (
          docId === 'url:legacy'
            ? [{ id: 'authoritative', docId, page: 2, text: 'loaded', updatedAt: 2 }]
            : []
        )),
        saveAnnotations: vi.fn(async () => {
          throw new Error('storage quota exceeded');
        }),
      },
      OpenCourseDeck: {
        bus: { emit: vi.fn((name, payload) => migrationFailures.push({ name, payload })) },
      },
    };
    installPdfIdentityHardening(root);

    await viewer._loadAnnotations();

    expect(state.annotations).toEqual({
      2: [{ id: 'authoritative', docId: 'sha256:current', page: 2, text: 'loaded', updatedAt: 2 }],
    });
    expect(state.annotations[1]).toBeUndefined();
    expect(migrationFailures).toEqual([
      expect.objectContaining({
        name: 'pdf:identity-migration-failed',
        payload: expect.objectContaining({ docId: 'sha256:current', aliases: ['url:legacy'] }),
      }),
    ]);
  });

  it('rejects malformed page maps whose record page conflicts with the persisted page key', async () => {
    const localStorage = createStorage();
    localStorage.setItem('plasma-pdf-annotations-by-page', JSON.stringify({
      1: [{ id: 'wrong-page', page: 2, docId: 'doc-a' }],
    }));
    const state = { annotationDocId: 'doc-a', annotationAliases: [], annotations: {} };
    const viewer = { load: vi.fn(), _deriveCanonicalDocId: vi.fn(), _deriveLegacyDocIds: vi.fn() };
    const root = { PlasmaPDFViewer: viewer, PlasmaPDFState: state, OpenCourseDeck: {}, localStorage };
    installPdfIdentityHardening(root);

    await viewer._loadAnnotations();

    expect(state.annotations).toEqual({});
  });
});
