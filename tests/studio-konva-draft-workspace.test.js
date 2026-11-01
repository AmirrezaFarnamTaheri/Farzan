import { describe, expect, it, vi } from 'vitest';
import {
  DRAFT_KEY, isKonvaDraftCompatible, createStudioKonvaDraftWorkspace,
} from '../src/features/studioKonvaDraftWorkspace.js';

const board = () => ({
  version: 1,
  viewport: { offsetX: 15, offsetY: -5, zoom: 1.5, rotation: 0 },
  grid: { enabled: false },
  layers: [
    { id: 'editable', visible: true, locked: false, elements: [
      { id: 'rect-1', type: 'rect', x: 100, y: 60, width: -80, height: -40 },
    ] },
    { id: 'locked', visible: true, locked: true, elements: [
      { id: 'card-locked', type: 'roundRect', x: 0, y: 0, width: 40, height: 30 },
    ] },
  ],
});

function workspace({ document = board(), saveDraft = vi.fn(async () => true) } = {}) {
  const scenes = [];
  const createScene = vi.fn(args => {
    const scene = {
      destroy: vi.fn(), select: vi.fn(), args,
      exportPreviewPng: vi.fn(() => 'data:image/png;base64,aGVsbG8='),
    };
    scenes.push(scene);
    return scene;
  });
  const container = window.document.createElement('div');
  const start = structuredClone(document);
  const instance = createStudioKonvaDraftWorkspace({
    container, board: document, saveDraft, sceneFactory: createScene,
  });
  return { instance, scenes, createScene, saveDraft, document, start };
}

describe('opt-in Konva editing draft workspace', () => {
  it('uses a separate saved-draft identity and refuses unsupported boards before mounting', () => {
    expect(DRAFT_KEY).toBe('ocd_studio_konva_draft');
    const source = board();
    source.grid.enabled = true;
    expect(isKonvaDraftCompatible(source)).toBe(false);
    const createScene = vi.fn();
    expect(() => createStudioKonvaDraftWorkspace({
      container: document.createElement('div'), board: source,
      saveDraft: vi.fn(async () => true), sceneFactory: createScene,
    })).toThrow(/incompatible/i);
    expect(createScene).not.toHaveBeenCalled();
  });

  it('moves an editable shape only after a real draft write acknowledgement and redraws from canonical v1', async () => {
    const { instance, scenes, saveDraft, document: input, start } = workspace();
    expect(scenes).toHaveLength(1);
    const changed = await instance.move('rect-1', 7, -4);
    expect(changed.layers[0].elements[0]).toMatchObject({ x: 107, y: 56, width: -80 });
    expect(changed.layers[1]).toEqual(start.layers[1]);
    expect(input).toEqual(start);
    expect(saveDraft).toHaveBeenCalledOnce();
    expect(saveDraft).toHaveBeenCalledWith(changed);
    expect(scenes[0].destroy).toHaveBeenCalledOnce();
    expect(scenes[1].args.board).toEqual(changed);
    instance.destroy();
  });

  it('does not change the scene, board or undo stack after a rejected write', async () => {
    const saveDraft = vi.fn(async () => false);
    const { instance, scenes } = workspace({ saveDraft });
    await expect(instance.move('rect-1', 5, 5)).rejects.toThrow(/acknowledg/i);
    expect(instance.getBoard()).toEqual(board());
    expect(instance.canUndo()).toBe(false);
    expect(scenes).toHaveLength(1);
    instance.destroy();
  });

  it('supports canonical rectangle resize with undo/redo only after acknowledged draft saves', async () => {
    const { instance, saveDraft } = workspace();
    await instance.resize('rect-1', { x: 10, y: 10, width: 120, height: 55 });
    const resized = instance.getBoard();
    expect(resized.layers[0].elements[0]).toMatchObject({
      x: 130, y: 65, width: -120, height: -55,
    });
    expect(instance.canUndo()).toBe(true);
    await instance.undo();
    expect(instance.getBoard()).toEqual(board());
    await instance.redo();
    expect(instance.getBoard()).toEqual(resized);
    expect(saveDraft).toHaveBeenCalledTimes(3);
    instance.destroy();
  });

  it('exports only the current acknowledged canonical draft preview, without storage mutations', async () => {
    const { instance, scenes, saveDraft, start } = workspace();
    const png = await instance.exportPreviewPng();
    expect(png).toBe('data:image/png;base64,aGVsbG8=');
    expect(scenes).toHaveLength(2);
    expect(scenes[0].destroy).toHaveBeenCalledOnce();
    expect(scenes[1].exportPreviewPng).toHaveBeenCalledOnce();
    expect(scenes[1].args.board).toEqual(start);
    expect(saveDraft).not.toHaveBeenCalled();
    expect(instance.getBoard()).toEqual(start);
    instance.setMode('pen');
    await expect(instance.exportPreviewPng()).rejects.toThrow(/select/i);
    instance.destroy();
  });

  it('refuses to capture a stale draft if a pending write is not acknowledged', async () => {
    let resolveSave;
    const saveDraft = vi.fn(() => new Promise(resolve => { resolveSave = resolve; }));
    const { instance, scenes } = workspace({ saveDraft });
    const edit = instance.move('rect-1', 4, 5);
    const exportAttempt = instance.exportPreviewPng();
    await vi.waitFor(() => expect(resolveSave).toBeTypeOf('function'));
    resolveSave(false);
    await expect(edit).rejects.toThrow(/acknowledg/i);
    await expect(exportAttempt).rejects.toThrow(/acknowledg/i);
    expect(instance.getBoard()).toEqual(board());
    expect(scenes.every(scene => scene.exportPreviewPng.mock.calls.length === 0)).toBe(true);
    instance.destroy();
  });

  it('reports an acknowledged in-flight draft save as committed even when the dialog closes', async () => {
    let acknowledge;
    const saveDraft = vi.fn(() => new Promise(resolve => { acknowledge = resolve; }));
    const onStatus = vi.fn();
    const onError = vi.fn();
    const scenes = [];
    const sceneFactory = args => {
      const scene = { select: vi.fn(), destroy: vi.fn(), args };
      scenes.push(scene);
      return scene;
    };
    const instance = createStudioKonvaDraftWorkspace({
      container: document.createElement('div'), board: board(), saveDraft,
      sceneFactory, onStatus, onError,
    });
    const pending = instance.move('rect-1', 5, -3);
    await vi.waitFor(() => expect(acknowledge).toBeTypeOf('function'));
    instance.destroy();
    acknowledge(true);
    const committed = await pending;
    expect(committed.layers[0].elements[0]).toMatchObject({
      x: 105, y: 57, width: -80, height: -40,
    });
    expect(saveDraft).toHaveBeenCalledOnce();
    expect(instance.getBoard()).toEqual(committed);
    expect(scenes).toHaveLength(1);
    expect(scenes[0].destroy).toHaveBeenCalledOnce();
    expect(onStatus).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    await expect(instance.move('rect-1', 2, 2)).rejects.toThrow(/closed/i);
  });

  it('disposes scenes and prevents further writes after leaving the experiment', async () => {
    const { instance, scenes, saveDraft } = workspace();
    instance.destroy();
    expect(scenes[0].destroy).toHaveBeenCalledOnce();
    await expect(instance.move('rect-1', 5, 0)).rejects.toThrow(/closed|disposed/i);
    expect(saveDraft).not.toHaveBeenCalled();
  });
});
