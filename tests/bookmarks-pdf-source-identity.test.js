import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountBookmarksView } from '../src/views/bookmarksRoute.js';

describe('saved PDF bookmark stable-source navigation', () => {
  let annotations, notes, route, setPendingPdfPage, Router;
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
    sanitizeHtml: html => html,
    createElement: (tag, attrs = {}, ...children) => {
      const el = document.createElement(tag);
      Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
      children.flat().forEach(child => el.append(child));
      return el;
    },
  });

  it('queues a page only for a stable saved PDF source ID and navigates to the document viewer', async () => {
    annotations = [{ id: 'ann-3', docId: 'local-doc-3', page: 17, docTitle: 'Chemistry notes' }];
    route = mount();
    const card = await vi.waitFor(() => {
      const element = document.querySelector('[data-bookmark-id="ann-3"]');
      expect(element).not.toBeNull();
      return element;
    });
    const open = card.querySelector('a');
    expect(open.getAttribute('href')).toBe('#/pdf');
    open.click();
    expect(setPendingPdfPage).toHaveBeenCalledWith('local-doc-3', 17);
    expect(Router.navigate).toHaveBeenCalledWith('#/pdf');
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
});
