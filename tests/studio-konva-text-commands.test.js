import { describe, expect, it, vi } from 'vitest';
import {
  setKonvaV1Text, createKonvaV1MoveSession,
} from '../src/features/studioKonvaEditing.js';

const source = () => ({
  version: 1,
  viewport: { offsetX: 30, offsetY: -20, zoom: 1.25, rotation: 0 },
  grid: { enabled: false },
  activeLayerIdx: 0,
  metadata: { source: 'user', aliases: ['فارسی', '中文'] },
  layers: [
    { id: 'main', name: 'Editable', visible: true, locked: false, elements: [
      { id: 'text-1', type: 'text', x: 40, y: 50, text: 'Original notes',
        fontSize: 22, fontFamily: 'Inter', fill: '#123456', opacity: 0.8 },
      { id: 'rect-1', type: 'rect', x: 0, y: 0, width: 100, height: 50 },
    ] },
    { id: 'private', name: 'Protected', visible: true, locked: true, elements: [
      { id: 'text-locked', type: 'text', x: 1, y: 2, text: 'Private' },
    ] },
  ],
});

describe('canonical Konva board-v1 text editor commands', () => {
  it('preserves every unrelated property while changing Unicode text verbatim', () => {
    const original = source(), snapshot = structuredClone(original);
    const updated = setKonvaV1Text(original, 'text-1', 'فارسی 心脏\nHearts <stay literal> 🎓');
    expect(updated.layers[0].elements[0].text).toBe('فارسی 心脏\nHearts <stay literal> 🎓');
    const noText = element => { const copy = { ...element }; delete copy.text; return copy; };
    expect(noText(updated.layers[0].elements[0])).toEqual(noText(original.layers[0].elements[0]));
    expect(updated.layers[0].elements[1]).toEqual(original.layers[0].elements[1]);
    expect(updated.layers[1]).toEqual(original.layers[1]);
    expect(updated.metadata).toEqual(original.metadata);
    expect(updated.viewport).toEqual(original.viewport);
    expect(original).toEqual(snapshot);
    expect(JSON.stringify(updated)).not.toContain('Konva.Stage');
  });

  it('refuses malformed, excessively long and non-text edits without mutating the source', () => {
    const board = source(), before = structuredClone(board);
    for (const invalid of [null, undefined, 42, {}, [], 'x'.repeat(32769)]) {
      expect(() => setKonvaV1Text(board, 'text-1', invalid)).toThrow();
    }
    expect(() => setKonvaV1Text(board, 'rect-1', 'erase shape')).toThrow(/text|unsupported/i);
    expect(() => setKonvaV1Text(board, 'missing', 'unknown')).toThrow(/not found/i);
    expect(() => setKonvaV1Text(board, 'text-locked', 'do not erase'))
      .toThrow(/locked|hidden/i);
    board.layers[0].visible = false;
    expect(() => setKonvaV1Text(board, 'text-1', 'hidden edit'))
      .toThrow(/locked|hidden/i);
    expect(board.layers[0].elements[0].text).toBe(before.layers[0].elements[0].text);
  });

  it('writes text only after the isolated draft acknowledges the snapshot, with undo and redo', async () => {
    const saved = [];
    const session = createKonvaV1MoveSession({
      board: source(),
      onChange: vi.fn(async next => { saved.push(next); return true; }),
    });
    const after = await session.updateText('text-1', 'Updated from keyboard');
    expect(after.layers[0].elements[0].text).toBe('Updated from keyboard');
    expect(saved).toHaveLength(1);
    expect(session.canUndo()).toBe(true);
    await session.undo();
    expect(session.getBoard()).toEqual(source());
    await session.redo();
    expect(session.getBoard()).toEqual(after);
    expect(saved).toHaveLength(3);
  });

  it('does not save an unchanged text, or mutate history after rejected storage writes', async () => {
    const save = vi.fn(async () => false);
    const session = createKonvaV1MoveSession({ board: source(), onChange: save });
    const unchanged = await session.updateText('text-1', 'Original notes');
    expect(unchanged).toEqual(source());
    expect(save).not.toHaveBeenCalled();
    await expect(session.updateText('text-1', 'Rejected edit')).rejects.toThrow(/acknowledg/i);
    expect(session.getBoard()).toEqual(source());
    expect(session.canUndo()).toBe(false);
    save.mockResolvedValue(true);
    await session.updateText('text-1', 'Committed text');
    expect(session.getBoard().layers[0].elements[0].text).toBe('Committed text');
    expect(session.canUndo()).toBe(true);
  });

  it('serializes overlapping edits and supports full canonical undo/redo history', async () => {
    let release;
    const saved = [];
    const save = vi.fn(next => {
      saved.push(structuredClone(next));
      if (saved.length === 1) return new Promise(resolve => { release = resolve; });
      return Promise.resolve(true);
    });
    const session = createKonvaV1MoveSession({ board: source(), onChange: save });
    const first = session.updateText('text-1', 'first');
    const second = session.updateText('text-1', 'second');
    await vi.waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].layers[0].elements[0].text).toBe('first');
    expect(session.getBoard()).toEqual(source());
    release(true);
    await first;
    await second;
    expect(saved).toHaveLength(2);
    expect(saved[1].layers[0].elements[0].text).toBe('second');
    await session.undo();
    expect(session.getBoard().layers[0].elements[0].text).toBe('first');
    await session.undo();
    expect(session.getBoard().layers[0].elements[0].text).toBe('Original notes');
  });
});
