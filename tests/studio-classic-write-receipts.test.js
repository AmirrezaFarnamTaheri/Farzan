import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountStudioView } from '../src/views/studioRoute.js';

const board = id => ({
  version: 1,
  viewport: { offsetX: 0, offsetY: 0, zoom: 1, rotation: 0 },
  layers: [{ id: 'layer-1', visible: true, locked: false, elements: [
    { id, type: 'rect', x: 14, y: 30, width: 80, height: 40 },
  ] }],
});

describe('classic Studio canonical write receipts and import recovery', () => {
  let app, controller, DB, Toast, state;
  beforeEach(() => {
    document.body.innerHTML = '';
    window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    state = board('original');
    let epoch = 0;
    app = {
      init: vi.fn(), destroy: vi.fn(), serialize: vi.fn(() => structuredClone(state)),
      loadState: vi.fn(source => { state = structuredClone(source); epoch += 1; return structuredClone(state); }),
      boardEpoch: vi.fn(() => epoch),
      restoreBoard: vi.fn(async () => false),
      getState: vi.fn(() => ({ tool: 'select', selectedIds: [] })),
      hasPendingAutosave: vi.fn(() => false),
    };
    Toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
    DB = {
      getSetting: vi.fn(async () => null), saveSetting: vi.fn(async (_key, payload) => structuredClone(payload)),
      getAllNotes: vi.fn(async () => []), getAllTimestamps: vi.fn(async () => []),
      getAllAnnotations: vi.fn(async () => []),
    };
    window.OpenCourseDeck = { Canvas: app, bus: { on: vi.fn(), off: vi.fn(), emit: vi.fn() } };
    window.DB = DB;
    window.DataStore = { init: vi.fn(async () => {}), allTopics: () => [], allCourses: () => [] };
    controller = mountStudioView({
      setView: html => { document.body.innerHTML = html; },
      Toast,
      Router: { navigate: vi.fn() },
      safeFetchUrl: () => null, safeMediaUrl: () => null, safeFrameUrl: () => null,
    });
  });

  afterEach(() => {
    controller?.unmount?.();
    delete window.OpenCourseDeck;
    delete window.DB;
    delete window.DataStore;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  async function importBoard(next) {
    const input = document.querySelector('[data-studio-import-file]');
    Object.defineProperty(input, 'files', { configurable: true, value: [{
      name: 'studio.json', text: async () => JSON.stringify(next),
    }] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  it('rejects false or missing manual-save receipts without claiming Studio was saved', async () => {
    DB.saveSetting.mockResolvedValueOnce(false);
    document.querySelector('[data-studio-save]').click();
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith('Studio save failed'));
    expect(Toast.success).not.toHaveBeenCalled();
    expect(document.querySelector('[data-studio-status]').textContent).toBe('Save failed');
    expect(state).toEqual(board('original'));

    DB.saveSetting.mockResolvedValueOnce(undefined);
    document.querySelector('[data-studio-save]').click();
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledTimes(2));
    expect(Toast.success).not.toHaveBeenCalled();
  });

  it('accepts the canonical value-as-receipt DB API for manual saves', async () => {
    document.querySelector('[data-studio-save]').click();
    await vi.waitFor(() => expect(Toast.success).toHaveBeenCalledWith('Studio board saved'));
    expect(DB.saveSetting).toHaveBeenCalledWith('ocd_studio_board', board('original'));
  });

  it('rolls back only the pending import on a refused write, preserving original content', async () => {
    DB.saveSetting.mockResolvedValueOnce(false);
    await importBoard(board('imported'));
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith('Studio JSON import failed'));
    expect(state).toEqual(board('original'));
    expect(app.loadState).toHaveBeenCalledWith(board('imported'));
    expect(app.loadState).toHaveBeenCalledWith(board('original'));
    expect(Toast.success).not.toHaveBeenCalled();
  });

  it('does not roll back a newer intervening canvas change after a refused import', async () => {
    let rejectWrite;
    DB.saveSetting.mockImplementationOnce(() => new Promise(resolve => { rejectWrite = resolve; }));
    await importBoard(board('imported'));
    await vi.waitFor(() => expect(rejectWrite).toBeTypeOf('function'));
    app.loadState(board('newer-local-edit'));
    rejectWrite(false);
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith('Studio JSON import failed'));
    expect(state).toEqual(board('newer-local-edit'));
  });

  it('refuses to import when no canonical writer exists and preserves current Studio', async () => {
    delete DB.saveSetting;
    await importBoard(board('imported'));
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith('Studio JSON import failed'));
    expect(app.loadState).not.toHaveBeenCalled();
    expect(state).toEqual(board('original'));
  });
});
