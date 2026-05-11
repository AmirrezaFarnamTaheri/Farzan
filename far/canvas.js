// ============================================================
// PlasmaDeck — canvas.js
// Full Whiteboard / Drawing Canvas
// Features: Pen, Shapes, Text, Eraser, Select, Layers,
//           Undo/Redo, Grid, Export PNG/SVG, Mini-map
// Pure Canvas 2D — no external dependencies
// ============================================================

(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function uid(prefix = 'el') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

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
  };

  // ──────────────────────────────────────────────────────────
  // 1. ELEMENT TYPES
  // ──────────────────────────────────────────────────────────

  class CanvasElement {
    constructor(type, opts = {}) {
      this.id          = uid(type);
      this.type        = type;
      this.layerId     = opts.layerId ?? State.layers[State.activeLayerIdx]?.id;
      this.strokeColor = opts.strokeColor ?? State.strokeColor;
      this.fillColor   = opts.fillColor   ?? State.fillColor;
      this.strokeWidth = opts.strokeWidth ?? State.strokeWidth;
      this.opacity     = opts.opacity     ?? State.opacity;
      this.lineCap     = opts.lineCap     ?? State.lineCap;
      this.lineJoin    = opts.lineJoin    ?? State.lineJoin;
      this.dashPattern = opts.dashPattern ?? [...State.dashPattern];
      this.x           = opts.x           ?? 0;
      this.y           = opts.y           ?? 0;
      this.rotation    = opts.rotation    ?? 0;
    }
  }

  class PathElement extends CanvasElement {
    constructor(opts = {}) {
      super('path', opts);
      this.points = opts.points ?? []; // [{x, y, pressure}]
      this.smooth = opts.smooth ?? true;
    }
  }

  class RectElement extends CanvasElement {
    constructor(opts = {}) {
      super('rect', opts);
      this.x      = opts.x      ?? 0;
      this.y      = opts.y      ?? 0;
      this.width  = opts.width  ?? 100;
      this.height = opts.height ?? 60;
      this.rx     = opts.rx     ?? 0;    // border radius
    }
  }

  class CircleElement extends CanvasElement {
    constructor(opts = {}) {
      super('circle', opts);
      this.cx = opts.cx ?? 0;
      this.cy = opts.cy ?? 0;
      this.rx = opts.rx ?? 50;
      this.ry = opts.ry ?? 50;
    }
  }

  class LineElement extends CanvasElement {
    constructor(opts = {}) {
      super('line', opts);
      this.x1 = opts.x1 ?? 0;
      this.y1 = opts.y1 ?? 0;
      this.x2 = opts.x2 ?? 100;
      this.y2 = opts.y2 ?? 100;
    }
  }

  class ArrowElement extends LineElement {
    constructor(opts = {}) {
      super(opts);
      this.type      = 'arrow';
      this.headStart = opts.headStart ?? false;
      this.headEnd   = opts.headEnd   ?? true;
    }
  }

  class TextElement extends CanvasElement {
    constructor(opts = {}) {
      super('text', opts);
      this.text       = opts.text       ?? '';
      this.fontSize   = opts.fontSize   ?? State.fontSize;
      this.fontFamily = opts.fontFamily ?? State.fontFamily;
      this.fontBold   = opts.fontBold   ?? false;
      this.fontItalic = opts.fontItalic ?? false;
      this.align      = opts.align      ?? 'left';
      this.width      = opts.width      ?? 200;
    }
  }

  class ImageElement extends CanvasElement {
    constructor(opts = {}) {
      super('image', opts);
      this.src    = opts.src    ?? '';
      this.width  = opts.width  ?? 200;
      this.height = opts.height ?? 150;
      this._img   = null;
    }
  }


  // ──────────────────────────────────────────────────────────
  // 2. CANVAS MANAGER
  // ──────────────────────────────────────────────────────────

  const Canvas = {
    _canvas:   null,
    _ctx:      null,
    _raf:      null,
    _dirty:    true,
    _paused:   false,

    init(canvasEl) {
      if (!canvasEl) return;
      if (canvasEl.dataset.pdCanvasInited === 'true') return;
      canvasEl.dataset.pdCanvasInited = 'true';
      this._canvas = canvasEl;
      this._ctx    = canvasEl.getContext('2d');

      this._resize();
      window.addEventListener('resize', () => { this._resize(); this._dirty = true; });

      this._bindPointer();
      this._bindKeyboard();
      this._bindWheel();

      // Pause expensive render loop when tab is hidden
      if (!document.documentElement.dataset.pdCanvasVisBound) {
        document.documentElement.dataset.pdCanvasVisBound = 'true';
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) this._pause();
          else this._resume();
        });
      }

      this._loop();
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

      // Background
      ctx.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue('--canvas-bg') ?? '#1e1e2e';
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
        const { x = 0, y = 0, rotation = 0, scaleX = 1, scaleY = 1 } = el.transform;
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
        font       = '14px Inter, sans-serif',
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

      ctx.font         = font;
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
      if (!src) return;

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
        this._scheduleRender();
      };

      if (this._imageCache.has(src)) {
        render(this._imageCache.get(src));
      } else {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          this._imageCache.set(src, img);
          render(img);
        };
        img.onerror = () => console.warn(`[CanvasRenderer] Failed to load image: ${src}`);
        img.src = src;
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
        animated      = false,
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
      // Called after async operations (image loads) to re-render
      if (this._renderPending) return;
      this._renderPending = true;
      requestAnimationFrame(() => {
        this._renderPending = false;
        this.render();
      });
    },

  };

  window.PlasmaDeck = window.PlasmaDeck ?? {};
  window.PlasmaDeck.Canvas = Canvas;
})();