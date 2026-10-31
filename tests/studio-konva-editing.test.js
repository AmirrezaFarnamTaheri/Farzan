import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import Konva from 'konva';
import { translateKonvaV1Element, createKonvaV1MoveSession } from '../src/features/studioKonvaEditing.js';

const fixture = () => ({
  version: 1, tool: 'select',
  viewport: { offsetX: 30, offsetY: -10, zoom: 1.5, rotation: 0 },
  grid: { enabled: false, size: 24 },
  metadata: { courseId: 'cardiology' },
  layers: [{
    id: 'layer-1', name: 'Diagrams', visible: true, locked: false, opacity: 0.8,
    elements: [
      { id: 'rect', type: 'rect', x: 200, y: 150, width: -100, height: -40, fill: '#aaa' },
      { id: 'circle', type: 'circle', x: 50, y: 60, radius: 10 },
      { id: 'line', type: 'line', x1: 1, y1: 2, x2: 11, y2: 22 },
      { id: 'legacy-line', type: 'line', x1: 3, y1: 4, width: 5, height: 6 },
      { id: 'pen', type: 'polyline', points: [[0, 0], [1, 2], [3, 4]] },
      { id: 'polygon', type: 'polygon', points: [[0, 0], [10, 0], [5, 10]] },
      { id: 'text', type: 'text', x: 20, y: 40, text: 'فیزیولوژی قلب', fontSize: 18 },
    ],
  }],
});

describe('Konva editing geometry to canonical board-v1 commands', () => {
  beforeEach(() => {
    vi.spyOn(Konva.Util, 'isCanvasFarblingActive').mockReturnValue(false);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      save: vi.fn(), restore: vi.fn(), measureText: value => ({
        width: String(value).length * 10, actualBoundingBoxAscent: 8,
        actualBoundingBoxDescent: 2,
      }),
    }));
  });
  afterEach(() => vi.restoreAllMocks());

  it('translates only selected shape coordinates, retaining signed dimensions and other layers unchanged', () => {
    const source = fixture(), original = structuredClone(source);
    const next = translateKonvaV1Element(source, 'rect', -7, 5);
    expect(next.layers[0].elements[0]).toEqual({
      ...source.layers[0].elements[0], x: 193, y: 155,
    });
    expect(next.layers[0].elements.slice(1)).toEqual(source.layers[0].elements.slice(1));
    expect(next.metadata).toEqual({ courseId: 'cardiology' });
    expect(source).toEqual(original);
  });

  it('moves line endpoints or legacy x/width endpoints together without changing stroke or style metadata', () => {
    const board = fixture();
    const line = translateKonvaV1Element(board, 'line', 8, -3).layers[0].elements[2];
    expect([line.x1, line.y1, line.x2, line.y2]).toEqual([9, -1, 19, 19]);
    const legacy = translateKonvaV1Element(board, 'legacy-line', 8, -3).layers[0].elements[3];
    expect(legacy).toMatchObject({ x1: 11, y1: 1, x: 8, y: -3, width: 5, height: 6 });
  });

  it('translates every pen and polygon vertex without destroying shapes, layer order, or the original source', () => {
    const board = fixture();
    const pen = translateKonvaV1Element(board, 'pen', -3, 7).layers[0].elements[4];
    expect(pen.points).toEqual([[-3, 7], [-2, 9], [0, 11]]);
    const polygon = translateKonvaV1Element(board, 'polygon', 5, 6).layers[0].elements[5];
    expect(polygon.points).toEqual([[5, 6], [15, 6], [10, 16]]);
    expect(board.layers[0].elements[4].points).toEqual([[0, 0], [1, 2], [3, 4]]);
  });

  it.each([
    ['locked layer', board => { board.layers[0].locked = true; }],
    ['hidden layer', board => { board.layers[0].visible = false; }],
    ['unknown shape metadata', board => { board.layers[0].elements[0].shadow = '#555'; }],
    ['duplicated ID', board => { board.layers[0].elements[1].id = 'rect'; }],
  ])('rejects %s without mutating a board', (_label, mutate) => {
    const board = fixture();
    mutate(board);
    const snapshot = structuredClone(board);
    expect(() => translateKonvaV1Element(board, 'rect', 4, 4)).toThrow();
    expect(board).toEqual(snapshot);
  });

  it('rejects nonexistent elements, nonsensical and overflowing deltas', () => {
    const board = fixture();
    expect(() => translateKonvaV1Element(board, 'not-found', 1, 1)).toThrow(/not found/i);
    for (const delta of [Infinity, NaN, '3', null]) {
      expect(() => translateKonvaV1Element(board, 'rect', delta, 1)).toThrow(/delta/i);
    }
    const extreme = fixture();
    extreme.layers[0].elements[0].x = Number.MAX_VALUE;
    expect(() => translateKonvaV1Element(extreme, 'rect', Number.MAX_VALUE, 1)).toThrow();
  });

  it('selects and commits through Konva drag events, serializing accepted board changes', async () => {
    const changes = [], selection = [];
    const session = createKonvaV1MoveSession({
      board: fixture(),
      onChange: async next => { changes.push(structuredClone(next)); return true; },
      onSelect: id => selection.push(id),
    });
    const node = new Konva.Rect({ id: 'rect', x: 100, y: 110, width: 100, height: 40 });
    const release = session.bind(node, 'rect');
    expect(node.draggable()).toBe(true);
    node.fire('click');
    expect(selection).toEqual(['rect']);
    node.fire('dragstart');
    node.position({ x: 108, y: 115 });
    node.fire('dragend');
    await session.flush();
    expect(changes).toHaveLength(1);
    expect(session.getBoard().layers[0].elements[0]).toMatchObject({ x: 208, y: 155, width: -100 });
    expect(changes[0].layers[0].elements[0].x).toBe(208);
    release();
    node.destroy();
  });

  it('undoes and redoes canonical moves only after confirmed writes, preserving every saved field', async () => {
    const records = [];
    const start = fixture();
    const session = createKonvaV1MoveSession({
      board: start,
      onChange: async next => { records.push(structuredClone(next)); return true; },
    });
    expect(session.canUndo()).toBe(false);
    expect(await session.undo()).toBe(false);
    expect(records).toHaveLength(0);
    await session.commit('rect', 12, -4);
    await session.commit('circle', 0, 8);
    expect(session.canUndo()).toBe(true);
    const moved = session.getBoard();
    expect(moved.layers[0].elements[0].x).toBe(212);
    expect(moved.layers[0].elements[1].y).toBe(68);
    const undone = await session.undo();
    expect(undone.layers[0].elements[0].x).toBe(212);
    expect(undone.layers[0].elements[1].y).toBe(60);
    expect(undone.metadata).toEqual(start.metadata);
    expect(session.canRedo()).toBe(true);
    const redone = await session.redo();
    expect(redone).toEqual(moved);
    expect(records.at(-1)).toEqual(moved);
    expect(start).toEqual(fixture());
  });

  it('clears redo only after a newly confirmed move and caps stored undo snapshots', async () => {
    const session = createKonvaV1MoveSession({
      board: fixture(), historyLimit: 2,
      onChange: async () => true,
    });
    await session.commit('circle', 1, 0);
    await session.commit('circle', 1, 0);
    await session.undo();
    expect(session.canRedo()).toBe(true);
    await session.commit('circle', 0, 3);
    expect(session.canRedo()).toBe(false);
    expect(await session.redo()).toBe(false);
    await session.commit('circle', 1, 0);
    await session.commit('circle', 1, 0);
    expect(await session.undo()).toMatchObject({ version: 1 });
    expect(await session.undo()).toMatchObject({ version: 1 });
    expect(await session.undo()).toBe(false);
  });

  it('retains the current board and undo history if an undo/redo write is refused', async () => {
    let canWrite = true;
    const session = createKonvaV1MoveSession({
      board: fixture(), onChange: async () => canWrite,
    });
    await session.commit('rect', 5, 7);
    const moved = session.getBoard();
    canWrite = false;
    await expect(session.undo()).rejects.toThrow(/acknowledge/i);
    expect(session.getBoard()).toEqual(moved);
    expect(session.canUndo()).toBe(true);
    expect(session.canRedo()).toBe(false);
    canWrite = true;
    await session.undo();
    expect(session.getBoard()).toEqual(fixture());
    canWrite = false;
    await expect(session.redo()).rejects.toThrow(/acknowledge/i);
    expect(session.getBoard()).toEqual(fixture());
    canWrite = true;
    expect(await session.redo()).toEqual(moved);
  });

  it('restores immutable snapshots after concurrent queued moves with a stable flush receipt', async () => {
    const session = createKonvaV1MoveSession({
      board: fixture(),
      onChange: async () => true,
    });
    const left = session.commit('rect', 2, 0);
    const right = session.commit('rect', 3, 0);
    await Promise.all([left, right]);
    expect(await session.flush()).toEqual(session.getBoard());
    expect(session.getBoard().layers[0].elements[0].x).toBe(205);
    const snapshot = session.getBoard();
    snapshot.layers[0].elements[0].x = 0;
    expect(session.getBoard().layers[0].elements[0].x).toBe(205);
    await session.undo();
    expect(session.getBoard().layers[0].elements[0].x).toBe(202);
  });

  it('restores node position and saved board if a write rejects or refuses acknowledgement', async () => {
    const failure = vi.fn(async () => { throw new Error('storage full'); });
    const session = createKonvaV1MoveSession({ board: fixture(), onChange: failure });
    const node = new Konva.Circle({ id: 'circle', x: 50, y: 60, radius: 10 });
    session.bind(node, 'circle');
    node.fire('dragstart');
    node.position({ x: 80, y: 95 });
    node.fire('dragend');
    await expect(session.flush()).rejects.toThrow(/storage full/);
    expect([node.x(), node.y()]).toEqual([50, 60]);
    expect(session.getBoard()).toEqual(fixture());
    node.destroy();

    const reject = createKonvaV1MoveSession({ board: fixture(), onChange: async () => false });
    const other = new Konva.Circle({ id: 'circle', x: 50, y: 60, radius: 10 });
    reject.bind(other, 'circle');
    other.fire('dragstart');
    other.position({ x: 60, y: 80 });
    other.fire('dragend');
    await expect(reject.flush()).rejects.toThrow(/acknowledge/i);
    expect(reject.getBoard()).toEqual(fixture());
    other.destroy();
  });
});
