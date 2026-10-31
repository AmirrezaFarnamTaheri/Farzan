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
  const factory = vi.fn(({ board: imported }) => ({
    getBoard: () => structuredClone(imported),
    select: vi.fn(), move: vi.fn(async () => imported),
    undo: vi.fn(async () => false), redo: vi.fn(async () => false),
    canUndo: () => false, canRedo: () => false,
    flush: vi.fn(async () => true),
    destroy: vi.fn(),
  }));
  const loader = loadKonvaDraft || vi.fn(async () => ({
    DRAFT_KEY: 'ocd_studio_konva_draft',
    createStudioKonvaDraftWorkspace: factory,
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
});
