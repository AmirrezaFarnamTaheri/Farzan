import { describe, expect, it } from 'vitest';
import { planKonvaV1Board } from '../src/features/studioKonvaAdapter.js';

function fixture() {
  return {
    version: 1,
    viewport: { offsetX: -8, offsetY: 12, zoom: 1.5, rotation: 0 },
    grid: { enabled: false },
    activeLayerIdx: 0,
    layers: [{
      id: 'protected', visible: true, locked: false, elements: [
        { id: 'mark', type: 'rect', x: -10, y: 12, width: -60, height: 40 },
      ],
    }],
  };
}

describe('Konva imported layer permissions are explicit booleans (#172)', () => {
  it.each([
    ['null visibility', source => { source.layers[0].visible = null; }, 'invalid-layer-visible'],
    ['null edit lock', source => { source.layers[0].locked = null; }, 'invalid-layer-locked'],
    ['null active layer index', source => { source.activeLayerIdx = null; }, 'invalid-active-layer'],
  ])('rejects %s without changing the persisted board', (_name, corrupt, reason) => {
    const original = fixture();
    corrupt(original);
    const unchanged = structuredClone(original);
    expect(planKonvaV1Board(original)).toEqual({ compatible: false, reason });
    expect(original).toEqual(unchanged);
  });

  it('preserves explicit hidden/locked layers and ordinary omitted defaults', () => {
    const source = fixture();
    source.layers[0].visible = false;
    source.layers[0].locked = true;
    const protectedPlan = planKonvaV1Board(source);
    expect(protectedPlan).toMatchObject({
      compatible: true,
      layers: [{ visible: false, locked: true }],
    });
    delete source.layers[0].visible;
    delete source.layers[0].locked;
    delete source.activeLayerIdx;
    const ordinary = planKonvaV1Board(source);
    expect(ordinary).toMatchObject({
      compatible: true,
      layers: [{ visible: true, locked: false }],
    });
  });
});
