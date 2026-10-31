import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountStudioView } from '../src/views/studioRoute.js';

const v1Board = () => ({
  version: 1,
  viewport: { offsetX: 0, offsetY: 0, zoom: 1, rotation: 0 },
  grid: { enabled: false },
  layers: [{
    id: 'layer-1', name: 'Editable', visible: true, locked: false,
    elements: [{ id: 'shape-1', type: 'rect', x: 10, y: 20, width: 70, height: 40 }],
  }],
});

function makeFixture({ savedDraft = null, board = v1Board(), loadKonvaDraft } = {}) {
  const serialize = vi.fn(() => structuredClone(board));
  const canvasApi = {
    init: vi.fn(), destroy: vi.fn(), serialize,
    restoreBoard: vi.fn(async () => false),
    getState: vi.fn(() => ({ tool: 'select', selectedIds: [] })),
    boardEpoch: vi.fn(() => 0), hasPendingAutosave: vi.fn(() => false),
  };
  const saveSetting = vi.fn(async () => true);
  const getSetting = vi.fn(async key => key === 'ocd_studio_konva_draft' ? savedDraft : null);
  window.OpenCourseDeck = { Canvas: canvasApi, bus: { on: vi.fn(), off: vi.fn(), emit: vi.fn() } };
  window.DB = {
    saveSetting, getSetting,
    getAllNotes: vi.fn(async () => []),
    getAllTimestamps: vi.fn(async () => []),
    getAllAnnotations: vi.fn(async () => []),
  };
  window.DataStore = { init: vi.fn(async () => {}), allCourses: () => [], allTopics: () => [] };
  const factory = vi.fn(({ board: imported }) => {
    let draftMode = 'select';
    return {
    getBoard: () => structuredClone(imported),
    setMode: vi.fn(mode => { draftMode = mode; return mode; }),
    getMode: vi.fn(() => draftMode),
    select: vi.fn(), move: vi.fn(async () => imported),
    undo: vi.fn(async () => false), redo: vi.fn(async () => false),
    canUndo: () => false, canRedo: () => false,
    flush: vi.fn(async () => true),
    destroy: vi.fn(),
    };
  });
  const loader = loadKonvaDraft || vi.fn(async () => ({
    DRAFT_KEY: 'ocd_studio_konva_draft',
    createStudioKonvaDraftWorkspace: factory,
    isKonvaDraftCompatible: () => true,
    exportKonvaV1DraftJSON: vi.fn(board => JSON.stringify(board)),
    importKonvaV1DraftJSON: vi.fn(text => {
      const parsed = JSON.parse(text);
      if (parsed.version !== 1) throw new Error('Incompatible Studio v1 board');
      return parsed;
    }),
  }));
  const controller = mountStudioView({
    setView: html => { document.body.innerHTML = html; },
    loadKonvaDraft: loader,
    Router: { navigate: vi.fn() },
    Toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  });
  return { controller, canvasApi, saveSetting, getSetting, factory, loader, board };
}

describe('Studio experimental Konva draft opt-in', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  });
  afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

  it('does not load Konva on normal Studio mount; exposes an explicit isolated-draft opt-in', async () => {
    const { controller, loader } = makeFixture();
    expect(document.querySelector('[data-studio-konva-open]')).not.toBeNull();
    const dialog = document.querySelector('[data-studio-konva-dialog]');
    expect(dialog).not.toBeNull();
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(dialog.textContent).toMatch(/separate|isolated/i);
    expect(dialog.textContent).toMatch(/not.*Studio board/i);
    expect(loader).not.toHaveBeenCalled();
    controller.unmount();
  });

  it('resumes a separately saved draft, commits only to its own key, and disposes on close', async () => {
    const savedDraft = v1Board();
    savedDraft.layers[0].elements[0].x = 95;
    const { controller, factory, saveSetting, getSetting, canvasApi } = makeFixture({ savedDraft });
    document.querySelector('[data-studio-konva-open]').click();
    await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce());
    expect(factory.mock.calls[0][0].board).toEqual(savedDraft);
    expect(document.querySelector('[data-studio-konva-dialog]').hasAttribute('open')).toBe(true);
    expect(getSetting).toHaveBeenCalledWith('ocd_studio_konva_draft');
    expect(saveSetting).not.toHaveBeenCalled();

    const saveDraft = factory.mock.calls[0][0].saveDraft;
    const changed = structuredClone(savedDraft);
    changed.layers[0].elements[0].x = 100;
    await expect(saveDraft(changed)).resolves.toBe(true);
    expect(saveSetting).toHaveBeenCalledWith('ocd_studio_konva_draft', changed);
    expect(saveSetting).not.toHaveBeenCalledWith('ocd_studio_board', expect.anything());
    expect(canvasApi.serialize()).toEqual(v1Board());

    const instance = factory.mock.results[0].value;
    document.querySelector('[data-studio-konva-close]').click();
    await vi.waitFor(() => expect(instance.destroy).toHaveBeenCalledOnce());
    expect(document.querySelector('[data-studio-konva-dialog]').hasAttribute('open')).toBe(false);
    controller.unmount();
  });

  it('refuses an unsupported saved draft rather than replacing or overwriting it', async () => {
    const savedDraft = { version: 2, layers: [] };
    const { controller, saveSetting, factory } = makeFixture({ savedDraft });
    // Workspace preflight represents unsupported legacy geometry/metadata.
    factory.mockImplementation(() => { throw new Error('Incompatible Studio v1 board'); });
    document.querySelector('[data-studio-konva-open]').click();
    await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce());
    expect(saveSetting).not.toHaveBeenCalled();
    expect(document.querySelector('[data-studio-konva-dialog]').hasAttribute('open')).toBe(false);
    expect(document.querySelector('[data-studio-status]').textContent).toMatch(/Konva.*unavailable|incompatible/i);
    controller.unmount();
  });

  it('requires confirmation before resetting a saved draft and preserves the live Studio board', async () => {
    const savedDraft = v1Board();
    savedDraft.layers[0].elements[0].x = 95;
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { controller, factory, saveSetting, canvasApi } = makeFixture({ savedDraft });
    document.querySelector('[data-studio-konva-open]').click();
    await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce());

    document.querySelector('[data-studio-konva-reset]').click();
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(saveSetting).not.toHaveBeenCalled();
    expect(factory).toHaveBeenCalledTimes(1);

    confirm.mockReturnValue(true);
    document.querySelector('[data-studio-konva-reset]').click();
    await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(2));
    expect(saveSetting).toHaveBeenCalledTimes(1);
    expect(saveSetting).toHaveBeenCalledWith('ocd_studio_konva_draft', v1Board());
    expect(saveSetting).not.toHaveBeenCalledWith('ocd_studio_board', expect.anything());
    expect(canvasApi.serialize()).toEqual(v1Board());
    controller.unmount();
  });

  it('keeps the current draft mounted if a confirmed reset write is refused', async () => {
    const savedDraft = v1Board();
    savedDraft.layers[0].elements[0].x = 95;
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { controller, factory, saveSetting } = makeFixture({ savedDraft });
    document.querySelector('[data-studio-konva-open]').click();
    await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce());
    const current = factory.mock.results[0].value;
    saveSetting.mockResolvedValue(false);

    document.querySelector('[data-studio-konva-reset]').click();
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(document.querySelector('[data-studio-konva-status]').textContent)
      .toMatch(/reset failed/i));
    expect(saveSetting).toHaveBeenCalledWith('ocd_studio_konva_draft', v1Board());
    expect(factory).toHaveBeenCalledOnce();
    expect(current.destroy).not.toHaveBeenCalled();
    expect(document.querySelector('[data-studio-konva-dialog]').hasAttribute('open')).toBe(true);
    controller.unmount();
  });

  it('does not mount the editor if its lazy import completes after Studio unmount', async () => {
    let releaseImport;
    const late = vi.fn(() => new Promise(resolve => { releaseImport = resolve; }));
    const { controller } = makeFixture({ loadKonvaDraft: late });
    document.querySelector('[data-studio-konva-open]').click();
    expect(late).toHaveBeenCalledOnce();
    controller.unmount();
    const factory = vi.fn();
    releaseImport({ DRAFT_KEY: 'ocd_studio_konva_draft', createStudioKonvaDraftWorkspace: factory });
    await vi.waitFor(() => expect(factory).not.toHaveBeenCalled());
    expect(document.querySelector('[data-studio-konva-dialog]').hasAttribute('open')).toBe(false);
  });

  it('offers an explicit pen tool only inside the draft modal, without changing the main Studio tool', async () => {
    const { controller, factory, canvasApi } = makeFixture();
    document.querySelector('[data-studio-konva-open]').click();
    await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce());
    const workspace = factory.mock.results[0].value;
    const pen = document.querySelector('[data-studio-konva-mode="pen"]');
    const select = document.querySelector('[data-studio-konva-mode="select"]');
    expect(pen).not.toBeNull();
    expect(select).not.toBeNull();
    expect(select.getAttribute('aria-pressed')).toBe('true');
    pen.click();
    expect(workspace.setMode).toHaveBeenCalledWith('pen');
    expect(pen.getAttribute('aria-pressed')).toBe('true');
    expect(select.getAttribute('aria-pressed')).toBe('false');
    select.click();
    expect(workspace.setMode).toHaveBeenCalledWith('select');
    expect(select.getAttribute('aria-pressed')).toBe('true');
    expect(canvasApi.getState().tool).toBe('select');
    controller.unmount();
  });

  it('exports the canonical isolated draft without persisting or touching the classic board', async () => {
    const oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL;
    const blobUrl = vi.fn(() => 'blob:studio-test');
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: blobUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      const saved = v1Board();
      saved.layers[0].elements[0].width = -70;
      const { controller, factory, saveSetting } = makeFixture({ savedDraft: saved });
      document.querySelector('[data-studio-konva-open]').click();
      await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce());
      const btn = document.querySelector('[data-studio-konva-export]');
      expect(btn).not.toBeNull();
      btn.click();
      await vi.waitFor(() => expect(blobUrl).toHaveBeenCalledOnce());
      expect(blobUrl.mock.calls[0][0]).toBeInstanceOf(Blob);
      expect(anchorClick).toHaveBeenCalledOnce();
      expect(saveSetting).not.toHaveBeenCalled();
      expect(document.querySelector('[data-studio-konva-status]').textContent).toMatch(/exported|download/i);
      controller.unmount();
    } finally {
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: oldCreate });
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: oldRevoke });
    }
  });

  it('imports an explicitly approved v1 draft to its isolated key, never the main board', async () => {
    const saved = v1Board();
    saved.layers[0].elements[0].x = 95;
    const imported = v1Board();
    imported.layers[0].elements[0].x = 130;
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { controller, factory, saveSetting, canvasApi } = makeFixture({ savedDraft: saved });
    document.querySelector('[data-studio-konva-open]').click();
    await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce());
    const previous = factory.mock.results[0].value;
    const file = document.querySelector('[data-studio-konva-import]');
    expect(file).not.toBeNull();
    const text = JSON.stringify(imported);
    Object.defineProperty(file, 'files', { configurable: true,
      value: [{ name: 'import.json', size: text.length, text: async () => text }] });
    file.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(2));
    expect(confirm).toHaveBeenCalledOnce();
    expect(factory.mock.calls[1][0].board).toEqual(imported);
    expect(previous.destroy).toHaveBeenCalledOnce();
    expect(saveSetting).toHaveBeenCalledWith('ocd_studio_konva_draft', imported);
    expect(saveSetting).not.toHaveBeenCalledWith('ocd_studio_board', expect.anything());
    expect(canvasApi.serialize()).toEqual(v1Board());
    controller.unmount();
  });

  it('accepts the canonical DB.saveSetting receipt which returns the saved board value, not a boolean', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { controller, factory, saveSetting } = makeFixture({ savedDraft: v1Board() });
    saveSetting.mockImplementation(async (_key, value) => structuredClone(value));
    document.querySelector('[data-studio-konva-open]').click();
    await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce());
    const imported = v1Board();
    imported.layers[0].elements[0].x = 246;
    const input = document.querySelector('[data-studio-konva-import]');
    const text = JSON.stringify(imported);
    Object.defineProperty(input, 'files', { configurable: true,
      value: [{ name: 'saved-value-receipt.json', size: text.length, text: async () => text }] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(2));
    expect(factory.mock.calls[1][0].board).toEqual(imported);
    expect(saveSetting).toHaveBeenCalledWith('ocd_studio_konva_draft', imported);
    expect(document.querySelector('[data-studio-konva-status]').textContent).toMatch(/Imported isolated/i);
    controller.unmount();
  });

  it('refuses unsupported v1 imports and rejected save receipts without switching workspaces', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { controller, factory, saveSetting } = makeFixture();
    document.querySelector('[data-studio-konva-open]').click();
    await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce());
    const previous = factory.mock.results[0].value;
    const file = document.querySelector('[data-studio-konva-import]');
    const choose = text => {
      Object.defineProperty(file, 'files', { configurable: true,
        value: [{ name: 'bad.json', size: text.length, text: async () => text }] });
      file.dispatchEvent(new Event('change', { bubbles: true }));
    };
    choose(JSON.stringify({ version: 2, layers: [] }));
    await vi.waitFor(() => expect(document.querySelector('[data-studio-konva-status]').textContent)
      .toMatch(/import failed|incompatible/i));
    expect(saveSetting).not.toHaveBeenCalled();
    saveSetting.mockResolvedValue(false);
    choose(JSON.stringify(v1Board()));
    await vi.waitFor(() => expect(saveSetting).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(document.querySelector('[data-studio-konva-status]').textContent)
      .toMatch(/import failed/i));
    expect(factory).toHaveBeenCalledOnce();
    expect(previous.destroy).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledTimes(2);
    controller.unmount();
  });

  it('drops an in-flight import when Studio closes, never writing stale data', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { controller, factory, saveSetting } = makeFixture();
    document.querySelector('[data-studio-konva-open]').click();
    await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce());
    let deliver;
    const reading = new Promise(resolve => { deliver = resolve; });
    const file = document.querySelector('[data-studio-konva-import]');
    Object.defineProperty(file, 'files', { configurable: true,
      value: [{ name: 'late.json', size: 50, text: () => reading }] });
    file.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector('[data-studio-konva-dialog]').hasAttribute('open')).toBe(true));
    document.querySelector('[data-studio-konva-close]').click();
    await vi.waitFor(() => expect(document.querySelector('[data-studio-konva-dialog]').hasAttribute('open')).toBe(false));
    deliver(JSON.stringify(v1Board()));
    await Promise.resolve();
    await Promise.resolve();
    expect(saveSetting).not.toHaveBeenCalled();
    controller.unmount();
  });


});
