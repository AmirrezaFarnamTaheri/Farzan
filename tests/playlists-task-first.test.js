import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mountPlaylistsView } from '../src/views/playlistsRoute.js';

describe('Playlists task-first organization', () => {
  let oldStore;
  let oldDB;
  let oldOCD;
  let saved;
  const topics = [
    { topicId: 'a', title: 'Lesson A', courseId: 'course-1', courseTitle: 'Course One',
      sourceIndex: 0, sourceLabel: 'Section', videos: [{ url: 'https://example.test/a.mp4' }] },
    { topicId: 'b', title: 'Lesson B', courseId: 'course-1', courseTitle: 'Course One',
      sourceIndex: 0, sourceLabel: 'Section', videos: [{ url: 'https://example.test/b.mp4' }] },
  ];
  beforeEach(() => {
    oldStore = window.DataStore;
    oldDB = window.DB;
    oldOCD = window.OpenCourseDeck;
    document.body.innerHTML = '<main id="main-content"></main>';
    window.DataStore = { init: vi.fn(async () => true), allTopics: () => topics.slice() };
    window.OpenCourseDeck = { UserLibrary: { overlay: vi.fn(async () => {}) } };
    saved = [];
    window.DB = {
      getAllTimestamps: vi.fn(async () => []),
      getSetting: vi.fn(async key => key === 'ocd_playlists' ? saved : null),
      saveSetting: vi.fn(async () => { throw new Error('Non-atomic writer must not run'); }),
      compareAndSwapSetting: vi.fn(async (key, expected, next) => {
        if (key !== 'ocd_playlists' || JSON.stringify(expected) !== JSON.stringify(saved)) return false;
        saved = structuredClone(next);
        return true;
      }),
    };
  });
  afterEach(() => {
    window.DataStore = oldStore;
    window.DB = oldDB;
    window.OpenCourseDeck = oldOCD;
    document.body.innerHTML = '';
  });
  const mount = () => mountPlaylistsView({
    setView: html => { document.querySelector('main').innerHTML = html; },
    safeMediaUrl: media => typeof media === 'string' ? media : media?.url,
    Toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  });

  it.each([
    ['course catalog reader', () => { delete window.DataStore.allTopics; }, /catalog|course/i],
    ['timestamp reader', () => { delete window.DB.getAllTimestamps; }, /timestamp|saved.*moment/i],
    ['saved playlist reader', () => { delete window.DB.getSetting; }, /saved playlists/i],
    ['imported course overlay', () => {
      window.OpenCourseDeck.UserLibrary.overlay.mockRejectedValue(new Error('Imported courses unavailable'));
    }, /catalog|course/i],
  ])('fails closed when the %s is unavailable rather than showing empty queues', async (_reason, breakReader, message) => {
    saved = [{ id: 'stored-queue', title: 'Persisted offline queue', topicIds: ['a'],
      sourceRefs: [{ courseId: 'course-1', topicId: 'a' }], createdAt: 1 }];
    const original = structuredClone(saved);
    breakReader();
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-playlists-error]')).not.toBeNull());
    const alert = document.querySelector('[data-playlists-error]');
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toMatch(message);
    expect(document.querySelector('[data-playlists-discover]').hidden).toBe(true);
    expect(document.querySelector('[data-playlist-list] [data-playlist-id]')).toBeNull();
    expect(document.querySelector('[data-playlist-metrics]').children).toHaveLength(0);
    expect(window.DB.compareAndSwapSetting).not.toHaveBeenCalled();
    expect(saved).toEqual(original);
  });

  it('puts saved queues in the main view and keeps catalog recommendations in a disclosure', async () => {
    saved = [{ id: 'favorite', title: 'My queue', topicIds: ['b', 'a'], sourceRefs: [{ courseId: 'course-1', topicId: 'b' }, { courseId: 'course-1', topicId: 'a' }], createdAt: 1 }];
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-playlist-id="favorite"]')).not.toBeNull());
    const list = document.querySelector('[data-playlist-list]');
    const catalog = document.querySelector('[data-playlist-catalog]');
    const discover = document.querySelector('[data-playlists-discover]');
    expect(list.querySelector('[data-playlist-id="favorite"]')).not.toBeNull();
    expect(list.querySelector('[data-playlist-id="source-1"]')).toBeNull();
    expect(catalog.querySelector('[data-playlist-id="source-1"]')).not.toBeNull();
    expect(discover.open).toBe(false);
    expect(document.querySelector('.playlists-list-card')?.classList.contains('card')).toBe(false);
    expect([...document.querySelectorAll('[data-playlist-metrics] .stat-card')].map(el => el.textContent)).not.toContain('0Queue cards');
  });

  it('makes every saved queue reachable beyond the initial 24-card page without changing storage', async () => {
    saved = Array.from({ length: 30 }, (_, index) => ({
      id: 'saved-' + index,
      title: 'Review queue ' + index,
      topicIds: ['a'],
      sourceRefs: [{ courseId: 'course-1', topicId: 'a' }],
      createdAt: index + 1,
      updatedAt: index + 1,
    }));
    const original = structuredClone(saved);
    mount();
    await vi.waitFor(() => expect(document.querySelectorAll(
      '[data-playlist-list] [data-playlist-id]')).toHaveLength(24));
    const hiddenLast = document.querySelector('[data-playlist-list] [data-playlist-id="saved-0"]');
    expect(hiddenLast).toBeNull();
    const more = document.querySelector('[data-playlists-show-more]');
    expect(more).not.toBeNull();
    expect(more.tagName).toBe('BUTTON');
    expect(more.textContent).toMatch(/more/i);
    more.focus();
    more.click();
    await vi.waitFor(() => expect(document.querySelectorAll(
      '[data-playlist-list] [data-playlist-id]')).toHaveLength(30));
    expect(document.querySelector('[data-playlist-list] [data-playlist-id="saved-0"]')).not.toBeNull();
    expect(document.querySelector('[data-playlists-show-more]')).toBeNull();
    expect(saved).toEqual(original);
    expect(window.DB.saveSetting).not.toHaveBeenCalled();
    expect(window.DB.compareAndSwapSetting).not.toHaveBeenCalled();
  });

  it('allows first-time saving directly from the expanded course catalog without five zero counters', async () => {
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-playlist-catalog] [data-playlist-id="source-1"]')).not.toBeNull());
    const discover = document.querySelector('[data-playlists-discover]');
    expect(discover.open).toBe(true);
    expect(document.querySelector('[data-playlist-metrics]').hidden).toBe(true);
    const save = discover.querySelector('[data-save-playlist]');
    expect(save.disabled).toBe(false);
    save.click();
    await vi.waitFor(() => expect(saved).toHaveLength(1));
    await vi.waitFor(() => expect(document.querySelector('[data-playlist-list] [data-open-playlist]')).not.toBeNull());
    expect(saved[0].topicIds).toEqual(['a', 'b']);
    expect(discover.open).toBe(false);
  });

  it('reports an unreadable saved queue and recovers on retry instead of showing a false empty state', async () => {
    let unavailable = true;
    window.DB.getSetting = vi.fn(async () => {
      if (unavailable) throw new Error('Saved playlist database temporarily unavailable');
      return saved;
    });
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-playlists-error]')).not.toBeNull());
    expect(document.querySelector('[data-playlists-error]').getAttribute('role')).toBe('alert');
    expect(document.querySelector('[data-playlists-discover]').hidden).toBe(true);
    expect(document.querySelector('[data-playlist-list] [data-playlist-id]')).toBeNull();

    saved = [{ id: 'restored', title: 'Restored queue', topicIds: ['b'], sourceRefs: [{ courseId: 'course-1', topicId: 'b' }], createdAt: 2 }];
    unavailable = false;
    document.querySelector('[data-playlists-retry]').click();
    await vi.waitFor(() => expect(document.querySelector('[data-playlist-list] [data-playlist-id="restored"]')).not.toBeNull());
    expect(document.querySelector('[data-playlists-error]')).toBeNull();
  });


  it('shows a retryable catalog failure without editing saved playlists or claiming the catalog is empty', async () => {
    saved = [{ id: 'saved-renal', title: 'Renal review queue', topicIds: ['a'], sourceRefs: [{ courseId: 'course-1', topicId: 'a' }], createdAt: 3 }];
    const before = structuredClone(saved);
    let offline = true;
    window.DataStore.init = vi.fn(async () => {
      if (offline) throw new Error('Course catalog storage unavailable');
      return true;
    });
    const writer = vi.spyOn(window.DB, 'saveSetting');
    mount();

    await vi.waitFor(() => expect(document.querySelector('[data-playlists-error]')).not.toBeNull());
    const alert = document.querySelector('[data-playlists-error]');
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toMatch(/catalog|courses/i);
    expect(document.querySelector('[data-playlists-discover]').hidden).toBe(true);
    expect(document.querySelector('[data-playlist-list] [data-playlist-id]')).toBeNull();
    expect(writer).not.toHaveBeenCalled();
    expect(saved).toEqual(before);

    offline = false;
    document.querySelector('[data-playlists-retry]').click();
    await vi.waitFor(() => expect(document.querySelector('[data-playlist-id="saved-renal"]')).not.toBeNull());
    expect(document.querySelector('[data-playlists-error]')).toBeNull();
    expect(writer).not.toHaveBeenCalled();
    expect(saved).toEqual(before);
  });

  it('does not present a false empty Resume queue when canonical timestamps are temporarily unreadable', async () => {
    saved = [{ id: 'review', title: 'Saved review', topicIds: ['a'], sourceRefs: [{ courseId: 'course-1', topicId: 'a' }], createdAt: 1 }];
    const original = structuredClone(saved);
    const writer = vi.spyOn(window.DB, 'saveSetting');
    let inaccessible = true;
    window.DB.getAllTimestamps = vi.fn(async () => {
      if (inaccessible) throw new Error('Canonical timestamp storage inaccessible');
      return [{ id: 'ts-a', topicId: 'a', courseId: 'course-1', position: 42, title: 'Saved point' }];
    });
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-playlists-error]')).not.toBeNull());
    const error = document.querySelector('[data-playlists-error]');
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.textContent).toMatch(/timestamp|saved.*moment|resume/i);
    expect(document.querySelector('[data-playlist-id="review"]')).toBeNull();
    expect(document.querySelector('[data-playlists-discover]').hidden).toBe(true);
    expect(writer).not.toHaveBeenCalled();
    expect(saved).toEqual(original);

    inaccessible = false;
    document.querySelector('[data-playlists-retry]').click();
    await vi.waitFor(() => expect(document.querySelector('[data-playlist-id="timestamp-queue"]')).not.toBeNull());
    expect(document.querySelector('[data-playlist-id="review"]')).not.toBeNull();
    expect(document.querySelector('[data-playlists-error]')).toBeNull();
    expect(writer).not.toHaveBeenCalled();
  });

  it('does not repeat a single active-queue count as a prominent metric', async () => {
    const player = document.createElement('div');
    player.dataset.player = '';
    player._pdPlayer = { queue: [{ title: 'Current lecture', src: 'https://example.test/a.mp4' }] };
    document.body.appendChild(player);
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-playlist-id="active-queue"]')).not.toBeNull());
    expect(document.querySelector('[data-playlist-metrics]').hidden).toBe(true);
  });

});
