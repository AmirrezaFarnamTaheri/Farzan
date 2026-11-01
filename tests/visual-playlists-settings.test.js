import fs from 'node:fs';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mountPlaylistsView } from '../src/views/playlistsRoute.js';
import { mountSettingsView } from '../src/views/settingsRoute.js';

const views = fs.readFileSync('src/styles/views.css', 'utf8');
const settingsCss = fs.readFileSync('src/styles/settings-enhancements.css', 'utf8');

describe('Playlists and Settings: readable controls without losing behavior', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    delete window.DB;
    delete window.DataStore;
    delete window.OpenCourseDeck;
    delete window.ProgressStats;
  });

  it('shows an active queue once, with a useful player action and no redundant current-title preview', async () => {
    const track = { title: 'Renal review — کلیه', topicId: 'study-1', src: 'https://example.test/renal.mp4' };
    document.body.innerHTML = '<main></main><div data-player id="live-player"></div>';
    document.getElementById('live-player')._pdPlayer = {
      queue: [track], trackIndex: 0, snapshot: () => ({ queue: [track], queueIndex: 0, currentTime: 52 }),
    };
    window.OpenCourseDeck = {};
    window.DataStore = { init: vi.fn(async () => {}), allTopics: vi.fn(async () => []) };
    window.DB = { getSetting: vi.fn(async () => null), getAllTimestamps: vi.fn(async () => []) };
    mountPlaylistsView({ setView: html => { document.querySelector('main').innerHTML = html; },
      safeMediaUrl: x => x?.src || x?.url || x,
      Router: { navigate: vi.fn() }, setPendingCourseSession: vi.fn(),
      Toast: { error: vi.fn() },
    });
    const card = await vi.waitFor(() => {
      const element = document.querySelector('[data-playlist-id="active-queue"]');
      expect(element).not.toBeNull();
      return element;
    });
    expect(card.querySelector('[data-playlist-current]').textContent).toContain('Renal review');
    expect(card.querySelectorAll('.playlist-preview-item')).toHaveLength(0);
    expect(card.querySelector('.playlist-card-actions .btn').textContent).toMatch(/player/i);
    expect(views).toMatch(/\.view-playlists \[data-playlist-list\]:has\(> \.playlist-card:only-child\)/);
    expect(views).toMatch(/\.playlist-card-body \.badge\s*\{[^}]*align-self:\s*flex-start;/s);
  });

  it('keeps Settings anchor navigation marked as current and does not send hashes through the SPA router', () => {
    document.body.innerHTML = '<main id="view-container"></main>';
    window.DB = { getSetting: vi.fn(async () => null), saveSetting: vi.fn(async () => true) };
    window.ProgressStats = { exportJSON: vi.fn(), importJSON: vi.fn() };
    window.OpenCourseDeck = { AI: {}, bus: { on: vi.fn(), off: vi.fn(), emit: vi.fn() } };
    const mount = mountSettingsView({
      setView: markup => { document.getElementById('view-container').innerHTML = markup; },
      ThemeManager: {}, FontScale: { get: () => 1 }, Prefs: { KEYS: { density: 'density' }, get: () => 'comfortable' },
      Toast: { error: vi.fn(), success: vi.fn() }, formatBytes: x => String(x), localStorageFootprint: () => 0,
    });
    const first = document.querySelector('.settings-nav a[href="#settings-appearance"]');
    const storage = document.querySelector('.settings-nav a[href="#settings-storage"]');
    const destination = document.querySelector('#settings-storage');
    destination.scrollIntoView = vi.fn();
    expect(first.getAttribute('aria-current')).toBe('location');
    window.location.hash = '#/settings';
    storage.click();
    expect(window.location.hash).toBe('#/settings');
    expect(storage.getAttribute('aria-current')).toBe('location');
    expect(first.hasAttribute('aria-current')).toBe(false);
    expect(destination.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
    mount?.unmount?.();
    expect(settingsCss).toMatch(/\.settings-nav a\[aria-current="location"\]\s*\{[^}]*background:/s);
    expect(settingsCss).toMatch(/#select-density,[\s\S]*?#select-language\s*\{[^}]*appearance:\s*auto;/);
  });
});
