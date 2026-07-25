import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('PDF viewer safe messages', () => {
  beforeEach(async () => {
    vi.resetModules();
    delete globalThis.pdfjsLib;
    document.body.innerHTML = `
      <div data-pdf-viewer></div>
      <div data-pdf-thumbnails></div>
      <div data-pdf-search-results></div>
    `;
    window.OpenCourseDeck = { bus: { emit: vi.fn() } };
    globalThis.IntersectionObserver = vi.fn(function IntersectionObserverMock() {
      this.observe = vi.fn();
      this.disconnect = vi.fn();
      this.unobserve = vi.fn();
    });
    await import('../pdf.js');
  });

  it('renders no-match search text without executing HTML', () => {
    window.PlasmaPDFState.searchQuery = '<img src=x onerror="window.__pdfXss = true">';
    window.PlasmaPDFState.searchResults = [];
    window.PlasmaPDFState.searchIdx = -1;

    window.PlasmaPDFViewer._renderSearchResults();

    const results = document.querySelector('[data-pdf-search-results]');
    expect(results.textContent).toContain('<img');
    expect(results.querySelector('img')).toBeNull();
    expect(window.__pdfXss).toBeUndefined();
  });

  it('ignores stale search results and caches page text', async () => {
    const resolvers = [];
    const getTextContent = vi.fn(() => new Promise((resolve) => resolvers.push(resolve)));
    const getPage = vi.fn(async () => ({ getTextContent }));
    window.PlasmaPDFState.pdfDoc = { getPage };
    window.PlasmaPDFState.totalPages = 1;
    window.PlasmaPDFState.annotationDocId = 'doc-a';
    window.PlasmaPDFState.searchDocId = 'fingerprint:doc-a';
    window.PlasmaPDFViewer.goTo = vi.fn();

    const stale = window.PlasmaPDFViewer.search('first');
    const fresh = window.PlasmaPDFViewer.search('second');

    await vi.waitFor(() => expect(resolvers).toHaveLength(1));
    resolvers[0]({ items: [{ str: 'second match' }] });
    await fresh;
    await stale;

    expect(window.PlasmaPDFState.searchQuery).toBe('second');
    expect(window.PlasmaPDFState.searchResults).toEqual([
      expect.objectContaining({ page: 1, snippet: 'second match' }),
    ]);
    expect(getTextContent).toHaveBeenCalledTimes(1);

    await window.PlasmaPDFViewer.search('match');

    expect(getTextContent).toHaveBeenCalledTimes(1);
    expect(getPage).toHaveBeenCalledTimes(1);
  });

  it('derives fingerprint search cache keys and clears stale text on new load', async () => {
    const makePage = (text) => ({
      rotate: 0,
      getViewport: vi.fn(() => ({ width: 100, height: 100 })),
      render: vi.fn(() => ({ promise: Promise.resolve() })),
      getTextContent: vi.fn(async () => ({ items: [{ str: text }] })),
    });
    const firstPage = makePage('first document match');
    const secondPage = makePage('second document match');
    globalThis.pdfjsLib = {
      getDocument: vi.fn()
        .mockReturnValueOnce({ promise: Promise.resolve({ numPages: 1, fingerprints: ['fp-1'], getPage: vi.fn(async () => firstPage) }) })
        .mockReturnValueOnce({ promise: Promise.resolve({ numPages: 1, fingerprints: ['fp-2'], getPage: vi.fn(async () => secondPage) }) }),
    };
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ setTransform: vi.fn(), scale: vi.fn() }));
    window.PlasmaPDFViewer._loadAnnotations = vi.fn(async () => {});
    window.PlasmaPDFViewer._buildThumbnails = vi.fn(async () => {});
    window.PlasmaPDFViewer.goTo = vi.fn();

    await window.PlasmaPDFViewer.load('https://docs.example.test/one.pdf');
    await window.PlasmaPDFViewer.search('first');

    expect(window.PlasmaPDFState.searchDocId).toBe('fingerprint:fp-1');
    expect([...window.PlasmaPDFState.textCache.keys()]).toEqual(['fingerprint:fp-1:1']);

    await window.PlasmaPDFViewer.load('https://docs.example.test/two.pdf');

    expect(window.PlasmaPDFState.searchDocId).toBe('fingerprint:fp-2');
    expect([...window.PlasmaPDFState.textCache.keys()]).toEqual([]);

    await window.PlasmaPDFViewer.search('second');

    expect([...window.PlasmaPDFState.textCache.keys()]).toEqual(['fingerprint:fp-2:1']);
    expect(window.PlasmaPDFState.searchResults).toEqual([expect.objectContaining({ page: 1 })]);
  });

  it('queues the latest page render instead of dropping requests during an active render', async () => {
    const renderResolvers = [];
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ setTransform: vi.fn(), scale: vi.fn() }));
    const makePage = (pageNumber) => ({
      rotate: 0,
      getViewport: vi.fn(() => ({ width: 100, height: 100 })),
      render: vi.fn(() => ({ promise: new Promise((resolve) => renderResolvers.push({ pageNumber, resolve })) })),
      getTextContent: vi.fn(async () => ({ items: [] })),
    });
    const pages = {
      1: makePage(1),
      2: makePage(2),
      3: makePage(3),
    };
    window.PlasmaPDFState.pdfDoc = { getPage: vi.fn(async pageNumber => pages[pageNumber]) };
    window.PlasmaPDFState.totalPages = 3;
    window.PlasmaPDFViewer._renderAnnotationLayer = vi.fn();
    window.PlasmaPDFViewer._highlightThumbnail = vi.fn();

    const firstRender = window.PlasmaPDFViewer.renderPage(1);
    await vi.waitFor(() => expect(renderResolvers).toHaveLength(1));

    await window.PlasmaPDFViewer.renderPage(2);
    await window.PlasmaPDFViewer.renderPage(3);

    expect(window.PlasmaPDFState.queuedRender).toEqual(expect.objectContaining({ pageNum: 3 }));

    renderResolvers[0].resolve();
    await firstRender;

    await vi.waitFor(() => expect(window.PlasmaPDFState.pdfDoc.getPage).toHaveBeenCalledWith(3));
    expect(window.PlasmaPDFState.pdfDoc.getPage).not.toHaveBeenCalledWith(2);

    renderResolvers[1].resolve();
    await vi.waitFor(() => expect(window.PlasmaPDFState.currentPage).toBe(3));
    expect(window.PlasmaPDFState.queuedRender).toBeNull();
  });

  it('cancels stale render completion after destroy', async () => {
    let resolveRender;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ setTransform: vi.fn(), scale: vi.fn() }));
    const page = {
      rotate: 0,
      getViewport: vi.fn(() => ({ width: 100, height: 100 })),
      render: vi.fn(() => ({ promise: new Promise((resolve) => { resolveRender = resolve; }) })),
      getTextContent: vi.fn(async () => ({ items: [] })),
    };
    window.PlasmaPDFState.pdfDoc = { getPage: vi.fn(async () => page), destroy: vi.fn() };
    window.PlasmaPDFState.totalPages = 1;
    window.PlasmaPDFViewer._renderAnnotationLayer = vi.fn();
    window.PlasmaPDFViewer._highlightThumbnail = vi.fn();

    const render = window.PlasmaPDFViewer.renderPage(1);
    await vi.waitFor(() => expect(page.render).toHaveBeenCalled());

    window.PlasmaPDFDestroy();
    resolveRender();
    await render;

    expect(page.getTextContent).not.toHaveBeenCalled();
    expect(window.PlasmaPDFViewer._renderAnnotationLayer).not.toHaveBeenCalled();
    expect(window.PlasmaPDFState.pdfDoc).toBeNull();
    expect(window.PlasmaPDFState.queuedRender).toBeNull();
  });

  it('routes print iframe object URLs through central frame URL validation', async () => {
    const objectUrl = 'blob:https://example.test/pdf';
    window.OpenCourseDeck.safeFrameUrl = vi.fn(() => null);
    window.PlasmaPDFState.pdfDoc = {
      getData: vi.fn(async () => new Uint8Array([1, 2, 3])),
    };
    vi.spyOn(URL, 'createObjectURL').mockReturnValue(objectUrl);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    await window.PlasmaPDFViewer.print();

    expect(window.OpenCourseDeck.safeFrameUrl).toHaveBeenCalledWith(objectUrl);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(objectUrl);
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('builds thumbnail placeholders without string HTML injection', async () => {
    window.PlasmaPDFState.pdfDoc = { getPage: vi.fn() };
    window.PlasmaPDFState.totalPages = 2;

    await window.PlasmaPDFViewer._buildThumbnails();

    const sidebar = document.querySelector('[data-pdf-thumbnails]');
    expect(sidebar.querySelector('.thumb-loading')).toBeNull();
    expect(sidebar.querySelectorAll('.thumb-item')).toHaveLength(2);
    expect(sidebar.querySelector('[data-thumb-page="1"] .thumb-label').textContent).toBe('1');
    expect(sidebar.querySelector('script,img')).toBeNull();
  });

  it('exports PDF annotations to canonical notes with document and page metadata', async () => {
    const saveNote = vi.fn(async note => note);
    window.DB = { saveNote };
    window.PlasmaPDFState.annotationDocId = 'doc-a.pdf';
    window.PlasmaPDFState.annotations = {
      2: [
        {
          id: 'ann-1',
          type: 'highlight',
          note: '<b>Key idea</b>',
          x: 0.1,
          y: 0.2,
          w: 0.3,
          h: 0.4,
        },
      ],
    };

    const result = await window.PlasmaPDFViewer.exportAnnotationsToNotes();

    expect(result).toEqual({ total: 1, created: 1, skipped: 0, errors: 0 });
    expect(saveNote).toHaveBeenCalledWith(expect.objectContaining({
      id: 'pdf-annotation-note-doc-a-pdf-ann-1',
      sourceType: 'pdf-annotation',
      docId: 'doc-a.pdf',
      pdfDocId: 'doc-a.pdf',
      annotationId: 'ann-1',
      annotationType: 'highlight',
      page: 2,
      pdfPage: 2,
      tags: ['pdf', 'annotation'],
    }));
    expect(saveNote.mock.calls[0][0].content).toContain('&lt;b&gt;Key idea&lt;/b&gt;');
    expect(saveNote.mock.calls[0][0].content).toContain('PDF page 2');
    expect(saveNote.mock.calls[0][0].content).toContain('x=0.1000');
  });

  it('saves selected PDF text to a canonical note with page metadata', async () => {
    const saveNote = vi.fn(async note => note);
    window.DB = { saveNote };
    window.PlasmaPDFState.annotationDocId = 'doc-selection.pdf';
    window.PlasmaPDFState.currentPage = 5;
    document.querySelector('[data-pdf-viewer]').innerHTML = '<span id="selected-text">Selected <b>PDF</b> idea</span>';
    const selectedNode = document.getElementById('selected-text').firstChild;
    const selection = {
      rangeCount: 1,
      toString: vi.fn(() => '<Selected PDF idea>'),
      getRangeAt: vi.fn(() => ({ commonAncestorContainer: selectedNode })),
      removeAllRanges: vi.fn(),
    };
    vi.spyOn(window, 'getSelection').mockReturnValue(selection);

    const result = await window.PlasmaPDFViewer.saveSelectionToNote();

    expect(result).toEqual({ saved: true, page: 5, docId: 'doc-selection.pdf' });
    expect(saveNote).toHaveBeenCalledWith(expect.objectContaining({
      sourceType: 'pdf-selection',
      docId: 'doc-selection.pdf',
      pdfDocId: 'doc-selection.pdf',
      page: 5,
      pdfPage: 5,
      tags: ['pdf', 'selection'],
    }));
    expect(saveNote.mock.calls[0][0].content).toContain('&lt;Selected PDF idea&gt;');
    expect(saveNote.mock.calls[0][0].content).toContain('PDF page 5');
    expect(selection.removeAllRanges).toHaveBeenCalled();
  });

  it('uses the selected text layer page instead of the current rendered page for PDF selection notes', async () => {
    const saveNote = vi.fn(async note => note);
    window.DB = { saveNote };
    window.PlasmaPDFState.annotationDocId = 'doc-selection.pdf';
    window.PlasmaPDFState.currentPage = 9;
    document.querySelector('[data-pdf-viewer]').innerHTML = `
      <div data-page-number="3" id="pdf-page-3">
        <span id="precise-selection">Precise highlight text</span>
      </div>
    `;
    document.getElementById('pdf-page-3').getBoundingClientRect = vi.fn(() => ({
      left: 100,
      top: 200,
      width: 400,
      height: 800,
    }));
    const selectedNode = document.getElementById('precise-selection').firstChild;
    const selection = {
      rangeCount: 1,
      toString: vi.fn(() => 'Precise highlight text'),
      getRangeAt: vi.fn(() => ({
        commonAncestorContainer: selectedNode,
        getClientRects: vi.fn(() => [
          { left: 140, top: 280, width: 120, height: 24 },
        ]),
      })),
      removeAllRanges: vi.fn(),
    };
    vi.spyOn(window, 'getSelection').mockReturnValue(selection);

    const result = await window.PlasmaPDFViewer.saveSelectionToNote();

    expect(result).toEqual({ saved: true, page: 3, docId: 'doc-selection.pdf' });
    expect(saveNote).toHaveBeenCalledWith(expect.objectContaining({
      sourceType: 'pdf-selection',
      page: 3,
      pdfPage: 3,
      selectionRects: [{ page: 3, x: 0.1, y: 0.1, w: 0.3, h: 0.03 }],
    }));
    expect(saveNote.mock.calls[0][0].content).toContain('PDF page 3');
  });

  it('preserves per-page geometry for multi-page PDF text selections', async () => {
    const saveNote = vi.fn(async note => note);
    window.DB = { saveNote };
    window.PlasmaPDFState.annotationDocId = 'doc-selection.pdf';
    window.PlasmaPDFState.currentPage = 9;
    document.querySelector('[data-pdf-viewer]').innerHTML = `
      <div data-page-number="2" id="pdf-page-2"><span>Page two text</span></div>
      <div data-page-number="3" id="pdf-page-3"><span>Page three text</span></div>
    `;
    document.getElementById('pdf-page-2').getBoundingClientRect = vi.fn(() => ({
      left: 100,
      top: 200,
      right: 500,
      bottom: 1000,
      width: 400,
      height: 800,
    }));
    document.getElementById('pdf-page-3').getBoundingClientRect = vi.fn(() => ({
      left: 100,
      top: 1100,
      right: 500,
      bottom: 1900,
      width: 400,
      height: 800,
    }));
    const selection = {
      rangeCount: 1,
      toString: vi.fn(() => 'Page two text Page three text'),
      getRangeAt: vi.fn(() => ({
        commonAncestorContainer: document.querySelector('[data-pdf-viewer]'),
        getClientRects: vi.fn(() => [
          { left: 120, top: 240, width: 160, height: 20 },
          { left: 140, top: 1180, width: 120, height: 24 },
        ]),
      })),
      removeAllRanges: vi.fn(),
    };
    vi.spyOn(window, 'getSelection').mockReturnValue(selection);

    const result = await window.PlasmaPDFViewer.saveSelectionToNote();

    expect(result).toEqual({ saved: true, page: 2, pages: [2, 3], docId: 'doc-selection.pdf' });
    expect(saveNote).toHaveBeenCalledWith(expect.objectContaining({
      page: 2,
      pdfPage: 2,
      pdfPages: [2, 3],
      selectionRects: [
        { page: 2, x: 0.05, y: 0.05, w: 0.4, h: 0.025 },
        { page: 3, x: 0.1, y: 0.1, w: 0.3, h: 0.03 },
      ],
    }));
    expect(saveNote.mock.calls[0][0].content).toContain('PDF pages 2, 3');
  });

  it('reconstructs selected PDF excerpts from overlapping text-layer fragments', async () => {
    const saveNote = vi.fn(async note => note);
    window.DB = { saveNote };
    window.PlasmaPDFState.annotationDocId = 'doc-text-items.pdf';
    window.PlasmaPDFState.currentPage = 4;
    document.querySelector('[data-pdf-viewer]').innerHTML = `
      <div data-page-number="4" id="pdf-page-4">
        <div class="pdf-text-layer">
          <span id="frag-1" data-pdf-text-item>Cardio-</span>
          <span id="frag-2" data-pdf-text-item>vascular physiology</span>
          <span id="frag-3" data-pdf-text-item>outside selection</span>
        </div>
      </div>
    `;
    document.getElementById('pdf-page-4').getBoundingClientRect = vi.fn(() => ({
      left: 100,
      top: 200,
      width: 400,
      height: 800,
    }));
    document.getElementById('frag-1').getBoundingClientRect = vi.fn(() => ({
      left: 120,
      top: 240,
      right: 180,
      bottom: 260,
      width: 60,
      height: 20,
    }));
    document.getElementById('frag-2').getBoundingClientRect = vi.fn(() => ({
      left: 120,
      top: 262,
      right: 260,
      bottom: 282,
      width: 140,
      height: 20,
    }));
    document.getElementById('frag-3').getBoundingClientRect = vi.fn(() => ({
      left: 120,
      top: 340,
      right: 260,
      bottom: 360,
      width: 140,
      height: 20,
    }));
    const selection = {
      rangeCount: 1,
      toString: vi.fn(() => 'Cardio-\nvascular physiology'),
      getRangeAt: vi.fn(() => ({
        commonAncestorContainer: document.getElementById('frag-1').firstChild,
        getClientRects: vi.fn(() => [
          { left: 115, top: 235, right: 270, bottom: 286, width: 155, height: 51 },
        ]),
      })),
      removeAllRanges: vi.fn(),
    };
    vi.spyOn(window, 'getSelection').mockReturnValue(selection);

    await window.PlasmaPDFViewer.saveSelectionToNote();

    expect(saveNote).toHaveBeenCalledWith(expect.objectContaining({
      page: 4,
      pdfPage: 4,
    }));
    expect(saveNote.mock.calls[0][0].content).toContain('Cardiovascular physiology');
    expect(saveNote.mock.calls[0][0].content).not.toContain('outside selection');
  });

  it('captures partially overlapping text-layer fragments whose center is outside the selection', async () => {
    const saveNote = vi.fn(async note => note);
    window.DB.saveNote = saveNote;
    document.querySelector('[data-pdf-viewer]').innerHTML = `
      <div data-page-number="5" id="pdf-page-5">
        <div class="pdf-text-layer">
          <span id="frag-wide" data-pdf-text-item>left-edge overlap should stay</span>
          <span id="frag-away" data-pdf-text-item>unselected neighbor</span>
        </div>
      </div>
    `;
    document.getElementById('pdf-page-5').getBoundingClientRect = vi.fn(() => ({
      left: 100,
      top: 200,
      width: 400,
      height: 800,
    }));
    document.getElementById('frag-wide').getBoundingClientRect = vi.fn(() => ({
      left: 120,
      top: 240,
      right: 420,
      bottom: 260,
      width: 300,
      height: 20,
    }));
    document.getElementById('frag-away').getBoundingClientRect = vi.fn(() => ({
      left: 120,
      top: 300,
      right: 260,
      bottom: 320,
      width: 140,
      height: 20,
    }));
    const selection = {
      rangeCount: 1,
      toString: vi.fn(() => 'edge overlap'),
      getRangeAt: vi.fn(() => ({
        commonAncestorContainer: document.getElementById('frag-wide').firstChild,
        getClientRects: vi.fn(() => [
          { left: 115, top: 235, right: 150, bottom: 265, width: 35, height: 30 },
        ]),
      })),
      removeAllRanges: vi.fn(),
    };
    vi.spyOn(window, 'getSelection').mockReturnValue(selection);

    await window.PlasmaPDFViewer.saveSelectionToNote();

    expect(saveNote.mock.calls[0][0].content).toContain('left-edge overlap should stay');
    expect(saveNote.mock.calls[0][0].content).not.toContain('unselected neighbor');
  });

  it('reconstructs repeated PDF columns top-to-bottom before moving across the page', async () => {
    const saveNote = vi.fn(async note => note);
    window.DB.saveNote = saveNote;
    document.querySelector('[data-pdf-viewer]').innerHTML = `
      <div data-page-number="6" id="pdf-page-6">
        <div class="pdf-text-layer">
          <span id="left-1" data-pdf-text-item>Left column first</span>
          <span id="left-2" data-pdf-text-item>continues here</span>
          <span id="right-1" data-pdf-text-item>Right column first</span>
          <span id="right-2" data-pdf-text-item>right continues</span>
        </div>
      </div>
    `;
    document.getElementById('pdf-page-6').getBoundingClientRect = vi.fn(() => ({
      left: 100,
      top: 200,
      width: 500,
      height: 800,
    }));
    const boxes = {
      'left-1': { left: 120, top: 240, right: 250, bottom: 260, width: 130, height: 20 },
      'left-2': { left: 120, top: 270, right: 230, bottom: 290, width: 110, height: 20 },
      'right-1': { left: 340, top: 240, right: 485, bottom: 260, width: 145, height: 20 },
      'right-2': { left: 340, top: 270, right: 455, bottom: 290, width: 115, height: 20 },
    };
    Object.entries(boxes).forEach(([id, rect]) => {
      document.getElementById(id).getBoundingClientRect = vi.fn(() => rect);
    });
    const selection = {
      rangeCount: 1,
      toString: vi.fn(() => 'Left column first Right column first continues here right continues'),
      getRangeAt: vi.fn(() => ({
        commonAncestorContainer: document.getElementById('left-1').firstChild,
        getClientRects: vi.fn(() => [
          { left: 115, top: 235, right: 500, bottom: 295, width: 385, height: 60 },
        ]),
      })),
      removeAllRanges: vi.fn(),
    };
    vi.spyOn(window, 'getSelection').mockReturnValue(selection);

    await window.PlasmaPDFViewer.saveSelectionToNote();

    const content = saveNote.mock.calls[0][0].content;
    expect(content).toContain('Left column first\ncontinues here');
    expect(content).toContain('Right column first\nright continues');
    expect(content.indexOf('continues here')).toBeLessThan(content.indexOf('Right column first'));
    expect(content).not.toContain('Left column first Right column first');
  });

  it('tears down and rebinds route-scoped toolbar and input listeners on remount', async () => {
    window.PlasmaPDFDestroy();
    document.body.innerHTML = `
      <button data-pdf-action="next" id="outside-next">Outside</button>
      <section class="view-pdf">
        <input data-pdf-current-page value="3">
        <input data-pdf-open type="file">
        <button data-pdf-action="next" id="inside-next">Next</button>
        <div data-pdf-viewer tabindex="0"></div>
        <div data-pdf-search-results></div>
      </section>
    `;
    window.PlasmaPDFViewer.next = vi.fn();
    window.PlasmaPDFViewer.goTo = vi.fn();

    window.PlasmaPDFInit();

    document.getElementById('outside-next').click();
    expect(window.PlasmaPDFViewer.next).not.toHaveBeenCalled();

    document.getElementById('inside-next').click();
    expect(window.PlasmaPDFViewer.next).toHaveBeenCalledTimes(1);

    const pageInput = document.querySelector('[data-pdf-current-page]');
    pageInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(window.PlasmaPDFViewer.goTo).toHaveBeenCalledWith('3');

    window.PlasmaPDFDestroy();
    document.getElementById('inside-next').click();
    pageInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(window.PlasmaPDFViewer.next).toHaveBeenCalledTimes(1);
    expect(window.PlasmaPDFViewer.goTo).toHaveBeenCalledTimes(1);
    expect(window.PlasmaPDFState.searchDocId).toBe('global');

    window.PlasmaPDFInit();
    document.getElementById('inside-next').click();
    pageInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(window.PlasmaPDFViewer.next).toHaveBeenCalledTimes(2);
    expect(window.PlasmaPDFViewer.goTo).toHaveBeenCalledTimes(2);
  });
});
