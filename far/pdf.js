// ============================================================
// OpenCourseDeck â€” pdf.js
// Full PDF Viewer with Thumbnails, Annotations, Search
// Requires: PDF.js library (pdfjs-dist)
//   <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
// ============================================================

(() => {
  'use strict';

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 0. SETUP
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const RouteListeners = {
    items: [],
    on(target, type, handler, options) {
      if (!target) return;
      target.addEventListener(type, handler, options);
      this.items.push({ target, type, handler, options });
    },
    clear() {
      for (const { target, type, handler, options } of this.items) {
        try { target.removeEventListener(type, handler, options); } catch {}
      }
      this.items = [];
    },
  };

  async function pdConfirm(input) {
    const pd = window.OpenCourseDeck;
    const fn = pd?.UI?.confirm ?? pd?.Modal?.confirmAsync;
    if (typeof fn === 'function') return fn(input);
    const message = input && typeof input === 'object' ? input.message : input;
    return window.confirm(String(message ?? 'Are you sure?'));
  }

  function escapeHtmlText(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function stableIdPart(value) {
    return String(value || 'global')
      .replace(/[^a-z0-9_-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'global';
  }

  function _joinPdfText(line, next, gap = 0) {
    const left = String(line || '').trimEnd();
    const right = String(next || '').trim();
    if (!left) return right;
    if (!right) return left;
    if (/[\s([{"'-]$/.test(left)) return `${left}${right}`;
    if (/^[,.;:!?%)\]}"']/.test(right)) return `${left}${right}`;
    return gap <= 1 ? `${left}${right}` : `${left} ${right}`;
  }

  function _buildPdfSelectionLines(hits) {
    const rows = [];
    hits.sort((a, b) => a.top - b.top || a.left - b.left).forEach((hit) => {
      const row = rows.find(item => Math.abs(item.top - hit.top) <= Math.max(3, hit.height * 0.65));
      if (row) {
        row.top = Math.min(row.top, hit.top);
        row.height = Math.max(row.height, hit.height);
        row.items.push(hit);
      } else {
        rows.push({ top: hit.top, height: hit.height, items: [hit] });
      }
    });
    return rows
      .sort((a, b) => a.top - b.top)
      .flatMap((row) => {
        const items = row.items.sort((a, b) => a.left - b.left);
        const segments = [];
        items.forEach((item) => {
          const previous = segments.at(-1)?.items.at(-1);
          if (previous && item.left - previous.right > Math.max(36, row.height * 1.8)) {
            segments.push({ items: [item] });
          } else if (segments.length) {
            segments.at(-1).items.push(item);
          } else {
            segments.push({ items: [item] });
          }
        });
        return segments.map((segment) => ({
          top: row.top,
          height: row.height,
          left: segment.items[0]?.left ?? 0,
          right: segment.items[segment.items.length - 1]?.right ?? 0,
          text: segment.items.reduce((line, item, index) => {
            const previous = segment.items[index - 1];
            return _joinPdfText(line, item.value, previous ? item.left - previous.right : 0);
          }, ''),
        }));
      })
      .filter(line => line.text.trim());
  }

  function _pdfSelectionTextFromLines(lines) {
    const avgHeight = lines.reduce((total, line) => total + line.height, 0) / Math.max(lines.length, 1);
    const tolerance = Math.max(30, avgHeight * 2);
    const columns = [];
    lines.forEach((line) => {
      const column = columns.find(item => Math.abs(item.left - line.left) <= tolerance);
      if (column) {
        column.left = Math.min(column.left, line.left);
        column.right = Math.max(column.right, line.right);
        column.lines.push(line);
      } else {
        columns.push({ left: line.left, right: line.right, lines: [line] });
      }
    });
    const realColumns = columns.length > 1 && columns.filter(item => item.lines.length > 1).length > 1;
    const orderedLines = realColumns
      ? columns.sort((a, b) => a.left - b.left).flatMap(column => column.lines.sort((a, b) => a.top - b.top))
      : lines.sort((a, b) => a.top - b.top || a.left - b.left);
    return orderedLines
      .map(line => line.text)
      .join('\n')
      .replace(/([A-Za-z])-\n([A-Za-z])/g, '$1$2')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // Point PDF.js to its worker
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      './vendor/pdf.worker.min.js',
      document.baseURI
    ).href;
  }


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 1. CORE STATE
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const State = {
    pdfDoc:        null,
    currentPage:   1,
    totalPages:    0,
    scale:         1.0,
    rotation:      0,           // 0 | 90 | 180 | 270
    fitMode:       'width',     // 'width' | 'page' | 'custom'
    renderingPage: false,
    renderToken:   0,
    queuedRender:  null,
    renderTask:    null,
    searchQuery:   '',
    searchResults: [],          // [{page, items}]
    searchIdx:     -1,
    searchToken:   0,
    textCache:     new Map(),
    annotations:   {},          // { [pageNum]: Annotation[] }
    annotationDocId: 'global',
    searchDocId:   'global',
    activeTool:    'pan',       // 'pan' | 'highlight' | 'text' | 'draw'
    highlights:    [],          // persisted highlight annotations
  };


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 2. DOM REFERENCES
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const DOM = {
    viewerContainer:   null,
    pageCanvas:        null,
    textLayer:         null,
    annotationLayer:   null,
    thumbnailSidebar:  null,
    currentPageInput:  null,
    totalPagesLabel:   null,
    zoomLevelDisplay:  null,
    searchInput:       null,
    searchResults:     null,
    loadingOverlay:    null,
    progressBar:       null,
    errorBanner:       null,
    pageCount:         null,
  };

  function initDOM() {
    DOM.viewerContainer  = $('[data-pdf-viewer]');
    DOM.pageCanvas       = $('[data-pdf-canvas]')        ?? createCanvas();
    DOM.textLayer        = $('[data-pdf-text-layer]')    ?? createLayer('pdf-text-layer');
    DOM.annotationLayer  = $('[data-pdf-annot-layer]')   ?? createLayer('pdf-annot-layer');
    DOM.thumbnailSidebar = $('[data-pdf-thumbnails]');
    DOM.currentPageInput = $('[data-pdf-current-page]');
    DOM.totalPagesLabel  = $('[data-pdf-total-pages]');
    DOM.zoomLevelDisplay = $('[data-pdf-zoom]');
    DOM.searchInput      = $('[data-pdf-search-input]');
    DOM.searchResults    = $('[data-pdf-search-results]');
    DOM.loadingOverlay   = $('[data-pdf-loading]');
    DOM.progressBar      = $('[data-pdf-progress]');
    DOM.errorBanner      = $('[data-pdf-error]');
  }

  function createCanvas() {
    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-page-canvas';
    DOM.viewerContainer?.appendChild(canvas);
    return canvas;
  }

  function createLayer(className) {
    const div = document.createElement('div');
    div.className = className;
    DOM.viewerContainer?.appendChild(div);
    return div;
  }


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 3. LOAD PDF
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const PDFViewer = {

    /**
     * Load a PDF from URL or ArrayBuffer
     * @param {string|ArrayBuffer|File} source
     */
    async load(source) {
      if (typeof pdfjsLib === 'undefined') {
        console.error('[OpenCourseDeck PDF] PDF.js not loaded. Add pdfjs-dist script.');
        this._showError('PDF.js library not loaded.');
        return;
      }

      this._showLoading(true);
      this._clearError();
      State.renderToken += 1;
      State.queuedRender = null;

      try {
        let src;
        if (source instanceof File) {
          src = { data: await source.arrayBuffer() };
        } else if (source instanceof ArrayBuffer) {
          src = { data: source };
        } else {
          src = { url: source };
        }

        const loadingTask = pdfjsLib.getDocument({
          ...src,
          onProgress: ({ loaded, total }) => {
            if (total) this._updateProgress(loaded / total);
          },
        });

        State.pdfDoc    = await loadingTask.promise;
        State.totalPages = State.pdfDoc.numPages;
        State.currentPage = 1;
        State.rotation  = 0;
        State.searchToken += 1;
        State.searchQuery = '';
        State.searchResults = [];
        State.searchIdx = -1;
        State.textCache = new Map();
        State.annotations = {};
        State.annotationDocId = typeof source === 'string'
          ? source
          : `file:${source?.name || 'local'}:${source?.size || 0}`;
        State.searchDocId = this._deriveSearchDocId(source, State.pdfDoc);

        this._updatePageUI();
        await this._loadAnnotations();
        await this.renderPage(State.currentPage);
        this._applyPendingPage();
        await this._buildThumbnails();

        window.OpenCourseDeck?.bus?.emit('pdf:load', {
          pages: State.totalPages,
          source: typeof source === 'string' ? source : '[file]',
        });
      } catch (err) {
        console.error('[OpenCourseDeck PDF] Load error:', err);
        this._showError(`Failed to load PDF: ${err.message}`);
      } finally {
        this._showLoading(false);
      }
    },


    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // 4. PAGE RENDERING
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    async renderPage(pageNum, {
      scale    = State.scale,
      rotation = State.rotation,
    } = {}) {
      if (!State.pdfDoc) return;
      const request = { pageNum, scale, rotation };
      if (State.renderingPage) {
        State.queuedRender = request;
        return;
      }
      const token = ++State.renderToken;
      State.renderingPage = true;
      State.currentPage   = Math.max(1, Math.min(pageNum, State.totalPages));

      try {
        const page    = await State.pdfDoc.getPage(State.currentPage);
        if (token !== State.renderToken || !State.pdfDoc) return;
        const rotated = (rotation + page.rotate) % 360;
        const baseVP  = page.getViewport({ scale: 1, rotation: rotated });

        // Fit mode
        const container  = DOM.viewerContainer;
        const viewerW    = container?.clientWidth  ?? window.innerWidth;
        const viewerH    = container?.clientHeight ?? window.innerHeight;

        let finalScale = scale;
        if (State.fitMode === 'width') {
          finalScale = (viewerW - 40) / baseVP.width;
        } else if (State.fitMode === 'page') {
          finalScale = Math.min(
            (viewerW  - 40) / baseVP.width,
            (viewerH - 80) / baseVP.height
          );
        }
        State.scale = finalScale;

        const viewport = page.getViewport({ scale: finalScale, rotation: rotated });
        const canvas   = DOM.pageCanvas;
        const ctx      = canvas.getContext('2d');

        // HiDPI
        const dpr = window.devicePixelRatio ?? 1;
        canvas.width  = viewport.width  * dpr;
        canvas.height = viewport.height * dpr;
        canvas.style.width  = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        // Avoid compounding scale across multiple renders.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);

        // Cancel any in-flight render before starting a new one
        if (State.renderTask) {
          try { State.renderTask.cancel(); } catch {}
          State.renderTask = null;
        }
        // Render
        State.renderTask = page.render({ canvasContext: ctx, viewport });
        try {
          await State.renderTask.promise;
        } catch (err) {
          if (err?.name !== 'RenderingCancelledException') throw err;
          return;
        } finally {
          if (State.renderTask) State.renderTask = null;
        }
        if (token !== State.renderToken || !State.pdfDoc) return;

        // Text layer
        await this._renderTextLayer(page, viewport);
        if (token !== State.renderToken || !State.pdfDoc) return;

        // Annotation layer
        this._renderAnnotationLayer(State.currentPage, viewport);

        this._updatePageUI();
        this._highlightThumbnail(State.currentPage);

        window.OpenCourseDeck?.bus?.emit('pdf:pageRender', {
          page: State.currentPage,
          scale: State.scale,
        });
      } catch (err) {
        console.error('[OpenCourseDeck PDF] Render error:', err);
      } finally {
        State.renderingPage = false;
        if (token === State.renderToken && State.queuedRender) {
          const nextRender = State.queuedRender;
          State.queuedRender = null;
          this.renderPage(nextRender.pageNum, {
            scale: nextRender.scale,
            rotation: nextRender.rotation,
          });
        }
      }
    },

    getSnapshot() {
      return {
        docId: State.annotationDocId,
        searchDocId: State.searchDocId,
        page: State.currentPage,
        totalPages: State.totalPages,
        scale: State.scale,
        rotation: State.rotation,
      };
    },

    getAnnotations() {
      return Object.entries(State.annotations || {}).flatMap(([pageKey, annotations]) => {
        const page = Math.max(1, Number(pageKey || 1));
        return (Array.isArray(annotations) ? annotations : []).map(annotation => ({
          ...annotation,
          page: Math.max(1, Number(annotation?.page || page)),
          docId: annotation?.docId || State.annotationDocId,
        }));
      });
    },

    _selectionOwner(range) {
      const node = range?.commonAncestorContainer;
      const ElementCtor = window.Element;
      const NodeCtor = window.Node;
      if (!node) return null;
      if (ElementCtor && node instanceof ElementCtor) return node;
      if (NodeCtor && node.nodeType === NodeCtor.ELEMENT_NODE) return node;
      return node.parentElement || null;
    },

    _pageFromSelectionOwner(owner) {
      const pageEl = this._pageElementFromSelectionOwner(owner);
      return this._pageFromPageElement(pageEl);
    },

    _pageFromPageElement(pageEl) {
      const raw = pageEl?.dataset?.pdfPage
        ?? pageEl?.dataset?.pageNumber
        ?? pageEl?.dataset?.page
        ?? pageEl?.dataset?.pageIndex;
      const page = Number(raw);
      if (!Number.isFinite(page)) return null;
      return Math.max(1, pageEl?.dataset?.pageIndex ? page + 1 : page);
    },

    _pageElementFromSelectionOwner(owner) {
      return owner?.closest?.('[data-pdf-page], [data-page-number], [data-page], [data-page-index]') || null;
    },

    _pageElementForRect(rect, fallbackEl) {
      const candidates = Array.from(DOM.viewerContainer?.querySelectorAll?.('[data-pdf-page], [data-page-number], [data-page], [data-page-index]') || []);
      const centerX = Number(rect.left || 0) + Number(rect.width || 0) / 2;
      const centerY = Number(rect.top || 0) + Number(rect.height || 0) / 2;
      const match = candidates.find((pageEl) => {
        const pageRect = pageEl.getBoundingClientRect?.();
        if (!pageRect) return false;
        return centerX >= Number(pageRect.left || 0)
          && centerX <= Number(pageRect.right ?? (Number(pageRect.left || 0) + Number(pageRect.width || 0)))
          && centerY >= Number(pageRect.top || 0)
          && centerY <= Number(pageRect.bottom ?? (Number(pageRect.top || 0) + Number(pageRect.height || 0)));
      });
      return match || fallbackEl || null;
    },

    _selectionRects(range, owner, page) {
      const rects = [];
      const fallbackPageEl = this._pageElementFromSelectionOwner(owner);
      try {
        Array.from(range?.getClientRects?.() || []).forEach((rect) => {
          const width = Number(rect.width || 0);
          const height = Number(rect.height || 0);
          if (width <= 0 || height <= 0) return;
          const pageEl = this._pageElementForRect(rect, fallbackPageEl);
          const resolvedPage = this._pageFromPageElement(pageEl) || page;
          if (!resolvedPage) return;
          const pageRect = pageEl?.getBoundingClientRect?.() || DOM.viewerContainer?.getBoundingClientRect?.();
          const pageWidth = Math.max(1, Number(pageRect?.width || 0));
          const pageHeight = Math.max(1, Number(pageRect?.height || 0));
          rects.push({
            page: resolvedPage,
            x: Number(((Number(rect.left || 0) - Number(pageRect?.left || 0)) / pageWidth).toFixed(4)),
            y: Number(((Number(rect.top || 0) - Number(pageRect?.top || 0)) / pageHeight).toFixed(4)),
            w: Number((width / pageWidth).toFixed(4)),
            h: Number((height / pageHeight).toFixed(4)),
          });
        });
      } catch {}
      return rects;
    },

    _selectionTextFromLayer(clientRects, fallback) {
      const hits = [];
      if (!DOM.viewerContainer || !clientRects?.length) return fallback;
      DOM.viewerContainer.querySelectorAll('[data-pdf-text-item],.pdf-text-layer span').forEach((el) => {
        const value = String(el.textContent || '').trim();
        const rect = el.getBoundingClientRect?.();
        if (!value || !rect?.width || !rect?.height) return;
        const right = rect.right ?? rect.left + rect.width;
        const bottom = rect.bottom ?? rect.top + rect.height;
        if (!clientRects.some(item => Math.max(rect.left, item.left) < Math.min(right, item.right ?? item.left + item.width) && Math.max(rect.top, item.top) < Math.min(bottom, item.bottom ?? item.top + item.height))) return;
        hits.push({ top: rect.top, left: rect.left, right, height: rect.height, value });
      });
      const text = _pdfSelectionTextFromLines(_buildPdfSelectionLines(hits));
      return text || fallback;
    },

    getSelectionSnapshot() {
      const selection = window.getSelection?.();
      const text = String(selection?.toString?.() || '').trim();
      if (!text) return { text: '', page: Math.max(1, Number(State.currentPage || 1)), rects: [] };
      const fallback = { text, page: Math.max(1, Number(State.currentPage || 1)), rects: [] };
      if (!DOM.viewerContainer || !selection?.rangeCount) return fallback;
      const pages = [];
      const rects = [];
      const clientRects = [];
      try {
        for (let index = 0; index < selection.rangeCount; index += 1) {
          const range = selection.getRangeAt(index);
          const owner = this._selectionOwner(range);
          if (owner && !DOM.viewerContainer.contains(owner)) return { text: '', page: fallback.page };
          const page = this._pageFromSelectionOwner(owner);
          clientRects.push(...Array.from(range?.getClientRects?.() || []));
          const rangeRects = this._selectionRects(range, owner, page);
          rects.push(...rangeRects);
          rangeRects.forEach(rect => pages.push(rect.page));
          if (page && !rangeRects.length) pages.push(page);
        }
      } catch {
        return fallback;
      }
      const uniquePages = [...new Set(pages)].sort((a, b) => a - b);
      const layerText = this._selectionTextFromLayer(clientRects, text);
      return { text: layerText, page: uniquePages[0] || fallback.page, pages: uniquePages, rects };
    },

    async saveSelectionToNote() {
      const saveNote = window.DB?.saveNote;
      const selectionSnapshot = this.getSelectionSnapshot();
      const text = selectionSnapshot.text;
      if (!text) return { saved: false, reason: 'empty-selection' };
      if (typeof saveNote !== 'function') return { saved: false, reason: 'storage-unavailable' };

      const docId = State.annotationDocId || 'global';
      const page = Math.max(1, Number(selectionSnapshot.page || State.currentPage || 1));
      const pages = Array.isArray(selectionSnapshot.pages) && selectionSnapshot.pages.length
        ? [...new Set(selectionSnapshot.pages.map(item => Math.max(1, Number(item) || 1)))].sort((a, b) => a - b)
        : [page];
      const pageLabel = pages.length > 1 ? `pages ${pages.join(', ')}` : `page ${page}`;
      const now = Date.now();
      const excerpt = text.length > 80 ? `${text.slice(0, 77)}...` : text;
      await saveNote({
        id: `pdf-selection-note-${stableIdPart(docId)}-${now}`,
        title: `PDF selection: ${excerpt}`,
        content: `<blockquote>${escapeHtmlText(text)}</blockquote><p><strong>Source:</strong> PDF ${pageLabel}</p>`,
        sourceType: 'pdf-selection',
        docId,
        pdfDocId: docId,
        page,
        pdfPage: page,
        pdfPages: pages,
        selectionRects: selectionSnapshot.rects,
        tags: ['pdf', 'selection'],
        createdAt: now,
        updatedAt: now,
      });
      try { window.getSelection?.()?.removeAllRanges?.(); } catch {}
      return pages.length > 1 ? { saved: true, page, pages, docId } : { saved: true, page, docId };
    },

    async exportAnnotationsToNotes() {
      const saveNote = window.DB?.saveNote;
      const annotations = this.getAnnotations();
      const result = {
        total: annotations.length,
        created: 0,
        skipped: 0,
        errors: 0,
      };
      if (typeof saveNote !== 'function') {
        result.skipped = annotations.length;
        return result;
      }

      const docId = State.annotationDocId || 'global';
      const docPart = stableIdPart(docId);
      const now = Date.now();
      for (const annotation of annotations) {
        if (!annotation?.id) {
          result.skipped += 1;
          continue;
        }
        const page = Math.max(1, Number(annotation.page || 1));
        const type = String(annotation.type || 'annotation');
        const noteText = String(annotation.note || '').trim();
        const annotationPart = stableIdPart(annotation.id);
        const geometry = [
          `x=${Number(annotation.x || 0).toFixed(4)}`,
          `y=${Number(annotation.y || 0).toFixed(4)}`,
          `w=${Number(annotation.w || 0).toFixed(4)}`,
          `h=${Number(annotation.h || 0).toFixed(4)}`,
        ].join(', ');
        const content = [
          noteText ? `<p>${escapeHtmlText(noteText)}</p>` : `<p>${escapeHtmlText(type)} annotation</p>`,
          `<p><strong>Source:</strong> PDF page ${page}</p>`,
          `<p><strong>Annotation:</strong> ${escapeHtmlText(type)} (${escapeHtmlText(geometry)})</p>`,
        ].join('');

        try {
          await saveNote({
            id: `pdf-annotation-note-${docPart}-${annotationPart}`,
            title: noteText ? `PDF annotation: ${noteText.slice(0, 60)}` : `PDF page ${page} ${type}`,
            content,
            sourceType: 'pdf-annotation',
            docId,
            pdfDocId: docId,
            annotationId: annotation.id,
            annotationType: type,
            page,
            pdfPage: page,
            tags: ['pdf', 'annotation'],
            createdAt: annotation.createdAt || now,
            updatedAt: now,
          });
          result.created += 1;
        } catch {
          result.errors += 1;
        }
      }
      return result;
    },

    _applyPendingPage() {
      let pendingDoc = '';
      let pendingPage = 0;
      try {
        pendingDoc = sessionStorage.getItem('plasma_pending_pdf_doc') || '';
        pendingPage = Number(sessionStorage.getItem('plasma_pending_pdf_page') || 0);
      } catch {}
      if (!pendingPage) return;
      if (pendingDoc && pendingDoc !== State.annotationDocId && pendingDoc !== State.searchDocId) return;
      try {
        sessionStorage.removeItem('plasma_pending_pdf_doc');
        sessionStorage.removeItem('plasma_pending_pdf_page');
      } catch {}
      this.goTo(pendingPage);
    },

    // â”€â”€ Text layer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async _renderTextLayer(page, viewport) {
      const textLayerDiv = DOM.textLayer;
      if (!textLayerDiv) return;
      textLayerDiv.replaceChildren();
      textLayerDiv.style.width  = `${viewport.width}px`;
      textLayerDiv.style.height = `${viewport.height}px`;

      const textContent = await page.getTextContent();

      if (pdfjsLib.renderTextLayer) {
        pdfjsLib.renderTextLayer({
          textContent,
          container:  textLayerDiv,
          viewport,
          textDivs:   [],
        });
      }
    },

    // â”€â”€ Annotation layer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    _renderAnnotationLayer(pageNum, viewport) {
      const layer = DOM.annotationLayer;
      if (!layer) return;
      layer.replaceChildren();
      layer.style.width  = `${viewport.width}px`;
      layer.style.height = `${viewport.height}px`;

      const annots = State.annotations[pageNum] ?? [];
      annots.forEach(annot => {
        const el = document.createElement('div');
        el.className = `pdf-annotation pdf-annot-${annot.type}`;
        el.style.cssText = `
          left:   ${annot.x * viewport.width}px;
          top:    ${annot.y * viewport.height}px;
          width:  ${annot.w * viewport.width}px;
          height: ${annot.h * viewport.height}px;
          background: ${annot.color ?? 'rgba(255,220,0,0.35)'};
          position: absolute;
        `;
        el.title = annot.note ?? '';
        el.dataset.annotId = annot.id;

        // Right-click to delete
        RouteListeners.on(el, 'contextmenu', async e => {
          e.preventDefault();
          if (await pdConfirm({
            title: 'Delete annotation',
            message: 'Delete this PDF annotation?',
            confirmLabel: 'Delete annotation',
            cancelLabel: 'Keep annotation',
          })) {
            AnnotationManager.delete(pageNum, annot.id);
            el.remove();
          }
        });

        layer.appendChild(el);
      });
    },


    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // 5. NAVIGATION
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    goTo(page) {
      const p = parseInt(page, 10);
      if (isNaN(p)) return;
      this.renderPage(p);
    },

    next() {
      if (State.currentPage < State.totalPages) this.renderPage(State.currentPage + 1);
    },

    prev() {
      if (State.currentPage > 1) this.renderPage(State.currentPage - 1);
    },

    first() { this.renderPage(1); },
    last()  { this.renderPage(State.totalPages); },


    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // 6. ZOOM
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    zoomIn(step = 0.25) {
      State.fitMode = 'custom';
      this.renderPage(State.currentPage, { scale: Math.min(State.scale + step, 5) });
    },

    zoomOut(step = 0.25) {
      State.fitMode = 'custom';
      this.renderPage(State.currentPage, { scale: Math.max(State.scale - step, 0.25) });
    },

    zoomTo(value) {
      State.fitMode = 'custom';
      this.renderPage(State.currentPage, { scale: parseFloat(value) });
    },

    fitWidth() {
      State.fitMode = 'width';
      this.renderPage(State.currentPage);
    },

    fitPage() {
      State.fitMode = 'page';
      this.renderPage(State.currentPage);
    },


    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // 7. ROTATION
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    rotateCW()  { State.rotation = (State.rotation + 90)  % 360; this.renderPage(State.currentPage); },
    rotateCCW() { State.rotation = (State.rotation + 270) % 360; this.renderPage(State.currentPage); },


    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // 8. THUMBNAILS
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    async _buildThumbnails() {
      const sidebar = DOM.thumbnailSidebar;
      if (!sidebar || !State.pdfDoc) return;
      const loading = document.createElement('div');
      loading.className = 'thumb-loading';
      loading.textContent = 'Loading thumbnails…';
      sidebar.replaceChildren(loading);

      const fragment = document.createDocumentFragment();

      for (let i = 1; i <= State.totalPages; i++) {
        const wrapper  = document.createElement('div');
        wrapper.className = 'thumb-item';
        wrapper.dataset.thumbPage = i;

        const canvas   = document.createElement('canvas');
        canvas.className = 'thumb-canvas';
        const label    = document.createElement('span');
        label.className = 'thumb-label';
        label.textContent = i;

        wrapper.append(canvas, label);
        fragment.appendChild(wrapper);

        RouteListeners.on(wrapper, 'click', () => this.goTo(i));
      }

      sidebar.replaceChildren(fragment);

      // Lazy-render thumbnails via IntersectionObserver
      this._thumbnailObserver?.disconnect?.();
      const observer = new IntersectionObserver(async entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const item    = entry.target;
          const pNum    = parseInt(item.dataset.thumbPage, 10);
          const canvas  = item.querySelector('.thumb-canvas');
          if (canvas.dataset.rendered) continue;

          const page    = await State.pdfDoc.getPage(pNum);
          const vp      = page.getViewport({ scale: 0.2 });
          canvas.width  = vp.width;
          canvas.height = vp.height;
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
          canvas.dataset.rendered = 'true';
          observer.unobserve(item);
        }
      }, { root: sidebar, rootMargin: '0px 0px 400px 0px' });

      this._thumbnailObserver = observer;
      $$('.thumb-item', sidebar).forEach(el => observer.observe(el));
    },

    _highlightThumbnail(page) {
      const sidebar = DOM.thumbnailSidebar;
      if (!sidebar) return;
      $$('.thumb-item', sidebar).forEach(el =>
        el.classList.toggle('active', parseInt(el.dataset.thumbPage, 10) === page)
      );
      const active = $(`.thumb-item[data-thumb-page="${page}"]`, sidebar);
      active?.scrollIntoView({ block: 'nearest' });
    },


    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // 9. TEXT SEARCH
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    async search(query) {
      if (!State.pdfDoc || !query.trim()) {
        this._clearSearch();
        return;
      }
      const token = ++State.searchToken;
      State.searchQuery   = query;
      State.searchResults = [];
      State.searchIdx     = -1;

      const q = query.toLowerCase();

      for (let p = 1; p <= State.totalPages; p++) {
        if (token !== State.searchToken) return;
        const text = await this._getPageSearchText(p);
        if (token !== State.searchToken) return;

        const idx = text.indexOf(q);
        if (idx >= 0) {
          State.searchResults.push({
            page: p,
            text,
            snippet: text.slice(Math.max(0, idx - 40), idx + q.length + 40),
          });
        }
      }

      this._renderSearchResults();

      if (State.searchResults.length) {
        State.searchIdx = 0;
        this.goTo(State.searchResults[0].page);
      }

      window.OpenCourseDeck?.bus?.emit('pdf:search', {
        query,
        count: State.searchResults.length,
      });
    },

    async _getPageSearchText(pageNum) {
      const cacheKey = `${State.searchDocId || State.annotationDocId || 'global'}:${pageNum}`;
      if (State.textCache.has(cacheKey)) return State.textCache.get(cacheKey);
      const textPromise = (async () => {
        const page = await State.pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        return textContent.items.map(i => i.str).join(' ').toLowerCase();
      })();
      State.textCache.set(cacheKey, textPromise);
      try {
        return await textPromise;
      } catch (err) {
        State.textCache.delete(cacheKey);
        throw err;
      }
    },

    async getPageText(pageNum = State.currentPage) {
      if (!State.pdfDoc) return '';
      const page = Math.max(1, Math.min(Number(pageNum) || State.currentPage || 1, State.totalPages || 1));
      const text = await this._getPageSearchText(page);
      return String(text || '').replace(/\s+/g, ' ').trim();
    },

    async extractTextForSummary({ maxPages = 5, maxChars = 12000 } = {}) {
      if (!State.pdfDoc) return { text: '', pages: 0, totalPages: 0, docId: State.annotationDocId || 'global' };
      const totalPages = Math.max(0, Number(State.totalPages) || 0);
      const limitPages = Math.max(1, Math.min(totalPages || 1, Number(maxPages) || 5));
      const limitChars = Math.max(1000, Number(maxChars) || 12000);
      const pageTexts = [];
      for (let page = 1; page <= limitPages; page += 1) {
        const text = await this.getPageText(page);
        if (text) pageTexts.push(`Page ${page}: ${text}`);
        if (pageTexts.join('\n\n').length >= limitChars) break;
      }
      const text = pageTexts.join('\n\n').slice(0, limitChars).trim();
      return { text, pages: pageTexts.length, totalPages, docId: State.annotationDocId || 'global' };
    },

    _deriveSearchDocId(source, pdfDoc = State.pdfDoc) {
      const fingerprints = Array.isArray(pdfDoc?.fingerprints) ? pdfDoc.fingerprints.filter(Boolean) : [];
      if (fingerprints.length) return `fingerprint:${fingerprints.join(':')}`;
      if (pdfDoc?.fingerprint) return `fingerprint:${pdfDoc.fingerprint}`;
      if (typeof source === 'string') return `url:${source}`;
      if (source instanceof File) return `file:${source.name}:${source.size}:${source.lastModified || 0}`;
      if (source instanceof ArrayBuffer) return `arraybuffer:${source.byteLength}`;
      return State.annotationDocId || 'global';
    },

    searchNext() {
      if (!State.searchResults.length) return;
      State.searchIdx = (State.searchIdx + 1) % State.searchResults.length;
      this.goTo(State.searchResults[State.searchIdx].page);
      this._renderSearchResults();
    },

    searchPrev() {
      if (!State.searchResults.length) return;
      State.searchIdx = (State.searchIdx - 1 + State.searchResults.length) % State.searchResults.length;
      this.goTo(State.searchResults[State.searchIdx].page);
      this._renderSearchResults();
    },

    _clearSearch() {
      State.searchToken += 1;
      State.searchQuery   = '';
      State.searchResults = [];
      State.searchIdx     = -1;
      if (DOM.searchResults) DOM.searchResults.replaceChildren();
    },

    _renderSearchResults() {
      const el = DOM.searchResults;
      if (!el) return;
      const { searchResults: results, searchIdx } = State;
      el.replaceChildren();
      if (!results.length) {
        const noResult = document.createElement('span');
        noResult.className = 'search-no-result';
        noResult.textContent = `No matches for "${State.searchQuery}"`;
        el.appendChild(noResult);
        return;
      }
      const count = document.createElement('span');
      count.className = 'search-count';
      count.textContent = `Match ${searchIdx + 1} of ${results.length}`;
      const pages = document.createElement('span');
      pages.className = 'search-pages';
      pages.textContent = `Pages: ${[...new Set(results.map(r => r.page))].join(', ')}`;
      el.append(count, pages);
    },


    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // 10. DOWNLOAD & PRINT
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    async download(filename = 'document.pdf') {
      if (!State.pdfDoc) return;
      const data = await State.pdfDoc.getData();
      const blob = new Blob([data], { type: 'application/pdf' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },

    async print() {
      if (!State.pdfDoc) return;
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      const data   = await State.pdfDoc.getData();
      const blob   = new Blob([data], { type: 'application/pdf' });
      const objectUrl = URL.createObjectURL(blob);
      const validateFrameUrl = window.OpenCourseDeck?.safeFrameUrl;
      const frameUrl = typeof validateFrameUrl === 'function'
        ? validateFrameUrl(objectUrl)
        : objectUrl;
      if (!frameUrl) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      iframe.src   = frameUrl;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        iframe.contentWindow.print();
        setTimeout(() => { iframe.remove(); URL.revokeObjectURL(objectUrl); }, 5000);
      };
    },

    // Screenshot current page as PNG
    async screenshot() {
      if (!DOM.pageCanvas) return;
      const url = DOM.pageCanvas.toDataURL('image/png');
      const a   = document.createElement('a');
      a.href = url;
      a.download = `page-${State.currentPage}.png`;
      a.click();
    },


    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // 11. UI HELPERS
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    _updatePageUI() {
      if (DOM.currentPageInput) DOM.currentPageInput.value = State.currentPage;
      if (DOM.totalPagesLabel)  DOM.totalPagesLabel.textContent = State.totalPages;
      if (DOM.zoomLevelDisplay) DOM.zoomLevelDisplay.textContent = `${Math.round(State.scale * 100)}%`;

      // Disable prev/next buttons at boundaries
      const prevBtn = $('[data-pdf-prev]');
      const nextBtn = $('[data-pdf-next]');
      if (prevBtn) prevBtn.disabled = State.currentPage <= 1;
      if (nextBtn) nextBtn.disabled = State.currentPage >= State.totalPages;
    },

    _showLoading(show) {
      if (DOM.loadingOverlay) DOM.loadingOverlay.hidden = !show;
    },

    _updateProgress(pct) {
      if (DOM.progressBar) {
        DOM.progressBar.style.width = `${pct * 100}%`;
        DOM.progressBar.setAttribute('aria-valuenow', Math.round(pct * 100));
      }
    },

    _showError(msg) {
      if (DOM.errorBanner) {
        DOM.errorBanner.textContent = msg;
        DOM.errorBanner.hidden = false;
      }
    },

    _clearError() {
      if (DOM.errorBanner) DOM.errorBanner.hidden = true;
    },

    async _loadAnnotations() {
      if (window.DB?.getAnnotations) {
        try {
          const records = await window.DB.getAnnotations(State.annotationDocId);
          State.annotations = records.reduce((acc, annotation) => {
            const page = annotation.page ?? 1;
            (acc[page] = acc[page] ?? []).push(annotation);
            return acc;
          }, {});
          return;
        } catch {}
      }
      const saved = localStorage.getItem('plasma-pdf-annotations');
      if (saved) {
        try { State.annotations = JSON.parse(saved); } catch {}
      }
    },

    async refreshAnnotationsFromStorage() {
      await this._loadAnnotations();
      const canvas = DOM.pageCanvas;
      // The annotation layer is styled in CSS pixels; canvas.width/height are
      // device pixels (scaled by devicePixelRatio in renderPage), so prefer
      // the CSS-pixel bounding rect and only fall back to device pixels
      // divided by the current ratio.
      const rect = canvas?.getBoundingClientRect?.();
      const dpr = Math.max(1, Number(window.devicePixelRatio) || 1);
      const viewport = {
        width: Math.max(1, Number(rect?.width || (canvas?.width ?? 0) / dpr)),
        height: Math.max(1, Number(rect?.height || (canvas?.height ?? 0) / dpr)),
      };
      this._renderAnnotationLayer(State.currentPage, viewport);
      return this.getAnnotations();
    },

    _saveAnnotations() {
      if (window.DB?.saveAnnotations) {
        try {
          window.DB.saveAnnotations(State.annotationDocId, State.annotations)
            .catch(() => localStorage.setItem('plasma-pdf-annotations', JSON.stringify(State.annotations)));
          return;
        } catch {}
      }
      localStorage.setItem('plasma-pdf-annotations', JSON.stringify(State.annotations));
    },
  };


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 12. ANNOTATION MANAGER
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const AnnotationManager = {
    _drawing:   false,
    _startPos:  null,
    _tempEl:    null,

    init() {
      const layer = DOM.annotationLayer;
      if (!layer) return;

      RouteListeners.on(layer, 'mousedown', e => this._onMouseDown(e));
      RouteListeners.on(layer, 'mousemove', e => this._onMouseMove(e));
      RouteListeners.on(layer, 'mouseup',   e => this._onMouseUp(e));
    },

    _onMouseDown(e) {
      if (State.activeTool === 'pan') return;
      this._drawing  = true;
      const rect     = e.currentTarget.getBoundingClientRect();
      this._startPos = {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top)  / rect.height,
      };

      this._tempEl = document.createElement('div');
      this._tempEl.className = 'pdf-annotation-temp';
      this._tempEl.style.cssText = `
        position: absolute;
        left:   ${e.clientX - rect.left}px;
        top:    ${e.clientY - rect.top}px;
        width:  0px;
        height: 0px;
        background: rgba(255,220,0,0.35);
        border: 2px dashed #f59e0b;
        pointer-events: none;
      `;
      DOM.annotationLayer.appendChild(this._tempEl);
    },

    _onMouseMove(e) {
      if (!this._drawing || !this._tempEl) return;
      const rect = DOM.annotationLayer.getBoundingClientRect();
      const x0   = this._startPos.x * rect.width;
      const y0   = this._startPos.y * rect.height;
      const x1   = e.clientX - rect.left;
      const y1   = e.clientY - rect.top;

      this._tempEl.style.left   = `${Math.min(x0, x1)}px`;
      this._tempEl.style.top    = `${Math.min(y0, y1)}px`;
      this._tempEl.style.width  = `${Math.abs(x1 - x0)}px`;
      this._tempEl.style.height = `${Math.abs(y1 - y0)}px`;
    },

    _onMouseUp(e) {
      if (!this._drawing) return;
      this._drawing = false;
      this._tempEl?.remove();
      this._tempEl = null;

      const rect = DOM.annotationLayer.getBoundingClientRect();
      const x0   = this._startPos.x;
      const y0   = this._startPos.y;
      const x1   = (e.clientX - rect.left) / rect.width;
      const y1   = (e.clientY - rect.top)  / rect.height;

      const annot = {
        id:    `annot-${Date.now()}`,
        type:  State.activeTool,
        x:     Math.min(x0, x1),
        y:     Math.min(y0, y1),
        w:     Math.abs(x1 - x0),
        h:     Math.abs(y1 - y0),
        color: this._colorForTool(State.activeTool),
        note:  '',
      };

      if (annot.w < 0.005 && annot.h < 0.005) return; // too small

      if (!State.annotations[State.currentPage]) {
        State.annotations[State.currentPage] = [];
      }
      State.annotations[State.currentPage].push(annot);
      PDFViewer._saveAnnotations();

      // Re-render annotation layer
      const vp = { width: rect.width, height: rect.height };
      PDFViewer._renderAnnotationLayer(State.currentPage, vp);

      window.OpenCourseDeck?.bus?.emit('pdf:annotate', { annot, page: State.currentPage });
    },

    delete(pageNum, annotId) {
      if (!State.annotations[pageNum]) return;
      State.annotations[pageNum] = State.annotations[pageNum].filter(a => a.id !== annotId);
      PDFViewer._saveAnnotations();
    },

    clearPage(pageNum) {
      delete State.annotations[pageNum];
      PDFViewer._saveAnnotations();
      if (DOM.annotationLayer) DOM.annotationLayer.replaceChildren();
    },

    clearAll() {
      State.annotations = {};
      PDFViewer._saveAnnotations();
    },

    _colorForTool(tool) {
      const colors = {
        highlight: 'rgba(255, 220, 0, 0.40)',
        text:      'rgba(99, 179, 237, 0.40)',
        draw:      'rgba(248, 113, 113, 0.40)',
      };
      return colors[tool] ?? 'rgba(255,220,0,0.35)';
    },
  };


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 13. KEYBOARD & TOUCH GESTURES
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const PDFInput = {
    _pinchDist: null,

    init() {
      RouteListeners.on(document, 'keydown', e => {
        const root = DOM.viewerContainer?.closest('.view-pdf') ?? DOM.viewerContainer;
        const target = e.target?.nodeType === 1 ? e.target : document.activeElement;
        if (!root?.contains(target) && !root?.contains(document.activeElement)) {
          return;
        }
        // Never hijack typing in the PDF search box, page-number input,
        // or any other editable control inside the viewer.
        if (target?.matches?.('input, textarea, select, [contenteditable], [contenteditable] *')) {
          return;
        }
        switch (e.key) {
          case 'ArrowRight':
          case 'ArrowDown':
          case 'PageDown': e.preventDefault(); PDFViewer.next(); break;
          case 'ArrowLeft':
          case 'ArrowUp':
          case 'PageUp':   e.preventDefault(); PDFViewer.prev(); break;
          case 'Home':     e.preventDefault(); PDFViewer.first(); break;
          case 'End':      e.preventDefault(); PDFViewer.last(); break;
          case '+':
          case '=':        PDFViewer.zoomIn(); break;
          case '-':        PDFViewer.zoomOut(); break;
          case '0':        PDFViewer.fitWidth(); break;
          case 'f':
          case 'F':        PDFViewer.fitPage(); break;
        }
      });

      // Mouse wheel zoom
      RouteListeners.on(DOM.viewerContainer, 'wheel', e => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        e.deltaY < 0 ? PDFViewer.zoomIn(0.1) : PDFViewer.zoomOut(0.1);
      }, { passive: false });

      // Pinch-to-zoom (touch)
      RouteListeners.on(DOM.viewerContainer, 'touchstart', e => {
        if (e.touches.length === 2) {
          this._pinchDist = this._dist(e.touches);
        }
      }, { passive: true });

      RouteListeners.on(DOM.viewerContainer, 'touchmove', e => {
        if (e.touches.length !== 2 || !this._pinchDist) return;
        const newDist = this._dist(e.touches);
        const delta   = (newDist - this._pinchDist) / 200;
        if (Math.abs(delta) > 0.02) {
          delta > 0 ? PDFViewer.zoomIn(0.1) : PDFViewer.zoomOut(0.1);
          this._pinchDist = newDist;
        }
      }, { passive: true });
    },

    destroy() {
      this._pinchDist = null;
    },

    _dist(touches) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    },
  };


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 14. TOOLBAR WIRING
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const PDFToolbar = {
    _inited: false,
    init() {
      if (this._inited) return;
      this._inited = true;
      RouteListeners.on(document, 'click', e => {
        const t = e?.target;
        const target = t && t.nodeType === 1 ? t : t?.parentElement;
        const btn = target?.closest?.('[data-pdf-action]');
        const root = DOM.viewerContainer?.closest('.view-pdf') ?? DOM.viewerContainer;
        if (!root?.contains(btn)) return;
        if (!btn) return;

        const action = btn.dataset.pdfAction;
        switch (action) {
          case 'prev':        PDFViewer.prev(); break;
          case 'next':        PDFViewer.next(); break;
          case 'first':       PDFViewer.first(); break;
          case 'last':        PDFViewer.last(); break;
          case 'zoom-in':     PDFViewer.zoomIn(); break;
          case 'zoom-out':    PDFViewer.zoomOut(); break;
          case 'fit-width':   PDFViewer.fitWidth(); break;
          case 'fit-page':    PDFViewer.fitPage(); break;
          case 'rotate-cw':   PDFViewer.rotateCW(); break;
          case 'rotate-ccw':  PDFViewer.rotateCCW(); break;
          case 'download':    PDFViewer.download(); break;
          case 'print':       PDFViewer.print(); break;
          case 'screenshot':  PDFViewer.screenshot(); break;
          case 'clear-annot': AnnotationManager.clearPage(State.currentPage); break;

          // Tool selection
          case 'tool-pan':
          case 'tool-highlight':
          case 'tool-text':
          case 'tool-draw':
            State.activeTool = action.replace('tool-', '');
            $$('[data-pdf-action^="tool-"]').forEach(b =>
              b.classList.toggle('active', b === btn));
            if (DOM.annotationLayer)
              DOM.annotationLayer.style.cursor =
                State.activeTool === 'pan' ? 'grab' : 'crosshair';
            break;
        }
      });

      // Page number input
      if (DOM.currentPageInput) {
        RouteListeners.on(DOM.currentPageInput, 'keydown', e => {
          if (e.key === 'Enter') PDFViewer.goTo(DOM.currentPageInput.value);
        });
        RouteListeners.on(DOM.currentPageInput, 'blur', () =>
          PDFViewer.goTo(DOM.currentPageInput.value));
      }

      // Zoom select
      const zoomSelect = $('[data-pdf-zoom-select]');
      if (zoomSelect) {
        RouteListeners.on(zoomSelect, 'change', () => {
          const v = zoomSelect.value;
          if (v === 'width') PDFViewer.fitWidth();
          else if (v === 'page') PDFViewer.fitPage();
          else PDFViewer.zoomTo(parseFloat(v));
        });
      }

      // Search
      if (DOM.searchInput) {
        RouteListeners.on(DOM.searchInput, 'keydown', e => {
          if (e.key === 'Enter') {
            e.shiftKey
              ? PDFViewer.searchPrev()
              : PDFViewer.search(DOM.searchInput.value);
          }
          if (e.key === 'Escape') {
            PDFViewer._clearSearch();
            DOM.searchInput.value = '';
          }
        });
      }

      // Open file
      const openInput = $('[data-pdf-open]');
      if (openInput) {
        openInput.accept = 'application/pdf';
        RouteListeners.on(openInput, 'change', () => {
          if (openInput.files[0]) PDFViewer.load(openInput.files[0]);
        });
        const openBtn = $('[data-pdf-action="open"]');
        if (openBtn) RouteListeners.on(openBtn, 'click', () => openInput.click());
      }

      // Drag-and-drop on viewer
      const viewer = $('[data-pdf-viewer]');
      if (viewer) {
        RouteListeners.on(viewer, 'dragover',  e => { e.preventDefault(); viewer.classList.add('drag-over'); });
        RouteListeners.on(viewer, 'dragleave', () => viewer.classList.remove('drag-over'));
        RouteListeners.on(viewer, 'drop', e => {
          e.preventDefault();
          viewer.classList.remove('drag-over');
          const file = e.dataTransfer.files[0];
          if (file?.type === 'application/pdf') PDFViewer.load(file);
        });
      }
    },
  };


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 15. INIT
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  let _inited = false;
  function initPDFViewer() {
    const hasViewer = !!$('[data-pdf-viewer]');
    // If we already initialized but the PDF view isn't mounted, skip.
    if (_inited && !hasViewer) return;
    // If the view is mounted later (SPA), allow re-init of DOM wiring.
    if (!hasViewer) return;
    _inited = true;
    initDOM();
    PDFToolbar.init();
    AnnotationManager.init();
    PDFInput.init();

    // Auto-load if data-pdf-src is set
    const viewer = $('[data-pdf-viewer]');
    const src    = viewer?.dataset.pdfSrc;
    if (src) PDFViewer.load(src);
  }

  function destroyPDFViewer() {
    RouteListeners.clear();
    PDFInput.destroy();
    PDFViewer._thumbnailObserver?.disconnect?.();
    PDFViewer._thumbnailObserver = null;
    // Cancel any in-flight render before destroying the document
    if (State.renderTask) {
      try { State.renderTask.cancel(); } catch {}
      State.renderTask = null;
    }
    try { State.pdfDoc?.destroy?.(); } catch {}
    Object.assign(State, {
      pdfDoc: null,
      currentPage: 1,
      totalPages: 0,
      scale: 1.0,
      rotation: 0,
      fitMode: 'width',
      renderingPage: false,
      renderToken: State.renderToken + 1,
      queuedRender: null,
      searchQuery: '',
      searchResults: [],
      searchIdx: -1,
      searchToken: 0,
      textCache: new Map(),
      annotations: {},
      annotationDocId: 'global',
      searchDocId: 'global',
      activeTool: 'pan',
      highlights: [],
    });
    Object.keys(DOM).forEach((key) => { DOM[key] = null; });
    PDFToolbar._inited = false;
    _inited = false;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPDFViewer);
  } else {
    initPDFViewer();
  }

  // Public API
  window.PlasmaPDFViewer       = PDFViewer;
  window.PlasmaAnnotationMgr   = AnnotationManager;
  window.PlasmaPDFState        = State;
  window.PlasmaPDFInit         = initPDFViewer;
  window.PlasmaPDFDestroy      = destroyPDFViewer;

})();
