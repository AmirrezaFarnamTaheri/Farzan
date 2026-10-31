import { describe, expect, it } from 'vitest';
import { planKonvaV1Board } from '../src/features/studioKonvaAdapter.js';

const source = () => ({
  version: 1,
  viewport: { offsetX: 12, offsetY: -4, zoom: 1.5, rotation: 0 },
  grid: { enabled: false },
  layers: [{
    id: 'study', visible: true, locked: false, opacity: 0.8,
    elements: [
      { id: 'rect-1', type: 'rect', x: 10, y: 20, width: -40, height: -30,
        opacity: 0.6, fill: '#f00', stroke: '#fff', strokeWidth: 2 },
    ],
  }],
});

const incompatible = [
  ['zero viewport zoom', board => { board.viewport.zoom = 0; }],
  ['negative viewport zoom', board => { board.viewport.zoom = -1; }],
  ['zoom above supported range', board => { board.viewport.zoom = 9; }],
  ['zoom below supported range', board => { board.viewport.zoom = 0.04; }],
  ['negative layer opacity', board => { board.layers[0].opacity = -0.1; }],
  ['layer opacity above one', board => { board.layers[0].opacity = 1.6; }],
  ['text layer opacity', board => { board.layers[0].opacity = '0.7'; }],
  ['null layer opacity', board => { board.layers[0].opacity = null; }],
  ['negative shape opacity', board => { board.layers[0].elements[0].opacity = -0.1; }],
  ['shape opacity above one', board => { board.layers[0].elements[0].opacity = 1.2; }],
  ['negative stroke width', board => { board.layers[0].elements[0].strokeWidth = -2; }],
  ['circle with negative radius', board => {
    board.layers[0].elements = [{ id: 'circle', type: 'circle', x: 10, y: 20, radius: -4 }];
  }],
  ['ellipse with negative radiusX', board => {
    board.layers[0].elements = [{ id: 'ellipse', type: 'ellipse', x: 10, y: 20,
      radiusX: -4, radiusY: 20 }];
  }],
  ['arrow with negative head size', board => {
    board.layers[0].elements = [{ id: 'arrow', type: 'arrow', x1: 1, y1: 2,
      x2: 10, y2: 20, headSize: -6 }];
  }],
  ['polygon with an extra coordinate per point', board => {
    board.layers[0].elements = [{ id: 'polygon', type: 'polygon',
      points: [[0, 0, 7], [100, 0, 7], [50, 50, 7]] }];
  }],
];

describe('Konva v1 strict preflight must never coerce unsupported stored geometry', () => {
  it.each(incompatible)('refuses %s without mutating the imported board', (_label, mutate) => {
    const board = source();
    mutate(board);
    const saved = structuredClone(board);
    const plan = planKonvaV1Board(board);
    expect(plan.compatible).toBe(false);
    expect(plan.reason).toMatch(/invalid|unsupported|range/i);
    expect(board).toEqual(saved);
  });

  it('still preserves signed rectangles, legitimate 0/1 opacity edges and supported zoom limits', () => {
    for (const zoom of [0.1, 1, 4]) {
      for (const opacity of [0, 1]) {
        const board = source();
        board.viewport.zoom = zoom;
        board.layers[0].opacity = opacity;
        board.layers[0].elements[0].opacity = opacity;
        const plan = planKonvaV1Board(board);
        expect(plan.compatible).toBe(true);
        expect(plan.viewport.zoom).toBe(zoom);
        expect(plan.layers[0].opacity).toBe(opacity);
        expect(plan.layers[0].elements[0].attrs.opacity).toBe(opacity);
        expect(board.layers[0].elements[0]).toMatchObject({ width: -40, height: -30 });
      }
    }
  });
});
