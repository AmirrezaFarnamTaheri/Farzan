// ============================================================
// OpenCourseDeck — canvas.js
// Full Whiteboard / Drawing Canvas
// Features: Pen, Shapes, Text, Eraser, Select, Layers,
//           Undo/Redo, Grid, Export PNG/SVG, Mini-map
// Pure Canvas 2D — no external dependencies
// ============================================================

(() => {
  'use strict';

  // ──────────────────────────────────────────────────────────
  // 0. STATE
  // ──────────────────────────────────────────────────────────

  const State = {
    // Canvas transform
    offsetX:     0,
    offsetY:     0,
    zoom:        1.0,
    rotation:    0,

    // Active tool
    tool:        'pen',   // pen | eraser | select | rect | circle | line | arrow | text | fill

    // Stroke / fill options
    strokeColor: '#6366f1',
    fillColor:   'transparent',
    strokeWidth: 2,
    opacity:     1.0,
    lineCap:     'round',   // round | square | butt
    lineJoin:    'round',
    dashPattern: [],        // [] | [8,4] | [2,4]
    fontSize:    18,
    fontFamily:  'Inter, sans-serif',

    // Drawing
    isDrawing:   false,
    isDragging:  false,
    isResizing:  false,

    // Elements (all drawn objects stored as data)
    layers:      [{ id: 'layer-1', name: 'Layer 1', visible: true, locked: false, elements: [] }],
    activeLayerIdx: 0,

    // Selection
    selectedIds: new Set(),
    hoveredId:   null,

    // Temp state (current in-progress drawing)
    currentPath: null,    // for pen tool
    currentShape: null,   // for shapes
    currentText:  null,   // for text

    // History (undo/redo)
    history:     [],
    historyIdx:  -1,
    maxHistory:  80,

    // Grid
    gridEnabled:   false,
    gridSize:      24,
    gridSnap:      false,

    // Clipboard
    clipboard:   [],

    // Drag
    dragStartX:  0,
    dragStartY:  0,
    dragLastX:   0,
    dragLastY:   0,

    // Undo/redo (operation-based snapshots)
    undoStack:   [],
    redoStack:   [],
    maxUndo:     80,
  };

  const safeImageUrl = (raw) => {
    const helper = window.OpenCourseDeck?.safeImageUrl;
    if (typeof helper === 'function') return helper(raw);
    const value = String(raw ?? '').trim();
    if (!value) return null;
    try {
      const url = new URL(value, document.baseURI);
      if (url.protocol === 'data:') return /^data:image\//i.test(value) ? url.href : null;
      return ['http:', 'https:', 'blob:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  };

  const cloneJSON = (value, fallback = null) => {
    try {
      return JSON.parse(JSON.stringify(value ?? fallback));
    } catch {
      return fallback;
    }
  };

  const baseLayer = () => ({ id: 'layer-1', name: 'Layer 1', visible: true, locked: false, elements: [] });

  const getAllowedTools = () => {
    const defaults = ['select', 'pen', 'eraser', 'rect', 'circle', 'line', 'arrow', 'text', 'fill'];
    const names = window.OpenCourseDeck?.CanvasTools?.getToolNames?.();
    return new Set([...defaults, ...(Array.isArray(names) ? names : [])]);
  };

  const normalizeLayers = (layers) => {
    const source = Array.isArray(layers) ? layers : [];
    const normalized = source
      .filter((layer) => layer && typeof layer === 'object')
      .map((layer, index) => ({
        id: String(layer.id || `layer-${index + 1}`),
        name: String(layer.name || `Layer ${index + 1}`),
        visible: layer.visible !== false,
        locked: !!layer.locked,
        opacity: Number.isFinite(Number(layer.opacity)) ? Math.min(1, Math.max(0, Number(layer.opacity))) : 1,
        elements: Array.isArray(layer.elements) ? cloneJSON(layer.elements, []) : [],
      }));
    return normalized.length ? normalized : [baseLayer()];
  };

  const finiteNumber = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  const xmlEscape = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  // ──────────────────────────────────────────────────────────
  // 1. CANVAS MANAGER
  // ──────────────────────────────────────────────────────────

  const Canvas = {
    _canvas:   null,
    _ctx:      null,
    _raf:      null,
    _dirty:    true,
    _paused:   false,
    _listeners: [],
    _autosaveTimer: null,
    _autosaveKey: 'plasma-canvas-board',
    _autosaveDebounceMs: 1500,
    _pointerId: null,
    _spaceDown: false,
    _panning:   false,
    _marquee:   null,
    _panStartX: 0,
    _panStartY: 0,
    _panStartOX: 0,
    _panStartOY: 0,
    _touchState: null,

    init(canvasEl) {
      if (!canvasEl) return;
      if (this._canvas && this._canvas !== canvasEl) this.destroy();
      if (canvasEl.dataset.pdCanvasInited === 'true') return;
      canvasEl.dataset.pdCanvasInited = 'true';
      if (!canvasEl.hasAttribute('tabindex')) canvasEl.tabIndex = 0;
      canvasEl.dataset.studioTool = State.tool;
      this._canvas = canvasEl;
      this._ctx    = canvasEl.getContext('2d');
      this._paused = false;

      this._resize();
      this._listen(window, 'resize', () => { this._resize(); this._dirty = true; });

      this._bindPointer();
      this._bindKeyboard();
      this._bindWheel();

      // Pause expensive render loop when tab is hidden
      this._listen(document, 'visibilitychange', () => {
        if (document.hidden) this._pause();
        else this._resume();
      });

      // Flush autosave on page unload
      this._listen(window, 'beforeunload', () => this._flushAutosave());

      this._loop();
      this.restoreBoard();
    },

    serialize() {
      return {
        version: 1,
        exportedAt: new Date().toISOString(),
        viewport: {
          offsetX: State.offsetX,
          offsetY: State.offsetY,
          zoom: State.zoom,
          rotation: State.rotation,
        },
        tool: State.tool,
        style: {
          strokeColor: State.strokeColor,
          fillColor: State.fillColor,
          strokeWidth: State.strokeWidth,
          opacity: State.opacity,
          lineCap: State.lineCap,
          lineJoin: State.lineJoin,
          dashPattern: cloneJSON(State.dashPattern, []),
          fontSize: State.fontSize,
          fontFamily: State.fontFamily,
        },
        grid: {
          enabled: State.gridEnabled,
          size: State.gridSize,
          snap: State.gridSnap,
        },
        activeLayerIdx: State.activeLayerIdx,
        layers: normalizeLayers(State.layers),
      };
    },

    loadState(payload = {}, options = {}) {
      const data = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
      const viewport = data.viewport && typeof data.viewport === 'object' ? data.viewport : {};
      const style = data.style && typeof data.style === 'object' ? data.style : {};
      const grid = data.grid && typeof data.grid === 'object' ? data.grid : {};
      const layers = normalizeLayers(data.layers);
      const previous = {
        offsetX: State.offsetX,
        offsetY: State.offsetY,
        zoom: State.zoom,
        rotation: State.rotation,
        tool: State.tool,
        selectedIds: Array.from(State.selectedIds),
      };

      State.offsetX = finiteNumber(viewport.offsetX, 0);
      State.offsetY = finiteNumber(viewport.offsetY, 0);
      State.zoom = Math.min(4, Math.max(0.1, finiteNumber(viewport.zoom, 1)));
      State.rotation = finiteNumber(viewport.rotation, 0);
      State.tool = options.preserveTool ? previous.tool : (typeof data.tool === 'string' ? data.tool : 'pen');
      State.strokeColor = typeof style.strokeColor === 'string' ? style.strokeColor : '#6366f1';
      State.fillColor = typeof style.fillColor === 'string' ? style.fillColor : 'transparent';
      State.strokeWidth = Math.max(1, finiteNumber(style.strokeWidth, 2));
      State.opacity = Math.min(1, Math.max(0, finiteNumber(style.opacity, 1)));
      State.lineCap = typeof style.lineCap === 'string' ? style.lineCap : 'round';
      State.lineJoin = typeof style.lineJoin === 'string' ? style.lineJoin : 'round';
      State.dashPattern = Array.isArray(style.dashPattern) ? style.dashPattern.map((n) => finiteNumber(n, 0)).filter((n) => n > 0) : [];
      State.fontSize = Math.max(8, finiteNumber(style.fontSize, 18));
      State.fontFamily = typeof style.fontFamily === 'string' ? style.fontFamily : 'Inter, sans-serif';
      State.gridEnabled = !!grid.enabled;
      State.gridSize = Math.max(4, finiteNumber(grid.size, 24));
      State.gridSnap = !!grid.snap;
      State.layers = layers;
      State.activeLayerIdx = Math.min(layers.length - 1, Math.max(0, Math.floor(finiteNumber(data.activeLayerIdx, 0))));
      if (options.preserveViewport) {
        State.offsetX = previous.offsetX;
        State.offsetY = previous.offsetY;
        State.zoom = previous.zoom;
        State.rotation = previous.rotation;
      }
      if (options.preserveSelection) {
        const validIds = new Set(layers.flatMap((layer) => layer.elements.map((element) => element.id)));
        State.selectedIds = new Set(previous.selectedIds.filter((id) => validIds.has(id)));
      } else {
        State.selectedIds = new Set();
      }
      State.hoveredId = null;
      State.currentPath = null;
      State.currentShape = null;
      State.currentText = null;
      State.clipboard = [];
      State.history = [];
      State.historyIdx = -1;
      State.undoStack = [];
      State.redoStack = [];
      State.isDrawing = false;
      State.isDragging = false;
      State.isResizing = false;
      this._scheduleRender();
      return this.serialize();
    },

    addElement(element = {}) {
      const layers = normalizeLayers(State.layers);
      State.layers = layers;
      const layer = layers[Math.min(layers.length - 1, Math.max(0, State.activeLayerIdx))] ?? layers[0];
      if (!layer || layer.locked) return null;
      const now = Date.now().toString(36);
      const id = String(element.id || `studio-${now}-${Math.random().toString(36).slice(2, 7)}`);
      const created = {
        type: String(element.type || 'rect'),
        x: finiteNumber(element.x, 80),
        y: finiteNumber(element.y, 80),
        ...cloneJSON(element, {}),
        id,
      };
      layer.elements.push(created);
      State.selectedIds = new Set([id]);
      this._scheduleRender();
      return cloneJSON(created, created);
    },

    setTool(tool = 'select') {
      const allowed = getAllowedTools();
      State.tool = allowed.has(tool) ? tool : 'select';
      State.currentPath = null;
      State.currentShape = null;
      State.isDrawing = false;
      State.isDragging = false;
      if (this._canvas) this._canvas.dataset.studioTool = State.tool;
      this._scheduleRender();
      return State.tool;
    },

    getState() {
      return {
        tool: State.tool,
        zoom: State.zoom,
        offsetX: State.offsetX,
        offsetY: State.offsetY,
        selectedIds: Array.from(State.selectedIds),
      };
    },

    getRegisteredTools() {
      return Array.from(getAllowedTools());
    },

    screenToWorld(clientX = 0, clientY = 0) {
      return this._screenToWorld(clientX, clientY);
    },

    addText(text = 'New note', options = {}) {
      return this.addElement({
        type: 'text',
        x: 96,
        y: 112,
        fill: State.strokeColor,
        fontSize: State.fontSize,
        fontFamily: State.fontFamily,
        ...options,
        text: String(text || 'New note').slice(0, 500),
      });
    },

    addCard(options = {}) {
      return this.addElement({
        type: 'roundRect',
        x: 80,
        y: 80,
        width: 240,
        height: 140,
        radius: 12,
        fill: 'rgba(99, 102, 241, 0.14)',
        stroke: State.strokeColor,
        strokeWidth: Math.max(1, State.strokeWidth),
        ...options,
      });
    },

    addRectangle(options = {}) {
      return this.addElement({
        type: 'rect',
        x: 100,
        y: 100,
        width: 220,
        height: 120,
        fill: 'rgba(16, 185, 129, 0.12)',
        stroke: State.strokeColor,
        strokeWidth: Math.max(1, State.strokeWidth),
        ...options,
      });
    },

    addCircle(options = {}) {
      return this.addElement({
        type: 'circle',
        x: 190,
        y: 160,
        radius: 64,
        fill: 'rgba(14, 165, 233, 0.12)',
        stroke: State.strokeColor,
        strokeWidth: Math.max(1, State.strokeWidth),
        ...options,
      });
    },

    addArrow(options = {}) {
      const hasOwn = (key) => Object.prototype.hasOwnProperty.call(options, key);
      const arrow = {
        type: 'arrow',
        x: 96,
        y: 96,
        x1: 96,
        y1: 96,
        x2: 280,
        y2: 180,
        width: 184,
        height: 84,
        fill: 'none',
        stroke: State.strokeColor,
        strokeWidth: Math.max(2, State.strokeWidth),
        headSize: 12,
        ...options,
      };
      if (!hasOwn('x') && hasOwn('x1')) arrow.x = arrow.x1;
      if (!hasOwn('y') && hasOwn('y1')) arrow.y = arrow.y1;
      arrow.x = finiteNumber(arrow.x, finiteNumber(arrow.x1, 96));
      arrow.y = finiteNumber(arrow.y, finiteNumber(arrow.y1, 96));
      arrow.x1 = finiteNumber(arrow.x1, arrow.x);
      arrow.y1 = finiteNumber(arrow.y1, arrow.y);
      arrow.x2 = finiteNumber(arrow.x2, arrow.x1 + finiteNumber(arrow.width, 184));
      arrow.y2 = finiteNumber(arrow.y2, arrow.y1 + finiteNumber(arrow.height, 84));
      arrow.width = finiteNumber(arrow.width, arrow.x2 - arrow.x1);
      arrow.height = finiteNumber(arrow.height, arrow.y2 - arrow.y1);
      return this.addElement(arrow);
    },

    addImage(src, options = {}) {
      const imageSrc = safeImageUrl(src);
      if (!imageSrc) return null;
      return this.addElement({
        type: 'image',
        x: 120,
        y: 120,
        width: 280,
        height: 160,
        fit: 'contain',
        ...options,
        src: imageSrc,
      });
    },

    applyTemplate(templateName = 'study-map') {
      const templates = {
        'study-map': {
          layers: [{
            id: 'layer-template-main',
            name: 'Study map',
            visible: true,
            locked: false,
            opacity: 1,
            elements: [
              { id: 'template-goal', type: 'roundRect', x: 72, y: 72, width: 260, height: 120, radius: 12, fill: 'rgba(99, 102, 241, 0.14)', stroke: '#6366f1', strokeWidth: 2, text: 'Learning goal' },
              { id: 'template-evidence', type: 'roundRect', x: 456, y: 72, width: 280, height: 120, radius: 12, fill: 'rgba(16, 185, 129, 0.12)', stroke: '#10b981', strokeWidth: 2, text: 'Key evidence' },
              { id: 'template-recall', type: 'roundRect', x: 72, y: 292, width: 280, height: 120, radius: 12, fill: 'rgba(245, 158, 11, 0.13)', stroke: '#f59e0b', strokeWidth: 2, text: 'Recall prompts' },
              { id: 'template-next', type: 'roundRect', x: 456, y: 292, width: 280, height: 120, radius: 12, fill: 'rgba(14, 165, 233, 0.12)', stroke: '#0ea5e9', strokeWidth: 2, text: 'Next review' },
              { id: 'template-flow-1', type: 'arrow', x: 336, y: 132, x1: 336, y1: 132, x2: 444, y2: 132, width: 108, height: 0, fill: 'none', stroke: '#94a3b8', strokeWidth: 2, headSize: 10 },
              { id: 'template-flow-2', type: 'arrow', x: 596, y: 200, x1: 596, y1: 200, x2: 596, y2: 282, width: 0, height: 82, fill: 'none', stroke: '#94a3b8', strokeWidth: 2, headSize: 10 },
              { id: 'template-flow-3', type: 'arrow', x: 444, y: 352, x1: 444, y1: 352, x2: 364, y2: 352, width: -80, height: 0, fill: 'none', stroke: '#94a3b8', strokeWidth: 2, headSize: 10 },
            ],
          }],
        },
        cornell: {
          layers: [{
            id: 'layer-template-cornell',
            name: 'Cornell notes',
            visible: true,
            locked: false,
            opacity: 1,
            elements: [
              { id: 'cornell-cues', type: 'rect', x: 64, y: 72, width: 220, height: 420, fill: 'rgba(99, 102, 241, 0.10)', stroke: '#6366f1', strokeWidth: 2 },
              { id: 'cornell-notes', type: 'rect', x: 300, y: 72, width: 500, height: 420, fill: 'rgba(16, 185, 129, 0.08)', stroke: '#10b981', strokeWidth: 2 },
              { id: 'cornell-summary', type: 'rect', x: 64, y: 520, width: 736, height: 140, fill: 'rgba(245, 158, 11, 0.10)', stroke: '#f59e0b', strokeWidth: 2 },
              { id: 'cornell-cues-label', type: 'text', x: 88, y: 104, text: 'Cues / questions', fill: '#e5e7eb', fontSize: 18 },
              { id: 'cornell-notes-label', type: 'text', x: 324, y: 104, text: 'Notes', fill: '#e5e7eb', fontSize: 18 },
              { id: 'cornell-summary-label', type: 'text', x: 88, y: 552, text: 'Summary', fill: '#e5e7eb', fontSize: 18 },
            ],
          }],
        },
      };
      const template = templates[String(templateName || '').trim()] || templates['study-map'];
      return this.loadState({
        version: 1,
        viewport: { offsetX: 0, offsetY: 0, zoom: 1, rotation: 0 },
        activeLayerIdx: 0,
        layers: template.layers,
      });
    },

    clearBoard() {
      State.layers = normalizeLayers(State.layers).map((layer) => ({ ...layer, elements: [] }));
      State.activeLayerIdx = Math.min(State.layers.length - 1, Math.max(0, State.activeLayerIdx));
      State.selectedIds = new Set();
      State.hoveredId = null;
      State.currentPath = null;
      State.currentShape = null;
      State.currentText = null;
      State.clipboard = [];
      State.history = [];
      State.historyIdx = -1;
      State.undoStack = [];
      State.redoStack = [];
      this._scheduleRender();
      return this.serialize();
    },

    addLayer(name = '') {
      const layers = normalizeLayers(State.layers);
      const id = `layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const layer = {
        id,
        name: String(name || `Layer ${layers.length + 1}`).slice(0, 80),
        visible: true,
        locked: false,
        opacity: 1,
        elements: [],
      };
      layers.push(layer);
      State.layers = layers;
      State.activeLayerIdx = layers.length - 1;
      State.selectedIds = new Set();
      this._scheduleRender();
      return cloneJSON(layer, layer);
    },

    setActiveLayer(index = 0) {
      const layers = normalizeLayers(State.layers);
      State.layers = layers;
      State.activeLayerIdx = Math.min(layers.length - 1, Math.max(0, Math.floor(finiteNumber(index, 0))));
      State.selectedIds = new Set();
      this._scheduleRender();
      return this.serialize();
    },

    removeLayer(layerId) {
      const layers = normalizeLayers(State.layers);
      if (layers.length <= 1) return null;
      const idx = layers.findIndex((layer) => layer.id === layerId);
      if (idx < 0) return null;
      const [removed] = layers.splice(idx, 1);
      State.layers = layers.length ? layers : [baseLayer()];
      State.activeLayerIdx = Math.min(State.layers.length - 1, Math.max(0, State.activeLayerIdx >= idx ? State.activeLayerIdx - 1 : State.activeLayerIdx));
      State.selectedIds = new Set();
      this._scheduleRender();
      return cloneJSON(removed, removed);
    },

    removeElement(elementId) {
      const layers = normalizeLayers(State.layers);
      for (const layer of layers) {
        const idx = layer.elements.findIndex((element) => element?.id === elementId);
        if (idx >= 0) {
          const [removed] = layer.elements.splice(idx, 1);
          State.layers = layers;
          State.selectedIds.delete(elementId);
          this._scheduleRender();
          return cloneJSON(removed, removed);
        }
      }
      return null;
    },

    updateElement(elementId, patch = {}) {
      if (!elementId || !patch || typeof patch !== 'object' || Array.isArray(patch)) return null;
      const layers = normalizeLayers(State.layers);
      const allowed = ['text', 'fill', 'stroke', 'strokeWidth', 'fontSize', 'width', 'height', 'x', 'y', 'linkType', 'linkTarget', 'linkLabel'];
      for (const layer of layers) {
        const element = layer.elements.find((item) => item?.id === elementId);
        if (!element) continue;
        for (const key of allowed) {
          if (!(key in patch)) continue;
          if (['strokeWidth', 'fontSize', 'width', 'height', 'x', 'y'].includes(key)) {
            element[key] = Math.max(key === 'strokeWidth' ? 1 : 0, finiteNumber(patch[key], element[key] ?? 0));
          } else if (key === 'linkType') {
            const value = String(patch[key] ?? '').trim();
            element[key] = ['course', 'pdf', 'note', 'timestamp', 'url', ''].includes(value) ? value : '';
          } else if (key === 'linkTarget') {
            element[key] = String(patch[key] ?? '').trim().slice(0, 500);
          } else if (key === 'linkLabel') {
            element[key] = String(patch[key] ?? '').trim().slice(0, 160);
          } else {
            element[key] = String(patch[key] ?? '').slice(0, key === 'text' ? 500 : 120);
          }
        }
        State.layers = layers;
        State.selectedIds = new Set([elementId]);
        this._scheduleRender();
        return cloneJSON(element, element);
      }
      return null;
    },

    exportPNG(type = 'image/png') {
      if (!this._canvas || typeof this._canvas.toDataURL !== 'function') return null;
      if (this._ctx) this._render();
      return this._canvas.toDataURL(type);
    },

    downloadPNG(filename = 'canvas.png') {
      const mod = window.OpenCourseDeck?.CanvasExport;
      if (!mod || !this._canvas) return;
      this._render();
      mod.downloadCanvas(this._canvas, 'png', filename);
    },

    downloadJPEG(filename = 'canvas.jpg', quality = 0.92) {
      const mod = window.OpenCourseDeck?.CanvasExport;
      if (!mod || !this._canvas) return;
      this._render();
      mod.downloadCanvas(this._canvas, 'jpeg', filename, quality);
    },

    downloadPDF(filename = 'canvas.pdf') {
      const mod = window.OpenCourseDeck?.CanvasExport;
      if (!mod || !this._canvas) return;
      this._render();
      mod.exportToPDF([this._canvas], filename);
    },

    exportSVG(options = {}) {
      const width = Math.max(1, finiteNumber(options.width, this._canvas?.offsetWidth || 1200));
      const height = Math.max(1, finiteNumber(options.height, this._canvas?.offsetHeight || 800));
      const board = this.serialize();
      const elements = board.layers
        .filter((layer) => layer.visible !== false)
        .map((layer) => {
          const opacity = Number.isFinite(Number(layer.opacity)) ? ` opacity="${xmlEscape(layer.opacity)}"` : '';
          return `<g id="${xmlEscape(layer.id)}" data-layer-name="${xmlEscape(layer.name)}"${opacity}>${layer.elements.map((el) => this._elementToSVG(el)).join('')}</g>`;
        })
        .join('');
      const viewport = board.viewport || {};
      const transform = `translate(${finiteNumber(viewport.offsetX, 0)} ${finiteNumber(viewport.offsetY, 0)}) scale(${finiteNumber(viewport.zoom, 1)})`;
      return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="OpenCourseDeck Studio board">`,
        '<rect width="100%" height="100%" fill="#1e1e2e"/>',
        `<g transform="${xmlEscape(transform)}">${elements}</g>`,
        '</svg>',
      ].join('');
    },

    destroy() {
      this._flushAutosave();
      this._pause();
      for (const { target, type, handler, options } of this._listeners) {
        try { target.removeEventListener(type, handler, options); } catch {}
      }
      this._listeners = [];
      if (this._canvas) delete this._canvas.dataset.pdCanvasInited;
      this._canvas = null;
      this._ctx = null;
      this._dirty = true;
      this._pointerId = null;
      State.isDrawing = false;
      State.isDragging = false;
      State.currentPath = null;
      State._marquee = null;
      this._panning = false;
      this._spaceDown = false;
      this._touchState = null;
    },

    _listen(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      this._listeners.push({ target, type, handler, options });
    },

    _bindPointer() {
      this._listen(this._canvas, 'pointerdown', (event) => this._onPointerDown(event));
      this._listen(this._canvas, 'pointermove', (event) => this._onPointerMove(event));
      this._listen(this._canvas, 'pointerup', (event) => this._onPointerUp(event));
      this._listen(this._canvas, 'pointercancel', (event) => this._onPointerUp(event));
      this._listen(this._canvas, 'contextmenu', (event) => this._onContextMenu(event));
      this._listen(this._canvas, 'touchstart', (e) => this._onTouchStart(e), { passive: false });
      this._listen(this._canvas, 'touchmove', (e) => this._onTouchMove(e), { passive: false });
      this._listen(this._canvas, 'touchend', (e) => this._onTouchEnd(e));
      this._listen(this._canvas, 'touchcancel', (e) => this._onTouchEnd(e));
    },

    _bindKeyboard() {
      this._listen(this._canvas, 'keydown', (event) => {
        const ctrl = event.ctrlKey || event.metaKey;
        const shift = event.shiftKey;

        if (event.key === 'Delete' || event.key === 'Backspace') {
          const ids = Array.from(State.selectedIds);
          if (!ids.length) return;
          event.preventDefault();
          this._pushUndo('delete');
          ids.forEach((id) => this.removeElement(id));
          State.selectedIds = new Set();
          this._emitInteractiveChange('delete');
        } else if (ctrl && shift && (event.key === 'z' || event.key === 'Z')) {
          event.preventDefault();
          this.redo();
        } else if (ctrl && (event.key === 'z' || event.key === 'Z')) {
          event.preventDefault();
          this.undo();
        } else if (ctrl && (event.key === 'c' || event.key === 'C')) {
          event.preventDefault();
          this._copySelection();
        } else if (ctrl && (event.key === 'x' || event.key === 'X')) {
          event.preventDefault();
          this._cutSelection();
        } else if (ctrl && (event.key === 'v' || event.key === 'V')) {
          event.preventDefault();
          this._pasteClipboard();
        } else if (ctrl && (event.key === 'a' || event.key === 'A')) {
          event.preventDefault();
          this._selectAll();
        } else if (ctrl && (event.key === 'd' || event.key === 'D')) {
          event.preventDefault();
          this._duplicateSelection();
        } else if (ctrl && shift && (event.key === 'g' || event.key === 'G')) {
          event.preventDefault();
          this._ungroupSelection();
        } else if (ctrl && (event.key === 'g' || event.key === 'G')) {
          event.preventDefault();
          this._groupSelection();
        } else if (event.key === ' ') {
          event.preventDefault();
          this._spaceDown = true;
          if (this._canvas) this._canvas.style.cursor = 'grab';
        } else if (event.key === 'Escape') {
          State.selectedIds = new Set();
          State.currentPath = null;
          State.currentShape = null;
          State.isDrawing = false;
          State.isDragging = false;
          State._marquee = null;
          this._scheduleRender();
        }
      });
      this._listen(this._canvas, 'keyup', (event) => {
        if (event.key === ' ') {
          this._spaceDown = false;
          this._panning = false;
          if (this._canvas) this._canvas.style.cursor = '';
        }
      });
    },

    _bindWheel() {
      this._listen(this._canvas, 'wheel', (event) => {
        event.preventDefault();
        const before = this._eventToWorld(event);
        const factor = event.deltaY < 0 ? 1.08 : 0.92;
        const nextZoom = Math.min(4, Math.max(0.2, State.zoom * factor));
        State.zoom = nextZoom;
        State.offsetX = event.clientX - this._canvas.getBoundingClientRect().left - before.x * nextZoom;
        State.offsetY = event.clientY - this._canvas.getBoundingClientRect().top - before.y * nextZoom;
        this._scheduleRender();
        this._emitInteractiveChange('zoom');
      }, { passive: false });
    },

    _onPointerDown(event) {
      if (!this._canvas) return;
      event.preventDefault();
      this._pointerId = event.pointerId ?? 'mouse';
      this._canvas.setPointerCapture?.(event.pointerId);
      this._canvas.focus?.();
      const point = this._eventToWorld(event);
      State.dragStartX = point.x;
      State.dragStartY = point.y;
      State.dragLastX = point.x;
      State.dragLastY = point.y;

      // Space+drag pan
      if (this._spaceDown || event.button === 1) {
        this._panning = true;
        this._panStartX = event.clientX;
        this._panStartY = event.clientY;
        this._panStartOX = State.offsetX;
        this._panStartOY = State.offsetY;
        if (this._canvas) this._canvas.style.cursor = 'grabbing';
        return;
      }

      if (State.tool === 'pen') {
        this._pushUndo('draw');
        State.isDrawing = true;
        State.currentPath = {
          id: `path-${Date.now().toString(36)}`,
          type: 'polyline',
          points: [[point.x, point.y]],
          stroke: State.strokeColor,
          strokeWidth: Math.max(1, State.strokeWidth),
          fill: null,
          lineCap: State.lineCap,
          lineJoin: State.lineJoin,
        };
        this._scheduleRender();
        return;
      }

      if (State.tool === 'eraser') {
        const hit = this._hitTest(point.x, point.y);
        if (hit && !hit.layer.locked) {
          this._pushUndo('erase');
          this.removeElement(hit.element.id);
          this._emitInteractiveChange('erase');
        }
        return;
      }

      if (State.tool === 'rect' || State.tool === 'circle' || State.tool === 'line' || State.tool === 'arrow') {
        this._pushUndo('draw');
        State.isDrawing = true;
        State.currentShape = this._createShapeFromTool(State.tool, point);
        this._scheduleRender();
        return;
      }

      if (State.tool === 'text') {
        const text = prompt('Enter text:', 'Text') || 'Text';
        this._pushUndo('draw');
        this.addText(text, { x: point.x, y: point.y });
        this._emitInteractiveChange('draw');
        return;
      }

      if (State.tool === 'fill') {
        const hit = this._hitTest(point.x, point.y);
        if (hit) {
          this._pushUndo('fill');
          this.updateElement(hit.element.id, { fill: State.strokeColor });
          this._emitInteractiveChange('fill');
        }
        return;
      }

      // select tool
      const hit = this._hitTest(point.x, point.y);
      if (hit) {
        if (event.shiftKey) {
          if (State.selectedIds.has(hit.element.id)) {
            State.selectedIds.delete(hit.element.id);
          } else {
            State.selectedIds.add(hit.element.id);
          }
        } else if (!State.selectedIds.has(hit.element.id)) {
          State.selectedIds = new Set([hit.element.id]);
        }
        State.activeLayerIdx = hit.layerIndex;
        State.isDragging = !hit.layer.locked;
        if (State.isDragging) this._pushUndo('move');
      } else {
        if (!event.shiftKey) State.selectedIds = new Set();
        // Start marquee selection
        State._marquee = { x1: point.x, y1: point.y, x2: point.x, y2: point.y };
      }
      this._scheduleRender();
    },

    _onPointerMove(event) {
      if (this._pointerId == null) return;
      const pointerId = event.pointerId ?? 'mouse';
      if (pointerId !== this._pointerId) return;
      const point = this._eventToWorld(event);

      // Panning
      if (this._panning) {
        const dx = event.clientX - this._panStartX;
        const dy = event.clientY - this._panStartY;
        State.offsetX = this._panStartOX + dx;
        State.offsetY = this._panStartOY + dy;
        this._scheduleRender();
        return;
      }

      // Marquee selection update
      if (State._marquee) {
        State._marquee.x2 = point.x;
        State._marquee.y2 = point.y;
        this._scheduleRender();
        return;
      }

      // Shape drawing preview
      if (State.isDrawing && State.currentShape) {
        State.currentShape.width = point.x - State.currentShape.x;
        State.currentShape.height = point.y - State.currentShape.y;
        if (State.currentShape.type === 'circle') {
          State.currentShape.radius = Math.hypot(point.x - State.currentShape.x, point.y - State.currentShape.y);
        }
        if (State.currentShape.type === 'line' || State.currentShape.type === 'arrow') {
          State.currentShape.x2 = point.x;
          State.currentShape.y2 = point.y;
          State.currentShape.width = point.x - State.currentShape.x;
          State.currentShape.height = point.y - State.currentShape.y;
        }
        this._scheduleRender();
        return;
      }

      if (State.isDrawing && State.currentPath) {
        const last = State.currentPath.points.at(-1);
        const distance = Math.hypot(point.x - last[0], point.y - last[1]);
        if (distance >= 1.5) {
          State.currentPath.points.push([point.x, point.y]);
          this._scheduleRender();
        }
        return;
      }

      if (State.isDragging && State.selectedIds.size) {
        const dx = point.x - State.dragLastX;
        const dy = point.y - State.dragLastY;
        if (dx || dy) {
          this._moveElements(Array.from(State.selectedIds), dx, dy);
          State.dragLastX = point.x;
          State.dragLastY = point.y;
          this._scheduleRender();
        }
      } else {
        const hit = this._hitTest(point.x, point.y);
        State.hoveredId = hit?.element?.id ?? null;
      }
    },

    _onPointerUp(event) {
      const pointerId = event.pointerId ?? 'mouse';
      if (this._pointerId != null && pointerId !== this._pointerId) return;
      this._canvas?.releasePointerCapture?.(event.pointerId);
      this._pointerId = null;

      // End panning
      if (this._panning) {
        this._panning = false;
        if (this._canvas) this._canvas.style.cursor = this._spaceDown ? 'grab' : '';
        return;
      }

      // Finalize marquee selection
      if (State._marquee) {
        const m = State._marquee;
        const x = Math.min(m.x1, m.x2);
        const y = Math.min(m.y1, m.y2);
        const w = Math.abs(m.x2 - m.x1);
        const h = Math.abs(m.y2 - m.y1);
        State._marquee = null;
        if (w > 2 || h > 2) {
          for (const layer of State.layers) {
            if (!layer.visible || layer.locked) continue;
            for (const el of layer.elements) {
              const bounds = this._elementBounds(el);
              if (bounds.x >= x && bounds.y >= y &&
                  bounds.x + bounds.width <= x + w &&
                  bounds.y + bounds.height <= y + h) {
                State.selectedIds.add(el.id);
              }
            }
          }
        }
        this._scheduleRender();
        return;
      }

      // Finalize shape drawing
      if (State.isDrawing && State.currentShape) {
        const shape = State.currentShape;
        State.currentShape = null;
        State.isDrawing = false;
        const bounds = this._elementBounds(shape);
        if (bounds.width > 2 || bounds.height > 2 || shape.radius > 2) {
          this.addElement(shape);
          this._emitInteractiveChange('draw');
        } else {
          this._scheduleRender();
        }
        return;
      }

      if (State.isDrawing && State.currentPath) {
        const path = State.currentPath;
        State.currentPath = null;
        State.isDrawing = false;
        if (path.points.length >= 2) {
          this.addElement(path);
          this._emitInteractiveChange('draw');
        } else {
          this._scheduleRender();
        }
        return;
      }

      if (State.isDragging) {
        State.isDragging = false;
        this._emitInteractiveChange('move');
      }
    },

    _eventToWorld(event) {
      return this._screenToWorld(event.clientX, event.clientY);
    },

    _screenToWorld(clientX = 0, clientY = 0) {
      const rect = this._canvas?.getBoundingClientRect?.() ?? { left: 0, top: 0 };
      return {
        x: ((clientX - rect.left) - State.offsetX) / State.zoom,
        y: ((clientY - rect.top) - State.offsetY) / State.zoom,
      };
    },

    _emitInteractiveChange(action) {
      this._canvas?.dispatchEvent?.(new CustomEvent('plasma:studio-board-change', {
        bubbles: true,
        detail: { action, board: this.serialize() },
      }));
      this._scheduleAutosave();
    },

    // ── Autosave (debounced IndexedDB) ────────────────────
    _scheduleAutosave() {
      if (this._autosaveTimer) clearTimeout(this._autosaveTimer);
      this._autosaveTimer = setTimeout(() => this._autosave(), this._autosaveDebounceMs);
    },

    _autosave() {
      this._autosaveTimer = null;
      if (!window.DB?.saveSetting && !window.localStorage) return;
      try {
        const board = this.serialize();
        if (window.DB?.saveSetting) {
          window.DB.saveSetting(this._autosaveKey, board).catch?.(() => {});
        } else {
          try { window.localStorage.setItem(this._autosaveKey, JSON.stringify(board)); } catch {}
        }
      } catch {}
    },

    _flushAutosave() {
      if (this._autosaveTimer) {
        clearTimeout(this._autosaveTimer);
        this._autosaveTimer = null;
        this._autosave();
      }
    },

    restoreBoard() {
      const doRestore = (board) => {
        if (!board || typeof board !== 'object') return false;
        this.loadState(board, { preserveViewport: true });
        return true;
      };
      if (window.DB?.getSetting) {
        window.DB.getSetting(this._autosaveKey).then(doRestore).catch?.(() => {});
      } else {
        try {
          const raw = window.localStorage?.getItem(this._autosaveKey);
          if (raw) doRestore(JSON.parse(raw));
        } catch {}
      }
    },

    clearAutosave() {
      this._flushAutosave();
      if (window.DB?.saveSetting) {
        window.DB.saveSetting(this._autosaveKey, null).catch?.(() => {});
      } else {
        try { window.localStorage?.removeItem(this._autosaveKey); } catch {}
      }
    },

    // ── Shape factory from tool name ──────────────────────
    _createShapeFromTool(tool, point) {
      const base = {
        x: point.x, y: point.y, width: 0, height: 0,
        stroke: State.strokeColor, strokeWidth: Math.max(1, State.strokeWidth),
        fill: State.fillColor,
      };
      switch (tool) {
        case 'rect': return { ...base, id: `rect-${Date.now().toString(36)}`, type: 'rect' };
        case 'circle': return { ...base, id: `circle-${Date.now().toString(36)}`, type: 'circle', radius: 0 };
        case 'line': return { ...base, id: `line-${Date.now().toString(36)}`, type: 'line', x1: point.x, y1: point.y, x2: point.x, y2: point.y };
        case 'arrow': return { ...base, id: `arrow-${Date.now().toString(36)}`, type: 'arrow', x1: point.x, y1: point.y, x2: point.x, y2: point.y, headSize: 12, fill: 'none' };
        default: return { ...base, id: `shape-${Date.now().toString(36)}`, type: 'rect' };
      }
    },

    // ── Undo / Redo (operation-based) ─────────────────────
    _pushUndo(action) {
      const snapshot = cloneJSON(State.layers, []);
      State.undoStack = State.undoStack.slice(0, State.historyIdx + 1);
      State.undoStack.push({ action, layers: snapshot, activeLayerIdx: State.activeLayerIdx });
      if (State.undoStack.length > State.maxUndo) State.undoStack.shift();
      State.historyIdx = State.undoStack.length - 1;
      State.redoStack = [];
    },

    undo() {
      // undoStack[i] holds the snapshot taken BEFORE the change at step i,
      // so undoing must restore undoStack[historyIdx] (not historyIdx - 1)
      // and stash the LIVE state — which exists nowhere on the undo stack —
      // onto the redo stack first, or the newest change is unrecoverable.
      if (State.historyIdx < 0 || !State.undoStack.length) return;
      const entry = State.undoStack[State.historyIdx];
      if (!entry) return;
      State.redoStack.push({
        action: entry.action,
        layers: cloneJSON(State.layers, []),
        activeLayerIdx: State.activeLayerIdx,
      });
      State.historyIdx--;
      State.layers = normalizeLayers(cloneJSON(entry.layers, []));
      State.activeLayerIdx = Math.min(State.layers.length - 1, entry.activeLayerIdx);
      State.selectedIds = new Set();
      this._scheduleRender();
      this._emitInteractiveChange('undo');
    },

    redo() {
      if (!State.redoStack.length) return;
      const entry = State.redoStack.pop();
      if (!entry) return;
      State.historyIdx++;
      State.layers = normalizeLayers(cloneJSON(entry.layers, []));
      State.activeLayerIdx = Math.min(State.layers.length - 1, entry.activeLayerIdx);
      State.selectedIds = new Set();
      this._scheduleRender();
      this._emitInteractiveChange('redo');
    },

    // ── Clipboard ─────────────────────────────────────────
    _copySelection() {
      const ids = Array.from(State.selectedIds);
      if (!ids.length) return;
      const elements = [];
      for (const layer of State.layers) {
        for (const el of layer.elements) {
          if (ids.includes(el.id)) elements.push(cloneJSON(el, el));
        }
      }
      State.clipboard = elements;
      const ClipClass = window.OpenCourseDeck?.Clipboard;
      if (ClipClass) {
        try {
          const instance = new ClipClass();
          instance.copy(elements);
        } catch {}
      }
    },

    _cutSelection() {
      this._copySelection();
      const ids = Array.from(State.selectedIds);
      if (!ids.length) return;
      this._pushUndo('cut');
      ids.forEach((id) => this.removeElement(id));
      State.selectedIds = new Set();
      this._emitInteractiveChange('cut');
    },

    _pasteClipboard() {
      const clip = State.clipboard;
      if (!clip || !clip.length) return;
      this._pushUndo('paste');
      const pasted = [];
      const layer = State.layers[Math.min(State.layers.length - 1, State.activeLayerIdx)];
      if (!layer || layer.locked) return;
      for (const el of clip) {
        const id = `studio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        const newEl = { ...cloneJSON(el, el), id, x: (el.x || 0) + 20, y: (el.y || 0) + 20 };
        if (Array.isArray(newEl.points)) {
          newEl.points = newEl.points.map((p) => [p[0] + 20, p[1] + 20]);
        }
        if (newEl.x1 != null) { newEl.x1 += 20; newEl.y1 += 20; }
        if (newEl.x2 != null) { newEl.x2 += 20; newEl.y2 += 20; }
        layer.elements.push(newEl);
        pasted.push(id);
      }
      State.selectedIds = new Set(pasted);
      this._scheduleRender();
      this._emitInteractiveChange('paste');
    },

    _deleteSelection() {
      const ids = Array.from(State.selectedIds);
      if (!ids.length) return;
      this._pushUndo('delete');
      ids.forEach((id) => this.removeElement(id));
      State.selectedIds = new Set();
      this._emitInteractiveChange('delete');
    },

    _duplicateSelection() {
      this._copySelection();
      this._pasteClipboard();
    },

    _selectAll() {
      const ids = [];
      for (const layer of State.layers) {
        if (!layer.locked) {
          for (const el of layer.elements) ids.push(el.id);
        }
      }
      State.selectedIds = new Set(ids);
      this._scheduleRender();
    },

    // ── Group / Ungroup ───────────────────────────────────
    _groupSelection() {
      const ids = Array.from(State.selectedIds);
      if (ids.length < 2) return;
      this._pushUndo('group');
      const layer = State.layers[Math.min(State.layers.length - 1, State.activeLayerIdx)];
      if (!layer || layer.locked) return;
      const children = [];
      const remaining = [];
      for (const el of layer.elements) {
        if (ids.includes(el.id)) children.push(el);
        else remaining.push(el);
      }
      if (children.length < 2) return;
      let minX = Infinity, minY = Infinity;
      for (const el of children) {
        const b = this._elementBounds(el);
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
      }
      const groupId = `group-${Date.now().toString(36)}`;
      const group = {
        id: groupId,
        type: 'group',
        x: minX,
        y: minY,
        children: children.map((el) => ({ ...el, x: (el.x || 0) - minX, y: (el.y || 0) - minY })),
        fill: null,
        stroke: null,
      };
      layer.elements = [...remaining, group];
      State.selectedIds = new Set([groupId]);
      this._scheduleRender();
      this._emitInteractiveChange('group');
    },

    _ungroupSelection() {
      const ids = Array.from(State.selectedIds);
      if (!ids.length) return;
      this._pushUndo('ungroup');
      const layer = State.layers[Math.min(State.layers.length - 1, State.activeLayerIdx)];
      if (!layer || layer.locked) return;
      const newSelection = [];
      const newElements = [];
      for (const el of layer.elements) {
        if (ids.includes(el.id) && el.type === 'group' && Array.isArray(el.children)) {
          for (const child of el.children) {
            const restored = {
              ...child,
              id: child.id || `studio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
              x: (child.x || 0) + (el.x || 0),
              y: (child.y || 0) + (el.y || 0),
            };
            newElements.push(restored);
            newSelection.push(restored.id);
          }
        } else {
          newElements.push(el);
        }
      }
      layer.elements = newElements;
      State.selectedIds = new Set(newSelection);
      this._scheduleRender();
      this._emitInteractiveChange('ungroup');
    },

    // ── Context Menu ──────────────────────────────────────
    _onContextMenu(event) {
      event.preventDefault();
      const menu = window.OpenCourseDeck?.ContextMenu;
      if (!menu) return;
      const point = this._eventToWorld(event);
      const hit = this._hitTest(point.x, point.y);
      const items = [];
      if (hit) {
        if (!State.selectedIds.has(hit.element.id)) {
          State.selectedIds = new Set([hit.element.id]);
        }
        State.activeLayerIdx = hit.layerIndex;
        items.push({ key: 'copy', label: 'Copy', shortcut: 'Ctrl+C', icon: '\u{1F4CB}' });
        items.push({ key: 'cut', label: 'Cut', shortcut: 'Ctrl+X', icon: '\u2702' });
        items.push({ key: 'delete', label: 'Delete', shortcut: 'Del', icon: '\u{1F5D1}' });
        items.push({ divider: true });
        items.push({ key: 'duplicate', label: 'Duplicate', shortcut: 'Ctrl+D' });
        if (State.selectedIds.size >= 2) {
          items.push({ key: 'group', label: 'Group', shortcut: 'Ctrl+G' });
        }
      } else {
        State.selectedIds = new Set();
        items.push({ key: 'paste', label: 'Paste', shortcut: 'Ctrl+V', icon: '\u{1F4CB}' });
        items.push({ divider: true });
        items.push({ key: 'select-all', label: 'Select All', shortcut: 'Ctrl+A' });
      }
      items.push({ divider: true });
      items.push({ key: 'undo', label: 'Undo', shortcut: 'Ctrl+Z' });
      items.push({ key: 'redo', label: 'Redo', shortcut: 'Ctrl+Shift+Z' });
      menu.show(items, event.clientX, event.clientY, (key) => this._handleContextAction(key));
      this._scheduleRender();
    },

    _handleContextAction(key) {
      switch (key) {
        case 'copy':       this._copySelection();      break;
        case 'cut':        this._cutSelection();        break;
        case 'paste':      this._pasteClipboard();      break;
        case 'delete':     this._deleteSelection();     break;
        case 'duplicate':  this._duplicateSelection();  break;
        case 'group':      this._groupSelection();      break;
        case 'select-all': this._selectAll();           break;
        case 'undo':       this.undo();                 break;
        case 'redo':       this.redo();                 break;
      }
    },

    // ── Touch / Pinch-to-zoom ─────────────────────────────
    _onTouchStart(event) {
      if (event.touches.length === 2) {
        event.preventDefault();
        const dx = event.touches[0].clientX - event.touches[1].clientX;
        const dy = event.touches[0].clientY - event.touches[1].clientY;
        this._touchState = {
          dist: Math.hypot(dx, dy),
          zoom: State.zoom,
          cx: (event.touches[0].clientX + event.touches[1].clientX) / 2,
          cy: (event.touches[0].clientY + event.touches[1].clientY) / 2,
          offsetX: State.offsetX,
          offsetY: State.offsetY,
        };
      }
    },

    _onTouchMove(event) {
      if (!this._touchState || event.touches.length < 2) return;
      event.preventDefault();
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scale = dist / (this._touchState.dist || 1);
      const newZoom = Math.min(4, Math.max(0.1, this._touchState.zoom * scale));
      const cx = (event.touches[0].clientX + event.touches[1].clientX) / 2;
      const cy = (event.touches[0].clientY + event.touches[1].clientY) / 2;
      const ratio = newZoom / this._touchState.zoom;
      State.zoom = newZoom;
      State.offsetX = this._touchState.cx - ratio * (this._touchState.cx - this._touchState.offsetX) + (cx - this._touchState.cx);
      State.offsetY = this._touchState.cy - ratio * (this._touchState.cy - this._touchState.offsetY) + (cy - this._touchState.cy);
      this._scheduleRender();
      this._emitInteractiveChange('pinch-zoom');
    },

    _onTouchEnd(event) {
      if (event.touches.length < 2) {
        this._touchState = null;
      }
    },

    _moveElements(ids, dx, dy) {
      const wanted = new Set(ids);
      for (const layer of State.layers) {
        if (layer.locked) continue;
        for (const element of layer.elements) {
          if (!wanted.has(element.id)) continue;
          element.x = finiteNumber(element.x, 0) + dx;
          element.y = finiteNumber(element.y, 0) + dy;
          if (['line', 'arrow'].includes(element.type)) {
            element.x1 = finiteNumber(element.x1, element.x) + dx;
            element.y1 = finiteNumber(element.y1, element.y) + dy;
            element.x2 = finiteNumber(element.x2, element.x) + dx;
            element.y2 = finiteNumber(element.y2, element.y) + dy;
          }
          if (Array.isArray(element.points)) {
            element.points = element.points.map((point) => [finiteNumber(point[0], 0) + dx, finiteNumber(point[1], 0) + dy]);
          }
        }
      }
    },

    _hitTest(x, y) {
      for (let layerIndex = State.layers.length - 1; layerIndex >= 0; layerIndex--) {
        const layer = State.layers[layerIndex];
        if (!layer?.visible) continue;
        for (let elementIndex = layer.elements.length - 1; elementIndex >= 0; elementIndex--) {
          const element = layer.elements[elementIndex];
          if (this._pointInElement(x, y, element)) return { layer, layerIndex, element };
        }
      }
      return null;
    },

    _pointInElement(x, y, element = {}) {
      if (element.type === 'circle') {
        return Math.hypot(x - finiteNumber(element.x, 0), y - finiteNumber(element.y, 0)) <= finiteNumber(element.radius, 0) + 6;
      }
      if (element.type === 'arrow' || element.type === 'line') {
        return this._pointNearLine(x, y, finiteNumber(element.x1, element.x), finiteNumber(element.y1, element.y), finiteNumber(element.x2, element.x), finiteNumber(element.y2, element.y), finiteNumber(element.strokeWidth, 2) + 8);
      }
      const box = this._elementBounds(element);
      return x >= box.x - 6 && x <= box.x + box.width + 6 && y >= box.y - 6 && y <= box.y + box.height + 6;
    },

    _pointNearLine(px, py, x1, y1, x2, y2, tolerance) {
      const lengthSq = ((x2 - x1) ** 2) + ((y2 - y1) ** 2);
      if (!lengthSq) return Math.hypot(px - x1, py - y1) <= tolerance;
      const t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / lengthSq));
      const x = x1 + t * (x2 - x1);
      const y = y1 + t * (y2 - y1);
      return Math.hypot(px - x, py - y) <= tolerance;
    },

    _elementBounds(element = {}) {
      if (Array.isArray(element.points) && element.points.length) {
        const [x, y, width, height] = this._boundingBox(element.points);
        return { x, y, width, height };
      }
      if (element.type === 'circle') {
        const radius = finiteNumber(element.radius, 0);
        return { x: finiteNumber(element.x, 0) - radius, y: finiteNumber(element.y, 0) - radius, width: radius * 2, height: radius * 2 };
      }
      if (element.type === 'text') {
        return { x: finiteNumber(element.x, 0), y: finiteNumber(element.y, 0) - finiteNumber(element.fontSize, State.fontSize), width: finiteNumber(element.width, String(element.text || '').length * 10 || 80), height: finiteNumber(element.height, finiteNumber(element.fontSize, State.fontSize) + 12) };
      }
      // Normalize rather than clamp: a shape dragged right-to-left or
      // bottom-to-top has negative width/height, and clamping those to 0
      // made the caller's `bounds.width > 2` size check fail, silently
      // discarding every shape drawn in the -X/-Y direction. Take the
      // absolute extent and move the origin to the top-left corner.
      const rawX = finiteNumber(element.x, finiteNumber(element.x1, 0));
      const rawY = finiteNumber(element.y, finiteNumber(element.y1, 0));
      const rawWidth = finiteNumber(element.width, finiteNumber(element.x2, 0) - finiteNumber(element.x1, 0));
      const rawHeight = finiteNumber(element.height, finiteNumber(element.y2, 0) - finiteNumber(element.y1, 0));
      return {
        x: rawWidth < 0 ? rawX + rawWidth : rawX,
        y: rawHeight < 0 ? rawY + rawHeight : rawY,
        width: Math.abs(rawWidth),
        height: Math.abs(rawHeight),
      };
    },

    // ── Resize ────────────────────────────────────────────
    _resize() {
      const dpr = window.devicePixelRatio ?? 1;
      const w   = this._canvas.offsetWidth;
      const h   = this._canvas.offsetHeight;
      this._canvas.width  = w * dpr;
      this._canvas.height = h * dpr;
      // Ensure the devicePixelRatio transform does not compound across resizes.
      this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._dirty = true;
    },

    // ── Render loop ───────────────────────────────────────
    _loop() {
      if (this._paused) return;
      if (this._dirty) {
        this._render();
        this._dirty = false;
      }
      this._raf = requestAnimationFrame(() => this._loop());
    },

    _pause() {
      this._paused = true;
      if (this._raf != null) cancelAnimationFrame(this._raf);
      this._raf = null;
    },

    _resume() {
      if (!this._paused) return;
      this._paused = false;
      this._dirty = true;
      this._loop();
    },

    _render() {
      const ctx = this._ctx;
      const w   = this._canvas.offsetWidth;
      const h   = this._canvas.offsetHeight;

      ctx.clearRect(0, 0, w, h);

      // Background. getPropertyValue returns '' (never null) when the
      // variable is unset, so `??` could not apply the fallback color.
      ctx.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue('--canvas-bg').trim() || '#1e1e2e';
      ctx.fillRect(0, 0, w, h);

      // Grid
      if (State.gridEnabled) this._drawGrid(ctx, w, h);

      // World transform
      ctx.save();
      ctx.translate(State.offsetX, State.offsetY);
      ctx.scale(State.zoom, State.zoom);

      // Draw all layers bottom → top
      for (const layer of State.layers) {
        if (!layer.visible) continue;
        ctx.save();
        ctx.globalAlpha = layer.opacity ?? 1;
        for (const el of layer.elements) {
          this._drawElement(ctx, el);
        }
        // Selection handles
        if (!layer.locked) {
          for (const el of layer.elements) {
            if (State.selectedIds.has(el.id)) {
              this._drawSelectionHandle(ctx, el);
            }
          }
        }
        ctx.restore();
      }

      // Current in-progress drawing
      if (State.currentPath)  this._drawPathPreview(ctx);
      if (State.currentShape) this._drawShapePreview(ctx);

      // Marquee selection rectangle
      if (State._marquee) {
        const m = State._marquee;
        const x = Math.min(m.x1, m.x2);
        const y = Math.min(m.y1, m.y2);
        const w = Math.abs(m.x2 - m.x1);
        const h = Math.abs(m.y2 - m.y1);
        ctx.save();
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 1 / Math.max(0.2, State.zoom);
        ctx.setLineDash([4 / State.zoom, 4 / State.zoom]);
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = 'rgba(99, 102, 241, 0.08)';
        ctx.fillRect(x, y, w, h);
        ctx.setLineDash([]);
        ctx.restore();
      }

      ctx.restore();

      // Mini-map
      this._drawMinimap(ctx, w, h);
    },

    // ── Grid ──────────────────────────────────────────────
    _drawGrid(ctx, w, h) {
      const sz  = State.gridSize * State.zoom;
      const ox  = State.offsetX % sz;
      const oy  = State.offsetY % sz;

      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      for (let x = ox; x < w; x += sz) {
        ctx.moveTo(x, 0); ctx.lineTo(x, h);
      }
      for (let y = oy; y < h; y += sz) {
        ctx.moveTo(0, y); ctx.lineTo(w, y);
      }
      ctx.stroke();
      ctx.restore();
    },

    // ── Mini-map ──────────────────────────────────────────
    _drawMinimap(ctx, canvasW, canvasH) {
      const mmW  = 160;
      const mmH  = 100;
      const mmX  = canvasW - mmW - 12;
      const mmY  = canvasH - mmH - 12;

      ctx.save();
      ctx.fillStyle   = 'rgba(15,23,42,0.8)';
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth   = 1;
      ctx.roundRect?.(mmX, mmY, mmW, mmH, 6);
      ctx.fill(); ctx.stroke();

      // Viewport indicator
      const scaleX = mmW / (canvasW / State.zoom);
      const scaleY = mmH / (canvasH / State.zoom);
      const vx     = (-State.offsetX / State.zoom) * scaleX + mmX;
      const vy     = (-State.offsetY / State.zoom) * scaleY + mmY;
      const vw     = (canvasW / State.zoom) * scaleX;
      const vh     = (canvasH / State.zoom) * scaleY;

      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth   = 1.5;
      ctx.strokeRect(vx, vy, vw, vh);
      ctx.restore();
    },

    // ── Draw element ──────────────────────────────────────
    _drawElement(ctx, el) {
      ctx.save();
      ctx.globalAlpha = el.opacity ?? 1;

      // Apply transform
      if (el.transform) {
        const { rotation = 0, scaleX = 1, scaleY = 1 } = el.transform;
        const cx = el.x + (el.width  ?? 0) / 2;
        const cy = el.y + (el.height ?? 0) / 2;
        ctx.translate(cx, cy);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.scale(scaleX, scaleY);
        ctx.translate(-cx, -cy);
      }

      // Shadow
      if (el.shadow) {
        ctx.shadowColor   = el.shadow.color   ?? 'rgba(0,0,0,0.3)';
        ctx.shadowBlur    = el.shadow.blur    ?? 8;
        ctx.shadowOffsetX = el.shadow.offsetX ?? 0;
        ctx.shadowOffsetY = el.shadow.offsetY ?? 2;
      }

      switch (el.type) {
        case 'rect':       this._drawRect(ctx, el);       break;
        case 'roundRect':  this._drawRoundRect(ctx, el);  break;
        case 'circle':     this._drawCircle(ctx, el);     break;
        case 'ellipse':    this._drawEllipse(ctx, el);    break;
        case 'line':       this._drawLine(ctx, el);       break;
        case 'polyline':   this._drawPolyline(ctx, el);   break;
        case 'polygon':    this._drawPolygon(ctx, el);    break;
        case 'arc':        this._drawArc(ctx, el);        break;
        case 'bezier':     this._drawBezier(ctx, el);     break;
        case 'text':       this._drawText(ctx, el);       break;
        case 'image':      this._drawImage(ctx, el);      break;
        case 'gradient':   this._drawGradientRect(ctx, el); break;
        case 'sparkline':  this._drawSparkline(ctx, el);  break;
        case 'donut':      this._drawDonut(ctx, el);      break;
        case 'bar':        this._drawBarGroup(ctx, el);   break;
        case 'area':       this._drawArea(ctx, el);       break;
        case 'gauge':      this._drawGauge(ctx, el);      break;
        case 'heatCell':   this._drawHeatCell(ctx, el);   break;
        case 'arrow':      this._drawArrow(ctx, el);      break;
        case 'badge':      this._drawBadge(ctx, el);      break;
        case 'group':      this._drawGroup(ctx, el);      break;
        default:
          console.warn(`[CanvasRenderer] Unknown element type: "${el.type}"`);
      }

      ctx.restore();
    },

    _elementToSVG(el = {}) {
      const wrap = (node) => {
        const transform = this._svgTransform(el);
        const linkAttrs = this._svgLinkAttrs(el);
        const wrapped = linkAttrs ? `<g${linkAttrs}>${node}</g>` : node;
        return transform ? `<g transform="${transform}">${wrapped}</g>` : wrapped;
      };
      const style = this._svgPaint(el);
      const x = finiteNumber(el.x, 0);
      const y = finiteNumber(el.y, 0);
      const width = finiteNumber(el.width, 0);
      const height = finiteNumber(el.height, 0);
      switch (el.type) {
        case 'rect':
        case 'gradient':
        case 'heatCell':
          return wrap(`<rect x="${x}" y="${y}" width="${width}" height="${height}"${style}/>`); 
        case 'roundRect':
        case 'badge':
          return wrap(`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${finiteNumber(el.radius, 8)}" ry="${finiteNumber(el.radius, 8)}"${style}/>`); 
        case 'circle':
          return wrap(`<circle cx="${x}" cy="${y}" r="${finiteNumber(el.radius, Math.max(width, height) / 2)}"${style}/>`); 
        case 'ellipse':
          return wrap(`<ellipse cx="${x + width / 2}" cy="${y + height / 2}" rx="${Math.max(0, width / 2)}" ry="${Math.max(0, height / 2)}"${style}/>`); 
        case 'line':
        case 'arrow':
          return wrap(`<line x1="${x}" y1="${y}" x2="${finiteNumber(el.x2, x + width)}" y2="${finiteNumber(el.y2, y + height)}"${style}/>`); 
        case 'polyline':
        case 'sparkline':
          return wrap(`<polyline points="${this._svgPoints(el.points)}"${style} fill="none"/>`); 
        case 'polygon':
          return wrap(`<polygon points="${this._svgPoints(el.points)}"${style}/>`); 
        case 'text':
          return wrap(`<text x="${x}" y="${y}" font-family="${xmlEscape(el.fontFamily || State.fontFamily)}" font-size="${finiteNumber(el.fontSize, State.fontSize)}" fill="${xmlEscape(el.fill || el.color || '#f8fafc')}" opacity="${finiteNumber(el.opacity, 1)}">${xmlEscape(el.text || '')}</text>`); 
        case 'image': {
          const src = safeImageUrl(el.src);
          return src ? wrap(`<image href="${xmlEscape(src)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>`) : '';
        }
        case 'group':
          return wrap((Array.isArray(el.children) ? el.children : []).map((child) => this._elementToSVG(child)).join(''));
        default:
          return `<desc>Unsupported Studio element: ${xmlEscape(el.type || 'unknown')}</desc>`;
      }
    },

    _svgPaint(el = {}) {
      const attrs = [];
      const fill = el.fill ?? (el.type === 'line' || el.type === 'arrow' || el.type === 'polyline' ? 'none' : 'transparent');
      const stroke = el.stroke ?? el.color ?? State.strokeColor;
      attrs.push(` fill="${xmlEscape(typeof fill === 'string' ? fill : 'transparent')}"`);
      if (stroke) attrs.push(` stroke="${xmlEscape(stroke)}"`);
      attrs.push(` stroke-width="${finiteNumber(el.strokeWidth, State.strokeWidth)}"`);
      attrs.push(` opacity="${finiteNumber(el.opacity, 1)}"`);
      if (Array.isArray(el.dashPattern) && el.dashPattern.length) attrs.push(` stroke-dasharray="${xmlEscape(el.dashPattern.join(' '))}"`);
      return attrs.join('');
    },

    _svgLinkAttrs(el = {}) {
      const type = String(el.linkType || '').trim();
      const target = String(el.linkTarget || '').trim();
      const label = String(el.linkLabel || '').trim();
      if (!type && !target && !label) return '';
      const attrs = [];
      if (type) attrs.push(` data-link-type="${xmlEscape(type)}"`);
      if (target) attrs.push(` data-link-target="${xmlEscape(target)}"`);
      if (label) attrs.push(` data-link-label="${xmlEscape(label)}"`);
      return attrs.join('');
    },

    _svgTransform(el = {}) {
      if (!el.transform) return '';
      const { rotation = 0, scaleX = 1, scaleY = 1 } = el.transform;
      const cx = finiteNumber(el.x, 0) + finiteNumber(el.width, 0) / 2;
      const cy = finiteNumber(el.y, 0) + finiteNumber(el.height, 0) / 2;
      const transforms = [];
      if (rotation) transforms.push(`rotate(${finiteNumber(rotation, 0)} ${cx} ${cy})`);
      if (scaleX !== 1 || scaleY !== 1) transforms.push(`translate(${cx} ${cy}) scale(${finiteNumber(scaleX, 1)} ${finiteNumber(scaleY, 1)}) translate(${-cx} ${-cy})`);
      return xmlEscape(transforms.join(' '));
    },

    _svgPoints(points = []) {
      return xmlEscape((Array.isArray(points) ? points : [])
        .map((point) => Array.isArray(point) ? `${finiteNumber(point[0], 0)},${finiteNumber(point[1], 0)}` : '')
        .filter(Boolean)
        .join(' '));
    },


  // ──────────────────────────────────────────────────────────
  // PRIMITIVE SHAPES
  // ──────────────────────────────────────────────────────────

    _drawRect(ctx, el) {
      const { x, y, width, height, fill, stroke, strokeWidth = 1 } = el;
      if (fill) {
        ctx.fillStyle = this._resolveFill(ctx, fill, x, y, width, height);
        ctx.fillRect(x, y, width, height);
      }
      if (stroke) {
        ctx.strokeStyle   = stroke;
        ctx.lineWidth     = strokeWidth;
        ctx.strokeRect(x, y, width, height);
      }
    },

    _drawRoundRect(ctx, el) {
      const { x, y, width, height, radius = 8, fill, stroke, strokeWidth = 1 } = el;
      const r = Math.min(radius, width / 2, height / 2);

      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + width - r, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + r);
      ctx.lineTo(x + width, y + height - r);
      ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
      ctx.lineTo(x + r, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();

      if (fill) {
        ctx.fillStyle = this._resolveFill(ctx, fill, x, y, width, height);
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth   = strokeWidth;
        ctx.stroke();
      }
    },

    _drawCircle(ctx, el) {
      const { x, y, radius, fill, stroke, strokeWidth = 1 } = el;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      if (fill) {
        ctx.fillStyle = this._resolveFill(ctx, fill, x - radius, y - radius, radius * 2, radius * 2);
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth   = strokeWidth;
        ctx.stroke();
      }
    },

    _drawEllipse(ctx, el) {
      const { x, y, radiusX, radiusY, rotation = 0, fill, stroke, strokeWidth = 1 } = el;
      ctx.beginPath();
      ctx.ellipse(x, y, radiusX, radiusY, (rotation * Math.PI) / 180, 0, Math.PI * 2);
      if (fill) {
        ctx.fillStyle = this._resolveFill(ctx, fill, x - radiusX, y - radiusY, radiusX * 2, radiusY * 2);
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth   = strokeWidth;
        ctx.stroke();
      }
    },

    _drawLine(ctx, el) {
      const { x1, y1, x2, y2, stroke = '#fff', strokeWidth = 1,
              dash = [], lineCap = 'butt' } = el;
      ctx.beginPath();
      ctx.setLineDash(dash);
      ctx.lineCap     = lineCap;
      ctx.strokeStyle = stroke;
      ctx.lineWidth   = strokeWidth;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
    },

    _drawPolyline(ctx, el) {
      const { points = [], stroke = '#fff', strokeWidth = 1,
              dash = [], fill = null, lineCap = 'round', lineJoin = 'round' } = el;
      if (points.length < 2) return;
      ctx.beginPath();
      ctx.setLineDash(dash);
      ctx.lineCap     = lineCap;
      ctx.lineJoin    = lineJoin;
      ctx.strokeStyle = stroke;
      ctx.lineWidth   = strokeWidth;
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.stroke();
      ctx.setLineDash([]);
    },

    _drawPathPreview(ctx) {
      this._drawPolyline(ctx, State.currentPath);
    },

    _drawShapePreview(ctx) {
      this._drawElement(ctx, State.currentShape);
    },

    _drawSelectionHandle(ctx, el) {
      const { x, y, width, height } = this._elementBounds(el);
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#a5b4fc';
      ctx.lineWidth = 1.5 / Math.max(0.2, State.zoom);
      ctx.strokeRect(x - 6, y - 6, width + 12, height + 12);
      ctx.setLineDash([]);
      ctx.fillStyle = '#6366f1';
      const size = 6 / Math.max(0.2, State.zoom);
      [
        [x - 6, y - 6],
        [x + width + 6, y - 6],
        [x + width + 6, y + height + 6],
        [x - 6, y + height + 6],
      ].forEach(([cx, cy]) => ctx.fillRect(cx - size / 2, cy - size / 2, size, size));
      ctx.restore();
    },

    _drawPolygon(ctx, el) {
      const { points = [], fill, stroke, strokeWidth = 1 } = el;
      if (points.length < 3) return;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
      ctx.closePath();
      if (fill) {
        ctx.fillStyle = this._resolveFill(ctx, fill, ...this._boundingBox(points));
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth   = strokeWidth;
        ctx.stroke();
      }
    },

    _drawArc(ctx, el) {
      const { x, y, radius, startAngle, endAngle, counterClockwise = false,
              stroke = '#fff', strokeWidth = 2, fill = null, lineCap = 'round' } = el;
      const sa = (startAngle * Math.PI) / 180;
      const ea = (endAngle   * Math.PI) / 180;
      ctx.beginPath();
      ctx.arc(x, y, radius, sa, ea, counterClockwise);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth   = strokeWidth;
        ctx.lineCap     = lineCap;
        ctx.stroke();
      }
    },

    _drawBezier(ctx, el) {
      const { x1, y1, cp1x, cp1y, cp2x, cp2y, x2, y2,
              stroke = '#fff', strokeWidth = 2, fill = null } = el;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth   = strokeWidth;
        ctx.stroke();
      }
    },

    _drawArrow(ctx, el) {
      const { x1, y1, x2, y2, stroke = '#fff', strokeWidth = 2,
              headSize = 10, headFill = null } = el;
      const angle = Math.atan2(y2 - y1, x2 - x1);

      // Shaft
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = stroke;
      ctx.lineWidth   = strokeWidth;
      ctx.stroke();

      // Arrowhead
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(
        x2 - headSize * Math.cos(angle - Math.PI / 6),
        y2 - headSize * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        x2 - headSize * Math.cos(angle + Math.PI / 6),
        y2 - headSize * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fillStyle = headFill ?? stroke;
      ctx.fill();
    },


  // ──────────────────────────────────────────────────────────
  // TEXT
  // ──────────────────────────────────────────────────────────

    _drawText(ctx, el) {
      const {
        x, y, text = '',
        fill       = '#f1f5f9',
        stroke     = null,
        strokeWidth = 1,
        align      = 'left',
        baseline   = 'alphabetic',
        maxWidth   = undefined,
        lineHeight = 20,
        wrap       = false,
        wrapWidth  = 200,
      } = el;

      // Elements created by this module store fontSize/fontFamily rather
      // than a composed `font` string; without this, every text element
      // rendered at the 14px default while hit-testing and SVG export used
      // the real size.
      const composedFont = el.font
        || `${finiteNumber(el.fontSize, State.fontSize)}px ${el.fontFamily || State.fontFamily || 'Inter, sans-serif'}`;

      ctx.font         = composedFont;
      ctx.textAlign    = align;
      ctx.textBaseline = baseline;

      if (wrap) {
        const lines = this._wrapText(ctx, text, wrapWidth);
        lines.forEach((line, i) => {
          if (fill)   { ctx.fillStyle = fill; ctx.fillText(line, x, y + i * lineHeight, maxWidth); }
          if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = strokeWidth; ctx.strokeText(line, x, y + i * lineHeight, maxWidth); }
        });
      } else {
        if (fill)   { ctx.fillStyle = fill; ctx.fillText(text, x, y, maxWidth); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = strokeWidth; ctx.strokeText(text, x, y, maxWidth); }
      }
    },

    _wrapText(ctx, text, maxWidth) {
      const words = text.split(' ');
      const lines = [];
      let current = '';
      for (const word of words) {
        const test  = current ? `${current} ${word}` : word;
        const width = ctx.measureText(test).width;
        if (width > maxWidth && current) {
          lines.push(current);
          current = word;
        } else {
          current = test;
        }
      }
      if (current) lines.push(current);
      return lines;
    },


  // ──────────────────────────────────────────────────────────
  // IMAGES
  // ──────────────────────────────────────────────────────────

    _imageCache: new Map(),

    _drawImage(ctx, el) {
      const { src, x, y, width, height, radius = 0, fit = 'cover' } = el;
      const imageSrc = safeImageUrl(src);
      if (!imageSrc) return;

      const render = img => {
        ctx.save();
        if (radius > 0) {
          this._clipRoundRect(ctx, x, y, width, height, radius);
        }
        if (fit === 'cover') {
          const { sx, sy, sw, sh } = this._coverFit(img, width, height);
          ctx.drawImage(img, sx, sy, sw, sh, x, y, width, height);
        } else if (fit === 'contain') {
          const { dx, dy, dw, dh } = this._containFit(img, x, y, width, height);
          ctx.drawImage(img, dx, dy, dw, dh);
        } else {
          ctx.drawImage(img, x, y, width, height);
        }
        ctx.restore();
      };

      if (this._imageCache.has(imageSrc)) {
        render(this._imageCache.get(imageSrc));
      } else {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          this._imageCache.set(imageSrc, img);
          this._scheduleRender();
        };
        img.onerror = () => console.warn(`[CanvasRenderer] Failed to load image: ${imageSrc}`);
        img.src = imageSrc;
      }
    },

    _coverFit(img, dw, dh) {
      const imgAR  = img.width / img.height;
      const destAR = dw / dh;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (imgAR > destAR) {
        sw = img.height * destAR;
        sx = (img.width - sw) / 2;
      } else {
        sh = img.width / destAR;
        sy = (img.height - sh) / 2;
      }
      return { sx, sy, sw, sh };
    },

    _containFit(img, x, y, dw, dh) {
      const imgAR  = img.width / img.height;
      const destAR = dw / dh;
      let dx = x, dy = y, w = dw, h = dh;
      if (imgAR > destAR) {
        h  = dw / imgAR;
        dy = y + (dh - h) / 2;
      } else {
        w  = dh * imgAR;
        dx = x + (dw - w) / 2;
      }
      return { dx, dy, dw: w, dh: h };
    },

    _clipRoundRect(ctx, x, y, w, h, r) {
      const rad = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.lineTo(x + w - rad, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
      ctx.lineTo(x + w, y + h - rad);
      ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
      ctx.lineTo(x + rad, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
      ctx.lineTo(x, y + rad);
      ctx.quadraticCurveTo(x, y, x + rad, y);
      ctx.closePath();
      ctx.clip();
    },


  // ──────────────────────────────────────────────────────────
  // GRADIENT RECT
  // ──────────────────────────────────────────────────────────

    _drawGradientRect(ctx, el) {
      const { x, y, width, height, gradient, radius = 0, stroke, strokeWidth = 1 } = el;
      const fill = this._buildGradient(ctx, gradient, x, y, width, height);
      this._drawRoundRect(ctx, { x, y, width, height, radius, fill, stroke, strokeWidth });
    },

    _buildGradient(ctx, grad, x, y, w, h) {
      if (!grad) return 'transparent';
      let g;
      if (grad.type === 'radial') {
        g = ctx.createRadialGradient(
          x + w / 2, y + h / 2, 0,
          x + w / 2, y + h / 2, Math.max(w, h) / 2
        );
      } else {
        const angle = (grad.angle ?? 135) * (Math.PI / 180);
        const x2    = x + w * Math.cos(angle);
        const y2    = y + h * Math.sin(angle);
        g = ctx.createLinearGradient(x, y, x2, y2);
      }
      (grad.stops ?? []).forEach(([offset, color]) => g.addColorStop(offset, color));
      return g;
    },


  // ──────────────────────────────────────────────────────────
  // CHART ELEMENTS
  // ──────────────────────────────────────────────────────────

    // ── Sparkline ─────────────────────────────────────────
    _drawSparkline(ctx, el) {
      const {
        x, y, width, height,
        data       = [],
        stroke     = '#6366f1',
        strokeWidth = 2,
        fill       = null,
        dot        = false,
        dotRadius  = 3,
        dotFill    = '#6366f1',
        smooth     = false,
        areaFill   = null,
        dash       = [],
      } = el;

      if (data.length < 2) return;

      const min  = Math.min(...data);
      const max  = Math.max(...data);
      const rangeVal = max - min || 1;
      const stepX = width / (data.length - 1);

      const toX = i => x + i * stepX;
      const toY = v => y + height - ((v - min) / rangeVal) * height;

      const points = data.map((v, i) => [toX(i), toY(v)]);

      // Area fill
      if (areaFill ?? fill) {
        ctx.beginPath();
        ctx.moveTo(points[0][0], y + height);
        ctx.lineTo(points[0][0], points[0][1]);
        if (smooth) {
          this._drawSmoothedPath(ctx, points);
        } else {
          points.forEach(([px, py]) => ctx.lineTo(px, py));
        }
        ctx.lineTo(points[points.length - 1][0], y + height);
        ctx.closePath();

        const grad = ctx.createLinearGradient(x, y, x, y + height);
        const col  = areaFill ?? fill ?? stroke;
        grad.addColorStop(0,   this._hexAlpha(col, 0.35));
        grad.addColorStop(1,   this._hexAlpha(col, 0.01));
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Line
      ctx.beginPath();
      ctx.setLineDash(dash);
      ctx.strokeStyle = stroke;
      ctx.lineWidth   = strokeWidth;
      ctx.lineJoin    = 'round';
      ctx.lineCap     = 'round';
      ctx.moveTo(points[0][0], points[0][1]);

      if (smooth) {
        this._drawSmoothedPath(ctx, points);
      } else {
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i][0], points[i][1]);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Dots
      if (dot) {
        points.forEach(([px, py]) => {
          ctx.beginPath();
          ctx.arc(px, py, dotRadius, 0, Math.PI * 2);
          ctx.fillStyle = dotFill;
          ctx.fill();
        });
      }
    },

    _drawSmoothedPath(ctx, points) {
      for (let i = 1; i < points.length; i++) {
        const cpX = (points[i - 1][0] + points[i][0]) / 2;
        ctx.bezierCurveTo(
          cpX, points[i - 1][1],
          cpX, points[i][1],
          points[i][0], points[i][1]
        );
      }
    },


    // ── Area Chart ────────────────────────────────────────
    _drawArea(ctx, el) {
      const {
        x, y, width, height,
        datasets   = [],
        xLabels    = [],
        yMin       = null, yMax = null,
        showGrid   = true,
        gridColor  = 'rgba(255,255,255,0.06)',
        labelFont  = '11px Inter, sans-serif',
        labelColor = '#64748b',
        smooth     = true,
        ySteps     = 5,
        padding    = { top: 20, right: 20, bottom: 32, left: 44 },
      } = el;

      const cw = width  - padding.left - padding.right;
      const ch = height - padding.top  - padding.bottom;
      const ox = x + padding.left;
      const oy = y + padding.top;

      // Compute data range
      const allVals = datasets.flatMap(ds => ds.data ?? []);
      const dataMin = yMin ?? Math.min(...allVals, 0);
      const dataMax = yMax ?? Math.max(...allVals, 1);
      const range   = dataMax - dataMin || 1;

      const toX = i   => ox + (i / (Math.max(...datasets.map(d => d.data.length), 2) - 1)) * cw;
      const toY = val => oy + ch - ((val - dataMin) / range) * ch;

      // Grid lines
      if (showGrid) {
        ctx.strokeStyle = gridColor;
        ctx.lineWidth   = 1;
        for (let i = 0; i <= ySteps; i++) {
          const gy = oy + (i / ySteps) * ch;
          ctx.beginPath();
          ctx.moveTo(ox, gy);
          ctx.lineTo(ox + cw, gy);
          ctx.stroke();
        }
      }

      // Y axis labels
      ctx.font         = labelFont;
      ctx.fillStyle    = labelColor;
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'middle';
      for (let i = 0; i <= ySteps; i++) {
        const val = dataMax - (i / ySteps) * range;
        const gy  = oy + (i / ySteps) * ch;
        ctx.fillText(this._formatNum(val), ox - 8, gy);
      }

      // X axis labels
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      xLabels.forEach((label, i) => {
        const gx = toX(i);
        ctx.fillText(String(label), gx, oy + ch + 8);
      });

      // Draw each dataset
      datasets.forEach(ds => {
        const pts = (ds.data ?? []).map((v, i) => [toX(i), toY(v)]);
        if (pts.length < 2) return;

        const color = ds.color ?? '#6366f1';

        // Area fill
        ctx.beginPath();
        ctx.moveTo(pts[0][0], oy + ch);
        ctx.lineTo(pts[0][0], pts[0][1]);
        if (smooth) this._drawSmoothedPath(ctx, pts);
        else pts.slice(1).forEach(([px, py]) => ctx.lineTo(px, py));
        ctx.lineTo(pts[pts.length - 1][0], oy + ch);
        ctx.closePath();
        const grad = ctx.createLinearGradient(ox, oy, ox, oy + ch);
        grad.addColorStop(0,   this._hexAlpha(color, 0.3));
        grad.addColorStop(1,   this._hexAlpha(color, 0.0));
        ctx.fillStyle = grad;
        ctx.fill();

        // Line
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth   = ds.strokeWidth ?? 2;
        ctx.lineJoin    = 'round';
        ctx.moveTo(pts[0][0], pts[0][1]);
        if (smooth) this._drawSmoothedPath(ctx, pts);
        else pts.slice(1).forEach(([px, py]) => ctx.lineTo(px, py));
        ctx.stroke();
      });
    },


    // ── Bar Group Chart ───────────────────────────────────
    _drawBarGroup(ctx, el) {
      const {
        x, y, width, height,
        datasets     = [],
        xLabels      = [],
        yMin         = 0,
        yMax         = null,
        showGrid     = true,
        gridColor    = 'rgba(255,255,255,0.06)',
        labelFont    = '11px Inter, sans-serif',
        labelColor   = '#64748b',
        barGap       = 0.2,
        groupGap     = 0.35,
        radius       = 4,
        padding      = { top: 20, right: 20, bottom: 32, left: 44 },
        ySteps       = 5,
        showValues   = false,
        valueFont    = '10px Inter, sans-serif',
      } = el;

      const cw     = width  - padding.left - padding.right;
      const ch     = height - padding.top  - padding.bottom;
      const ox     = x + padding.left;
      const oy     = y + padding.top;
      const groups = xLabels.length || (datasets[0]?.data?.length ?? 0);
      const nSets  = datasets.length;

      const allVals = datasets.flatMap(ds => ds.data ?? []);
      const dataMax = yMax ?? Math.max(...allVals, 1);
      const range   = dataMax - (yMin ?? 0) || 1;

      const groupW  = cw / groups;
      const barTW   = groupW * (1 - groupGap);
      const barW    = nSets > 1 ? (barTW / nSets) * (1 - barGap) : barTW;

      const toY  = val => oy + ch - ((val - (yMin ?? 0)) / range) * ch;
      const barH = val => ((val - (yMin ?? 0)) / range) * ch;

      // Grid
      if (showGrid) {
        ctx.strokeStyle = gridColor;
        ctx.lineWidth   = 1;
        for (let i = 0; i <= ySteps; i++) {
          const gy = oy + (i / ySteps) * ch;
          ctx.beginPath();
          ctx.moveTo(ox, gy);
          ctx.lineTo(ox + cw, gy);
          ctx.stroke();
        }
      }

      // Y labels
      ctx.font         = labelFont;
      ctx.fillStyle    = labelColor;
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'middle';
      for (let i = 0; i <= ySteps; i++) {
        const val = dataMax - (i / ySteps) * range;
        ctx.fillText(this._formatNum(val), ox - 8, oy + (i / ySteps) * ch);
      }

      // X labels
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      for (let g = 0; g < groups; g++) {
        const gx = ox + g * groupW + groupW / 2;
        ctx.fillText(String(xLabels[g] ?? g), gx, oy + ch + 8);
      }

      // Bars
      datasets.forEach((ds, di) => {
        (ds.data ?? []).forEach((val, gi) => {
          const gStartX = ox + gi * groupW + groupW * (groupGap / 2);
          const bx      = gStartX + di * (barW + (barTW / nSets) * barGap);
          const bh      = barH(val);
          const by      = toY(val);
          const color   = Array.isArray(ds.color) ? ds.color[gi] : (ds.color ?? '#6366f1');

          this._drawRoundRect(ctx, {
            x: bx, y: by,
            width: barW, height: bh,
            radius: Math.min(radius, barW / 2),
            fill: color,
          });

          if (showValues && val > 0) {
            ctx.font      = valueFont;
            ctx.fillStyle = '#f1f5f9';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(this._formatNum(val), bx + barW / 2, by - 3);
          }
        });
      });
    },


    // ── Donut Chart ───────────────────────────────────────
    _drawDonut(ctx, el) {
      const {
        x, y,
        radius        = 80,
        innerRadius   = 52,
        data          = [],
        colors        = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
        gap           = 0.02,
        startAngle    = -Math.PI / 2,
        centerText    = '',
        centerSubText = '',
        centerFont    = 'bold 22px Inter, sans-serif',
        centerSubFont = '12px Inter, sans-serif',
        centerColor   = '#f1f5f9',
        centerSubColor = '#64748b',
        showLabels    = false,
        labelFont     = '11px Inter, sans-serif',
        labelColor    = '#94a3b8',
        animProgress  = 1,
      } = el;

      const total    = data.reduce((s, v) => s + v, 0) || 1;
      let   current  = startAngle;

      data.forEach((val, i) => {
        const sliceAngle = (val / total) * Math.PI * 2 * animProgress;
        const sa = current + gap;
        const ea = current + sliceAngle - gap;

        ctx.beginPath();
        ctx.arc(x, y, radius, sa, ea, false);
        ctx.arc(x, y, innerRadius, ea, sa, true);
        ctx.closePath();
        ctx.fillStyle = colors[i % colors.length];
        ctx.fill();

        // Labels
        if (showLabels) {
          const midAngle = sa + (ea - sa) / 2;
          const lx = x + (radius + 16) * Math.cos(midAngle);
          const ly = y + (radius + 16) * Math.sin(midAngle);
          ctx.font         = labelFont;
          ctx.fillStyle    = labelColor;
          ctx.textAlign    = lx > x ? 'left' : 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${Math.round((val / total) * 100)}%`, lx, ly);
        }

        current += sliceAngle;
      });

      // Center text
      if (centerText) {
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.font         = centerFont;
        ctx.fillStyle    = centerColor;
        ctx.fillText(centerText, x, y - (centerSubText ? 10 : 0));

        if (centerSubText) {
          ctx.font      = centerSubFont;
          ctx.fillStyle = centerSubColor;
          ctx.fillText(centerSubText, x, y + 14);
        }
      }
    },


    // ── Gauge ─────────────────────────────────────────────
    _drawGauge(ctx, el) {
      const {
        x, y,
        radius       = 80,
        strokeWidth  = 16,
        value        = 0,       // 0–100
        max          = 100,
        colors       = ['#10b981', '#f59e0b', '#ef4444'],
        thresholds   = [60, 80],
        trackColor   = 'rgba(255,255,255,0.08)',
        startAngle   = Math.PI * 0.75,
        endAngle     = Math.PI * 2.25,
        centerText   = null,    // null = auto show value%
        centerFont   = 'bold 24px Inter, sans-serif',
        centerColor  = '#f1f5f9',
        labelFont    = '12px Inter, sans-serif',
        labelColor   = '#64748b',
        animProgress = 1,
      } = el;

      const arcSpan = endAngle - startAngle;
      const pct     = Math.min(value / max, 1) * animProgress;
      const fillEnd = startAngle + arcSpan * pct;

      // Track
      ctx.beginPath();
      ctx.arc(x, y, radius, startAngle, endAngle);
      ctx.strokeStyle = trackColor;
      ctx.lineWidth   = strokeWidth;
      ctx.lineCap     = 'round';
      ctx.stroke();

      // Determine color from thresholds
      const pctVal  = (value / max) * 100;
      const colorIdx = thresholds.findIndex(t => pctVal < t);
      const color    = colors[colorIdx === -1 ? colors.length - 1 : colorIdx];

      // Fill arc
      ctx.beginPath();
      ctx.arc(x, y, radius, startAngle, fillEnd);
      ctx.strokeStyle = color;
      ctx.lineWidth   = strokeWidth;
      ctx.lineCap     = 'round';
      ctx.stroke();

      // Center text
      const label = centerText ?? `${Math.round(pct * 100)}%`;
      ctx.font         = centerFont;
      ctx.fillStyle    = centerColor;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, y);

      // Min/max labels
      ctx.font      = labelFont;
      ctx.fillStyle = labelColor;
      const minX = x + radius * Math.cos(startAngle);
      const minY = y + radius * Math.sin(startAngle);
      const maxX = x + radius * Math.cos(endAngle);
      const maxY = y + radius * Math.sin(endAngle);
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('0',         minX, minY + 6);
      ctx.fillText(String(max), maxX, maxY + 6);
    },


    // ── Heat Cell ─────────────────────────────────────────
    _drawHeatCell(ctx, el) {
      const { x, y, width, height, level = 0, radius = 3,
              palette = ['#1e293b','#1e3a5f','#1e4d8c','#2563eb','#60a5fa'] } = el;
      this._drawRoundRect(ctx, {
        x, y, width, height, radius,
        fill: palette[Math.min(level, palette.length - 1)],
      });
    },


    // ── Badge (text pill on canvas) ───────────────────────
    _drawBadge(ctx, el) {
      const {
        x, y,
        text      = '',
        font      = 'bold 10px Inter, sans-serif',
        fill      = '#6366f1',
        textColor = '#fff',
        paddingX  = 8,
        paddingY  = 4,
        radius    = 99,
      } = el;
      ctx.font = font;
      const tw = ctx.measureText(text).width;
      const bw = tw + paddingX * 2;
      const bh = 16 + paddingY * 2;
      this._drawRoundRect(ctx, { x: x - bw / 2, y: y - bh / 2, width: bw, height: bh, radius, fill });
      ctx.fillStyle    = textColor;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
    },


    // ── Group (children with local offset) ───────────────
    _drawGroup(ctx, el) {
      const { x = 0, y = 0, children = [], clip = null } = el;
      ctx.save();
      ctx.translate(x, y);
      if (clip) {
        this._drawRoundRect(ctx, { ...clip, fill: null });
        ctx.clip();
      }
      children.forEach(child => this._drawElement(ctx, child));
      ctx.restore();
    },


  // ──────────────────────────────────────────────────────────
  // FILL RESOLVER
  // ──────────────────────────────────────────────────────────

    _resolveFill(ctx, fill, x, y, w, h) {
      if (typeof fill === 'string') return fill;
      if (typeof fill === 'object' && fill.type) {
        return this._buildGradient(ctx, fill, x, y, w, h);
      }
      return fill;
    },


  // ──────────────────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────────────────

    _hexAlpha(color, alpha) {
      // Works for hex or rgb() strings
      if (color.startsWith('#')) {
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
      }
      if (color.startsWith('rgb')) {
        return color.replace(/[\d.]+\)$/, `${alpha})`).replace('rgb(', 'rgba(');
      }
      return color;
    },

    _formatNum(val) {
      if (Math.abs(val) >= 1e6)  return (val / 1e6).toFixed(1)  + 'M';
      if (Math.abs(val) >= 1e3)  return (val / 1e3).toFixed(1)  + 'K';
      return Number.isInteger(val) ? String(val) : val.toFixed(1);
    },

    _boundingBox(points) {
      const xs = points.map(p => p[0]);
      const ys = points.map(p => p[1]);
      const x  = Math.min(...xs);
      const y  = Math.min(...ys);
      return [x, y, Math.max(...xs) - x, Math.max(...ys) - y];
    },

    _scheduleRender() {
      // Called after async operations (image loads) to let the render loop redraw once.
      this._dirty = true;
      if (this._paused && this._canvas && this._ctx) this._resume();
    },

  };

  window.OpenCourseDeck = window.OpenCourseDeck ?? {};
  window.OpenCourseDeck.Canvas = Canvas;
})();
