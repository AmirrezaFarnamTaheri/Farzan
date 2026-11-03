import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountStudioView } from '../src/views/studioRoute.js';

describe('Studio saved PDF link navigation (#172/#174)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.matchMedia = vi.fn(() => ({ matches: false }));
    sessionStorage.setItem('ocd_pending_pdf_doc', 'sha256:old-document');
    sessionStorage.setItem('ocd_pending_pdf_page', '77');
  });
  afterEach(() => {
    document.body.innerHTML = '';
    for (const key of ['ocd_pending_pdf_doc', 'ocd_pending_pdf_page']) sessionStorage.removeItem(key);
    delete window.OpenCourseDeck;
    delete window.DB;
    delete window.DataStore;
    vi.restoreAllMocks();
  });
  function makeFixture({ missingHandoff = false } = {}) {
    const board = {
      version: 1, activeLayerIdx: 0, layers: [{
        id: 'layer-1', name: 'Main', visible: true, locked: false,
        elements: [{ id: 'pdf-link', type: 'rect', text: 'Rhythm PDF',
          linkType: 'pdf', linkTarget: 'topic-rhythm', linkLabel: 'Rhythm notes' }],
      }],
    };
    window.OpenCourseDeck = {
      Canvas: {
        init: vi.fn(), destroy: vi.fn(), serialize: vi.fn(() => structuredClone(board)),
        restoreBoard: vi.fn(async () => false),
        getState: vi.fn(() => ({ tool: 'select', selectedIds: [] })),
      },
      bus: { on: vi.fn(), off: vi.fn() },
    };
    window.DB = { getSetting: vi.fn(async () => null) };
    const Router = { navigate: vi.fn() };
    const Toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
    const setPendingPdfPage = vi.fn((docId, page) => {
      if (docId == null && page == null) {
        sessionStorage.removeItem('ocd_pending_pdf_doc');
        sessionStorage.removeItem('ocd_pending_pdf_page');
      }
    });
    const controller = mountStudioView({
      setView: html => { document.body.innerHTML = html; },
      Router, Toast, ...(missingHandoff ? {} : { setPendingPdfPage }),
    });
    return { controller, Router, Toast, setPendingPdfPage };
  }

  it('sends an unresolved linked topic to source discovery, not an unrelated cached PDF viewer', () => {
    const { controller, Router, setPendingPdfPage } = makeFixture();
    try {
      expect(document.querySelector('[data-open-studio-link="pdf-link"]').textContent).toMatch(/find pdf/i);
      document.querySelector('[data-open-studio-link="pdf-link"]').click();
      expect(setPendingPdfPage).toHaveBeenCalledExactlyOnceWith(null, null);
      expect(sessionStorage.getItem('ocd_pending_pdf_doc')).toBeNull();
      expect(sessionStorage.getItem('ocd_pending_pdf_page')).toBeNull();
      expect(Router.navigate).toHaveBeenCalledExactlyOnceWith('#/materials');
      expect(document.querySelector('[data-studio-status]').textContent).toMatch(/find.*pdf.*materials/i);
    } finally { controller.unmount(); }
  });

  it('labels inspector links as source discovery rather than promising direct document navigation', () => {
    const { controller } = makeFixture();
    try {
      document.querySelector('[data-inspect-element="pdf-link"]').click();
      expect(document.querySelector('[data-studio-properties] [data-open-studio-link]').textContent)
        .toMatch(/find linked pdf/i);
    } finally { controller.unmount(); }
  });

  it('fails closed if the canonical pending-PDF handoff cannot be cleared', () => {
    const { controller, Router, Toast } = makeFixture({ missingHandoff: true });
    try {
      document.querySelector('[data-open-studio-link="pdf-link"]').click();
      expect(Router.navigate).not.toHaveBeenCalled();
      expect(sessionStorage.getItem('ocd_pending_pdf_doc')).toBe('sha256:old-document');
      expect(sessionStorage.getItem('ocd_pending_pdf_page')).toBe('77');
      expect(document.querySelector('[data-studio-status]').textContent).toMatch(/pdf.*unavailable/i);
      expect(Toast.error).toHaveBeenCalled();
    } finally { controller.unmount(); }
  });
});
