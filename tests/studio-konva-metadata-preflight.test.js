import { describe, expect, it } from 'vitest';
import { planKonvaV1Board } from '../src/features/studioKonvaAdapter.js';

const boardWith = element => ({
  version: 1,
  layers: [{
    id: 'main', name: 'Primary', visible: true, locked: false,
    elements: [element],
  }],
});

describe('Konva board-v1 typography and stroke metadata preflight (#172)', () => {
  it.each([
    ['numeric font family', { id: 't', type: 'text', text: 'قلب Heart 你好', fontFamily: 42 }, 'invalid-element-fontFamily'],
    ['blank font family', { id: 't', type: 'text', text: 'Heart', fontFamily: '' }, 'invalid-element-fontFamily'],
    ['non-string text alignment', { id: 't', type: 'text', text: 'Heart', align: 0 }, 'unsupported-element-align'],
    ['non-string text baseline', { id: 't', type: 'text', text: 'Heart', baseline: 0 }, 'unsupported-element-baseline'],
    ['numeric line cap', { id: 'l', type: 'line', x1: 0, y1: 0, x2: 10, y2: 10, lineCap: 0 }, 'invalid-element-lineCap'],
    ['unknown line cap', { id: 'l', type: 'line', x1: 0, y1: 0, x2: 10, y2: 10, lineCap: 'diamond' }, 'invalid-element-lineCap'],
    ['numeric polyline join', { id: 'p', type: 'polyline', points: [[0, 0], [5, 5]], lineJoin: 0 }, 'invalid-element-lineJoin'],
    ['unknown polyline join', { id: 'p', type: 'polyline', points: [[0, 0], [5, 5]], lineJoin: 'circular' }, 'invalid-element-lineJoin'],
    ['unmapped string dash', { id: 'l', type: 'line', x1: 0, y1: 0, x2: 10, y2: 10, dash: '4,2' }, 'unsupported-element-dash'],
    ['unmapped object dash', { id: 'l', type: 'line', x1: 0, y1: 0, x2: 10, y2: 10, dash: { segments: [4, 2] } }, 'unsupported-element-dash'],
  ])('refuses %s instead of silently changing saved appearance', (_case, element, reason) => {
    const board = boardWith(element);
    const original = structuredClone(board);
    expect(planKonvaV1Board(board)).toEqual({ compatible: false, reason });
    expect(board).toEqual(original);
  });

  it('retains supported font, direction-neutral alignment and stroke enums', () => {
    const board = {
      version: 1,
      layers: [{
        id: 'main', name: 'Primary', elements: [
          { id: 't', type: 'text', text: 'فارسی Heart 中文', fontFamily: 'Noto Sans',
            align: 'left', baseline: 'alphabetic' },
          { id: 'l', type: 'line', x1: 0, y1: 0, x2: 5, y2: 5, lineCap: 'square', dash: [] },
          { id: 'p', type: 'polyline', points: [[0, 0], [5, 5]], lineCap: 'round', lineJoin: 'bevel' },
        ],
      }],
    };
    const original = structuredClone(board);
    const plan = planKonvaV1Board(board);
    expect(plan.compatible).toBe(true);
    expect(plan.layers[0].elements[0].attrs.fontFamily).toBe('Noto Sans');
    expect(plan.layers[0].elements[1].attrs.lineCap).toBe('square');
    expect(plan.layers[0].elements[2].attrs.lineJoin).toBe('bevel');
    expect(board).toEqual(original);
  });
});
