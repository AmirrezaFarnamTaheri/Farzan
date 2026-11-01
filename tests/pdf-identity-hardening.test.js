import { describe, expect, it, vi } from 'vitest';
import { installPdfIdentityHardening } from '../src/core/pdfIdentityHardening.js';

function storage() {
  const values = new Map();
  return {
    getItem: vi.fn(key => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, String(value))),
    removeItem: vi.fn(key => values.delete(key)),
  };
}

function mount(docId = 'doc-a', localStorage = storage(), db = null) {
  const state = { annotationDocId: docId, annotations: {} };
  const viewer = { load: vi.fn(), _deriveCanonicalDocId: vi.fn() };
  const root = { PlasmaPDFViewer: viewer, PlasmaPDFState: state, OpenCourseDeck: {}, localStorage, DB: db };
  installPdfIdentityHardening(root);
  return { root, viewer, state, localStorage };
}

describe('greenfield PDF identity and document-scoped annotations', () => {
  it('retains source bytes after transport detachment, with no historical alias resolver', async () => {
    const derive = vi.fn(async (_source, _document, bytes) =>
      [...new Uint8Array(bytes.buffer || bytes, bytes.byteOffset || 0, bytes.byteLength)].join('-'));
    const viewer = {
      async load(source) {
        structuredClone(source, { transfer: [source] });
        return this._deriveCanonicalDocId(source, {}, source);
      },
      _deriveCanonicalDocId: derive,
    };
    installPdfIdentityHardening({ PlasmaPDFViewer: viewer, OpenCourseDeck: {} });
    const first = new Uint8Array([1, 2, 3, 4]).buffer;
    const second = new Uint8Array([4, 3, 2, 1]).buffer;
    await expect(viewer.load(first)).resolves.toBe('1-2-3-4');
    await expect(viewer.load(second)).resolves.toBe('4-3-2-1');
    expect(first.byteLength).toBe(4);
    expect(second.byteLength).toBe(4);
    expect(viewer).not.toHaveProperty('_deriveLegacyDocIds');
  });

  it('reads only canonical IndexedDB records for the currently loaded document', async () => {
    const local = storage();
    local.setItem('ocd_pdf_annotations_by_page', JSON.stringify({
      1: [{ id: 'fallback', page: 1, docId: 'doc-a' }],
    }));
    const db = {
      getAnnotations: vi.fn(async () => [
        { id: 'right', page: 2, docId: 'doc-a' },
        { id: 'foreign', page: 3, docId: 'doc-b' },
      ]),
      saveAnnotations: vi.fn(),
    };
    const { viewer, state } = mount('doc-a', local, db);
    await viewer._loadAnnotations();
    expect(db.getAnnotations).toHaveBeenCalledExactlyOnceWith('doc-a');
    expect(db.saveAnnotations).not.toHaveBeenCalled();
    expect(state.annotations).toEqual({
      2: [{ id: 'right', page: 2, docId: 'doc-a' }],
    });
  });

  it('uses only canonical, document-scoped fallback when the DB read fails', async () => {
    const local = storage();
    local.setItem('ocd_pdf_annotations_by_page', JSON.stringify({
      1: [
        { id: 'own', docId: 'doc-a', page: 1 },
        { id: 'not-ours', docId: 'doc-b', page: 1 },
      ],
    }));
    const db = { getAnnotations: vi.fn(async () => { throw new Error('DB unavailable'); }) };
    const { viewer, state } = mount('doc-a', local, db);
    await viewer._loadAnnotations();
    expect(state.annotations).toEqual({ 1: [{ id: 'own', docId: 'doc-a', page: 1 }] });
    expect(local.removeItem).not.toHaveBeenCalled();
  });

  it('rejects mismatched page annotations and malformed fallback records', async () => {
    const local = storage();
    local.setItem('ocd_pdf_annotations_by_page', JSON.stringify({
      1: [{ id: 'wrong-page', page: 2, docId: 'doc-a' }],
    }));
    const { viewer, state } = mount('doc-a', local);
    await viewer._loadAnnotations();
    expect(state.annotations).toEqual({});
  });

  it('retains another document when writing a scoped local fallback', async () => {
    const local = storage();
    local.setItem('ocd_pdf_annotations_by_page', JSON.stringify({
      2: [{ id: 'other', page: 2, docId: 'doc-b' }],
    }));
    const { viewer, state } = mount('doc-a', local);
    state.annotations = { 1: [{ id: 'ours', page: 1, docId: 'doc-a' }] };
    viewer._saveAnnotations();
    expect(JSON.parse(local.getItem('ocd_pdf_annotations_by_page'))).toEqual({
      1: [{ id: 'ours', page: 1, docId: 'doc-a' }],
      2: [{ id: 'other', page: 2, docId: 'doc-b' }],
    });
  });
});
