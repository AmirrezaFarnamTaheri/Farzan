import { describe, expect, it, vi } from 'vitest';
import { selectKonvaV1ActiveLayer, createKonvaV1MoveSession } from '../src/features/studioKonvaEditing.js';
import { createStudioKonvaDraftWorkspace } from '../src/features/studioKonvaDraftWorkspace.js';

const board = () => ({
  version: 1, viewport: { offsetX: 12, offsetY: -3, zoom: 1, rotation: 0 },
  activeLayerIdx: 0, grid: { enabled: false }, metadata: { courseId: 'course-a' },
  layers: [
    { id: 'first', name: 'Editable', visible: true, locked: false, elements: [] },
    { id: 'second', name: 'Protected', visible: true, locked: true, elements: [] },
    { id: 'third', name: 'Notes', visible: true, locked: false, elements: [] },
  ],
});

describe('Konva v1 active-layer editing (#172)', () => {
  it('changes only the canonical active layer, keeping all existing geometry and metadata', () => {
    const source = board(), old = structuredClone(source);
    const next = selectKonvaV1ActiveLayer(source, 2);
    expect(next).toEqual({ ...old, activeLayerIdx: 2 });
    expect(source).toEqual(old);
    expect(() => selectKonvaV1ActiveLayer(source, -1)).toThrow();
    expect(() => selectKonvaV1ActiveLayer(source, 3)).toThrow();
    expect(() => selectKonvaV1ActiveLayer(source, 1.5)).toThrow();
  });

  it('persists a layer change as one undoable v1 command; fails closed on refused writes', async () => {
    const writer = vi.fn(async () => false);
    const session = createKonvaV1MoveSession({ board: board(), onChange: writer });
    await expect(session.selectLayer(2)).rejects.toThrow(/acknowledg/i);
    expect(session.getBoard()).toEqual(board());
    expect(session.canUndo()).toBe(false);
    writer.mockResolvedValue(true);
    const next = await session.selectLayer(2);
    expect(next.activeLayerIdx).toBe(2);
    expect(session.canUndo()).toBe(true);
    expect(await session.undo()).toEqual(board());
    expect((await session.redo()).activeLayerIdx).toBe(2);
    expect(writer).toHaveBeenCalledTimes(4);
    await session.selectLayer(2);
    expect(writer).toHaveBeenCalledTimes(4);
  });

  it('keeps locked layers selectable to inspect but never adds shapes to them', async () => {
    const writer = vi.fn(async () => true);
    const session = createKonvaV1MoveSession({ board: board(), onChange: writer });
    await session.selectLayer(1);
    expect(session.getBoard().activeLayerIdx).toBe(1);
    await expect(session.addShape({ type: 'rect', x: 0, y: 1, width: 10, height: 20 }))
      .rejects.toThrow(/locked/i);
    expect(session.getBoard().layers[1].elements).toEqual([]);
  });

  it('exposes active-layer selection through the listening draft scene with durable acknowledgment', async () => {
    const writer = vi.fn(async () => true);
    const workspace = createStudioKonvaDraftWorkspace({
      container: document.createElement('div'), board: board(), saveDraft: writer,
      sceneFactory: () => ({ select: vi.fn(), destroy: vi.fn() }),
    });
    expect((await workspace.selectLayer(2)).activeLayerIdx).toBe(2);
    expect(writer).toHaveBeenCalledOnce();
    expect(workspace.getBoard().activeLayerIdx).toBe(2);
    workspace.destroy();
  });
});
