import { describe, expect, it, vi } from 'vitest';
import * as editing from '../src/features/studioKonvaEditing.js';
import { createStudioKonvaDraftWorkspace } from '../src/features/studioKonvaDraftWorkspace.js';

const sourceBoard = () => ({
  version: 1,
  viewport: { offsetX: 24, offsetY: -15, zoom: 2, rotation: 0 },
  tool: 'select',
  activeLayerIdx: 0,
  grid: { enabled: false },
  style: {
    strokeColor: '#234abc', strokeWidth: 4, lineCap: 'round', lineJoin: 'round',
  },
  layers: [
    { id: 'main', name: 'Drawing', visible: true, locked: false, elements: [
      { id: 'rect-1', type: 'rect', x: 1, y: 2, width: 20, height: 30 },
    ] },
    { id: 'locked', name: 'Protected', visible: true, locked: true, elements: [
      { id: 'other', type: 'rect', x: 0, y: 0, width: 12, height: 15 },
    ] },
  ],
});

const points = [[10, 20], [24, 25], [42, 54]];

describe('Konva draft pen: canonical-v1 compatible stroke commands', () => {
  it('adds one immutable legacy polyline on the active layer using the board pen style', () => {
    const board = sourceBoard();
    const saved = structuredClone(board);
    const next = editing.appendKonvaV1Stroke(board, 'path-1', points);
    expect(board).toEqual(saved);
    expect(next.layers[0].elements[0]).toEqual(saved.layers[0].elements[0]);
    expect(next.layers[1]).toEqual(saved.layers[1]);
    expect(next.viewport).toEqual(saved.viewport);
    expect(next.layers[0].elements[1]).toEqual({
      id: 'path-1', type: 'polyline',
      points, stroke: '#234abc', strokeWidth: 4,
      fill: null, lineCap: 'round', lineJoin: 'round',
    });
    expect(next.version).toBe(1);
    // No Konva Stage JSON or renderer-only attributes are stored.
    expect(JSON.stringify(next)).not.toContain('className');
  });

  it('rejects unsupported input, duplicate IDs, and degenerate or oversized strokes', () => {
    const board = sourceBoard();
    const saved = structuredClone(board);
    for (const candidate of [
      [], [[0, 0]], [[0, 0], [0, 0]], [[0, 0], [Infinity, 2]],
      [[0, 0], [NaN, 2]], [[0, 0], [1, '2']], [[0], [1, 2]],
      Array.from({ length: 4098 }, (_, i) => [i, 5]),
    ]) {
      expect(() => editing.appendKonvaV1Stroke(board, 'new-path', candidate)).toThrow();
    }
    expect(() => editing.appendKonvaV1Stroke(board, 'rect-1', points))
      .toThrow(/duplicate|id/i);
    expect(() => editing.appendKonvaV1Stroke(board, '', points)).toThrow();
    expect(board).toEqual(saved);
  });

  it('refuses strokes on the current locked or hidden layer instead of silently switching layers', () => {
    const board = sourceBoard();
    board.activeLayerIdx = 1;
    expect(() => editing.appendKonvaV1Stroke(board, 'new-path', points)).toThrow(/locked/i);
    board.activeLayerIdx = 0;
    board.layers[0].visible = false;
    expect(() => editing.appendKonvaV1Stroke(board, 'new-path', points)).toThrow(/hidden/i);
    expect(board.layers[0].elements).toHaveLength(1);
    expect(board.layers[1].elements).toHaveLength(1);
  });

  it('stores pen strokes only after affirmative draft acknowledgment and supports undo/redo', async () => {
    const save = vi.fn(async () => true);
    const session = editing.createKonvaV1MoveSession({ board: sourceBoard(), onChange: save });
    const next = await session.addStroke(points);
    const path = next.layers[0].elements[1];
    expect(path.type).toBe('polyline');
    expect(path.id).toMatch(/^path-/);
    expect(path.points).toEqual(points);
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(next);
    expect(session.canUndo()).toBe(true);
    expect(await session.undo()).toEqual(sourceBoard());
    expect(await session.redo()).toEqual(next);
    expect(save).toHaveBeenCalledTimes(3);
  });

  it('does not append or change history for a failed save and can accept a later stroke', async () => {
    let acknowledged = false;
    const save = vi.fn(async () => acknowledged);
    const session = editing.createKonvaV1MoveSession({ board: sourceBoard(), onChange: save });
    await expect(session.addStroke(points)).rejects.toThrow(/acknowledg/i);
    expect(session.getBoard()).toEqual(sourceBoard());
    expect(session.canUndo()).toBe(false);
    expect(session.canRedo()).toBe(false);
    acknowledged = true;
    await session.addStroke(points);
    expect(session.getBoard().layers[0].elements).toHaveLength(2);
    expect(session.canUndo()).toBe(true);
  });

  it('exposes a distinct pen mode to the scene and saves pointer strokes via the same durable writer', async () => {
    const scenes = [];
    const factory = vi.fn(args => {
      const scene = { args, destroy: vi.fn(), select: vi.fn() };
      scenes.push(scene);
      return scene;
    });
    const saveDraft = vi.fn(async () => true);
    const instance = createStudioKonvaDraftWorkspace({
      container: document.createElement('div'), board: sourceBoard(),
      saveDraft, sceneFactory: factory,
    });
    expect(scenes[0].args.mode).toBe('select');
    instance.setMode('pen');
    expect(instance.getMode()).toBe('pen');
    expect(scenes[1].args.mode).toBe('pen');
    await scenes[1].args.onStroke(points);
    expect(saveDraft).toHaveBeenCalledOnce();
    expect(instance.getBoard().layers[0].elements.at(-1).type).toBe('polyline');
    expect(scenes.at(-1).args.mode).toBe('pen');
    expect(instance.canUndo()).toBe(true);
    await instance.undo();
    expect(instance.getBoard()).toEqual(sourceBoard());
    instance.setMode('select');
    expect(scenes.at(-1).args.mode).toBe('select');
    instance.destroy();
  });

  it('does not write after a pen session has been closed', async () => {
    const scenes = [];
    const saveDraft = vi.fn(async () => true);
    const instance = createStudioKonvaDraftWorkspace({
      container: document.createElement('div'), board: sourceBoard(), saveDraft,
      sceneFactory: args => { scenes.push(args); return { destroy: vi.fn(), select: vi.fn() }; },
    });
    instance.setMode('pen');
    const onStroke = scenes.at(-1).onStroke;
    instance.destroy();
    await expect(onStroke(points)).rejects.toThrow(/closed|disposed/i);
    expect(saveDraft).not.toHaveBeenCalled();
  });
});
