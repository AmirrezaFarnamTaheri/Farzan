import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountPlaylistsView } from '../src/views/playlistsRoute.js';

describe('visible current and next live-playlist positions', () => {
  const tracks = [
    { title: 'Anatomy introduction', src: 'https://example.test/a.mp4' },
    { title: 'فیزیولوژی قلب', src: 'https://example.test/b.mp4' },
    { title: 'Renal review 你好', src: 'https://example.test/c.mp4' },
  ];
  let player;
  const mount = () => mountPlaylistsView({
    setView: html => { document.querySelector('main').innerHTML = html; },
    safeMediaUrl: media => typeof media === 'string' ? media : media?.url,
    Toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  });

  beforeEach(() => {
    document.body.innerHTML = '<main></main><div data-player id="live-player"></div>';
    player = { queue: tracks, trackIndex: 1,
      snapshot: () => ({ queue: tracks, queueIndex: 1, shuffle: false, repeat: 'off' }) };
    document.getElementById('live-player')._pdPlayer = player;
    window.OpenCourseDeck = {};
    window.DataStore = { init: vi.fn(async () => {}), allTopics: () => [] };
    window.DB = { getSetting: vi.fn(async () => null), getAllTimestamps: vi.fn(async () => []) };
  });
  afterEach(() => {
    document.body.innerHTML = '';
    delete window.OpenCourseDeck;
    delete window.DataStore;
    delete window.DB;
    vi.restoreAllMocks();
  });

  it('shows the real current and next titles for a loaded live player in mixed-script order', async () => {
    mount();
    const card = await vi.waitFor(() => {
      const node = document.querySelector('[data-playlist-id="active-queue"]');
      expect(node).toBeTruthy();
      return node;
    });
    expect(card.querySelector('[data-playlist-current]')?.textContent).toContain('فیزیولوژی قلب');
    expect(card.querySelector('[data-playlist-next]')?.textContent).toContain('Renal review 你好');
    expect(card.querySelector('[data-playlist-current] bdi')?.getAttribute('dir')).toBe('auto');
    expect(card.querySelector('[data-playlist-next] bdi')?.getAttribute('dir')).toBe('auto');
    expect(card.querySelectorAll('.playlist-preview-item')).toHaveLength(3);
  });

  it('does not invent a current or next track without a trustworthy player index', async () => {
    player.trackIndex = undefined;
    player.snapshot = () => ({ queue: tracks, queueIndex: -1 });
    mount();
    const card = await vi.waitFor(() => {
      const node = document.querySelector('[data-playlist-id="active-queue"]');
      expect(node).toBeTruthy();
      return node;
    });
    expect(card.querySelector('[data-playlist-current]')).toBeNull();
    expect(card.querySelector('[data-playlist-next]')).toBeNull();
  });

  it('does not mislabel the next shuffled track as the next sequential row', async () => {
    player.snapshot = () => ({ queue: tracks, queueIndex: 1, shuffle: true });
    mount();
    const card = await vi.waitFor(() => {
      const node = document.querySelector('[data-playlist-id="active-queue"]');
      expect(node).toBeTruthy();
      return node;
    });
    expect(card.querySelector('[data-playlist-current]')?.textContent).toContain('فیزیولوژی قلب');
    expect(card.querySelector('[data-playlist-next]')).toBeNull();
  });
});
