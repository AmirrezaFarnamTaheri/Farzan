import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountStudioView } from '../src/views/studioRoute.js';
import { createStudioKonvaDraftWorkspace } from '../src/features/studioKonvaDraftWorkspace.js';

const source = () => ({
  version: 1,
  viewport: { offsetX: 0, offsetY: 0, zoom: 1, rotation: 0 },
  grid: { enabled: false },
  layers: [
    { id: 'editable', visible: true, locked: false, elements: [
      { id: 'text-1', type: 'text', x: 12, y: 23, text: 'قلب original', fontSize: 24, fill: '#112233' },
      { id: 'rect-1', type: 'rect', x: 50, y: 50, width: 60, height: 50 },
    ] },
    { id: 'locked', visible: true, locked: true, elements: [
      { id: 'private', type: 'text', x: 1, y: 1, text: 'Do not edit' },
    ] },
  ],
});

describe('Studio Konva draft text controls and storage isolation', () => {
  let controller;
  let factory;
  let saveSetting;
  let draft;

  beforeEach(() => {
    document.body.innerHTML = '';
    window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const original = source();
    window.OpenCourseDeck = {
      Canvas: {
        init: vi.fn(), destroy: vi.fn(), serialize: vi.fn(() => original),
        restoreBoard: vi.fn(async () => false),
        getState: vi.fn(() => ({ tool: 'select', selectedIds: [] })),
        boardEpoch: vi.fn(() => 0), hasPendingAutosave: vi.fn(() => false),
      },
      bus: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
    };
    saveSetting = vi.fn(async () => true);
    window.DB = {
      getSetting: vi.fn(async () => null), saveSetting,
      getAllNotes: vi.fn(async () => []),
      getAllTimestamps: vi.fn(async () => []),
      getAllAnnotations: vi.fn(async () => []),
    };
    window.DataStore = { init: vi.fn(async () => {}), allCourses: () => [], allTopics: () => [] };
    factory = vi.fn(({ board, saveDraft, onSelect, onStatus }) => {
      let current = structuredClone(board);
      draft = {
        getBoard: () => structuredClone(current),
        getMode: () => 'select',
        select: vi.fn(id => onSelect(id)),
        updateText: vi.fn(async (id, text) => {
          const next = structuredClone(current);
          const shape = next.layers[0].elements.find(element => element.id === id);
          if (!shape || shape.type !== 'text') throw new TypeError('Not a text object');
          shape.text = text;
          await saveDraft(next);
          current = next;
          onStatus('Experimental draft saved');
          return structuredClone(current);
        }),
        canUndo: () => false, canRedo: () => false,
        flush: vi.fn(async () => true),
        destroy: vi.fn(),
      };
      return draft;
    });
    controller = mountStudioView({
      setView: html => { document.body.innerHTML = html; },
      loadKonvaDraft: vi.fn(async () => ({
        DRAFT_KEY: 'ocd_studio_konva_draft',
        createStudioKonvaDraftWorkspace: factory,
        isKonvaDraftCompatible: () => true,
      })),
      Toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
      Router: { navigate: vi.fn() },
    });
  });

  afterEach(() => {
    controller?.unmount?.();
    document.body.innerHTML = '';
    delete window.DB;
    delete window.DataStore;
    delete window.OpenCourseDeck;
    vi.restoreAllMocks();
  });

  async function openAndSelect(id = 'text-1') {
    document.querySelector('[data-studio-konva-open]').click();
    await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce());
    const select = document.querySelector('[data-studio-konva-object]');
    select.value = id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  it('edits mixed-script text only in the isolated draft with accessible text controls', async () => {
    await openAndSelect();
    const input = document.querySelector('[data-studio-konva-text]');
    const save = document.querySelector('[data-studio-konva-text-save]');
    expect(input).not.toBeNull();
    expect(input.getAttribute('aria-label')).toMatch(/text/i);
    expect(input.disabled).toBe(false);
    expect(input.value).toBe('قلب original');
    expect(save.disabled).toBe(true);

    const content = 'فارسی 中文 👩🏽‍⚕️ <literal>\nEdited';
    input.value = content;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(save.disabled).toBe(false);
    save.click();

    await vi.waitFor(() => expect(saveSetting).toHaveBeenCalledOnce());
    expect(draft.updateText).toHaveBeenCalledWith('text-1', content);
    expect(saveSetting.mock.calls[0][0]).toBe('ocd_studio_konva_draft');
    const stored = saveSetting.mock.calls[0][1];
    // Vitest vmThreads may supply a different Array prototype across the
    // route's browser realm. Check structure, not constructor identity.
    expect(stored.version).toBe(1);
    expect(Array.isArray(stored.layers)).toBe(true);
    expect(stored.layers[0].elements[0].text).toBe(content);
    expect(stored.layers[0].elements[0].fontSize).toBe(24);
    expect(stored.layers[0].elements[1].type).toBe('rect');
    expect(saveSetting).not.toHaveBeenCalledWith('ocd_studio_board', expect.anything());
    await vi.waitFor(() => expect(save.disabled).toBe(true));
  });

  it('exposes accessible bring-forward/backward controls and preserves the canonical layer metadata', async () => {
    await openAndSelect('text-1');
    const forward = document.querySelector('[data-studio-konva-reorder="forward"]');
    const backward = document.querySelector('[data-studio-konva-reorder="backward"]');
    expect(forward).toBeTruthy();
    expect(backward).toBeTruthy();
    expect(forward.disabled).toBe(false);
    expect(backward.disabled).toBe(true); // first shape is at layer back
    forward.click();
    await vi.waitFor(() => expect(saveSetting).toHaveBeenCalledTimes(1));
    const [key, persisted] = saveSetting.mock.calls[0];
    expect(key).toBe('ocd_studio_konva_draft');
    expect(persisted.layers[0].elements.map(shape => shape.id))
      .toEqual(['rect-1', 'text-1']);
    expect(persisted.layers[1].locked).toBe(true);
    expect(persisted.layers[1].elements[0].text).toBe('Do not edit');
    expect(window.OpenCourseDeck.Canvas.serialize().layers[0].elements[0].id).toBe('text-1');
    expect(backward.disabled).toBe(false);
  });

  it('keeps unsaved Unicode input and reports a rejected draft write, without claiming success', async () => {
    await openAndSelect();
    saveSetting.mockResolvedValue(false);
    const input = document.querySelector('[data-studio-konva-text]');
    input.value = 'Unacknowledged متن';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-studio-konva-text-save]').click();
    await vi.waitFor(() => expect(document.querySelector('[data-studio-konva-status]').textContent)
      .toMatch(/not saved|failed/i));
    expect(input.value).toBe('Unacknowledged متن');
    expect(draft.getBoard().layers[0].elements[0].text).toBe('قلب original');
    expect(saveSetting).not.toHaveBeenCalledWith('ocd_studio_board', expect.anything());
  });

  it('disables editing for non-text and locked layers, and never mutates a different object', async () => {
    await openAndSelect('rect-1');
    const input = document.querySelector('[data-studio-konva-text]');
    const save = document.querySelector('[data-studio-konva-text-save]');
    expect(input.disabled).toBe(true);
    expect(save.disabled).toBe(true);
    expect(document.querySelector('[data-studio-konva-object] option[value="private"]')).toBeNull();
    document.querySelector('[data-studio-konva-object]').value = 'text-1';
    document.querySelector('[data-studio-konva-object]').dispatchEvent(new Event('change', { bubbles: true }));
    expect(input.disabled).toBe(false);
    expect(input.value).toBe('قلب original');
  });

  it('workspace text edits are durable, undoable and fail closed on rejected receipts', async () => {
    const sceneFactory = vi.fn(() => ({ select: vi.fn(), destroy: vi.fn() }));
    const receipts = vi.fn(async () => true);
    const ws = createStudioKonvaDraftWorkspace({
      board: source(), container: document.createElement('div'),
      saveDraft: receipts, sceneFactory,
    });
    const changed = await ws.updateText('text-1', 'Saved 内科');
    expect(changed.layers[0].elements[0].text).toBe('Saved 内科');
    expect(receipts).toHaveBeenCalledWith(changed);
    expect(ws.canUndo()).toBe(true);
    await ws.undo();
    expect(ws.getBoard()).toEqual(source());
    receipts.mockResolvedValue(false);
    await expect(ws.updateText('text-1', 'failed')).rejects.toThrow(/acknowledg/i);
    expect(ws.getBoard()).toEqual(source());
    ws.destroy();
  });
});
