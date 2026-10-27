import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import Konva from 'konva';
import { planKonvaV1Board, buildKonvaNodes } from '../src/features/studioKonvaAdapter.js';

function fixture() {
  return {
    version: 1, tool: 'select',
    viewport: { offsetX: 32, offsetY: -16, zoom: 1.5, rotation: 0 },
    grid: { enabled: false, size: 24 },
    layers: [{
      id: 'layer-1', name: 'Medicine', visible: true, locked: false, opacity: 0.9,
      elements: [
        { id: 'card', type: 'roundRect', x: 80, y: 90, width: 250, height: 160,
          radius: 12, fill: '#123456', stroke: '#ffffff', strokeWidth: 2 },
        { id: 'heart', type: 'circle', x: 210, y: 180, radius: 32, fill: '#ff0000' },
        { id: 'arrow', type: 'arrow', x1: 110, y1: 100, x2: 215, y2: 175,
          headSize: 14, stroke: '#eeeeee', strokeWidth: 3 },
        { id: 'label', type: 'text', x: 110, y: 210, text: 'فیزیولوژی قلب 你好世界',
          fill: '#ffffff', fontSize: 22, fontFamily: 'Inter' },
        { id: 'pen', type: 'polyline', points: [[10, 20], [20, 40], [30, 55]],
          stroke: '#00ff00', strokeWidth: 2 },
      ],
    }],
  };
}

describe('Konva sidecar for canonical Studio v1 board documents', () => {
  // jsdom has no real Canvas2D context. Konva 10 probes canvas farbling
  // during shape construction; that browser fingerprinting probe is unrelated
  // to our geometry/serialization tests, so only stub that specific probe.
  beforeEach(() => {
    vi.spyOn(Konva.Util, 'isCanvasFarblingActive').mockReturnValue(false);
    // Konva.Text measures glyphs synchronously through a Canvas2D context.
    // jsdom deliberately does not implement Canvas2D, so supply a deterministic
    // *measurement-only* fake. Real rasterization is covered by browser QA.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      save: vi.fn(), restore: vi.fn(), measureText: text => ({
        width: String(text).length * 10,
        actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2,
      }),
    }));
  });
  afterEach(() => vi.restoreAllMocks());
  it('maps legacy shapes/viewport into Konva primitives without mutating any saved board property', () => {
    const board = fixture();
    const original = structuredClone(board);
    const plan = planKonvaV1Board(board);
    expect(plan).toMatchObject({ compatible: true, viewport: { x: 32, y: -16, zoom: 1.5 } });
    expect(plan.layers).toHaveLength(1);
    const nodes = buildKonvaNodes(plan.layers[0]);
    expect(nodes.map(node => node.getClassName()))
      .toEqual(['Rect', 'Circle', 'Arrow', 'Text', 'Line']);
    expect(nodes.map(node => node.id())).toEqual(['card', 'heart', 'arrow', 'label', 'pen']);
    expect(nodes[0].cornerRadius()).toBe(12);
    expect(nodes[2].points()).toEqual([110, 100, 215, 175]);
    expect(nodes[3].text()).toContain('你好世界');
    expect(nodes[4].points()).toEqual([10, 20, 20, 40, 30, 55]);
    expect(board).toEqual(original);
    for (const node of nodes) node.destroy();
  });

  it('maps original ellipse radii, rotation and native line default strokes', () => {
    const board = fixture();
    board.layers[0].elements = [
      { id: 'ellipse-1', type: 'ellipse', x: 95, y: 135,
        radiusX: 70, radiusY: 25, rotation: 15, fill: '#aabbcc' },
      { id: 'line-1', type: 'line', x1: 0, y1: 10, x2: 50, y2: 70 },
      { id: 'pen-1', type: 'polyline', points: [[0, 0], [25, 25]] },
    ];
    const plan = planKonvaV1Board(board);
    expect(plan.compatible).toBe(true);
    const nodes = buildKonvaNodes(plan.layers[0]);
    try {
      expect([nodes[0].radiusX(), nodes[0].radiusY(), nodes[0].rotation()])
        .toEqual([70, 25, 15]);
      expect(nodes[1].stroke()).toBe('#fff');
      expect(nodes[2].stroke()).toBe('#fff');
    } finally { for (const node of nodes) node.destroy(); }
  });

  it('renders canonical closed polygons with the original points and fill style', () => {
    const board = fixture();
    board.layers[0].elements = [
      { id: 'triangle', type: 'polygon', points: [[20, 20], [120, 30], [50, 90]],
        fill: '#aabbcc', stroke: '#123456', strokeWidth: 2 },
    ];
    const original = structuredClone(board);
    const plan = planKonvaV1Board(board);
    expect(plan.compatible).toBe(true);
    const [node] = buildKonvaNodes(plan.layers[0]);
    expect(node.getClassName()).toBe('Line');
    expect(node.points()).toEqual([20, 20, 120, 30, 50, 90]);
    expect(node.closed()).toBe(true);
    expect(node.fill()).toBe('#aabbcc');
    expect(board).toEqual(original);
    node.destroy();
  });

  it('retains negative-dimension rectangles visually without rewriting their signed source geometry', () => {
    const board = fixture();
    board.layers[0].elements = [{ id: 'negative', type: 'rect', x: 200, y: 150,
      width: -100, height: -40, fill: '#ddd' }];
    const plan = planKonvaV1Board(board);
    const [shape] = buildKonvaNodes(plan.layers[0]);
    expect([shape.x(), shape.y(), shape.width(), shape.height()]).toEqual([100, 110, 100, 40]);
    expect(board.layers[0].elements[0].width).toBe(-100);
    shape.destroy();
  });

  it.each([
    ['old version', { version: 2, layers: [] }],
    ['remote image', { version: 1, layers: [{ id: 'x', elements: [{ type: 'image', src: 'https://example.org/x.png' }] }] }],
    ['unknown shape', { version: 1, layers: [{ id: 'x', elements: [{ type: 'gauge' }] }] }],
    ['nested group', { version: 1, layers: [{ id: 'x', elements: [{ type: 'group', children: [] }] }] }],
    ['rotated element', { version: 1, layers: [{ id: 'x', elements: [{ type: 'rect', transform: { rotation: 45 } }] }] }],
    ['metadata link', { version: 1, layers: [{ id: 'x', elements: [{ type: 'text', linkTarget: 'note-2' }] }] }],
    ['grid', { version: 1, grid: { enabled: true }, layers: [] }],
  ])('refuses unsupported %s before constructing a partial scene', (_label, board) => {
    const result = planKonvaV1Board(board);
    expect(result.compatible).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('maps the canonical Canvas2D ellipse radii and rotation without altering original coordinates', () => {
    const board = fixture();
    board.layers[0].elements = [{ id: 'elliptical', type: 'ellipse', x: 140, y: 160,
      radiusX: 60, radiusY: 25, rotation: 27, fill: '#8899aa', strokeWidth: 1 }];
    const preserved = structuredClone(board);
    const plan = planKonvaV1Board(board);
    expect(plan.compatible).toBe(true);
    const [node] = buildKonvaNodes(plan.layers[0]);
    expect(node.getClassName()).toBe('Ellipse');
    expect([node.x(), node.y(), node.radiusX(), node.radiusY(), node.rotation(), node.strokeWidth()])
      .toEqual([140, 160, 60, 25, 27, 1]);
    expect(board).toEqual(preserved);
    node.destroy();
  });

  it.each([
    ['round rectangle label', { id: 'labelled', type: 'roundRect', x: 20, y: 30,
      width: 160, height: 90, text: 'Original shape label' }],
    ['unsupported line dashes', { id: 'dashed', type: 'line', x1: 0, y1: 0, x2: 100, y2: 10,
      dash: [5, 3] }],
    ['wrapped text', { id: 'wrapped', type: 'text', x: 30, y: 60, text: 'العربية 你好',
      wrap: true, wrapWidth: 120 }],
  ])('refuses silent visual loss for %s', (_label, element) => {
    const board = fixture();
    board.layers[0].elements = [element];
    expect(planKonvaV1Board(board).compatible).toBe(false);
  });

  it('preserves locked/hidden layer visibility and opacity attributes in the plan', () => {
    const board = fixture();
    board.layers[0].visible = false;
    board.layers[0].locked = true;
    const plan = planKonvaV1Board(board);
    expect(plan.layers[0]).toMatchObject({ visible: false, locked: true, opacity: 0.9 });
  });
});
