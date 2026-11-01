import fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountPlaylistsView } from '../src/views/playlistsRoute.js';

const css = fs.readFileSync('src/styles/views.css', 'utf8');
const studio = fs.readFileSync('src/views/studioRoute.js', 'utf8');
const finalCss = fs.readFileSync('src/styles/farzan-redesign.css', 'utf8');
const metricsCss = fs.readFileSync('src/styles/progress-enhancements.css', 'utf8');

describe('playback queue and study toolbar presentation', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main></main><div data-player id="live-player"></div>';
    document.getElementById('live-player')._pdPlayer = {
      queue: [{ title: 'First lesson', src: '/a.mp4' }, { title: 'Current lesson', src: '/b.mp4' }],
      trackIndex: 1,
      snapshot: () => ({
        queue: [{ title: 'First lesson', src: '/a.mp4' }, { title: 'Current lesson', src: '/b.mp4' }],
        queueIndex: 1, shuffle: false,
      }),
    };
    window.OpenCourseDeck = {};
    window.DataStore = { init: vi.fn(async () => {}), allTopics: () => [] };
    window.DB = { getSetting: vi.fn(async () => null), getAllTimestamps: vi.fn(async () => []) };
  });

  it('lets the single active queue fill its row without echoing the current title twice', async () => {
    mountPlaylistsView({
      setView: html => { document.querySelector('main').innerHTML = html; },
      safeMediaUrl: media => typeof media === 'string' ? media : media?.url,
      Toast: { success: vi.fn(), error: vi.fn() },
    });
    await vi.waitFor(() => expect(document.querySelector('[data-playlist-id="active-queue"]')).not.toBeNull());
    const card = document.querySelector('[data-playlist-id="active-queue"]');
    expect(document.querySelector('[data-playlist-list]').dataset.single).toBe('true');
    expect(card.querySelector('[data-playlist-current]').textContent).toContain('Current lesson');
    expect(card.querySelector('.playlist-preview').hidden).toBe(true);
    expect(css).toContain('.view-playlists .grid[data-playlist-list][data-single="true"]');
    expect(css).toMatch(/\.playlist-card-body > \.badge\s*\{[^}]*align-self:\s*flex-start;/s);
  });

  it('uses clear selected-tool emphasis but only Save is a primary top-level Studio action', () => {
    expect(studio).toContain('class="btn btn-ghost btn-sm" data-studio-add-text');
    expect(studio).toContain('data-studio-tool="pen" aria-pressed="true"');
    expect(finalCss).toContain('.view-studio [data-studio-tool][aria-pressed="true"]');
  });

  it('presents completion as a static metric rather than a selected filter', () => {
    expect(metricsCss).toMatch(/\.progress-metric-featured\s*\{[^}]*border-color:\s*var\(--glass-border\);/s);
    expect(metricsCss).toMatch(/\.progress-metric-featured\s*\{[^}]*background:\s*var\(--surface-2\);/s);
  });
});
