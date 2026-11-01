import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import Konva from 'konva';
import * as studioEditing from '../src/features/studioKonvaEditing.js';
const { translateKonvaV1Element, resizeKonvaV1Element, createKonvaV1MoveSession } = studioEditing;

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

describe('Konva draft z-order remains canonical, undoable and failure-safe', () => {
  it('moves one element by one stacking slot within its editable layer, preserving every field', () => {
    const original = fixture();
    const snapshot = structuredClone(original);
    const next = studioEditing.reorderKonvaV1Element(original, 'rect', 'forward');
    expect(next.layers[0].elements.map(item => item.id))
      .toEqual(['circle', 'rect', 'line', 'legacy-line', 'pen', 'polygon', 'text']);
    expect(next.layers[0].elements.find(item => item.id === 'rect')).toEqual(original.layers[0].elements[0]);
    expect(next.metadata).toEqual(original.metadata);
    expect(next.viewport).toEqual(original.viewport);
    expect(original).toEqual(snapshot);
    expect(studioEditing.reorderKonvaV1Element(next, 'rect', 'backward')).toEqual(original);
  });

  it('refuses protected layers, unknown directions and invalid board content without source mutations', () => {
    const board = fixture();
    const before = structuredClone(board);
    expect(() => studioEditing.reorderKonvaV1Element(board, 'rect', 'sideways')).toThrow();
    expect(() => studioEditing.reorderKonvaV1Element(board, 'unknown', 'forward')).toThrow();
    board.layers[0].locked = true;
    expect(() => studioEditing.reorderKonvaV1Element(board, 'rect', 'forward')).toThrow(/locked/i);
    board.layers[0].locked = false;
    board.layers[0].visible = false;
    expect(() => studioEditing.reorderKonvaV1Element(board, 'rect', 'forward')).toThrow(/hidden/i);
    expect({ ...board, layers: [{ ...board.layers[0], locked: false, visible: true }] }).toEqual(before);
  });

  it('queues a committed z-order edit behind durable storage and allows undo/redo without a fake boundary write', async () => {
    const writes = vi.fn(async () => true);
    const session = createKonvaV1MoveSession({ board: fixture(), onChange: writes });
    const first = await session.reorder('rect', 'backward');
    expect(first).toEqual(fixture());
    expect(writes).not.toHaveBeenCalled();
    const changed = await session.reorder('rect', 'forward');
    expect(changed.layers[0].elements.map(item => item.id).slice(0, 3)).toEqual(['circle', 'rect', 'line']);
    expect(writes).toHaveBeenCalledWith(changed);
    expect(session.canUndo()).toBe(true);
    await session.undo();
    expect(session.getBoard()).toEqual(fixture());
    await session.redo();
    expect(session.getBoard()).toEqual(changed);
    writes.mockResolvedValue(false);
    await expect(session.reorder('rect', 'forward')).rejects.toThrow(/acknowledg/i);
    expect(session.getBoard()).toEqual(changed);
    expect(session.canRedo()).toBe(false);
  });
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
  it('resizes a signed-dimension rectangle using Konva display bounds without corrupting the canonical board', () => {
    const source = fixture();
    const original = structuredClone(source);
    const resized = resizeKonvaV1Element(source, 'rect', { x: 90, y: 104, width: 135, height: 60 });
    const shape = resized.layers[0].elements[0];
    expect(shape).toEqual({ ...original.layers[0].elements[0],
      x: 225, y: 164, width: -135, height: -60 });
    expect(resized.layers[0].elements.slice(1)).toEqual(original.layers[0].elements.slice(1));
    expect(resized.metadata).toEqual(original.metadata);
    expect(source).toEqual(original);
  });

  it('preserves card corner radius, style, and positive dimensions when resizing a round rectangle', () => {
    const board = fixture();
    board.layers[0].elements.push({
      id: 'card', type: 'roundRect', x: 2, y: 3,
      width: 40, height: 25, radius: 12, stroke: '#abc', opacity: 0.8,
    });
    const resized = resizeKonvaV1Element(board, 'card', {
      x: 12, y: 18, width: 75, height: 50,
    });
    expect(resized.layers[0].elements.at(-1)).toEqual({
      id: 'card', type: 'roundRect', x: 12, y: 18, width: 75,
      height: 50, radius: 12, stroke: '#abc', opacity: 0.8,
    });
    expect(board.layers[0].elements.at(-1)).toMatchObject({ x: 2, width: 40 });
  });

  it('resizes canonical circles only with uniform positive dimensions while retaining metadata', () => {
    const board = fixture();
    const unchanged = structuredClone(board);
    const changed = resizeKonvaV1Element(board, 'circle', {
      x: 25, y: 30, width: 50, height: 50,
    });
    expect(changed.layers[0].elements[1]).toEqual({
      ...unchanged.layers[0].elements[1], x: 50, y: 55, radius: 25,
    });
    expect(changed.layers[0].elements.filter(x => x.id !== 'circle'))
      .toEqual(unchanged.layers[0].elements.filter(x => x.id !== 'circle'));
    expect(changed.viewport).toEqual(unchanged.viewport);
    expect(changed.metadata).toEqual(unchanged.metadata);
    expect(board).toEqual(unchanged);
    for (const bounds of [
      { x: 25, y: 30, width: 50, height: 51 },
      { x: 25, y: 30, width: -50, height: -50 },
      { x: 25, y: 30, width: 50, height: Infinity },
    ]) {
      expect(() => resizeKonvaV1Element(board, 'circle', bounds)).toThrow();
    }
    expect(board).toEqual(unchanged);
  });

  it('applies uniform Konva circle transforms only after an acknowledged canonical save', async () => {
    let accepted = true;
    const writes = [];
    const session = createKonvaV1MoveSession({
      board: fixture(), onChange: async next => {
        writes.push(structuredClone(next));
        return accepted;
      },
    });
    const node = new Konva.Circle({ id: 'circle', x: 50, y: 60, radius: 10 });
    session.bind(node, 'circle');
    node.fire('transformstart');
    node.position({ x: 55, y: 65 });
    node.scale({ x: 1.5, y: 1.5 });
    node.fire('transformend');
    await session.flush();
    expect(session.getBoard().layers[0].elements[1]).toMatchObject({
      x: 55, y: 65, radius: 15,
    });
    expect([node.x(), node.y(), node.radius(), node.scaleX(), node.scaleY()])
      .toEqual([55, 65, 15, 1, 1]);
    expect(writes).toHaveLength(1);
    await session.undo();
    expect(session.getBoard()).toEqual(fixture());
    await session.redo();
    expect(session.getBoard().layers[0].elements[1].radius).toBe(15);

    accepted = false;
    node.fire('transformstart');
    node.scale({ x: 1.2, y: 1.2 });
    node.fire('transformend');
    await expect(session.flush()).rejects.toThrow(/acknowledge/i);
    expect(session.getBoard().layers[0].elements[1].radius).toBe(15);
    expect([node.radius(), node.scaleX(), node.scaleY()]).toEqual([15, 1, 1]);
    node.destroy();
  });

  it('refuses unsafe, nonfinite, flipped, zero-sized, or unsupported shape resizes without mutating input', () => {
    const board = fixture();
    const original = structuredClone(board);
    for (const bounds of [
      { x: NaN, y: 0, width: 50, height: 40 },
      { x: 5, y: 2, width: -20, height: 40 },
      { x: 5, y: 2, width: 20, height: 0 },
      { x: 5, y: 2, width: Infinity, height: 40 },
      { x: Number.MAX_VALUE, y: 2, width: Number.MAX_VALUE, height: 40 },
    ]) {
      expect(() => resizeKonvaV1Element(board, 'rect', bounds)).toThrow();
    }
    expect(() => resizeKonvaV1Element(board, 'line', {
      x: 4, y: 5, width: 25, height: 25,
    })).toThrow(/unsupported/i);
    board.layers[0].locked = true;
    expect(() => resizeKonvaV1Element(board, 'rect', {
      x: 1, y: 1, width: 20, height: 30,
    })).toThrow(/locked/i);
    board.layers[0].locked = false;
    expect(board).toEqual(original);
  });

  it('persists canonical resizes and supports undo and redo without Konva JSON', async () => {
    const writes = [];
    const session = createKonvaV1MoveSession({
      board: fixture(),
      onChange: async document => { writes.push(structuredClone(document)); return true; },
    });
    const grown = await session.resize('rect', { x: 90, y: 100, width: 150, height: 90 });
    expect(grown.layers[0].elements[0]).toMatchObject({
      x: 240, y: 190, width: -150, height: -90,
    });
    expect(writes).toHaveLength(1);
    expect(writes[0].version).toBe(1);
    expect(writes[0].layers[0].elements[0]).toEqual(grown.layers[0].elements[0]);
    expect(session.canUndo()).toBe(true);
    expect(await session.undo()).toEqual(fixture());
    expect(session.canRedo()).toBe(true);
    expect(await session.redo()).toEqual(grown);
  });

  it('leaves board and history intact when a resize is not durably acknowledged', async () => {
    let allowed = true;
    const session = createKonvaV1MoveSession({
      board: fixture(), onChange: async () => allowed,
    });
    await session.resize('rect', { x: 90, y: 100, width: 120, height: 40 });
    const saved = session.getBoard();
    allowed = false;
    await expect(session.resize('rect', {
      x: 85, y: 105, width: 120, height: 60,
    })).rejects.toThrow(/acknowledge/i);
    expect(session.getBoard()).toEqual(saved);
    expect(session.canUndo()).toBe(true);
    expect(session.canRedo()).toBe(false);
    allowed = true;
    expect(await session.undo()).toEqual(fixture());
  });

  it('commits actual Konva transform events and normalizes node scale after the accepted save', async () => {
    const writes = [];
    const session = createKonvaV1MoveSession({
      board: fixture(),
      onChange: async b => { writes.push(structuredClone(b)); return true; },
    });
    // The preview mapper normalizes a signed 100x40 rectangle into this
    // positive-size Konva Rect; world viewport zoom belongs to its parent.
    const node = new Konva.Rect({ id: 'rect', x: 100, y: 110, width: 100, height: 40 });
    const release = session.bind(node, 'rect');
    node.fire('transformstart');
    node.position({ x: 90, y: 105 });
    node.scale({ x: 1.3, y: 1.5 });
    node.fire('transformend');
    await session.flush();
    expect(writes).toHaveLength(1);
    expect(session.getBoard().layers[0].elements[0]).toMatchObject({
      x: 220, y: 165, width: -130, height: -60,
    });
    expect([node.x(), node.y(), node.width(), node.height(),
      node.scaleX(), node.scaleY()]).toEqual([90, 105, 130, 60, 1, 1]);
    release();
    node.destroy();
  });

  it('restores Konva geometry after a rejected transform or forbidden flip', async () => {
    const writes = [];
    const session = createKonvaV1MoveSession({
      board: fixture(), onChange: async b => { writes.push(b); return false; },
    });
    const node = new Konva.Rect({ id: 'rect', x: 100, y: 110, width: 100, height: 40 });
    session.bind(node, 'rect');
    node.fire('transformstart');
    node.position({ x: 110, y: 90 });
    node.scale({ x: 1.2, y: 1.4 });
    node.fire('transformend');
    await expect(session.flush()).rejects.toThrow(/acknowledge/i);
    expect([node.x(), node.y(), node.width(), node.height(),
      node.scaleX(), node.scaleY()]).toEqual([100, 110, 100, 40, 1, 1]);
    expect(session.getBoard()).toEqual(fixture());
    expect(session.canUndo()).toBe(false);

    node.fire('transformstart');
    node.scale({ x: -1.1, y: 1 });
    node.fire('transformend');
    await expect(session.flush()).rejects.toThrow(/transform|flip|positive/i);
    expect(writes).toHaveLength(1);
    expect([node.x(), node.y(), node.scaleX(), node.scaleY()]).toEqual([100, 110, 1, 1]);
    expect(session.getBoard()).toEqual(fixture());
    node.destroy();
  });


  it('resizes a rotated canonical ellipse in its local axes without losing metadata', () => {
    const board = fixture();
    board.layers[0].elements.push({
      id: 'ellipse', type: 'ellipse', x: 40, y: 30,
      radiusX: 10, radiusY: 20, rotation: 27, fill: '#123abc', opacity: 0.7,
    });
    const before = structuredClone(board);
    const resized = resizeKonvaV1Element(board, 'ellipse', {
      x: 12, y: 15, width: 50, height: 30,
    });
    expect(resized.layers[0].elements.at(-1)).toEqual({
      ...before.layers[0].elements.at(-1), x: 37, y: 30,
      radiusX: 25, radiusY: 15,
    });
    expect(resized.layers[0].elements.slice(0, -1)).toEqual(before.layers[0].elements.slice(0, -1));
    expect(resized.viewport).toEqual(before.viewport);
    expect(resized.metadata).toEqual(before.metadata);
    expect(board).toEqual(before);
    for (const bounds of [
      { x: 0, y: 0, width: 0, height: 30 },
      { x: 0, y: 0, width: 20, height: -4 },
      { x: 0, y: 0, width: Infinity, height: 30 },
    ]) {
      expect(() => resizeKonvaV1Element(board, 'ellipse', bounds)).toThrow();
    }
    board.layers[0].locked = true;
    expect(() => resizeKonvaV1Element(board, 'ellipse', {
      x: 0, y: 0, width: 20, height: 30,
    })).toThrow(/locked/i);
  });

  it('commits a rotated Konva Ellipse local-axis transform and rejects a rotation change', async () => {
    const board = fixture();
    board.layers[0].elements.push({
      id: 'ellipse', type: 'ellipse', x: 40, y: 30,
      radiusX: 10, radiusY: 20, rotation: 27, fill: '#123abc',
    });
    const changes = [];
    const session = createKonvaV1MoveSession({
      board, onChange: async next => { changes.push(structuredClone(next)); return true; },
    });
    const node = new Konva.Ellipse({
      id: 'ellipse', x: 40, y: 30, radiusX: 10, radiusY: 20, rotation: 27,
    });
    const release = session.bind(node, 'ellipse');
    node.fire('transformstart');
    node.position({ x: 45, y: 15 });
    node.scale({ x: 2, y: 0.5 });
    node.fire('transformend');
    await session.flush();
    expect(session.getBoard().layers[0].elements.at(-1)).toMatchObject({
      x: 45, y: 15, radiusX: 20, radiusY: 10, rotation: 27,
    });
    expect([node.x(), node.y(), node.radiusX(), node.radiusY(),
      node.scaleX(), node.scaleY(), node.rotation()]).toEqual([45, 15, 20, 10, 1, 1, 27]);
    expect(changes).toHaveLength(1);
    await session.undo();
    expect(session.getBoard()).toEqual(board);
    await session.redo();
    expect(session.getBoard().layers[0].elements.at(-1).radiusX).toBe(20);

    node.fire('transformstart');
    node.rotation(55);
    node.fire('transformend');
    await expect(session.flush()).rejects.toThrow(/rotation/i);
    expect(changes).toHaveLength(3); // edit, undo, redo; forbidden rotation was not saved
    expect(node.rotation()).toBe(27);
    expect(session.getBoard().layers[0].elements.at(-1).rotation).toBe(27);
    release();
    node.destroy();
  });

});
