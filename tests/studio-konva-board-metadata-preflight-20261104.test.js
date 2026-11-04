import { describe, expect, it } from 'vitest';
import { planKonvaV1Board } from '../src/features/studioKonvaAdapter.js';

function board() {
  return {
    version: 1,
    viewport: { offsetX: -8, offsetY: 12, zoom: 1.5, rotation: 0 },
    grid: { enabled: false, size: 24 },
    layers: [{ id: 'primary', name: 'Primary', visible: true, elements: [
      { id: 'label', type: 'text', x: 8, y: 20, text: 'قلب Heart 中文' },
    ] }],
  };
}

describe('Konva board-level metadata preflight is fail-closed (#172)', () => {
  it.each([
    ['null grid record', value => { value.grid = null; }, 'invalid-grid-record'],
    ['array grid record', value => { value.grid = []; }, 'invalid-grid-record'],
    ['numeric grid record', value => { value.grid = 24; }, 'invalid-grid-record'],
    ['numeric grid enabled flag', value => { value.grid.enabled = 0; }, 'invalid-grid-enabled'],
    ['text grid enabled flag', value => { value.grid.enabled = 'false'; }, 'invalid-grid-enabled'],
    ['numeric layer name', value => { value.layers[0].name = 12; }, 'invalid-layer-name'],
    ['null layer name', value => { value.layers[0].name = null; }, 'invalid-layer-name'],
    ['object layer name', value => { value.layers[0].name = { label: 'Primary' }; }, 'invalid-layer-name'],
  ])('refuses %s before mounting Konva without rewriting board-v1', (_label, mutate, reason) => {
    const source = board();
    mutate(source);
    const original = structuredClone(source);
    expect(planKonvaV1Board(source)).toEqual({ compatible: false, reason });
    expect(source).toEqual(original);
  });

  it('preserves valid optional layer name and deliberately disabled grid metadata', () => {
    const source = board();
    const original = structuredClone(source);
    const planned = planKonvaV1Board(source);
    expect(planned).toMatchObject({ compatible: true, viewport: { x: -8, y: 12, zoom: 1.5 } });
    expect(planned.layers[0].name).toBe('Primary');
    expect(source).toEqual(original);

    delete source.grid;
    delete source.layers[0].name;
    expect(planKonvaV1Board(source)).toMatchObject({
      compatible: true, layers: [{ name: '' }],
    });
  });
});
