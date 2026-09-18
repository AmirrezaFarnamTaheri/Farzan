import { beforeEach, describe, expect, it, vi } from 'vitest';

// `ocd_studio_board` is restored by up to three async readers — the canvas's
// own restoreBoard() from init(), the Studio route's mount-time load, and the
// route's refreshFromSync() on a cross-tab message. Before the epoch guard,
// whichever read resolved last won, so a snapshot read *before* a newer change
// could clobber it. These tests pin the invariant: a stale snapshot is dropped.

const boardWith = (ids, viewport = {}) => ({
  version: 1,
  viewport: { offsetX: 10, offsetY: 20, zoom: 1.5, rotation: 0, ...viewport },
  layers: [{
    id: 'layer-1',
    name: 'Layer 1',
    visible: true,
    locked: false,
    elements: ids.map((id) => ({ id, type: 'rect', x: 1, y: 2, width: 3, height: 4 })),
  }],
});

const makeCanvasEl = () => {
  const el = document.createElement('canvas');
  Object.defineProperty(el, 'offsetWidth', { value: 320, configurable: true });
  Object.defineProperty(el, 'offsetHeight', { value: 180, configurable: true });
  return el;
};

// The restore is a promise chain; a bare `await vi.waitFor(...)` can sample the
// board before the chain's microtask runs and pass against the pre-restore
// state. Yielding to the timer queue guarantees the restore settled first.
const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Canvas board restore races', () => {
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

  const elementIds = () =>
    window.OpenCourseDeck.Canvas.serialize().layers
      .flatMap((layer) => layer.elements.map((element) => element.id));

  it('discards a stale board restore when a newer load landed first', async () => {
    const canvas = window.OpenCourseDeck.Canvas;
    let resolveRead;
    window.DB = {
      getSetting: vi.fn(() => new Promise((resolve) => { resolveRead = resolve; })),
      saveSetting: vi.fn(async () => true),
    };

    canvas.init(makeCanvasEl()); // restoreBoard() read is now in flight
    // A newer board commits while that read is still pending.
    canvas.loadState(boardWith(['fresh']));
    resolveRead(boardWith(['stale']));
    // Let the in-flight restore's microtask run before asserting, so the
    // assertion observes the post-restore state (otherwise it would read the
    // pre-restore board and pass vacuously).
    await flushMicrotasks();

    expect(elementIds()).toEqual(['fresh']);
    expect(canvas.boardEpoch()).toBeGreaterThan(0);
  });

  it('discards a stale board restore when the board changed locally mid-read', async () => {
    const canvas = window.OpenCourseDeck.Canvas;
    let resolveRead;
    window.DB = {
      getSetting: vi.fn(() => new Promise((resolve) => { resolveRead = resolve; })),
      saveSetting: vi.fn(async () => true),
    };

    canvas.init(makeCanvasEl()); // restoreBoard() read is now in flight
    // A local programmatic edit lands before the read resolves.
    canvas.addElement({ id: 'local', type: 'rect' });
    resolveRead(boardWith(['stale']));
    await flushMicrotasks();

    expect(elementIds()).toEqual(['local']);
  });

  it('applies one board when two restores of the same key race', async () => {
    const canvas = window.OpenCourseDeck.Canvas;
    const resolvers = [];
    window.DB = {
      getSetting: vi.fn(() => new Promise((resolve) => { resolvers.push(resolve); })),
      saveSetting: vi.fn(async () => true),
    };
    const loadSpy = vi.spyOn(canvas, 'loadState');

    // Two concurrent restores of the same key (canvas init + route mount).
    const first = canvas.restoreBoard();
    const second = canvas.restoreBoard();
    resolvers[0](boardWith(['first']));
    resolvers[1](boardWith(['second']));
    const [firstResult, secondResult] = await Promise.all([first, second]);

    // Exactly one wins; the loser proves its snapshot was stale.
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect([firstResult, secondResult].filter(Boolean)).toHaveLength(1);
    expect(elementIds()).toEqual(['first']);
    // The board that won is the one whose read resolved first, not the one
    // that resolved last — the un-guarded race let the second one clobber it.
    expect(canvas.boardEpoch()).toBe(1);
  });

  it('cancels a pending autosave instead of flushing it over a restored board', async () => {
    vi.useFakeTimers();
    const canvas = window.OpenCourseDeck.Canvas;
    const saved = boardWith(['saved']);
    window.DB = {
      getSetting: vi.fn(async () => saved),
      saveSetting: vi.fn(async () => true),
    };

    canvas.init(makeCanvasEl());
    await canvas.restoreBoard();
    // An interactive change leaves an autosave pending with the outgoing board.
    canvas.addElement({ id: 'outgoing', type: 'rect' });
    canvas._emitInteractiveChange('draw');
    expect(canvas.hasPendingAutosave()).toBe(true);

    const restored = await canvas.restoreBoard();

    expect(restored).toBe(true);
    expect(canvas.hasPendingAutosave()).toBe(false);
    expect(elementIds()).toEqual(['saved']);
    // The cancelled autosave never fires, so the outgoing board is not written
    // back over the restored one.
    window.DB.saveSetting.mockClear();
    await vi.advanceTimersByTimeAsync(5000);
    expect(window.DB.saveSetting).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
