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

  it('isolates English queue counts from Persian titles under an RTL workspace', async () => {
    const previousDir = document.documentElement.dir;
    document.documentElement.dir = 'rtl';
    try {
      document.body.innerHTML = '<main id="main-content"></main>';
      const topics = Array.from({ length: 6 }, (_, i) => ({
        topicId: 'lesson-' + i, courseId: 'medicine',
        courseTitle: 'دوره پزشکی', sourceIndex: 0,
        sourceLabel: 'بخش اول', title: 'درس ' + i,
        videos: [{ url: 'https://example.test/' + i + '.mp4' }],
      }));
      window.DataStore = { init: vi.fn(async () => true), allTopics: vi.fn(() => topics) };
      window.DB = { getAllTimestamps: vi.fn(async () => []), getSetting: vi.fn(async () => null) };
      window.OpenCourseDeck = {};
      mountPlaylistsView({
        setView: markup => { document.querySelector('main').innerHTML = markup; },
        safeMediaUrl: media => media?.url || media,
        Toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
      });
      const card = await vi.waitFor(() => {
        const element = document.querySelector('[data-playlist-id="source-1"]');
        expect(element).not.toBeNull();
        return element;
      });
      expect(card.querySelector('h2').getAttribute('dir')).toBe('auto');
      expect(card.querySelector('.playlist-card-detail').textContent).toBe('6 video topics');
      expect(card.querySelector('.playlist-card-detail > bdi')?.getAttribute('dir')).toBe('auto');
      expect(card.querySelector('.playlist-more').textContent).toBe('2 more topics');
      expect(card.querySelector('.playlist-more > bdi')?.getAttribute('dir')).toBe('auto');
      const discovery = document.querySelector('.playlists-discover-summary');
      expect(discovery.textContent).toContain('1 featured of 1');
      expect(discovery.querySelector('bdi')?.getAttribute('dir')).toBe('auto');
    } finally {
      document.documentElement.dir = previousDir;
    }
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
        ? [{ id: 'playlist-1', title: 'My queue', topicIds: ['topic-2','topic-1'], sourceRefs: [{ courseId: 'course-1', topicId: 'topic-2' }, { courseId: 'course-1', topicId: 'topic-1' }], createdAt: 1 }]
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
    await vi.waitFor(() => expect(document.querySelector('[data-playlists-error]')).not.toBeNull());
    expect(document.querySelector('[data-open-playlist="ambiguous"]')).toBeNull();
    expect(setPendingCourseSession).not.toHaveBeenCalled();
    expect(Router.navigate).not.toHaveBeenCalled();
    expect(window.DB.saveSetting).not.toHaveBeenCalled();
    expect(saved[0].topicIds).toEqual(['shared']);
  });

  it('still disables unsafe queues when unscoped topic IDs cannot identify a course', async () => {
    document.body.innerHTML = '<main id="main-content"></main>';
    window.DataStore = { init: vi.fn(async () => true), allTopics: () => [
      { topicId: 'shared', title: 'Cardiac',
        videos: [{ url: 'https://example.test/a.mp4' }] },
      { topicId: 'shared', title: 'Renal',
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
      .toMatch(/cannot be identified|unsafe|source/i);
    expect(window.DB.saveSetting).not.toHaveBeenCalled();
  });

  it('prefers the first course-scoped queue when other courses reuse topic IDs', async () => {
    document.body.innerHTML = '<main id="main-content"></main>';
    let saved = [];
    window.DataStore = { init: vi.fn(async () => true), allTopics: () => [
      { topicId: 'shared', courseId: 'a', title: 'Cardiac', videos: [{ url: 'https://example.test/a.mp4' }] },
      { topicId: 'shared', courseId: 'b', title: 'Renal', videos: [{ url: 'https://example.test/b.mp4' }] },
      { topicId: 'unique', courseId: 'c', title: 'Safe lecture', videos: [{ url: 'https://example.test/c.mp4' }] },
    ] };
    window.DB = {
      getAllTimestamps: vi.fn(async () => []),
      getSetting: vi.fn(async () => structuredClone(saved)),
      compareAndSwapSetting: vi.fn(async (key, expected, next) => {
        if (key !== 'ocd_playlists' || JSON.stringify(expected) !== JSON.stringify(saved)) return false;
        saved = structuredClone(next);
        return true;
      }),
    };
    window.OpenCourseDeck = {};
    const Toast = { success: vi.fn(), error: vi.fn() };
    mountPlaylistsView({
      setView: html => { document.querySelector('main').innerHTML = html; },
      safeMediaUrl: media => typeof media === 'string' ? media : media?.url, Toast,
    });
    const save = await vi.waitFor(() => {
      expect(document.querySelector('[data-playlist-id="source-3"]')).not.toBeNull();
      return document.querySelector('[data-save-playlist]');
    });
    expect(save.disabled).toBe(false);
    save.click();
    await vi.waitFor(() => expect(Toast.success).toHaveBeenCalledWith('Playlist saved'));
    expect(saved).toHaveLength(1);
    expect(saved[0].topicIds).toEqual(['shared']);
    expect(saved[0].sourceRefs).toEqual([{ courseId: 'a', topicId: 'shared' }]);
  });

  it('keeps a saved timestamp title instead of borrowing a duplicated imported course-topic source', async () => {
    document.body.innerHTML = '<main id="main-content"></main>';
    const timestamps = [{ id: 'ts-ambiguous', topicId: 'shared',
      courseId: 'renal', title: 'Saved kidney lecture checkpoint', position: 104 }];
    window.DataStore = { init: vi.fn(async () => true), allTopics: () => [
      { topicId: 'shared', courseId: 'renal', title: 'Incorrect first imported source',
        videos: [{ url: 'https://example.test/a.mp4' }] },
      { topicId: 'shared', courseId: 'renal', title: 'Conflicting second imported source',
        videos: [{ url: 'https://example.test/b.mp4' }] },
    ] };
    window.DB = { getAllTimestamps: vi.fn(async () => structuredClone(timestamps)),
      getSetting: vi.fn(async () => null), saveSetting: vi.fn() };
    window.OpenCourseDeck = {};
    mountPlaylistsView({
      setView: html => { document.querySelector('main').innerHTML = html; },
      safeMediaUrl: media => typeof media === 'string' ? media : media?.url,
      Toast: { error: vi.fn() },
    });
    const card = await vi.waitFor(() => {
      const el = document.querySelector('[data-playlist-id="timestamp-queue"]');
      expect(el).not.toBeNull(); return el;
    });
    expect(card.textContent).toContain('Saved kidney lecture checkpoint');
    expect(card.textContent).not.toContain('Incorrect first imported source');
    expect(card.textContent).not.toContain('Conflicting second imported source');
    expect(window.DB.saveSetting).not.toHaveBeenCalled();
    expect(timestamps[0].title).toBe('Saved kidney lecture checkpoint');
  });

  it('never borrows a uniquely named topic from a different course than the saved timestamp', async () => {
    document.body.innerHTML = '<main id="main-content"></main>';
    const timestamp = { id: 'ts-removed', topicId: 'legacy-topic',
      courseId: 'old-course', title: 'Archived course checkpoint', position: 62 };
    window.DataStore = { init: vi.fn(async () => true), allTopics: () => [
      { topicId: 'legacy-topic', courseId: 'replacement-course',
        title: 'Unrelated new imported lesson', videos: [{ url: 'https://example.test/unrelated.mp4' }] },
    ] };
    window.DB = { getAllTimestamps: vi.fn(async () => [structuredClone(timestamp)]),
      getSetting: vi.fn(async () => null) };
    window.OpenCourseDeck = {};
    mountPlaylistsView({
      setView: html => { document.querySelector('main').innerHTML = html; },
      safeMediaUrl: media => typeof media === 'string' ? media : media?.url,
      Toast: { error: vi.fn() },
    });
    const card = await vi.waitFor(() => {
      const el = document.querySelector('[data-playlist-id="timestamp-queue"]');
      expect(el).not.toBeNull(); return el;
    });
    expect(card.textContent).toContain('Archived course checkpoint');
    expect(card.textContent).not.toContain('Unrelated new imported lesson');
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
