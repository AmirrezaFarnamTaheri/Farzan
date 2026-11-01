import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { appendKonvaV1Shape, createKonvaV1MoveSession } from '../src/features/studioKonvaEditing.js';
import { createStudioKonvaDraftWorkspace } from '../src/features/studioKonvaDraftWorkspace.js';

const board = () => ({
  version: 1, activeLayerIdx: 0, grid: { enabled: false },
  viewport: { offsetX: 36, offsetY: -18, zoom: 2, rotation: 0 },
  style: { strokeColor: '#345678', strokeWidth: 3, fillColor: '#c8d8ee' },
  layers: [
    { id: 'main', visible: true, locked: false, elements: [
      { id: 'old', type: 'circle', x: 50, y: 60, radius: 20 },
    ] },
    { id: 'locked', visible: true, locked: true, elements: [] },
  ],
});

describe('Konva v1 shape creation parity (#172)', () => {
  it('has retired the never-consumed noninteractive preview renderer before first release', () => {
    const adapter = fs.readFileSync('src/features/studioKonvaAdapter.js', 'utf8');
    expect(adapter).not.toMatch(/mountKonvaV1Preview|listening: false/);
    const editor = fs.readFileSync('src/features/studioKonvaDraftWorkspace.js', 'utf8');
    expect(editor).toMatch(/listening: true/);
  });

  it('appends an immutable canonical rectangle at world coordinates and preserves layer metadata', () => {
    const input = board();
    const before = structuredClone(input);
    const next = appendKonvaV1Shape(input, 'created-1', { type: 'rect', x: -35, y: 24, width: 120, height: 80 });
    expect(input).toEqual(before);
    expect(next.layers[1]).toEqual(before.layers[1]);
    expect(next.viewport).toEqual(before.viewport);
    expect(next.layers[0].elements.at(-1)).toEqual({
      id: 'created-1', type: 'rect', x: -35, y: 24, width: 120, height: 80,
      stroke: '#345678', strokeWidth: 3, fill: '#c8d8ee',
    });
  });
  it('creates a canonical circle with center/radius and refuses malformed or protected layer inputs', () => {
    const input = board();
    expect(appendKonvaV1Shape(input, 'circle-new', { type: 'circle', x: 11, y: -3, radius: 30 })
      .layers[0].elements.at(-1)).toMatchObject({
      id: 'circle-new', type: 'circle', x: 11, y: -3, radius: 30,
    });
    for (const shape of [
      { type: 'rect', x: 0, y: 0, width: 0, height: 30 },
      { type: 'rect', x: 0, y: 0, width: Infinity, height: 20 },
      { type: 'circle', x: 1, y: 1, radius: -1 },
      { type: 'circle', x: 1, y: 1, radius: 10, linkTarget: 'https://example.test' },
      { type: 'image', x: 0, y: 0, width: 30, height: 30 },
    ]) expect(() => appendKonvaV1Shape(input, 'new-id', shape)).toThrow();
    expect(() => appendKonvaV1Shape(input, 'old', { type: 'circle', x: 1, y: 1, radius: 20 }))
      .toThrow(/duplicate/i);
    input.activeLayerIdx = 1;
    expect(() => appendKonvaV1Shape(input, 'new', { type: 'circle', x: 1, y: 1, radius: 20 }))
      .toThrow(/locked/i);
    expect(input.layers[0].elements).toHaveLength(1);
  });
  it('serializes a new shape behind the real write receipt, with undo/redo and rejected-write rollback', async () => {
    const receipt = vi.fn(async () => false);
    const session = createKonvaV1MoveSession({ board: board(), onChange: receipt });
    await expect(session.addShape({ type: 'rect', x: 1, y: 2, width: 80, height: 60 }))
      .rejects.toThrow(/acknowledg/i);
    expect(session.getBoard()).toEqual(board());
    expect(session.canUndo()).toBe(false);
    receipt.mockResolvedValue(true);
    const saved = await session.addShape({ type: 'circle', x: 50, y: 60, radius: 25 });
    expect(saved.layers[0].elements).toHaveLength(2);
    expect(saved.layers[0].elements.at(-1).id).toMatch(/^shape-/);
    expect(await session.undo()).toEqual(board());
    expect(await session.redo()).toEqual(saved);
  });
  it('surfaces accessible shape actions through the workspace using exactly the acknowledged v1 writer', async () => {
    const writer = vi.fn(async () => true);
    const instance = createStudioKonvaDraftWorkspace({
      container: document.createElement('div'), board: board(), saveDraft: writer,
      sceneFactory: () => ({ destroy: vi.fn(), select: vi.fn() }),
    });
    const created = await instance.addShape({ type: 'rect', x: 1, y: 2, width: 80, height: 60 });
    expect(created.layers[0].elements).toHaveLength(2);
    expect(writer).toHaveBeenCalledExactlyOnceWith(created);
    instance.destroy();
  });
});
