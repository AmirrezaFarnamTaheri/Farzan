import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mountPlaylistsView } from '../src/views/playlistsRoute.js';

describe('Live Playlists player handoff', () => {
  const queue = [
    { title: 'Lecture A', topicId: 'a', courseId: 'medicine', src: 'https://example.test/a.mp4' },
    { title: 'Lecture B — قلب', topicId: 'b', courseId: 'medicine', src: 'https://example.test/b.mp4' },
  ];
  let player;
  let resume;
  let navigate;
  beforeEach(() => {
    document.body.innerHTML = '<main id="playlist-host"></main><div data-player id="live-player"></div>';
    player = {
      queue, trackIndex: 1,
      snapshot: () => ({
        queue, queueIndex: 1, currentTime: 93.25, duration: 600,
        playing: true, volume: 0.6, muted: false, shuffle: true,
        repeat: 'all', playbackRate: 1.25, track: queue[1],
      }),
    };
    document.getElementById('live-player')._pdPlayer = player;
    window.DB = { getAllTimestamps: vi.fn(async () => []), getSetting: vi.fn(async () => null) };
    window.DataStore = { init: vi.fn(async () => {}), allTopics: () => [] };
    window.OpenCourseDeck = {};
    resume = vi.fn();
    navigate = vi.fn();
  });
  afterEach(() => {
    delete window.DB;
    delete window.DataStore;
    delete window.OpenCourseDeck;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });
  const mount = () => mountPlaylistsView({
    setView: html => { document.getElementById('playlist-host').innerHTML = html; },
    setPendingCourseSession: resume,
    Router: { navigate },
    safeMediaUrl: src => typeof src === 'string' ? src : src?.url,
    Toast: { error: vi.fn(), success: vi.fn() },
  });

  it('resumes actual time and queue order without guessing shuffle or autoplaying unexpectedly', async () => {
    mount();
    const link = await vi.waitFor(() => {
      const element = document.querySelector('[data-resume-live-queue]');
      expect(element).not.toBeNull();
      return element;
    });
    link.click();
    expect(resume).toHaveBeenCalledOnce();
    const snapshot = resume.mock.calls[0][0];
    expect(snapshot.queue.map(x => x.topicId)).toEqual(['a', 'b']);
    expect(snapshot.queueIndex).toBe(1);
    expect(snapshot.currentTime).toBe(93.25);
    expect(snapshot.track.topicId).toBe('b');
    expect(snapshot.shuffle).toBe(true);
    expect(snapshot.repeat).toBe('all');
    expect(snapshot.playing).toBe(false);
    expect(navigate).toHaveBeenCalledWith('#/courses');
  });

  it('does not hand off a stale or unidentifiable player queue', async () => {
    player.snapshot = () => ({ queue, queueIndex: -1, currentTime: 93, shuffle: true });
    mount();
    const link = await vi.waitFor(() => {
      const el = document.querySelector('[data-resume-live-queue]');
      expect(el).not.toBeNull();
      return el;
    });
    link.click();
    expect(resume).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(link.getAttribute('href')).toBe('#/courses');
  });

  it('does not invent shuffle state or a course association', async () => {
    player.snapshot = () => ({
      queue: [{ title: 'Unknown track', src: 'https://example.test/unknown.mp4' }],
      queueIndex: 0, currentTime: 30, playing: false,
    });
    player.queue = [{ title: 'Unknown track', src: 'https://example.test/unknown.mp4' }];
    mount();
    const link = await vi.waitFor(() => {
      const el = document.querySelector('[data-resume-live-queue]');
      expect(el).not.toBeNull();
      return el;
    });
    link.click();
    expect(resume).not.toHaveBeenCalled();
  });
});
