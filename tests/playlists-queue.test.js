import { describe, expect, it, vi } from 'vitest';
import { mountPlaylistsView } from '../src/views/playlistsRoute.js';

describe('saved video queue playback', () => {
  it('opens the saved playlist in its original order, not the first catalog queue', async () => {
    document.body.innerHTML = '<main id="main-content"></main>';
    const topics = [
      { topicId: 'topic-1', title: 'Lecture A', courseId: 'course-1', courseTitle: 'Biology', videos: [{ url: 'https://example.test/a.mp4' }] },
      { topicId: 'topic-2', title: 'Lecture B', courseId: 'course-1', courseTitle: 'Biology', videos: [{ url: 'https://example.test/b.mp4' }] },
    ];
    window.DataStore = { init: vi.fn(async () => true), allTopics: vi.fn(() => topics) };
    window.DB = {
      getAllTimestamps: vi.fn(async () => []),
      getSetting: vi.fn(async key => key === 'ocd_playlists'
        ? [{ id: 'playlist-1', title: 'My queue', topicIds: ['topic-2','topic-1'], createdAt: 1 }]
        : null),
      saveSetting: vi.fn(async () => true),
    };
    window.OpenCourseDeck = { UserLibrary: { resolvePlayable: vi.fn(async media => media.url) } };
    const setPendingCourseSession = vi.fn();
    const Router = { navigate: vi.fn() };
    mountPlaylistsView({
      setView: html => { document.querySelector('main').innerHTML = html; },
      Router,
      setPendingCourseSession,
      safeMediaUrl: media => typeof media === 'string' ? media : media.url,
      Toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
    });
    const open = await vi.waitFor(() => {
      const el = document.querySelector('[data-open-playlist="playlist-1"]');
      expect(el).not.toBeNull();
      return el;
    });
    open.click();
    await vi.waitFor(() => expect(setPendingCourseSession).toHaveBeenCalledTimes(1));
    const snapshot = setPendingCourseSession.mock.calls[0][0];
    expect(snapshot.queue.map(item => item.topicId)).toEqual(['topic-2','topic-1']);
    expect(snapshot.queue.map(item => item.src)).toEqual(['https://example.test/b.mp4','https://example.test/a.mp4']);
    expect(Router.navigate).toHaveBeenCalledWith('#/courses');
  });
});
