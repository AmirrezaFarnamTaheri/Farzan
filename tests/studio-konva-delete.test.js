import { describe, expect, it, vi } from 'vitest';
import {
  removeKonvaV1Element, createKonvaV1MoveSession,
} from '../src/features/studioKonvaEditing.js';
import { createStudioKonvaDraftWorkspace } from '../src/features/studioKonvaDraftWorkspace.js';

const board = () => ({
  version: 1,
  grid: { enabled: false },
  viewport: { offsetX: 12, offsetY: -7, zoom: 2, rotation: 0 },
  metadata: { title: 'فارسی canvas', custom: [1, 2, 3] },
  layers: [
    { id: 'editable', visible: true, locked: false, elements: [
      { id: 'first', type: 'rect', x: 15, y: 20, width: -100, height: 50, fill: '#aabbcc' },
      { id: 'second', type: 'text', text: 'یادداشت 你好', x: 3, y: 7, fontSize: 18 },
    ] },
    { id: 'protected', visible: true, locked: true, elements: [
      { id: 'private', type: 'circle', x: 10, y: 10, radius: 8 },
    ] },
  ],
});

describe('Konva canonical delete, undo and keyboard parity (#172)', () => {
  it('removes only the selected unlocked shape while retaining the original and all other board-v1 data', () => {
    const original = board();
    const snapshot = structuredClone(original);
    const next = removeKonvaV1Element(original, 'first');
    expect(next.layers[0].elements.map(el => el.id)).toEqual(['second']);
    expect(next.layers[0].elements[0]).toEqual(original.layers[0].elements[1]);
    expect(next.layers[1]).toEqual(original.layers[1]);
    expect(next.viewport).toEqual(original.viewport);
    expect(next.metadata).toEqual(original.metadata);
    expect(original).toEqual(snapshot);
    expect(() => removeKonvaV1Element(original, 'private')).toThrow(/locked|hidden/i);
    expect(() => removeKonvaV1Element(original, 'missing')).toThrow(/not found/i);
  });

  it('waits for one confirmed canonical deletion before clearing selection and supports undo/redo', async () => {
    const writes = vi.fn(async () => true);
    const selection = vi.fn();
    const session = createKonvaV1MoveSession({ board: board(), onChange: writes, onSelect: selection });
    const deleted = await session.remove('first');
    expect(deleted.layers[0].elements.map(el => el.id)).toEqual(['second']);
    expect(writes).toHaveBeenCalledOnce();
    expect(writes).toHaveBeenCalledWith(deleted);
    expect(selection).toHaveBeenCalledWith(null);
    expect(session.canUndo()).toBe(true);
    await session.undo();
    expect(session.getBoard()).toEqual(board());
    await session.redo();
    expect(session.getBoard()).toEqual(deleted);
    expect(writes).toHaveBeenCalledTimes(3);
  });

  it('does not remove a shape or alter history/selection after a failed persistence receipt', async () => {
    const writes = vi.fn(async () => false);
    const selected = vi.fn();
    const session = createKonvaV1MoveSession({ board: board(), onChange: writes, onSelect: selected });
    await expect(session.remove('first')).rejects.toThrow(/acknowledg/i);
    expect(session.getBoard()).toEqual(board());
    expect(session.canUndo()).toBe(false);
    expect(selected).not.toHaveBeenCalled();
    expect(writes).toHaveBeenCalledOnce();
  });

  it('redraws the isolated draft only after acknowledged deletion and restores it on undo', async () => {
    const scenes = [], saveDraft = vi.fn(async () => true);
    const workspace = createStudioKonvaDraftWorkspace({
      container: document.createElement('div'), board: board(), saveDraft,
      sceneFactory: args => {
        const scene = { args, destroy: vi.fn(), select: vi.fn() };
        scenes.push(scene);
        return scene;
      },
    });
    try {
      const deleted = await workspace.remove('first');
      expect(deleted.layers[0].elements.map(x => x.id)).toEqual(['second']);
      expect(saveDraft).toHaveBeenCalledWith(deleted);
      expect(scenes[0].destroy).toHaveBeenCalledOnce();
      expect(scenes[1].args.board).toEqual(deleted);
      await workspace.undo();
      expect(workspace.getBoard()).toEqual(board());
      expect(scenes.at(-1).args.board).toEqual(board());
    } finally { workspace.destroy(); }
  });
});
