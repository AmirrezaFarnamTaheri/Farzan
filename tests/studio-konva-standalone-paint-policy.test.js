import { describe, expect, it } from 'vitest';
import { planKonvaV1Board } from '../src/features/studioKonvaAdapter.js';
import { exportKonvaV1DraftSVG } from '../src/features/studioKonvaPortability.js';

const boardWith = (paint, field = 'fill') => ({
  version: 1,
  layers: [{
    id: 'layer-1', visible: true, locked: false,
    elements: [{
      id: 'painted', type: 'rect', x: -20, y: 8, width: 35, height: 24,
      [field]: paint,
    }],
  }],
});

describe('Studio v1 standalone paint has one fail-closed renderer/export policy (#172)', () => {
  it.each([
    ['missing RGB channels', 'rgb(,,,)'],
    ['out-of-range red channel', 'rgb(999, 0, 0)'],
    ['out-of-range alpha', 'rgba(18, 52, 86, 2)'],
    ['missing HSL saturation', 'hsl(20,,50%)'],
    ['out-of-range HSL alpha percent', 'hsla(120, 100%, 50%, 120%)'],
  ])('rejects %s before rendering or SVG export without touching the board', (_name, paint) => {
    for (const field of ['fill', 'stroke']) {
      const board = boardWith(paint, field);
      const source = structuredClone(board);
      expect(planKonvaV1Board(board)).toMatchObject({
        compatible: false, reason: expect.stringMatching(/invalid|unsupported/i),
      });
      expect(() => exportKonvaV1DraftSVG(board)).toThrow(/invalid|unsupported|paint/i);
      expect(board).toEqual(source);
    }
  });

  it.each([
    ['hex', '#abc'],
    ['alpha hex', '#aabbccdd'],
    ['named color', 'rebeccapurple'],
    ['RGB', 'rgb(18, 52, 86)'],
    ['RGBA', 'rgba(18, 52, 86, 0.5)'],
    ['HSL', 'hsl(180, 50%, 50%)'],
    ['HSLA', 'hsla(180, 50%, 50%, 0.5)'],
  ])('allows valid standalone %s consistently through render plan and SVG', (_name, paint) => {
    const board = boardWith(paint);
    const original = structuredClone(board);
    const plan = planKonvaV1Board(board);
    expect(plan.compatible).toBe(true);
    expect(plan.layers[0].elements[0].attrs.fill).toBe(paint);
    const svg = exportKonvaV1DraftSVG(board);
    expect(svg).toContain('fill="' + paint + '"');
    expect(board).toEqual(original);
  });

  it('maps explicit no-stroke as no Konva stroke and no SVG stroke without changing canonical data', () => {
    const board = boardWith('none', 'stroke');
    const original = structuredClone(board);
    const plan = planKonvaV1Board(board);
    expect(plan.compatible).toBe(true);
    expect(plan.layers[0].elements[0].attrs.stroke).toBeUndefined();
    expect(exportKonvaV1DraftSVG(board)).toContain('stroke="none"');
    expect(board).toEqual(original);
  });
});
