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
    saved = [{ id: 'old', title: 'Before', topicIds: ['a','b'], createdAt: 10 }];
    Toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    window.DataStore = { init: vi.fn(async () => true), allTopics: () => topics };
    window.OpenCourseDeck = { UserLibrary: { overlay: vi.fn(async () => {}) } };
    window.DB = {
      getAllTimestamps: vi.fn(async () => []),
      getSetting: vi.fn(async key => key === 'ocd_playlists' ? structuredClone(saved) : null),
      saveSetting: vi.fn(async (key, value) => {
        saved = structuredClone(value);
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

  it('does not claim creation succeeded when the canonical writer refuses the receipt', async () => {
    const initial = structuredClone(saved);
    window.DB.saveSetting.mockResolvedValue(false);
    const { field } = await create();
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith(expect.stringMatching(/save.*playlist|playlist.*save/i)));
    expect(Toast.success).not.toHaveBeenCalled();
    expect(field.value).toBe('My durable queue');
    expect(saved).toEqual(initial);
  });

  it('accepts the existing canonical settings API returning the written array', async () => {
    window.DB.saveSetting.mockImplementation(async (_key, value) => {
      saved = structuredClone(value);
      return structuredClone(value);
    });
    await create();
    await vi.waitFor(() => expect(Toast.success).toHaveBeenCalledWith('Playlist saved'));
    expect(saved[0].title).toBe('My durable queue');
    expect(saved[1].id).toBe('old');
  });

  it('rejects a missing write receipt without erasing the original queue on delete', async () => {
    const initial = structuredClone(saved);
    window.DB.saveSetting.mockResolvedValue(undefined);
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
    mount();
    const button = await vi.waitFor(() => {
      const deleteButton = document.querySelector('[data-delete-playlist="old"]');
      expect(deleteButton).not.toBeNull();
      return deleteButton;
    });
    button.click();
    await vi.waitFor(() => expect(Toast.success).toHaveBeenCalledWith('Playlist deleted'));
    expect(saved).toEqual([{ id: 'future-format', version: 2, unrecognized: { needsRetaining: true } }]);
  });

  it('rejects an unacknowledged reorder without notifying success', async () => {
    window.DB.saveSetting.mockResolvedValue(undefined);
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
});
