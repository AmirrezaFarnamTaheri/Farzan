import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mountPdfView } from '../src/views/pdfRoute.js';

describe('PDF empty document and loaded page state', () => {
  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="view-container"></div>';
    window.OpenCourseDeck = {
      Toast: { success: vi.fn(), error: vi.fn() },
      bus: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
    };
    window.DB = { saveNote: vi.fn(async () => true) };
    delete window.PlasmaPDFInit;
    delete window.PlasmaPDFState;
    delete window.PlasmaPDFViewer;
    await import('../pdf.js');
  });
  afterEach(() => {
    try { window.PlasmaPDFDestroy?.(); } catch {}
    document.body.innerHTML = '';
    delete window.PlasmaPDFInit;
    delete window.PlasmaPDFState;
    delete window.PlasmaPDFViewer;
    delete window.OpenCourseDeck;
    delete window.DB;
  });

  it('starts with a document-first empty view instead of inactive reader chrome', () => {
    const view = mountPdfView();
    const shell = document.querySelector('.pdf-shell');
    const empty = document.querySelector('[data-pdf-empty-screen]');
    const open = document.querySelector('[data-pdf-empty-open]');
    const input = document.querySelector('[data-pdf-open]');
    const choose = vi.spyOn(input, 'click').mockImplementation(() => {});
    expect(shell?.dataset.documentState).toBe('empty');
    expect(empty?.hidden).toBe(false);
    expect(open).toBeTruthy();
    const groups = [...document.querySelectorAll('[data-pdf-requires-document]')];
    expect(groups.length).toBeGreaterThanOrEqual(3);
    expect(groups.every(group => group.hidden)).toBe(true);

    open.click();
    expect(choose).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('transitions the document stage from loading to ready and reveals actual reading actions', () => {
    const view = mountPdfView();
    const shell = document.querySelector('.pdf-shell');
    const viewer = window.PlasmaPDFViewer;
    viewer._showLoading(true);
    expect(shell.dataset.documentState).toBe('loading');

    const state = window.PlasmaPDFState;
    state.pdfDoc = { numPages: 2 };
    state.totalPages = 2;
    state.currentPage = 1;
    viewer._updatePageUI();
    viewer._showLoading(false);
    expect(shell.dataset.documentState).toBe('ready');
    expect(document.querySelector('[data-pdf-empty-screen]').hidden).toBe(true);
    expect([...document.querySelectorAll('[data-pdf-requires-document]')].every(group => !group.hidden)).toBe(true);
    expect(document.querySelector('[data-pdf-page-note-input]').disabled).toBe(false);
    view.unmount();
  });

  it('disables nonexistent PDF page controls and rejects phantom notes', () => {
    const view = mountPdfView();
    const page = document.querySelector('[data-pdf-current-page]');
    const save = document.querySelector('[data-pdf-save-page-note]');
    const note = document.querySelector('[data-pdf-page-note-input]');
    expect(page.value).toBe('—');
    expect(page.disabled).toBe(true);
    expect(save.disabled).toBe(true);
    expect(note.disabled).toBe(true);
    expect(document.querySelector('[data-pdf-total-pages]').textContent).toBe('0');
    expect(document.querySelector('[data-pdf-empty-hint]').hidden).toBe(false);
    save.disabled = false; // Bypass disabled UI; the save handler must also reject.
    note.value = 'Invalid page note';
    save.click();
    expect(window.DB.saveNote).not.toHaveBeenCalled();
    expect(document.querySelector('[data-pdf-page-note-status]').textContent)
      .toContain('Open a PDF');
    view.unmount();
  });

  it('reactivates page controls and saves a note only after a document loads', async () => {
    const view = mountPdfView();
    const state = window.PlasmaPDFState;
    state.pdfDoc = { numPages: 3 };
    state.totalPages = 3;
    state.currentPage = 2;
    state.annotationDocId = 'fingerprint:example';
    window.PlasmaPDFViewer._updatePageUI();

    const page = document.querySelector('[data-pdf-current-page]');
    const save = document.querySelector('[data-pdf-save-page-note]');
    const note = document.querySelector('[data-pdf-page-note-input]');
    expect(page.value).toBe('2');
    expect(page.disabled).toBe(false);
    expect(save.disabled).toBe(false);
    expect(note.disabled).toBe(false);
    expect(document.querySelector('[data-pdf-empty-hint]').hidden).toBe(true);
    note.value = 'Real page note';
    save.click();
    await vi.waitFor(() => expect(window.DB.saveNote).toHaveBeenCalledTimes(1));
    expect(window.DB.saveNote).toHaveBeenCalledWith(expect.objectContaining({
      sourceType: 'pdf', docId: 'fingerprint:example', page: 2,
    }));
    view.unmount();
  });
});
