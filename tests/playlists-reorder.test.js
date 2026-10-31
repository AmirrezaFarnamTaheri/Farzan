import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mountPlaylistsView } from '../src/views/playlistsRoute.js';

describe('keyboard-accessible canonical saved playlist reordering', () => {
  let saved;
  let toast;
  let setPendingCourseSession;
  let original;
  const topics = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({
    topicId: id, title: 'Lesson ' + id.toUpperCase(), courseId: 'course-1',
    courseTitle: 'Course One', sourceIndex: 0,
    videos: [{ url: 'https://example.test/' + i + '.mp4' }],
  }));
  const mount = () => mountPlaylistsView({
    setView: html => { document.querySelector('main').innerHTML = html; },
    safeMediaUrl: media => typeof media === 'string' ? media : media?.url,
    Router: { navigate: vi.fn() },
    setPendingCourseSession,
    Toast: toast,
  });
  beforeEach(() => {
    document.body.innerHTML = '<main></main>';
    saved = [{ id: 'focus-queue', title: 'Focus playlist',
      topicIds: ['a','b','c','d','e'], createdAt: 1, updatedAt: 5,
      metadata: { script: 'فارسی', custom: ['one', 'two'] } }];
    original = structuredClone(saved);
    toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    setPendingCourseSession = vi.fn();
    window.OpenCourseDeck = { UserLibrary: { resolvePlayable: vi.fn(async media => media.url) } };
    window.DataStore = { init: vi.fn(async () => {}), allTopics: () => topics };
    window.DB = {
      getAllTimestamps: vi.fn(async () => []),
      getSetting: vi.fn(async key => key === 'ocd_playlists' ? saved : null),
      saveSetting: vi.fn(async (key, value) => {
        if (key !== 'ocd_playlists') throw new Error('Wrong storage key');
        saved = structuredClone(value);
        return true;
      }),
    };
  });
  afterEach(() => {
    document.body.innerHTML = '';
    delete window.DB;
    delete window.DataStore;
    delete window.OpenCourseDeck;
    vi.restoreAllMocks();
  });

  it('reorders every saved topic, including beyond the four-item preview, with durable acknowledgement', async () => {
    mount();
    const move = await vi.waitFor(() => {
      const button = document.querySelector('[data-playlist-move="up"][data-topic-index="4"]');
      expect(button).not.toBeNull();
      return button;
    });
    expect(move.getAttribute('aria-label')).toMatch(/move.*up/i);
    expect(document.querySelectorAll('.playlist-preview li')).toHaveLength(4);
    expect(document.querySelector('[data-playlist-move="up"][data-topic-index="0"]').disabled).toBe(true);
    move.click();
    await vi.waitFor(() => expect(saved[0].topicIds).toEqual(['a','b','c','e','d']));
    expect(saved[0].metadata).toEqual(original[0].metadata);
    expect(saved[0].createdAt).toBe(original[0].createdAt);
    expect(saved[0].updatedAt).toBeGreaterThan(original[0].updatedAt);
    expect(window.DB.saveSetting).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/order/i));

    const open = await vi.waitFor(() => {
      const button = document.querySelector('[data-open-playlist="focus-queue"]');
      expect(button).not.toBeNull();
      return button;
    });
    open.click();
    await vi.waitFor(() => expect(setPendingCourseSession).toHaveBeenCalledOnce());
    expect(setPendingCourseSession.mock.calls[0][0].queue.map(row => row.topicId))
      .toEqual(['a','b','c','e','d']);
  });

  it('preserves the previous canonical order when a durable writer rejects the update', async () => {
    window.DB.saveSetting = vi.fn(async () => false);
    mount();
    const move = await vi.waitFor(() => {
      const button = document.querySelector('[data-playlist-move="down"][data-topic-index="0"]');
      expect(button).not.toBeNull();
      return button;
    });
    move.click();
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(saved).toEqual(original);
    expect(toast.success).not.toHaveBeenCalled();
    expect(document.querySelector('[data-playlist-id="focus-queue"]')).not.toBeNull();
  });

  it('rejects stale index actions after another tab changes a saved queue', async () => {
    mount();
    const stale = await vi.waitFor(() => {
      const button = document.querySelector('[data-playlist-move="up"][data-topic-index="4"]');
      expect(button).not.toBeNull();
      return button;
    });
    saved = [{ ...saved[0], topicIds: ['e','a','b','c','d'] }];
    stale.click();
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(window.DB.saveSetting).not.toHaveBeenCalled();
    expect(saved[0].topicIds).toEqual(['e','a','b','c','d']);
  });
});
