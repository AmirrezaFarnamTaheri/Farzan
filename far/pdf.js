// ============================================================
// PlasmaDeck — pdf.js
// Full PDF Viewer with Thumbnails, Annotations, Search
// Requires: PDF.js library (pdfjs-dist)
//   <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
// ============================================================

(() => {
  'use strict';

  // ──────────────────────────────────────────────────────────
  // 0. SETUP
  // ──────────────────────────────────────────────────────────

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function debounce(fn, ms = 300) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  async function pdConfirm(message) {
    const fn = window.PlasmaDeck?.UI?.confirm;
    if (typeof fn === 'function') return fn(message);
    return window.confirm(String(message ?? 'Are you sure?'));
  }

  // Point PDF.js to its worker
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      './vendor/pdf.worker.min.js',
      document.baseURI
    ).href;
  }


  // ──────────────────────────────────────────────────────────
  // 1. CORE STATE
  // ──────────────────────────────────────────────────────────

  const State = {
    pdfDoc:        null,
    currentPage:   1,
    totalPages:    0,
    scale:         1.0,
    rotation:      0,           // 0 | 90 | 180 | 270
    fitMode:       'width',     // 'width' | 'page' | 'custom'
    renderingPage: false,
    searchQuery:   '',
    searchResults: [],          // [{page, items}]
    searchIdx:     -1,
    currentDocId:   null,
    annotations:   {},          // { [pageNum]: Annotation[] }
    activeTool:    'pan',       // 'pan' | 'highlight' | 'text' | 'draw'
    highlights:    [],          // persisted highlight annotations
  };


  // ──────────────────────────────────────────────────────────
  // 2. DOM REFERENCES
  // ──────────────────────────────────────────────────────────

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


  // ──────────────────────────────────────────────────────────
  // 3. LOAD PDF
  // ──────────────────────────────────────────────────────────

  const PDFViewer = {

    /**
     * Load a PDF from URL or ArrayBuffer
     * @param {string|ArrayBuffer|File} source
     */
    async load(source) {
      if (typeof pdfjsLib === 'undefined') {
        console.error('[PlasmaDeck PDF] PDF.js not loaded. Add pdfjs-dist script.');
        this._showError('PDF.js library not loaded.');
        return;
      }

      this._showLoading(true);
      this._clearError();

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

        State.currentDocId = typeof source === 'string' ? source : (source instanceof File ? source.name : 'buffer-' + Date.now());
      State.pdfDoc    = await loadingTask.promise;
        State.totalPages = State.pdfDoc.numPages;
        State.currentPage = 1;
        State.rotation  = 0;
        State.annotations = {};

        this._updatePageUI();
        await this.renderPage(State.currentPage);
        await this._buildThumbnails();
        this._loadAnnotations();

        window.PlasmaDeck?.bus?.emit('pdf:load', {
          pages: State.totalPages,
          source: typeof source === 'string' ? source : '[file]',
        });
      } catch (err) {
        console.error('[PlasmaDeck PDF] Load error:', err);
        this._showError(`Failed to load PDF: ${err.message}`);
      } finally {
        this._showLoading(false);
      }
    },


    // ──────────────────────────────────────────────────────
    // 4. PAGE RENDERING
    // ──────────────────────────────────────────────────────

    async renderPage(pageNum, {
      scale    = State.scale,
      rotation = State.rotation,
    } = {}) {
      if (!State.pdfDoc || State.renderingPage) return;
      State.renderingPage = true;
      State.currentPage   = Math.max(1, Math.min(pageNum, State.totalPages));

      try {
        const page    = await State.pdfDoc.getPage(State.currentPage);
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

        // Render
        await page.render({ canvasContext: ctx, viewport }).promise;

        // Text layer
        await this._renderTextLayer(page, viewport);

        // Annotation layer
        this._renderAnnotationLayer(State.currentPage, viewport);

        this._updatePageUI();
        this._highlightThumbnail(State.currentPage);

        window.PlasmaDeck?.bus?.emit('pdf:pageRender', {
          page: State.currentPage,
          scale: State.scale,
        });
      } catch (err) {
        console.error('[PlasmaDeck PDF] Render error:', err);
      } finally {
        State.renderingPage = false;
      }
    },

    // ── Text layer ─────────────────────────────────────────
    async _renderTextLayer(page, viewport) {
      const textLayerDiv = DOM.textLayer;
      if (!textLayerDiv) return;
      textLayerDiv.innerHTML = '';
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

    // ── Annotation layer ────────────────────────────────────
    _renderAnnotationLayer(pageNum, viewport) {
      const layer = DOM.annotationLayer;
      if (!layer) return;
      layer.innerHTML = '';
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
        el.addEventListener('contextmenu', async e => {
          e.preventDefault();
          if (await pdConfirm('Delete this annotation?')) {
            AnnotationManager.delete(pageNum, annot.id);
            el.remove();
          }
        });

        layer.appendChild(el);
      });
    },


    // ──────────────────────────────────────────────────────
    // 5. NAVIGATION
    // ──────────────────────────────────────────────────────

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


    // ──────────────────────────────────────────────────────
    // 6. ZOOM
    // ──────────────────────────────────────────────────────

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


    // ──────────────────────────────────────────────────────
    // 7. ROTATION
    // ──────────────────────────────────────────────────────

    rotateCW()  { State.rotation = (State.rotation + 90)  % 360; this.renderPage(State.currentPage); },
    rotateCCW() { State.rotation = (State.rotation + 270) % 360; this.renderPage(State.currentPage); },


    // ──────────────────────────────────────────────────────
    // 8. THUMBNAILS
    // ──────────────────────────────────────────────────────

    async _buildThumbnails() {
      const sidebar = DOM.thumbnailSidebar;
      if (!sidebar || !State.pdfDoc) return;
      sidebar.innerHTML = '<div class="thumb-loading">Loading thumbnails…</div>';

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

        wrapper.addEventListener('click', () => this.goTo(i));
      }

      sidebar.innerHTML = '';
      sidebar.appendChild(fragment);

      // Lazy-render thumbnails via IntersectionObserver
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


    // ──────────────────────────────────────────────────────
    // 9. TEXT SEARCH
    // ──────────────────────────────────────────────────────

    async search(query) {
      if (!State.pdfDoc || !query.trim()) {
        this._clearSearch();
        return;
      }

      // Cancel previous search if running
      if (this._searchAbort) this._searchAbort.abort();
      this._searchAbort = new AbortController();
      const { signal } = this._searchAbort;

      State.searchQuery   = query;
      State.searchResults = [];
      State.searchIdx     = -1;

      const q = query.toLowerCase();
      
      // Non-blocking search with feedback
      for (let p = 1; p <= State.totalPages; p++) {
        if (signal.aborted) return;
        
        const page        = await State.pdfDoc.getPage(p);
        const textContent = await page.getTextContent();
        const text        = textContent.items.map(i => i.str).join(' ').toLowerCase();

        if (text.includes(q)) {
          State.searchResults.push({ page: p, text });
          this._renderSearchResults(); // Partial results
        }
        
        // Yield to UI thread every 10 pages
        if (p % 10 === 0) await new Promise(r => setTimeout(r, 0));
      }

      this._renderSearchResults();

      if (State.searchResults.length && State.searchIdx === -1) {
        State.searchIdx = 0;
        this.goTo(State.searchResults[0].page);
      }

      window.PlasmaDeck?.bus?.emit('pdf:search', {
        query,
        count: State.searchResults.length,
      });
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
      State.searchQuery   = '';
      State.searchResults = [];
      State.searchIdx     = -1;
      if (DOM.searchResults) DOM.searchResults.innerHTML = '';
    },

    _renderSearchResults() {
      const el = DOM.searchResults;
      if (!el) return;
      const { searchResults: results, searchIdx } = State;
      if (!results.length) {
        el.innerHTML = `<span class="search-no-result">No matches for "${State.searchQuery}"</span>`;
        return;
      }
      el.innerHTML = `
        <span class="search-count">
          Match ${searchIdx + 1} of ${results.length}
        </span>
        <span class="search-pages">
          Pages: ${[...new Set(results.map(r => r.page))].join(', ')}
        </span>
      `;
    },


    // ──────────────────────────────────────────────────────
    // 10. DOWNLOAD & PRINT
    // ──────────────────────────────────────────────────────

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
      iframe.src   = URL.createObjectURL(blob);
      document.body.appendChild(iframe);
      iframe.onload = () => {
        iframe.contentWindow.print();
        setTimeout(() => { iframe.remove(); URL.revokeObjectURL(iframe.src); }, 5000);
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


    // ──────────────────────────────────────────────────────
    // 11. UI HELPERS
    // ──────────────────────────────────────────────────────

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
      if (!State.currentDocId) return;
      try {
        const list = await window.DB?.getAnnotations(State.currentDocId) ?? [];
        State.annotations = {};
        list.forEach(a => {
          if (!State.annotations[a.page]) State.annotations[a.page] = [];
          State.annotations[a.page].push(a);
        });
      } catch (err) {
        console.warn('[PDF] Failed to load annotations from DB:', err);
      }
    },

    async _saveAnnotations() {
      if (!State.currentDocId) return;
      try {
        await window.DB?.saveAnnotations(State.currentDocId, State.annotations);
      } catch (err) {
        console.warn('[PDF] Failed to save annotations to DB:', err);
      }
    },
  };


  // ──────────────────────────────────────────────────────────
  // 12. ANNOTATION MANAGER
  // ──────────────────────────────────────────────────────────

  const AnnotationManager = {
    _drawing:   false,
    _startPos:  null,
    _tempEl:    null,

    init() {
      const layer = DOM.annotationLayer;
      if (!layer) return;

      layer.addEventListener('mousedown', e => this._onMouseDown(e));
      layer.addEventListener('mousemove', e => this._onMouseMove(e));
      layer.addEventListener('mouseup',   e => this._onMouseUp(e));
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

      window.PlasmaDeck?.bus?.emit('pdf:annotate', { annot, page: State.currentPage });
    },

    delete(pageNum, annotId) {
      if (!State.annotations[pageNum]) return;
      State.annotations[pageNum] = State.annotations[pageNum].filter(a => a.id !== annotId);
      PDFViewer._saveAnnotations();
    },

    clearPage(pageNum) {
      delete State.annotations[pageNum];
      PDFViewer._saveAnnotations();
      if (DOM.annotationLayer) DOM.annotationLayer.innerHTML = '';
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


  // ──────────────────────────────────────────────────────────
  // 13. KEYBOARD & TOUCH GESTURES
  // ──────────────────────────────────────────────────────────

  const PDFInput = {
    _pinchDist: null,

    init() {
      document.addEventListener('keydown', e => {
        if (!$('[data-pdf-viewer]')?.closest(':focus-within') &&
            document.activeElement?.tagName !== 'INPUT') {
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
      DOM.viewerContainer?.addEventListener('wheel', e => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        e.deltaY < 0 ? PDFViewer.zoomIn(0.1) : PDFViewer.zoomOut(0.1);
      }, { passive: false });

      // Pinch-to-zoom (touch)
      DOM.viewerContainer?.addEventListener('touchstart', e => {
        if (e.touches.length === 2) {
          this._pinchDist = this._dist(e.touches);
        }
      }, { passive: true });

      DOM.viewerContainer?.addEventListener('touchmove', e => {
        if (e.touches.length !== 2 || !this._pinchDist) return;
        const newDist = this._dist(e.touches);
        const delta   = (newDist - this._pinchDist) / 200;
        if (Math.abs(delta) > 0.02) {
          delta > 0 ? PDFViewer.zoomIn(0.1) : PDFViewer.zoomOut(0.1);
          this._pinchDist = newDist;
        }
      }, { passive: true });
    },

    _dist(touches) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    },
  };


  // ──────────────────────────────────────────────────────────
  // 14. TOOLBAR WIRING
  // ──────────────────────────────────────────────────────────

  const PDFToolbar = {
    _inited: false,
    init() {
      if (this._inited) return;
      this._inited = true;
      document.addEventListener('click', e => {
        const t = e?.target;
        const target = t && t.nodeType === 1 ? t : t?.parentElement;
        const btn = target?.closest?.('[data-pdf-action]');
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
        if (DOM.currentPageInput.dataset.pdBound) return;
        DOM.currentPageInput.dataset.pdBound = 'true';
        DOM.currentPageInput.addEventListener('keydown', e => {
          if (e.key === 'Enter') PDFViewer.goTo(DOM.currentPageInput.value);
        });
        DOM.currentPageInput.addEventListener('blur', () =>
          PDFViewer.goTo(DOM.currentPageInput.value));
      }

      // Zoom select
      const zoomSelect = $('[data-pdf-zoom-select]');
      if (zoomSelect) {
        zoomSelect.addEventListener('change', () => {
          const v = zoomSelect.value;
          if (v === 'width') PDFViewer.fitWidth();
          else if (v === 'page') PDFViewer.fitPage();
          else PDFViewer.zoomTo(parseFloat(v));
        });
      }

      // Search
      if (DOM.searchInput) {
        DOM.searchInput.addEventListener('keydown', e => {
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
        if (!openInput.dataset.pdBound) {
          openInput.dataset.pdBound = 'true';
        openInput.accept = 'application/pdf';
        openInput.addEventListener('change', () => {
          if (openInput.files[0]) PDFViewer.load(openInput.files[0]);
        });
        const openBtn = $('[data-pdf-action="open"]');
        if (openBtn) openBtn.addEventListener('click', () => openInput.click());
        }
      }

      // Drag-and-drop on viewer
      const viewer = $('[data-pdf-viewer]');
      if (viewer) {
        viewer.addEventListener('dragover',  e => { e.preventDefault(); viewer.classList.add('drag-over'); });
        viewer.addEventListener('dragleave', () => viewer.classList.remove('drag-over'));
        viewer.addEventListener('drop', e => {
          e.preventDefault();
          viewer.classList.remove('drag-over');
          const file = e.dataTransfer.files[0];
          if (file?.type === 'application/pdf') PDFViewer.load(file);
        });
      }
    },
  };


  // ──────────────────────────────────────────────────────────
  // 15. INIT
  // ──────────────────────────────────────────────────────────

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

})();
