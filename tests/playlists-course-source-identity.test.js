import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mountPlaylistsView } from '../src/views/playlistsRoute.js';

describe('course-scoped persisted playlists and complete playback (#174)', () => {
  let catalog, saved, Toast, Router, setPendingCourseSession;
  beforeEach(() => {
    document.body.innerHTML = '<main id="main"></main>';
    catalog = [
      { topicId: 'shared', courseId: 'a', title: 'Cardiac A', courseTitle: 'A',
        sourceIndex: 0, videos: [{ url: 'https://example.test/a.mp4' }] },
      { topicId: 'shared', courseId: 'b', title: 'Renal B', courseTitle: 'B',
        sourceIndex: 0, videos: [{ url: 'https://example.test/b.mp4' }] },
    ];
    saved = [];
    Toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    Router = { navigate: vi.fn() };
    setPendingCourseSession = vi.fn();
    window.OpenCourseDeck = { UserLibrary: {
      overlay: vi.fn(async () => {}),
      resolvePlayable: vi.fn(async media => media?.url ?? null),
    } };
    window.DataStore = { init: vi.fn(async () => {}), allTopics: () => catalog };
    window.DB = {
      getAllTimestamps: vi.fn(async () => []),
      getSetting: vi.fn(async key => key === 'ocd_playlists' ? structuredClone(saved) : null),
      saveSetting: vi.fn(async (_key, value) => { saved = structuredClone(value); return true; }),
      compareAndSwapSetting: vi.fn(async (key, expected, next) => {
        if (key !== 'ocd_playlists' || JSON.stringify(expected) !== JSON.stringify(saved)) return false;
        saved = structuredClone(next);
        return true;
      }),
    };
  });
  afterEach(() => {
    document.body.innerHTML = '';
    delete window.OpenCourseDeck;
    delete window.DataStore;
    delete window.DB;
    vi.restoreAllMocks();
  });
  function mount() {
    mountPlaylistsView({
      setView: html => { document.querySelector('main').innerHTML = html; },
      safeMediaUrl: media => typeof media === 'string' ? media : media?.url,
      setPendingCourseSession, Router, Toast,
    });
  }
  async function openSaved(id) {
    const el = await vi.waitFor(() => {
      const button = document.querySelector('[data-open-playlist="' + id + '"]');
      expect(button).not.toBeNull();
      return button;
    });
    el.click();
  }

  it('saves a catalog queue using immutable course+topic references despite cross-course topic ID collisions', async () => {
    mount();
    const saveButton = await vi.waitFor(() => {
      expect(document.querySelector('[data-playlist-id="source-2"]')).not.toBeNull();
      return document.querySelector('[data-save-playlist]');
    });
    expect(saveButton.disabled).toBe(false);
    saveButton.click();
    await vi.waitFor(() => expect(Toast.success).toHaveBeenCalledWith('Playlist saved'));
    expect(saved).toHaveLength(1);
    expect(saved[0].topicIds).toEqual(['shared']);
    expect(saved[0].sourceRefs).toEqual([{ courseId: 'a', topicId: 'shared' }]);
    expect(window.DB.compareAndSwapSetting).toHaveBeenCalledTimes(1);
    expect(window.DB.saveSetting).not.toHaveBeenCalled();

    await openSaved(saved[0].id);
    await vi.waitFor(() => expect(setPendingCourseSession).toHaveBeenCalledTimes(1));
    const queue = setPendingCourseSession.mock.calls[0][0].queue;
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ topicId: 'shared', courseId: 'a', src: 'https://example.test/a.mp4' });
    expect(Router.navigate).toHaveBeenCalledWith('#/courses');
  });

  it('reorders duplicate topic IDs by course and persists aligned source refs without changing either source', async () => {
    saved = [{
      id: 'scoped', title: 'Cross-course queue', topicIds: ['shared', 'shared'],
      sourceRefs: [{ courseId: 'a', topicId: 'shared' }, { courseId: 'b', topicId: 'shared' }],
      metadata: { study: 'فارسی' }, createdAt: 9, updatedAt: 10,
    }];
    mount();
    const move = await vi.waitFor(() => {
      const el = document.querySelector('[data-playlist-id="scoped"] [data-playlist-move="up"][data-topic-index="1"]');
      expect(el).not.toBeNull();
      return el;
    });
    expect(document.querySelector('[data-playlist-id="scoped"] .playlist-reorder-list').textContent)
      .toContain('Renal B');
    move.click();
    await vi.waitFor(() => expect(Toast.success).toHaveBeenCalledWith('Playlist order saved'));
    expect(saved[0].sourceRefs).toEqual([
      { courseId: 'b', topicId: 'shared' },
      { courseId: 'a', topicId: 'shared' },
    ]);
    expect(saved[0].metadata).toEqual({ study: 'فارسی' });
    await openSaved('scoped');
    await vi.waitFor(() => expect(setPendingCourseSession).toHaveBeenCalledTimes(1));
    expect(setPendingCourseSession.mock.calls[0][0].queue.map(item => [item.courseId, item.src]))
      .toEqual([['b', 'https://example.test/b.mp4'], ['a', 'https://example.test/a.mp4']]);
  });

  it('does not launch a partial queue after a saved lesson becomes unavailable', async () => {
    catalog = [
      { topicId: 'a1', courseId: 'a', title: 'Available', videos: [{ url: 'https://example.test/a1.mp4' }] },
    ];
    saved = [{ id: 'partial', title: 'Do not truncate', topicIds: ['a1', 'offline'] }];
    mount();
    await openSaved('partial');
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith(expect.stringMatching(/unavailable|missing|incomplete/i)));
    expect(setPendingCourseSession).not.toHaveBeenCalled();
    expect(Router.navigate).not.toHaveBeenCalled();
    expect(saved[0].topicIds).toEqual(['a1', 'offline']);
  });

  it('refuses a stale saved queue whose canonical revision changed in another tab', async () => {
    catalog = [{ topicId: 'a1', courseId: 'a', title: 'Available', videos: [{ url: 'https://example.test/a1.mp4' }] }];
    saved = [{ id: 'stale', title: 'My queue', topicIds: ['a1'], updatedAt: 1 }];
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-open-playlist="stale"]')).not.toBeNull());
    saved = [{ ...saved[0], title: 'Updated on another tab', updatedAt: 2 }];
    await openSaved('stale');
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith(expect.stringMatching(/changed|reload|stale/i)));
    expect(setPendingCourseSession).not.toHaveBeenCalled();
  });

  it('never ignores malformed scoped references and falls back to an unrelated topic-only match', async () => {
    catalog = [{ topicId: 'a1', courseId: 'a', title: 'Available', videos: [{ url: 'https://example.test/a1.mp4' }] }];
    saved = [{ id: 'wrong', title: 'Bad source', topicIds: ['a1'],
      sourceRefs: [{ courseId: 'missing-course', topicId: 'a1' }] }];
    mount();
    await openSaved('wrong');
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith(expect.stringMatching(/unavailable|missing|incomplete/i)));
    expect(setPendingCourseSession).not.toHaveBeenCalled();
    expect(window.DB.saveSetting).not.toHaveBeenCalled();
  });
});
