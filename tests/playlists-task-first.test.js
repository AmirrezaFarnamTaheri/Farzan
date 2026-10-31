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
      saveSetting: vi.fn(async (key, value) => { saved = value; return true; }),
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

  it('puts saved queues in the main view and keeps catalog recommendations in a disclosure', async () => {
    saved = [{ id: 'favorite', title: 'My queue', topicIds: ['b', 'a'], createdAt: 1 }];
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-playlist-id="favorite"]')).not.toBeNull());
    const list = document.querySelector('[data-playlist-list]');
    const catalog = document.querySelector('[data-playlist-catalog]');
    const discover = document.querySelector('[data-playlists-discover]');
    expect(list.querySelector('[data-playlist-id="favorite"]')).not.toBeNull();
    expect(list.querySelector('[data-playlist-id="source-1"]')).toBeNull();
    expect(catalog.querySelector('[data-playlist-id="source-1"]')).not.toBeNull();
    expect(discover.open).toBe(false);
    expect([...document.querySelectorAll('[data-playlist-metrics] .stat-card')].map(el => el.textContent)).not.toContain('0Queue cards');
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
});
