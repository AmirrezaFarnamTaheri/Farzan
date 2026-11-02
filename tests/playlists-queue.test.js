import { describe, expect, it, vi } from 'vitest';
import { mountPlaylistsView } from '../src/views/playlistsRoute.js';

describe('saved video queue playback', () => {
  it('labels catalog playlists with course names, preserves section labels and keeps previews compact', async () => {
    document.body.innerHTML = '<main id="main-content"></main>';
    const topics = Array.from({ length: 6 }, (_, i) => ({
      topicId: `topic-${i + 1}`,
      title: `Lesson ${i + 1}`,
      courseId: 'medicine',
      courseTitle: 'دوره جامع داخلی پزشکی',
      sourceIndex: 0,
      sourceLabel: 'شروع این دوره',
      videos: [{ url: `https://example.test/lesson-${i + 1}.mp4` }],
    }));
    window.DataStore = { init: vi.fn(async () => true), allTopics: vi.fn(() => topics) };
    window.DB = { getAllTimestamps: vi.fn(async () => []), getSetting: vi.fn(async () => null) };
    window.OpenCourseDeck = {};
    mountPlaylistsView({
      setView: html => { document.querySelector('main').innerHTML = html; },
      safeMediaUrl: media => typeof media === 'string' ? media : media?.url,
      Toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
    });

    const card = await vi.waitFor(() => {
      const value = document.querySelector('[data-playlist-id="source-1"]');
      expect(value).not.toBeNull();
      return value;
    });
    expect(card.querySelector('h2').textContent).toBe('دوره جامع داخلی پزشکی');
    expect(card.querySelector('h2').getAttribute('dir')).toBe('auto');
    expect(card.textContent).toContain('شروع این دوره');
    expect(card.querySelectorAll('ol li')).toHaveLength(4);
    expect(card.textContent).toContain('2 more topics');
  });

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

  it('refuses saved-queue playback when topic IDs match multiple courses', async () => {
    document.body.innerHTML = '<main id="main-content"></main>';
    const catalog = [
      { topicId: 'shared', courseId: 'a', title: 'Cardiac', videos: [{ url: 'https://example.test/a.mp4' }] },
      { topicId: 'shared', courseId: 'b', title: 'Renal', videos: [{ url: 'https://example.test/b.mp4' }] },
    ];
    const saved = [{ id: 'ambiguous', title: 'Legacy review', topicIds: ['shared'], createdAt: 1 }];
    window.DataStore = { init: vi.fn(async () => true), allTopics: () => catalog };
    window.DB = {
      getAllTimestamps: vi.fn(async () => []),
      getSetting: vi.fn(async () => structuredClone(saved)),
      saveSetting: vi.fn(async () => { throw new Error('Must not write'); }),
    };
    window.OpenCourseDeck = { UserLibrary: { resolvePlayable: vi.fn(async media => media.url) } };
    const Router = { navigate: vi.fn() };
    const setPendingCourseSession = vi.fn();
    const Toast = { error: vi.fn(), success: vi.fn() };
    mountPlaylistsView({
      setView: html => { document.querySelector('main').innerHTML = html; },
      Router, Toast, setPendingCourseSession,
      safeMediaUrl: media => typeof media === 'string' ? media : media?.url,
    });
    const open = await vi.waitFor(() => {
      const button = document.querySelector('[data-open-playlist="ambiguous"]');
      expect(button).not.toBeNull();
      return button;
    });
    open.click();
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/ambiguous|multiple courses|wrong/i)));
    expect(setPendingCourseSession).not.toHaveBeenCalled();
    expect(Router.navigate).not.toHaveBeenCalled();
    expect(window.DB.saveSetting).not.toHaveBeenCalled();
    expect(saved[0].topicIds).toEqual(['shared']);
  });

  it('disables saving a new catalog queue whose topic-only records would be ambiguous', async () => {
    document.body.innerHTML = '<main id="main-content"></main>';
    window.DataStore = { init: vi.fn(async () => true), allTopics: () => [
      { topicId: 'shared', courseId: 'a', title: 'Cardiac',
        videos: [{ url: 'https://example.test/a.mp4' }] },
      { topicId: 'shared', courseId: 'b', title: 'Renal',
        videos: [{ url: 'https://example.test/b.mp4' }] },
    ] };
    window.DB = { getAllTimestamps: vi.fn(async () => []),
      getSetting: vi.fn(async () => []), saveSetting: vi.fn(async () => true) };
    window.OpenCourseDeck = {};
    mountPlaylistsView({
      setView: html => { document.querySelector('main').innerHTML = html; },
      safeMediaUrl: media => typeof media === 'string' ? media : media?.url,
      Toast: { error: vi.fn(), success: vi.fn() },
    });
    const save = await vi.waitFor(() => {
      expect(document.querySelector('[data-playlist-id="source-1"]')).not.toBeNull();
      const button = document.querySelector('[data-save-playlist]');
      expect(button).not.toBeNull();
      return button;
    });
    expect(save.disabled).toBe(true);
    expect(document.querySelector('[data-playlist-source-warning]')?.textContent)
      .toMatch(/multiple courses|ambiguous|same topic/i);
    expect(window.DB.saveSetting).not.toHaveBeenCalled();
  });

  it('resolves a timestamp preview by course ID when the catalog repeats a topic ID', async () => {
    document.body.innerHTML = '<main id="main-content"></main>';
    window.DataStore = { init: vi.fn(async () => true), allTopics: () => [
      { topicId: 'shared', courseId: 'a', title: 'Cardiac',
        videos: [{ url: 'https://example.test/a.mp4' }] },
      { topicId: 'shared', courseId: 'b', title: 'Renal',
        videos: [{ url: 'https://example.test/b.mp4' }] },
    ] };
    window.DB = { getAllTimestamps: vi.fn(async () => [
        { id: 'recent', topicId: 'shared', courseId: 'b', position: 98 },
      ]), getSetting: vi.fn(async () => null) };
    window.OpenCourseDeck = {};
    mountPlaylistsView({
      setView: html => { document.querySelector('main').innerHTML = html; },
      safeMediaUrl: media => typeof media === 'string' ? media : media?.url,
      Toast: { error: vi.fn() },
    });
    const card = await vi.waitFor(() => {
      const el = document.querySelector('[data-playlist-id="timestamp-queue"]');
      expect(el).not.toBeNull();
      return el;
    });
    expect(card.textContent).toContain('Renal');
    expect(card.textContent).not.toContain('Cardiac');
  });
});
