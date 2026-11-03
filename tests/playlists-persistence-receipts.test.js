import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mountPlaylistsView } from '../src/views/playlistsRoute.js';

const topics = ['a','b'].map(id => ({
  topicId: id, courseId: 'course-1', courseTitle: 'Clinical course',
  sourceIndex: 0, sourceLabel: 'Lecture', title: 'Lesson ' + id,
  videos: [{ url: 'https://example.test/' + id + '.mp4' }],
}));

describe('Saved playlists acknowledged mutations', () => {
  let saved, Toast;
  beforeEach(() => {
    document.body.innerHTML = '<main></main>';
    saved = [{ id: 'old', title: 'Before', topicIds: ['a','b'], sourceRefs: [{ courseId: 'course-1', topicId: 'a' }, { courseId: 'course-1', topicId: 'b' }], createdAt: 10 }];
    Toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    window.DataStore = { init: vi.fn(async () => true), allTopics: () => topics };
    window.OpenCourseDeck = { UserLibrary: { overlay: vi.fn(async () => {}) } };
    window.DB = {
      getAllTimestamps: vi.fn(async () => []),
      getSetting: vi.fn(async key => key === 'ocd_playlists' ? structuredClone(saved) : null),
      saveSetting: vi.fn(async () => { throw new Error('Non-atomic writer must not run'); }),
      compareAndSwapSetting: vi.fn(async (key, expected, next) => {
        expect(key).toBe('ocd_playlists');
        if (JSON.stringify(expected) !== JSON.stringify(saved)) return false;
        saved = structuredClone(next);
        return true;
      }),
    };
  });
  afterEach(() => {
    delete window.DB;
    delete window.DataStore;
    delete window.OpenCourseDeck;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  const mount = () => mountPlaylistsView({
    setView: html => { document.querySelector('main').innerHTML = html; },
    safeMediaUrl: media => media?.url || media,
    Router: { navigate: vi.fn() },
    Toast,
  });

  async function create() {
    mount();
    const button = await vi.waitFor(() => {
      // The markup contains an enabled save button before the async catalog
      // and saved-queue read attaches its handler. Wait for real hydration.
      expect(document.querySelector('[data-playlist-list] [data-playlist-id="old"]')).not.toBeNull();
      const save = document.querySelector('[data-save-playlist]');
      expect(save).not.toBeNull();
      expect(save.disabled).toBe(false);
      return save;
    });
    const field = document.querySelector('[data-playlist-name]');
    field.value = 'My durable queue';
    button.click();
    return { field, button };
  }

  it('does not expose queue creation through a non-atomic saveSetting-only adapter', async () => {
    delete window.DB.compareAndSwapSetting;
    mount();
    const saveButton = await vi.waitFor(() => {
      expect(document.querySelector('[data-playlist-id="old"]')).not.toBeNull();
      const button = document.querySelector('[data-save-playlist]');
      expect(button).not.toBeNull();
      return button;
    });
    expect(saveButton.disabled).toBe(true);
    saveButton.click();
    expect(window.DB.saveSetting).not.toHaveBeenCalled();
    expect(saved).toHaveLength(1);
  });

  it('never deletes a saved queue through the legacy non-atomic writer', async () => {
    delete window.DB.compareAndSwapSetting;
    mount();
    const button = await vi.waitFor(() => {
      const node = document.querySelector('[data-delete-playlist="old"]');
      expect(node).not.toBeNull();
      return node;
    });
    button.click();
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/storage|atomic|unavailable/i),
    ));
    expect(window.DB.saveSetting).not.toHaveBeenCalled();
    expect(saved).toEqual([{ id: 'old', title: 'Before', topicIds: ['a','b'], sourceRefs: [{ courseId: 'course-1', topicId: 'a' }, { courseId: 'course-1', topicId: 'b' }], createdAt: 10 }]);
  });

  it('does not claim creation succeeded when the canonical writer refuses the receipt', async () => {
    const initial = structuredClone(saved);
    window.DB.compareAndSwapSetting.mockResolvedValue(false);
    const { field } = await create();
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith(expect.stringMatching(/save.*playlist|playlist.*save/i)));
    expect(Toast.success).not.toHaveBeenCalled();
    expect(field.value).toBe('My durable queue');
    expect(saved).toEqual(initial);
  });

  it('rejects a missing write receipt without erasing the original queue on delete', async () => {
    const initial = structuredClone(saved);
    window.DB.compareAndSwapSetting.mockResolvedValue(undefined);
    mount();
    const button = await vi.waitFor(() => {
      const deleteButton = document.querySelector('[data-delete-playlist="old"]');
      expect(deleteButton).not.toBeNull();
      return deleteButton;
    });
    button.click();
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith(expect.stringMatching(/delete|playlist.*fail/i)));
    expect(Toast.success).not.toHaveBeenCalled();
    expect(saved).toEqual(initial);
    expect(document.querySelector('[data-playlist-id="old"]')).not.toBeNull();
  });

  it('preserves unrecognized saved playlist records on deletion rather than rewriting the collection', async () => {
    saved.push({ id: 'future-format', version: 2, unrecognized: { needsRetaining: true } });
    const original = structuredClone(saved);
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-playlists-error]')).not.toBeNull());
    expect(document.querySelector('[data-delete-playlist="old"]')).toBeNull();
    expect(window.DB.compareAndSwapSetting).not.toHaveBeenCalled();
    expect(Toast.success).not.toHaveBeenCalled();
    expect(saved).toEqual(original);
  });

  it('rejects an unacknowledged reorder without notifying success', async () => {
    window.DB.compareAndSwapSetting.mockResolvedValue(undefined);
    mount();
    const move = await vi.waitFor(() => {
      const button = document.querySelector('[data-playlist-move="down"][data-topic-index="0"]');
      expect(button).not.toBeNull();
      return button;
    });
    move.click();
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalled());
    expect(Toast.success).not.toHaveBeenCalled();
    expect(saved[0].topicIds).toEqual(['a','b']);
  });
  it('does not overwrite a second tab when the atomic playlist compare fails during creation', async () => {
    window.DB.compareAndSwapSetting = vi.fn(async (key, expected) => {
      expect(key).toBe('ocd_playlists');
      expect(expected).toHaveLength(1);
      saved = [{ id: 'other-tab', title: 'From another tab', topicIds: ['b'], sourceRefs: [{ courseId: 'course-1', topicId: 'b' }] }, ...saved];
      return false;
    });
    await create();
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith(expect.stringMatching(/changed|save|reload/i)));
    expect(Toast.success).not.toHaveBeenCalled();
    expect(saved.map(item => item.id)).toEqual(['other-tab', 'old']);
    expect(window.DB.saveSetting).not.toHaveBeenCalled();
  });

  it('uses atomic compare-and-swap and canonical readback for an acknowledged new queue', async () => {
    window.DB.compareAndSwapSetting = vi.fn(async (key, expected, next) => {
      expect(key).toBe('ocd_playlists');
      if (JSON.stringify(expected) !== JSON.stringify(saved)) return false;
      saved = structuredClone(next);
      return true;
    });
    await create();
    await vi.waitFor(() => expect(Toast.success).toHaveBeenCalledWith('Playlist saved'));
    expect(saved[0].title).toBe('My durable queue');
    expect(saved[1].id).toBe('old');
    expect(window.DB.compareAndSwapSetting).toHaveBeenCalledTimes(1);
    expect(window.DB.saveSetting).not.toHaveBeenCalled();
  });

  it('rejects a missing atomic receipt even if a non-atomic writer is available', async () => {
    window.DB.compareAndSwapSetting = vi.fn(async () => undefined);
    await create();
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalled());
    expect(Toast.success).not.toHaveBeenCalled();
    expect(saved).toHaveLength(1);
    expect(window.DB.saveSetting).not.toHaveBeenCalled();
  });

  it('refuses to delete an older playlist revision after a concurrent tab update', async () => {
    window.DB.compareAndSwapSetting = vi.fn(async (_key, expected) => {
      expect(expected[0].id).toBe('old');
      saved[0].title = 'Changed in another tab';
      return false;
    });
    mount();
    const button = await vi.waitFor(() => {
      const node = document.querySelector('[data-delete-playlist="old"]');
      expect(node).not.toBeNull();
      return node;
    });
    button.click();
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalled());
    expect(Toast.success).not.toHaveBeenCalled();
    expect(saved[0].title).toBe('Changed in another tab');
    expect(window.DB.saveSetting).not.toHaveBeenCalled();
  });

});
