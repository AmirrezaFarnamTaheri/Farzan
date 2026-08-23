import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Canvas renderer scheduling', () => {
  let ctx;

  beforeEach(async () => {
    vi.resetModules();
    ctx = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      ellipse: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      closePath: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      setLineDash: vi.fn(),
      measureText: vi.fn(() => ({ width: 20 })),
      fillText: vi.fn(),
      strokeText: vi.fn(),
    };
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx);
    window.requestAnimationFrame = vi.fn(() => 1);
    window.cancelAnimationFrame = vi.fn();
    await import('../canvas.js');
  });

  it('marks the canvas dirty and resumes without calling a missing render method', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'offsetWidth', { value: 320, configurable: true });
    Object.defineProperty(canvas, 'offsetHeight', { value: 180, configurable: true });

    window.OpenCourseDeck.Canvas.init(canvas);
    window.OpenCourseDeck.Canvas._pause();

    expect(() => window.OpenCourseDeck.Canvas._scheduleRender()).not.toThrow();
    expect(window.requestAnimationFrame).toHaveBeenCalled();

    window.OpenCourseDeck.Canvas.destroy();
  });

  it('does not schedule a render every time a cached image is drawn', () => {
    const img = { width: 200, height: 100 };
    const canvas = window.OpenCourseDeck.Canvas;
    const safeSrc = new URL('cached.png', document.baseURI).href;
    canvas._imageCache.set(safeSrc, img);
    canvas._scheduleRender = vi.fn();

    canvas._drawImage(ctx, {
      src: 'cached.png',
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      fit: 'contain',
    });

    expect(ctx.drawImage).toHaveBeenCalled();
    expect(canvas._scheduleRender).not.toHaveBeenCalled();
  });

  it('rejects unsafe image sources before creating a loader', () => {
    const OriginalImage = window.Image;
    const setSrc = vi.fn();
    window.Image = class {
      set src(value) {
        setSrc(value);
      }
    };

    try {
      window.OpenCourseDeck.Canvas._drawImage(ctx, {
        src: 'data:text/html,<script>window.__canvasXss = true</script>',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
      });
    } finally {
      window.Image = OriginalImage;
    }

    expect(setSrc).not.toHaveBeenCalled();
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(window.__canvasXss).toBeUndefined();
  });

  it('delegates canvas image URL validation to the app shell when available', () => {
    const OriginalImage = window.Image;
    const safeImageUrl = vi.fn(() => 'https://cdn.example.test/safe.png');
    const setSrc = vi.fn();
    window.OpenCourseDeck.safeImageUrl = safeImageUrl;
    window.Image = class {
      set src(value) {
        setSrc(value);
      }
    };

    try {
      window.OpenCourseDeck.Canvas._drawImage(ctx, {
        src: 'https://cdn.example.test/raw.png',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
      });
    } finally {
      window.Image = OriginalImage;
      delete window.OpenCourseDeck.safeImageUrl;
    }

    expect(safeImageUrl).toHaveBeenCalledWith('https://cdn.example.test/raw.png');
    expect(setSrc).toHaveBeenCalledWith('https://cdn.example.test/safe.png');
  });

  it('serializes and reloads board state for Studio persistence', () => {
    const canvas = window.OpenCourseDeck.Canvas;

    const loaded = canvas.loadState({
      version: 1,
      viewport: { offsetX: 12, offsetY: -8, zoom: 1.5, rotation: 0 },
      tool: 'rect',
      style: { strokeColor: '#111111', fillColor: '#eeeeee', strokeWidth: 4, opacity: 0.75 },
      grid: { enabled: true, size: 32, snap: true },
      activeLayerIdx: 0,
      layers: [{
        id: 'layer-a',
        name: 'Imported',
        visible: true,
        locked: false,
        elements: [{ id: 'shape-1', type: 'rect', x: 10, y: 20, width: 80, height: 40 }],
      }],
    });

    expect(loaded.viewport.zoom).toBe(1.5);
    expect(loaded.style.strokeColor).toBe('#111111');
    expect(loaded.grid.enabled).toBe(true);
    expect(loaded.layers[0].elements[0]).toEqual(expect.objectContaining({ id: 'shape-1', type: 'rect' }));

    const serialized = canvas.serialize();
    expect(serialized.layers[0].id).toBe('layer-a');
    expect(serialized.layers[0].elements).toHaveLength(1);
  });

  it('can reload synced Studio board state while preserving local viewport, tool, and valid selection', () => {
    const canvas = window.OpenCourseDeck.Canvas;

    canvas.loadState({
      version: 1,
      viewport: { offsetX: 32, offsetY: -16, zoom: 1.75, rotation: 0 },
      tool: 'select',
      layers: [{
        id: 'layer-a',
        name: 'Local',
        visible: true,
        locked: false,
        elements: [],
      }],
    });
    const selected = canvas.addText('Keep selected');
    canvas.loadState({
      version: 1,
      viewport: { offsetX: 0, offsetY: 0, zoom: 0.5, rotation: 0 },
      tool: 'pen',
      layers: [{
        id: 'layer-a',
        name: 'Remote',
        visible: true,
        locked: false,
        elements: [{ id: selected.id, type: 'text', text: 'Remote text', x: 10, y: 20 }],
      }],
    }, {
      preserveSelection: true,
      preserveTool: true,
      preserveViewport: true,
    });

    expect(canvas.getState()).toEqual(expect.objectContaining({
      tool: 'select',
      zoom: 1.75,
      offsetX: 32,
      offsetY: -16,
      selectedIds: [selected.id],
    }));
    expect(canvas.serialize().layers[0].elements[0]).toEqual(expect.objectContaining({
      id: selected.id,
      text: 'Remote text',
    }));
  });

  it('adds Studio text and card elements, then clears board elements', () => {
    const canvas = window.OpenCourseDeck.Canvas;

    const text = canvas.addText('Clinical sketch');
    const card = canvas.addCard({ x: 140, y: 160 });

    let board = canvas.serialize();
    expect(text).toEqual(expect.objectContaining({ type: 'text', text: 'Clinical sketch' }));
    expect(card).toEqual(expect.objectContaining({ type: 'roundRect', x: 140, y: 160 }));
    expect(board.layers[0].elements).toHaveLength(2);

    board = canvas.clearBoard();
    expect(board.layers[0].elements).toEqual([]);
  });

  it('adds Studio shape and image elements with safe image URL validation', () => {
    const canvas = window.OpenCourseDeck.Canvas;

    const rect = canvas.addRectangle({ width: 260 });
    const circle = canvas.addCircle({ radius: 42 });
    const arrow = canvas.addArrow({ x1: 30, y1: 40, x2: 160, y2: 90 });
    const image = canvas.addImage('/assets/og-cover.svg');
    const rejected = canvas.addImage('javascript:alert(1)');

    expect(rect).toEqual(expect.objectContaining({ type: 'rect', width: 260 }));
    expect(circle).toEqual(expect.objectContaining({ type: 'circle', radius: 42 }));
    expect(arrow).toEqual(expect.objectContaining({ type: 'arrow', x: 30, y: 40, x1: 30, y1: 40, x2: 160, y2: 90 }));
    expect(image).toEqual(expect.objectContaining({ type: 'image', fit: 'contain' }));
    expect(image.src).toContain('/assets/og-cover.svg');
    expect(rejected).toBeNull();
    expect(canvas.serialize().layers[0].elements.map((element) => element.type)).toEqual(['rect', 'circle', 'arrow', 'image']);
  });

  it('manages Studio layers and removes elements by id', () => {
    const canvas = window.OpenCourseDeck.Canvas;

    const layer = canvas.addLayer('Second layer');
    expect(layer.name).toBe('Second layer');

    const text = canvas.addText('Layer note');
    let board = canvas.serialize();
    expect(board.activeLayerIdx).toBe(1);
    expect(board.layers[1].elements[0].id).toBe(text.id);

    canvas.setActiveLayer(0);
    board = canvas.serialize();
    expect(board.activeLayerIdx).toBe(0);

    expect(canvas.removeElement(text.id)).toEqual(expect.objectContaining({ id: text.id }));
    expect(canvas.removeLayer(layer.id)).toEqual(expect.objectContaining({ id: layer.id }));
    board = canvas.serialize();
    expect(board.layers).toHaveLength(1);
    expect(board.layers[0].elements).toEqual([]);
  });

  it('updates Studio element properties by id', () => {
    const canvas = window.OpenCourseDeck.Canvas;
    const text = canvas.addText('Before', { width: 120, height: 40 });

    const updated = canvas.updateElement(text.id, {
      text: 'After',
      fill: '#ffffff',
      stroke: '#111111',
      width: 260,
      height: 90,
      strokeWidth: 3,
      linkType: 'note',
      linkTarget: 'note-42',
      linkLabel: 'Clinical pearl',
    });

    expect(updated).toEqual(expect.objectContaining({
      id: text.id,
      text: 'After',
      fill: '#ffffff',
      stroke: '#111111',
      width: 260,
      height: 90,
      strokeWidth: 3,
      linkType: 'note',
      linkTarget: 'note-42',
      linkLabel: 'Clinical pearl',
    }));
  });

  it('draws freehand pen strokes through route-safe pointer events', () => {
    const canvasEl = document.createElement('canvas');
    Object.defineProperty(canvasEl, 'offsetWidth', { value: 320, configurable: true });
    Object.defineProperty(canvasEl, 'offsetHeight', { value: 180, configurable: true });
    canvasEl.getBoundingClientRect = vi.fn(() => ({ left: 0, top: 0, width: 320, height: 180 }));
    const changeSpy = vi.fn();
    canvasEl.addEventListener('ocd:studio-board-change', changeSpy);

    window.OpenCourseDeck.Canvas.loadState({ layers: [{ id: 'layer-1', name: 'Layer 1', visible: true, locked: false, elements: [] }] });
    window.OpenCourseDeck.Canvas.init(canvasEl);
    window.OpenCourseDeck.Canvas.setTool('pen');

    canvasEl.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 20 }));
    canvasEl.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 16, clientY: 26 }));
    canvasEl.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 24, clientY: 32 }));
    canvasEl.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 24, clientY: 32 }));

    const board = window.OpenCourseDeck.Canvas.serialize();
    expect(board.layers[0].elements).toHaveLength(1);
    expect(board.layers[0].elements[0]).toEqual(expect.objectContaining({ type: 'polyline', stroke: '#6366f1' }));
    expect(board.layers[0].elements[0].points.length).toBeGreaterThanOrEqual(3);
    expect(changeSpy).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.objectContaining({ action: 'draw' }) }));

    window.OpenCourseDeck.Canvas.destroy();
  });

  it('selects, drags, zooms, and deletes Studio elements with canvas input', () => {
    const canvasEl = document.createElement('canvas');
    Object.defineProperty(canvasEl, 'offsetWidth', { value: 320, configurable: true });
    Object.defineProperty(canvasEl, 'offsetHeight', { value: 180, configurable: true });
    canvasEl.getBoundingClientRect = vi.fn(() => ({ left: 0, top: 0, width: 320, height: 180 }));

    window.OpenCourseDeck.Canvas.loadState({
      layers: [{
        id: 'layer-1',
        name: 'Layer 1',
        visible: true,
        locked: false,
        elements: [{ id: 'rect-1', type: 'rect', x: 20, y: 20, width: 80, height: 50, fill: '#ffffff' }],
      }],
    });
    window.OpenCourseDeck.Canvas.init(canvasEl);
    window.OpenCourseDeck.Canvas.setTool('select');

    canvasEl.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 30, clientY: 30 }));
    canvasEl.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 45, clientY: 48 }));
    canvasEl.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 45, clientY: 48 }));

    let board = window.OpenCourseDeck.Canvas.serialize();
    expect(board.layers[0].elements[0]).toEqual(expect.objectContaining({ x: 35, y: 38 }));
    expect(window.OpenCourseDeck.Canvas.getState().selectedIds).toEqual(['rect-1']);

    canvasEl.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 100, clientY: 80, deltaY: -100 }));
    expect(window.OpenCourseDeck.Canvas.getState().zoom).toBeGreaterThan(1);

    canvasEl.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Delete' }));
    board = window.OpenCourseDeck.Canvas.serialize();
    expect(board.layers[0].elements).toEqual([]);

    window.OpenCourseDeck.Canvas.destroy();
  });

  it('applies Studio board templates as normalized scenes', () => {
    const canvas = window.OpenCourseDeck.Canvas;

    const studyMap = canvas.applyTemplate('study-map');
    expect(studyMap.layers[0].name).toBe('Study map');
    expect(studyMap.layers[0].elements.map((element) => element.id)).toContain('template-goal');
    expect(studyMap.layers[0].elements.some((element) => element.type === 'arrow')).toBe(true);

    const cornell = canvas.applyTemplate('cornell');
    expect(cornell.layers[0].name).toBe('Cornell notes');
    expect(cornell.layers[0].elements.map((element) => element.id)).toContain('cornell-summary');
    expect(cornell.layers[0].elements.some((element) => element.text === 'Cues / questions')).toBe(true);
  });

  it('exports the rendered Studio canvas as PNG when initialized', () => {
    const canvasEl = document.createElement('canvas');
    Object.defineProperty(canvasEl, 'offsetWidth', { value: 320, configurable: true });
    Object.defineProperty(canvasEl, 'offsetHeight', { value: 180, configurable: true });
    canvasEl.toDataURL = vi.fn(() => 'data:image/png;base64,studio');

    window.OpenCourseDeck.Canvas.init(canvasEl);

    expect(window.OpenCourseDeck.Canvas.exportPNG()).toBe('data:image/png;base64,studio');
    expect(canvasEl.toDataURL).toHaveBeenCalledWith('image/png');

    window.OpenCourseDeck.Canvas.destroy();
  });

  it('exports portable SVG for common Studio scene elements', () => {
    const canvas = window.OpenCourseDeck.Canvas;
    canvas.loadState({
      version: 1,
      viewport: { offsetX: 4, offsetY: 8, zoom: 1 },
      layers: [{
        id: 'layer-svg',
        name: 'SVG Layer',
        visible: true,
        locked: false,
        elements: [
          { id: 'rect-1', type: 'rect', x: 10, y: 20, width: 80, height: 40, fill: '#ffffff', stroke: '#111111', linkType: 'course', linkTarget: 'course-1', linkLabel: 'Cardiology' },
          { id: 'text-1', type: 'text', x: 12, y: 32, text: '<unsafe>', fill: '#222222' },
        ],
      }],
    });

    const svg = canvas.exportSVG({ width: 400, height: 240 });

    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 400 240"');
    expect(svg).toContain('<rect x="10" y="20" width="80" height="40"');
    expect(svg).toContain('data-link-type="course"');
    expect(svg).toContain('data-link-target="course-1"');
    expect(svg).toContain('data-link-label="Cardiology"');
    expect(svg).toContain('&lt;unsafe&gt;');
    expect(svg).not.toContain('<unsafe>');
  });

  it('destroy cancels rendering, removes listeners, and clears canvas ownership', () => {
    const canvasEl = document.createElement('canvas');
    Object.defineProperty(canvasEl, 'offsetWidth', { value: 320, configurable: true });
    Object.defineProperty(canvasEl, 'offsetHeight', { value: 180, configurable: true });
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    window.OpenCourseDeck.Canvas.init(canvasEl);
    expect(canvasEl.dataset.pdCanvasInited).toBe('true');

    window.OpenCourseDeck.Canvas.destroy();

    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function), undefined);
    expect(canvasEl.dataset.pdCanvasInited).toBeUndefined();
    expect(window.OpenCourseDeck.Canvas._canvas).toBeNull();
    expect(window.OpenCourseDeck.Canvas._ctx).toBeNull();
  });
});
