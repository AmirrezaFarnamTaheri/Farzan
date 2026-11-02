import { describe, expect, it } from 'vitest';
import { exportKonvaV1DraftSVG } from '../src/features/studioKonvaPortability.js';

const fixture = () => ({
  version: 1,
  viewport: { offsetX: 28, offsetY: -18, zoom: 1.5, rotation: 0 },
  grid: { enabled: false },
  activeLayerIdx: 0,
  layers: [
    { id: 'visible', name: 'Visible', visible: true, locked: true, opacity: 0.8,
      elements: [
        { id: 'negative', type: 'rect', x: 90, y: 80, width: -35, height: -15,
          fill: '#aabbcc', stroke: '#123456', strokeWidth: 2 },
        { id: 'circle', type: 'circle', x: -15, y: 20, radius: 12, fill: '#eeeeee' },
        { id: 'rotated', type: 'ellipse', x: 55, y: 60, radiusX: 22, radiusY: 9,
          rotation: 30, fill: '#00ffaa' },
        { id: 'arrow', type: 'arrow', x1: 0, y1: 0, x2: 20, y2: 20,
          headSize: 6, stroke: '#ff0011', strokeWidth: 2 },
        { id: 'polyline', type: 'polyline', points: [[0, 0], [5, 10], [9, 2]],
          stroke: '#765432', strokeWidth: 2 },
        { id: 'poly', type: 'polygon', points: [[3, 4], [6, 7], [8, 4]], fill: '#123abc' },
        { id: 'mixed-script', type: 'text', x: 50, y: 100,
          text: 'Heart & <script>alert(1)</script> قلب 你好',
          fontFamily: 'Inter', fontSize: 18, fill: '#112233' },
      ],
    },
    { id: 'hidden', name: 'Private', visible: false, locked: true,
      elements: [{ id: 'not-exported', type: 'rect', x: 0, y: 0,
        width: 50, height: 50, fill: '#ff0000' }],
    },
  ],
});

describe('Konva canonical board-v1 viewport SVG preview (#172)', () => {
  it('exports only visible mapped geometry with viewport transform and escaped multilingual text', () => {
    const board = fixture();
    const before = structuredClone(board);
    const svg = exportKonvaV1DraftSVG(board, { width: 760, height: 440 });
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 760 440"');
    expect(svg).toContain('transform="translate(28 -18) scale(1.5)"');
    expect(svg).toContain('opacity="0.8"');
    expect(svg).toContain('<rect');
    expect(svg).toContain('x="55" y="65" width="35" height="15"');
    expect(svg).toContain('<circle');
    expect(svg).toContain('<ellipse');
    expect(svg).toContain('rotate(30 55 60)');
    expect(svg).toContain('<polyline');
    expect(svg).toContain('<polygon');
    expect(svg).toContain('<text');
    expect(svg).toContain('Heart &amp; &lt;script&gt;alert(1)&lt;/script&gt; قلب 你好');
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('not-exported');
    expect(svg).not.toContain('Konva.Stage');
    expect(board).toEqual(before);
  });

  it('rejects external paint URLs, unsupported links and an invalid viewport without mutating source', () => {
    const attack = fixture();
    const before = structuredClone(attack);
    attack.layers[0].elements[0].fill = 'url(https://evil.test/tracker.svg)';
    expect(() => exportKonvaV1DraftSVG(attack)).toThrow(/paint|color|unsupported/i);
    const link = fixture();
    link.layers[0].elements[0].linkTarget = 'https://example.test';
    expect(() => exportKonvaV1DraftSVG(link)).toThrow(/incompatible|unsupported/i);
    const rotated = fixture();
    rotated.viewport.rotation = 45;
    expect(() => exportKonvaV1DraftSVG(rotated)).toThrow(/viewport|incompatible/i);
    expect(before.layers[0].elements[0].fill).toBe('#aabbcc');
  });

  it('enforces bounded viewport dimensions and preview size', () => {
    const board = fixture();
    for (const size of [
      { width: 0, height: 400 }, { width: 500, height: Infinity },
      { width: 50000, height: 400 },
    ]) expect(() => exportKonvaV1DraftSVG(board, size)).toThrow(/size|dimension|viewport/i);
    expect(() => exportKonvaV1DraftSVG(board, { width: 760, height: 440, maxChars: 40 }))
      .toThrow(/size|limit/i);
  });
});
