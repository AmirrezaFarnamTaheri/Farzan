import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountStudioView } from '../src/views/studioRoute.js';

describe('Studio canonical link target preflight (#172)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.matchMedia = vi.fn(() => ({ matches: false }));
  });
  afterEach(() => {
    document.body.innerHTML = '';
    delete window.DB;
    delete window.DataStore;
    delete window.OpenCourseDeck;
    vi.restoreAllMocks();
  });

  const mount = (breakReader) => {
    const board = {
      version: 1, activeLayerIdx: 0,
      layers: [{ id: 'layer-1', name: 'Main', visible: true, locked: false, elements: [
        { id: 'shape-1', type: 'rect', text: 'Board object', x: 10, y: 20 },
      ] }],
    };
    const canvasApi = {
      init: vi.fn(), destroy: vi.fn(), serialize: vi.fn(() => structuredClone(board)),
      getState: vi.fn(() => ({ tool: 'select', selectedIds: [] })),
      updateElement: vi.fn(() => ({ id: 'shape-1' })),
    };
    window.OpenCourseDeck = { Canvas: canvasApi, bus: { on: vi.fn(), off: vi.fn() } };
    const saveSetting = vi.fn(async () => true);
    window.DB = {
      getSetting: vi.fn(async () => null), saveSetting,
      getAllNotes: vi.fn(async () => [{ id: 'note-1', title: 'Saved note' }]),
      getAllTimestamps: vi.fn(async () => [{ id: 'ts-1', topicId: 'topic-1' }]),
      getAllAnnotations: vi.fn(async () => []),
    };
    window.DataStore = {
      init: vi.fn(async () => true),
      allCourses: vi.fn(() => [{ id: 'course-1', title: 'Cardiology' }]),
      allTopics: vi.fn(() => [{ topicId: 'topic-1', title: 'Lesson' }]),
    };
    breakReader(window.DB, window.DataStore);
    const controller = mountStudioView({
      setView: html => { document.body.innerHTML = html; },
      Router: { navigate: vi.fn() },
      Toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
    });
    return { controller, canvasApi, saveSetting };
  };

  it.each([
    ['missing Notes reader', (db) => { delete db.getAllNotes; }],
    ['rejected Notes reader', (db) => { db.getAllNotes.mockRejectedValue(new Error('Locked notes store')); }],
    ['malformed saved timestamps', (db) => { db.getAllTimestamps.mockResolvedValue('not an array'); }],
    ['unavailable catalog', (_db, store) => { store.init.mockRejectedValue(new Error('Offline catalog unavailable')); }],
  ])('does not show partial link suggestions or write invalid link edits after %s', async (_case, breakReader) => {
    const { controller, canvasApi, saveSetting } = mount(breakReader);
    try {
      await vi.waitFor(() => expect(document.querySelector('[data-studio-link-read-error]')).not.toBeNull());
      const alert = document.querySelector('[data-studio-link-read-error]');
      expect(alert.getAttribute('role')).toBe('alert');
      document.querySelector('[data-inspect-element="shape-1"]').click();
      expect(document.querySelectorAll('#studio-link-target-options option')).toHaveLength(0);
      const select = document.querySelector('[data-studio-prop-link-type]');
      select.value = 'note';
      document.querySelector('[data-studio-prop-link-target]').value = 'note-1';
      document.querySelector('[data-studio-apply-props]').click();
      expect(canvasApi.updateElement).not.toHaveBeenCalled();
      expect(saveSetting).not.toHaveBeenCalled();
    } finally {
      controller.unmount();
    }
  });
});
