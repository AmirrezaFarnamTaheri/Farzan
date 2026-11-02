import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountBookmarksView } from '../src/views/bookmarksRoute.js';

describe('saved PDF bookmark stable-source navigation', () => {
  let annotations, notes, route, setPendingPdfPage, Router, Toast;
  beforeEach(() => {
    document.body.innerHTML = '';
    annotations = [];
    notes = [];
    window.DB = {
      getAllTimestamps: vi.fn(async () => []),
      getAllNotes: vi.fn(async () => notes),
      getAllAnnotations: vi.fn(async () => annotations),
    };
    setPendingPdfPage = vi.fn();
    Router = { navigate: vi.fn() };
    Toast = { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() };
  });
  afterEach(() => {
    route?.unmount?.();
    document.body.innerHTML = '';
    delete window.DB;
    vi.restoreAllMocks();
  });

  const mount = () => mountBookmarksView({
    setView: html => { document.body.innerHTML = html; },
    setPendingPdfPage,
    Router,
    Toast,
    sanitizeHtml: html => html,
    createElement: (tag, attrs = {}, ...children) => {
      const el = document.createElement(tag);
      Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
      children.flat().forEach(child => el.append(child));
      return el;
    },
  });

  it('queues a page only for a stable saved PDF source ID and navigates to the document viewer', async () => {
    annotations = [{ id: 'ann-3', docId: 'fingerprint:local-doc-3', page: 17, docTitle: 'Chemistry notes' }];
    route = mount();
    const card = await vi.waitFor(() => {
      const element = document.querySelector('[data-bookmark-id="ann-3"]');
      expect(element).not.toBeNull();
      return element;
    });
    const open = card.querySelector('a');
    expect(open.getAttribute('href')).toBe('#/pdf');
    open.click();
    await vi.waitFor(() => expect(setPendingPdfPage).toHaveBeenCalledWith('fingerprint:local-doc-3', 17));
    expect(Router.navigate).toHaveBeenCalledWith('#/pdf');
  });

  it('never uses a renamed filename or URL as a stable PDF document identifier', async () => {
    annotations = [
      { id: 'ann-by-name', docId: 'renamed.pdf', page: 12, docTitle: 'Renamed PDF' },
      { id: 'ann-by-url', docId: 'url:https://example.test/course.pdf', page: 3, docTitle: 'Remote PDF' },
    ];
    route = mount();
    await vi.waitFor(() => expect(document.querySelectorAll('[data-bookmark-id^="ann-by-"]')).toHaveLength(2));
    for (const id of ['ann-by-name', 'ann-by-url']) {
      const card = document.querySelector('[data-bookmark-id="' + id + '"]');
      const link = card.querySelector('a');
      expect(link.getAttribute('href')).toBe('#/materials');
      link.click();
    }
    expect(setPendingPdfPage).toHaveBeenCalledTimes(2);
    expect(setPendingPdfPage).toHaveBeenNthCalledWith(1, null, null);
    expect(setPendingPdfPage).toHaveBeenNthCalledWith(2, null, null);
    expect(Router.navigate).toHaveBeenLastCalledWith('#/materials');
  });

  it('routes a legacy global annotation to source discovery, never to the prior PDF page', async () => {
    annotations = [{ id: 'old-annotation', docId: 'global', page: 12, docTitle: 'Imported legacy page' }];
    route = mount();
    const card = await vi.waitFor(() => {
      const element = document.querySelector('[data-bookmark-id="old-annotation"]');
      expect(element).not.toBeNull();
      return element;
    });
    const link = card.querySelector('a');
    expect(link.getAttribute('href')).toBe('#/materials');
    expect(link.textContent).toMatch(/find|locate|browse/i);
    link.click();
    // Discovery must clear a stale session handoff, not queue a page under
    // an unrelated PDF document.
    expect(setPendingPdfPage).toHaveBeenCalledWith(null, null);
    expect(Router.navigate).toHaveBeenCalledWith('#/materials');
    expect(card.textContent).toContain('Imported legacy page');
  });

  it('does not deep-link a PDF page note without a stable document identity', async () => {
    notes = [{ id: 'n-7', title: 'Renal PDF note', pdfPage: 4, sourceType: 'pdf', content: '<p>saved</p>' }];
    route = mount();
    const card = await vi.waitFor(() => {
      const element = document.querySelector('[data-bookmark-id="n-7"]');
      expect(element).not.toBeNull();
      return element;
    });
    const link = card.querySelector('a');
    expect(link.getAttribute('href')).toBe('#/materials');
    link.click();
    // Discovery must clear a stale session handoff, not queue a page under
    // an unrelated PDF document.
    expect(setPendingPdfPage).toHaveBeenCalledWith(null, null);
    expect(Router.navigate).toHaveBeenCalledWith('#/materials');
  });

  it('shows canonical saved PDF bookmarks and navigates only when their document identity is stable', async () => {
    const stored = [
      { id: 'bm-renal', docId: 'fingerprint:renal-doc-content', docTitle: 'Renal physiology', page: 7, updatedAt: 100 },
      { id: 'bm-unanchored', docId: 'global', docTitle: 'Unanchored PDF', page: 12, updatedAt: 90 },
    ];
    window.DB.getAllPdfBookmarks = vi.fn(async () => structuredClone(stored));
    route = mount();
    const first = await vi.waitFor(() => {
      const card = document.querySelector('[data-bookmark-id="bm-renal"]');
      expect(card).not.toBeNull();
      return card;
    });
    expect(first.textContent).toContain('Renal physiology');
    expect(first.textContent).toContain('Page 7');
    first.querySelector('a').click();
    await vi.waitFor(() => expect(setPendingPdfPage).toHaveBeenCalledWith('fingerprint:renal-doc-content', 7));
    expect(Router.navigate).toHaveBeenCalledWith('#/pdf');

    const unsafe = document.querySelector('[data-bookmark-id="bm-unanchored"]');
    expect(unsafe).not.toBeNull();
    expect(unsafe.querySelector('a').getAttribute('href')).toBe('#/materials');
    unsafe.querySelector('a').click();
    expect(setPendingPdfPage).toHaveBeenCalledWith(null, null);
    expect(Router.navigate).toHaveBeenCalledWith('#/materials');
    expect(stored).toHaveLength(2);
  });

  it('fails closed when canonical PDF bookmarks cannot be read and offers retry without modifying records', async () => {
    const getAllPdfBookmarks = vi.fn().mockRejectedValueOnce(new Error('IDB unavailable'))
      .mockResolvedValueOnce([{ id: 'bm-recovered', docId: 'fingerprint:renal-doc-content-recovered', page: 3, title: 'Renal bookmark' }]);
    window.DB.getAllPdfBookmarks = getAllPdfBookmarks;
    route = mount();
    const retry = await vi.waitFor(() => {
      const button = document.querySelector('[data-bookmark-retry]');
      expect(button).not.toBeNull();
      return button;
    });
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Bookmarks could not be loaded');
    expect(document.querySelector('[data-bookmark-id="bm-recovered"]')).toBeNull();
    retry.click();
    await vi.waitFor(() => expect(document.querySelector('[data-bookmark-id="bm-recovered"]')).not.toBeNull());
    expect(getAllPdfBookmarks).toHaveBeenCalledTimes(2);
  });


  it('refuses an annotation link if the canonical document or page changes in another tab', async () => {
    annotations = [{ id: 'ann-stale', docId: 'fingerprint:old-document', page: 12, updatedAt: 10 }];
    route = mount();
    const card = await vi.waitFor(() => {
      const value = document.querySelector('[data-bookmark-id="ann-stale"]');
      expect(value).not.toBeNull();
      return value;
    });
    // Another tab or backup restore now points this same ID to new content.
    annotations = [{ ...annotations[0], docId: 'fingerprint:different-document',
      page: 4, updatedAt: 20 }];
    card.querySelector('a').click();
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/changed|reload|stale/i)));
    expect(setPendingPdfPage).not.toHaveBeenCalled();
    expect(Router.navigate).not.toHaveBeenCalled();
    expect(annotations[0].page).toBe(4);
  });

  it('rejects a removed PDF bookmark rather than seeking in the previously mounted document', async () => {
    let saved = [{ id: 'bm-removed', docId: 'fingerprint:source-a', page: 5 }];
    window.DB.getAllPdfBookmarks = vi.fn(async () => structuredClone(saved));
    route = mount();
    const card = await vi.waitFor(() => {
      const value = document.querySelector('[data-bookmark-id="bm-removed"]');
      expect(value).not.toBeNull();
      return value;
    });
    saved = [];
    card.querySelector('a').click();
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/changed|reload|stale/i)));
    expect(setPendingPdfPage).not.toHaveBeenCalled();
    expect(Router.navigate).not.toHaveBeenCalled();
  });

  it('does not open a stale PDF note after a newer saved page replaces it', async () => {
    notes = [{ id: 'pdf-note', sourceType: 'pdf', title: 'Case',
      pdfDocId: 'fingerprint:case-a', pdfPage: 6, updatedAt: 11 }];
    route = mount();
    const card = await vi.waitFor(() => {
      const value = document.querySelector('[data-bookmark-id="pdf-note"]');
      expect(value).not.toBeNull();
      return value;
    });
    notes = [{ ...notes[0], pdfDocId: 'fingerprint:case-b',
      pdfPage: 15, updatedAt: 12 }];
    card.querySelector('a').click();
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/changed|reload|stale/i)));
    expect(setPendingPdfPage).not.toHaveBeenCalled();
    expect(Router.navigate).not.toHaveBeenCalled();
  });

  it('fails closed when a canonical annotation read fails after the card rendered', async () => {
    const original = { id: 'ann-offline', docId: 'fingerprint:source-offline', page: 8 };
    window.DB.getAllAnnotations = vi.fn()
      .mockResolvedValueOnce([original])
      .mockRejectedValueOnce(new Error('Canonical IndexedDB unavailable'));
    route = mount();
    const card = await vi.waitFor(() => {
      const value = document.querySelector('[data-bookmark-id="ann-offline"]');
      expect(value).not.toBeNull();
      return value;
    });
    card.querySelector('a').click();
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/unavailable|could not|failed|load/i)));
    expect(setPendingPdfPage).not.toHaveBeenCalled();
    expect(Router.navigate).not.toHaveBeenCalled();
  });

  it('does not queue a source from a detached PDF bookmark card after an asynchronous read', async () => {
    const saved = [{ id: 'ann-detached', docId: 'fingerprint:detached', page: 16 }];
    let completeRead;
    window.DB.getAllAnnotations = vi.fn()
      .mockResolvedValueOnce(saved)
      .mockImplementationOnce(() => new Promise(resolve => { completeRead = resolve; }));
    route = mount();
    const card = await vi.waitFor(() => {
      const value = document.querySelector('[data-bookmark-id="ann-detached"]');
      expect(value).not.toBeNull();
      return value;
    });
    card.querySelector('a').click();
    await vi.waitFor(() => expect(window.DB.getAllAnnotations).toHaveBeenCalledTimes(2));
    card.remove();
    completeRead(saved);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(setPendingPdfPage).not.toHaveBeenCalled();
    expect(Router.navigate).not.toHaveBeenCalled();
    expect(Toast.error).not.toHaveBeenCalled();
  });

});
