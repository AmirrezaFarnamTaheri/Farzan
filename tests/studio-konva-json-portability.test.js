import { describe, expect, it } from 'vitest';
import {
  exportKonvaV1DraftJSON, importKonvaV1DraftJSON,
} from '../src/features/studioKonvaPortability.js';

const representative = () => ({
  version: 1,
  viewport: { offsetX: 15, offsetY: -20, zoom: 1.75, rotation: 0 },
  grid: { enabled: false, size: 24 },
  activeLayerIdx: 0,
  tool: 'select',
  style: { strokeColor: '#123456', strokeWidth: 3 },
  courseMetadata: { source: 'imported', labels: ['فارسی', 'English'] },
  layers: [
    {
      id: 'main', name: 'Mixed RTL study', visible: true, locked: false,
      elements: [
        { id: 'signed', type: 'rect', x: 70, y: 80, width: -55, height: -24, fill: '#abc123' },
        { id: 'ink', type: 'polyline', points: [[1, 2], [3, 5], [9, 11]],
          stroke: '#123456', strokeWidth: 3, lineCap: 'round', lineJoin: 'round', fill: null },
        { id: 'text', type: 'text', x: 30, y: 50, text: 'فیزیولوژی Heart', fontSize: 20 },
      ],
    },
    {
      id: 'protected', name: 'Locked examples', visible: false, locked: true,
      elements: [{ id: 'card', type: 'roundRect', x: 0, y: 0, width: 90, height: 50 }],
    },
  ],
});

describe('isolated Konva draft v1 JSON portability', () => {
  it('round-trips canonical signed geometry, metadata, pen strokes and mixed RTL/Latin text', () => {
    const board = representative(), original = structuredClone(board);
    const json = exportKonvaV1DraftJSON(board);
    expect(JSON.parse(json)).toEqual(original);
    expect(importKonvaV1DraftJSON(json)).toEqual(original);
    expect(board).toEqual(original);
    expect(json).not.toContain('className');
    expect(json).not.toContain('Konva.Stage');
  });

  it('refuses unsupported or malformed imports rather than stripping user data', () => {
    for (const payload of [
      '<script>not a board</script>',
      '{}',
      JSON.stringify({ ...representative(), version: 2 }),
      JSON.stringify({ ...representative(), grid: { enabled: true } }),
      JSON.stringify({ ...representative(), viewport: { rotation: 45, zoom: 1 } }),
      JSON.stringify({ ...representative(), layers: [{
        id: 'main', elements: [{ id: 'link', type: 'rect', x: 1, y: 2,
          width: 40, height: 25, linkTarget: 'https://example.org/' }],
      }] }),
    ]) {
      expect(() => importKonvaV1DraftJSON(payload)).toThrow();
    }
  });

  it('rejects oversize JSON, non-JSON runtime metadata and unrepresentable saved boards', () => {
    const board = representative();
    expect(() => importKonvaV1DraftJSON(JSON.stringify(board), { maxChars: 20 })).toThrow(/size|large/i);
    expect(() => exportKonvaV1DraftJSON(board, { maxChars: 20 })).toThrow(/size|large/i);
    const corrupt = representative();
    corrupt.layers[0].elements[0].width = Infinity;
    expect(() => exportKonvaV1DraftJSON(corrupt)).toThrow(/incompatible|unsupported/i);
    const runtimeValue = representative();
    runtimeValue.courseMetadata.callback = () => {};
    expect(() => exportKonvaV1DraftJSON(runtimeValue)).toThrow(/json|unsupported/i);
  });
});
