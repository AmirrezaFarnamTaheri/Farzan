import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('MediaPlayer queue rendering', () => {
  let originalAudioContext;
  let originalResizeObserver;

  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="player"></div>';
    window.PlasmaDeck = { bus: { emit: vi.fn() } };
    originalAudioContext = window.AudioContext;
    originalResizeObserver = window.ResizeObserver;
    Element.prototype.scrollIntoView = vi.fn();
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    await import('../player.js');
  });

  afterEach(() => {
    window.AudioContext = originalAudioContext;
    window.ResizeObserver = originalResizeObserver;
    vi.restoreAllMocks();
  });

  it('renders queue metadata as text instead of executable HTML', () => {
    const player = new window.PlasmaDeck.MediaPlayer('#player', { type: 'audio' });
    player.loadPlaylist([
      {
        title: '<img src=x onerror="window.__queueXss = true">',
        artist: '<script>window.__queueArtistXss = true</script>',
        src: 'track.mp3',
      },
    ]);

    player.showQueue();

    const row = document.querySelector('.pd-queue-item');
    expect(row.querySelector('.pd-queue-title').textContent).toContain('<img');
    expect(row.querySelector('.pd-queue-artist').textContent).toContain('<script>');
    expect(row.querySelector('.pd-queue-title img')).toBeNull();
    expect(row.querySelector('.pd-queue-num svg polygon')).not.toBeNull();
    expect(window.__queueXss).toBeUndefined();
    expect(window.__queueArtistXss).toBeUndefined();
  });

  it('rejects unsafe media and artwork URLs before assigning DOM sources', () => {
    const player = new window.PlasmaDeck.MediaPlayer('#player', { type: 'audio' });
    player.loadPlaylist([
      {
        title: 'Unsafe',
        artist: 'Catalog',
        src: 'javascript:window.__mediaXss = true',
        artwork: 'data:text/html,<script>window.__artXss = true</script>',
      },
    ]);

    const media = document.querySelector('#player audio');
    const artwork = document.querySelector('#player .pd-art-img');

    expect(media.hasAttribute('src')).toBe(false);
    expect(artwork.getAttribute('src')).toBe('');
    expect(artwork.style.display).toBe('none');
    expect(window.__mediaXss).toBeUndefined();
    expect(window.__artXss).toBeUndefined();
  });

  it('allows standalone player media and artwork URL families that match their context', () => {
    const player = new window.PlasmaDeck.MediaPlayer('#player', { type: 'audio' });
    player.loadPlaylist([
      {
        title: 'Safe',
        artist: 'Catalog',
        src: 'data:audio/mpeg;base64,AAAA',
        artwork: 'data:image/png;base64,AAAA',
      },
    ]);

    expect(document.querySelector('#player audio').getAttribute('src')).toBe('data:audio/mpeg;base64,AAAA');
    expect(document.querySelector('#player .pd-art-img').getAttribute('src')).toBe('data:image/png;base64,AAAA');
  });

  it('clears stale media and tolerates empty playlists', () => {
    const player = new window.PlasmaDeck.MediaPlayer('#player', { type: 'audio' });
    player.loadPlaylist([{ title: 'Old track', artist: 'Old artist', src: 'old.mp3' }]);

    expect(player.queue).toHaveLength(1);

    player.loadPlaylist([]);

    expect(player.queue).toEqual([]);
    expect(player.trackIndex).toBe(0);
    expect(document.querySelector('#player .pd-title').textContent).toBe('—');
    expect(document.querySelector('#player .pd-artist').textContent).toBe('—');
    expect(document.querySelector('#player audio').hasAttribute('src')).toBe(false);
    expect(() => player.next()).not.toThrow();
    expect(() => player.prev()).not.toThrow();
  });

  it('emits seeked progress payloads and flushes the previous track before switching', () => {
    const player = new window.PlasmaDeck.MediaPlayer('#player', { type: 'audio' });
    const seeked = vi.fn();
    const beforeTrackChange = vi.fn();
    player.on('seeked', seeked);
    player.on('beforeTrackChange', beforeTrackChange);

    Object.defineProperty(player._media, 'duration', { value: 100, configurable: true });
    player.loadPlaylist([
      { id: 'a', title: 'A', src: 'a.mp3', topicId: 'topic-a', courseId: 'course-a' },
      { id: 'b', title: 'B', src: 'b.mp3', topicId: 'topic-b', courseId: 'course-b' },
    ]);

    player._state.duration = 100;
    player._media.currentTime = 25;
    player._media.dispatchEvent(new Event('seeked'));

    expect(seeked).toHaveBeenCalledWith(expect.objectContaining({
      track: expect.objectContaining({ id: 'a' }),
      currentTime: 25,
      duration: 100,
      percent: 25,
    }));

    player.playAt(1);

    expect(beforeTrackChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('emits durable timeupdate and pause payloads for the active track', () => {
    const player = new window.PlasmaDeck.MediaPlayer('#player', { type: 'audio' });
    const timeupdate = vi.fn();
    const pause = vi.fn();
    player.on('timeupdate', timeupdate);
    player.on('pause', pause);

    Object.defineProperty(player._media, 'duration', { value: 200, configurable: true });
    player.loadPlaylist([
      { id: 'a', title: 'A', src: 'a.mp3', topicId: 'topic-a', courseId: 'course-a' },
    ]);

    player._state.duration = 200;
    player._media.currentTime = 50;
    player._media.dispatchEvent(new Event('timeupdate'));
    player._media.dispatchEvent(new Event('pause'));

    expect(timeupdate).toHaveBeenCalledWith({
      currentTime: 50,
      duration: 200,
      percent: 25,
    });
    expect(pause).toHaveBeenCalledWith(expect.objectContaining({
      id: 'a',
      topicId: 'topic-a',
      courseId: 'course-a',
    }));
    expect(JSON.parse(sessionStorage.getItem('pd-player'))).toEqual(expect.objectContaining({
      currentTime: 50,
      queueIndex: 0,
    }));
  });

  it('captures a resumable snapshot of the active queue and playback position', () => {
    const player = new window.PlasmaDeck.MediaPlayer('#player', { type: 'audio' });
    Object.defineProperty(player._media, 'duration', { value: 180, configurable: true });
    player.loadPlaylist([
      { id: 'a', title: 'A', src: 'a.mp3', topicId: 'topic-a', courseId: 'course-a' },
      { id: 'b', title: 'B', src: 'b.mp3', topicId: 'topic-b', courseId: 'course-b' },
    ]);
    player.playAt(1);
    player._state.duration = 180;
    player._media.currentTime = 45;

    const snapshot = player.snapshot();

    expect(snapshot).toEqual(expect.objectContaining({
      queueIndex: 1,
      currentTime: 45,
      duration: 180,
      track: expect.objectContaining({ id: 'b', topicId: 'topic-b' }),
    }));
    expect(snapshot.queue).toHaveLength(2);
    expect(snapshot.queue[0]).not.toBe(player.queue[0]);
  });

  it('restores a full queue snapshot including index, timing, and playback settings', () => {
    const player = new window.PlasmaDeck.MediaPlayer('#player', { type: 'audio' });
    const seekTo = vi.spyOn(player, 'seekTo');
    const play = vi.spyOn(player, 'play').mockResolvedValue(undefined);

    const restored = player.restoreSnapshot({
      queue: [
        { id: 'a', title: 'A', src: 'a.mp3', topicId: 'topic-a', courseId: 'course-a' },
        { id: 'b', title: 'B', src: 'b.mp3', topicId: 'topic-b', courseId: 'course-b' },
      ],
      queueIndex: 1,
      currentTime: 65,
      duration: 180,
      playing: true,
      volume: 0.4,
      muted: true,
      shuffle: false,
      repeat: 'all',
      playbackRate: 1.5,
    });

    expect(restored).toBe(true);
    expect(player.trackIndex).toBe(1);
    expect(player.queue).toHaveLength(2);
    expect(player.queue[1]).toEqual(expect.objectContaining({ id: 'b', topicId: 'topic-b' }));
    expect(seekTo).toHaveBeenCalledWith(65);
    expect(player._media.playbackRate).toBe(1.5);
    expect(document.querySelector('#player [data-pd="speed"]').textContent).toBe('1.5x');
    expect(player._media.muted).toBe(true);
    expect(player._media.volume).toBe(0.4);
    expect(play).toHaveBeenCalled();
  });

  it('sizes the visualizer canvas through ResizeObserver instead of per-frame resizing', () => {
    const observers = [];
    const disconnect = vi.fn();
    const observe = vi.fn();
    window.ResizeObserver = class ResizeObserverMock {
      constructor(callback) {
        this.callback = callback;
        this.observe = observe;
        this.disconnect = disconnect;
        observers.push(this);
      }
    };
    window.AudioContext = class AudioContextMock {
      createAnalyser() {
        return {
          fftSize: 0,
          frequencyBinCount: 8,
          connect: vi.fn(),
          getByteFrequencyData: vi.fn(),
        };
      }
      createMediaElementSource() {
        return { connect: vi.fn() };
      }
      close() {}
      get destination() { return {}; }
    };
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 150,
      height: 30,
      top: 0,
      right: 150,
      bottom: 30,
      left: 0,
      x: 0,
      y: 0,
      toJSON() { return {}; },
    });

    const player = new window.PlasmaDeck.MediaPlayer('#player', { type: 'audio', visualizer: true });
    const canvas = document.querySelector('#player .pd-visualizer');

    expect(observers).toHaveLength(1);
    expect(observe).toHaveBeenCalledWith(canvas);
    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(60);

    player.destroy();

    expect(disconnect).toHaveBeenCalled();
  });

  it('does not animate the visualizer when reduced motion is requested', () => {
    window.AudioContext = class AudioContextMock {
      createAnalyser() {
        return {
          fftSize: 0,
          frequencyBinCount: 8,
          connect: vi.fn(),
          getByteFrequencyData: vi.fn(),
        };
      }
      createMediaElementSource() {
        return { connect: vi.fn() };
      }
      close() {}
      get destination() { return {}; }
    };
    window.matchMedia = vi.fn(() => ({ matches: true }));
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame');
    const clearRect = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect,
      createLinearGradient: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      fill: vi.fn(),
    });

    const player = new window.PlasmaDeck.MediaPlayer('#player', { type: 'audio', visualizer: true });
    player._state.playing = true;
    player._startViz();

    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(clearRect).toHaveBeenCalled();
    expect(requestFrame).not.toHaveBeenCalled();
    expect(player._vizAnimId).toBeNull();
  });

  it('returns the first active player snapshot before route teardown', () => {
    const player = new window.PlasmaDeck.MediaPlayer('#player', { type: 'audio' });
    document.querySelector('#player').setAttribute('data-player', '');
    document.querySelector('#player')._pdPlayer = player;
    player.loadPlaylist([{ id: 'a', title: 'A', src: 'a.mp3', topicId: 'topic-a' }]);

    const snapshot = window.PlasmaDeck.Player.getActiveSnapshot(document);

    expect(snapshot.track).toEqual(expect.objectContaining({ id: 'a', topicId: 'topic-a' }));
  });

  it('supports explicit Picture-in-Picture requests for video players', async () => {
    const player = new window.PlasmaDeck.MediaPlayer('#player', { type: 'video' });
    document.querySelector('#player').setAttribute('data-player', '');
    document.querySelector('#player')._pdPlayer = player;
    const requestPictureInPicture = vi.fn(async () => {
      Object.defineProperty(document, 'pictureInPictureElement', {
        configurable: true,
        value: player._media,
      });
    });
    const exitPictureInPicture = vi.fn(async () => {
      Object.defineProperty(document, 'pictureInPictureElement', {
        configurable: true,
        value: null,
      });
    });
    Object.defineProperty(document, 'pictureInPictureEnabled', { configurable: true, value: true });
    Object.defineProperty(document, 'pictureInPictureElement', { configurable: true, value: null });
    Object.defineProperty(document, 'exitPictureInPicture', { configurable: true, value: exitPictureInPicture });
    Object.defineProperty(player._media, 'requestPictureInPicture', {
      configurable: true,
      value: requestPictureInPicture,
    });

    await expect(player.togglePictureInPicture()).resolves.toEqual({ active: true, supported: true });
    expect(requestPictureInPicture).toHaveBeenCalledTimes(1);

    await expect(window.PlasmaDeck.Player.requestActivePictureInPicture(document)).resolves.toEqual({ active: false, supported: true });
    expect(exitPictureInPicture).toHaveBeenCalledTimes(1);
  });

  it('reports Picture-in-Picture as unsupported for audio players', async () => {
    const player = new window.PlasmaDeck.MediaPlayer('#player', { type: 'audio' });

    expect(player.canPictureInPicture()).toBe(false);
    await expect(player.togglePictureInPicture()).resolves.toEqual({
      active: false,
      supported: false,
      reason: 'unsupported',
    });
  });

  it('provides richer queue controls for playing, reordering, removing, and clearing tracks', () => {
    const player = new window.PlasmaDeck.MediaPlayer('#player', { type: 'audio' });
    const playAt = vi.spyOn(player, 'playAt').mockImplementation(() => {});
    player.loadPlaylist([
      { id: 'a', title: 'A', src: 'a.mp3' },
      { id: 'b', title: 'B', src: 'b.mp3' },
      { id: 'c', title: 'C', src: 'c.mp3' },
    ]);

    player.showQueue();
    document.querySelector('[aria-label="Play B"]').click();
    expect(playAt).toHaveBeenCalledWith(1);
    playAt.mockRestore();

    document.querySelectorAll('[aria-label="Move up"]')[1].click();
    expect(player.queue.map(item => item.id)).toEqual(['b', 'a', 'c']);

    document.querySelectorAll('[aria-label="Move down"]')[0].click();
    expect(player.queue.map(item => item.id)).toEqual(['a', 'b', 'c']);

    document.querySelectorAll('.pd-queue-remove')[1].click();
    expect(player.queue.map(item => item.id)).toEqual(['a', 'c']);

    document.querySelector('[data-pd="queue-clear"]').click();
    expect(player.queue).toHaveLength(0);
    expect(document.querySelector('.pd-queue-empty').textContent).toContain('Queue is empty');
  });

  it('renders chapters, transcript, and caption cues safely for the active track', () => {
    const player = new window.PlasmaDeck.MediaPlayer('#player', { type: 'video' });
    Object.defineProperty(player._media, 'duration', { value: 120, configurable: true });
    player._state.duration = 120;
    player.loadPlaylist([{
      id: 'lecture',
      title: 'Lecture',
      src: 'lecture.mp4',
      chapters: [
        { time: 0, title: 'Intro' },
        { time: 45, title: '<script>Bad</script> Rhythm' },
      ],
      transcript: [
        { start: 0, text: 'Welcome.' },
        { start: 45, text: '<img src=x onerror=alert(1)> Rhythm details.' },
      ],
      captions: [
        { start: 0, end: 10, text: 'Caption one' },
        { start: 45, end: 55, text: 'Caption two' },
      ],
      captionTracks: [
        { src: 'https://example.test/captions.vtt', label: 'English', srclang: 'en', default: true },
      ],
    }]);

    player.showChapters();
    expect(document.querySelector('.pd-learning-header').textContent).toContain('Chapters');
    expect(document.querySelector('.pd-learning-panel').textContent).toContain('Rhythm');
    expect(document.querySelector('.pd-learning-panel script')).toBeNull();

    document.querySelectorAll('.pd-learning-item')[1].click();
    expect(player._media.currentTime).toBe(45);

    player.showTranscript();
    expect(document.querySelector('.pd-learning-header').textContent).toContain('Transcript');
    expect(document.querySelector('.pd-learning-panel').textContent).toContain('Rhythm details.');
    expect(document.querySelector('.pd-learning-panel img')).toBeNull();

    player.toggleCaptions(true);
    player._media.currentTime = 46;
    player._onTimeUpdate();

    expect(document.querySelector('.pd-caption-overlay').hidden).toBe(false);
    expect(document.querySelector('.pd-caption-overlay').textContent).toBe('Caption two');
    expect(player._media.querySelector('track').getAttribute('src')).toBe('https://example.test/captions.vtt');
  });

  it('scopes keyboard shortcuts to the focused player and removes them on destroy', () => {
    const player = new window.PlasmaDeck.MediaPlayer('#player', { type: 'audio' });
    player.toggle = vi.fn();

    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK', bubbles: true, cancelable: true }));
    expect(player.toggle).not.toHaveBeenCalled();

    const playButton = document.querySelector('#player [data-pd="play"]');
    playButton.focus();
    playButton.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK', bubbles: true, cancelable: true }));
    expect(player.toggle).toHaveBeenCalledTimes(1);

    player.destroy();
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK', bubbles: true, cancelable: true }));
    expect(player.toggle).toHaveBeenCalledTimes(1);
  });

  it('removes native media and drag listeners during destroy', () => {
    const player = new window.PlasmaDeck.MediaPlayer('#player', { type: 'audio' });
    const timeUpdate = vi.spyOn(player, '_onTimeUpdate');
    const seekTo = vi.spyOn(player, 'seekTo');
    Object.defineProperty(player._media, 'duration', { value: 100, configurable: true });
    player._state.duration = 100;

    const seekTrack = document.querySelector('#player .pd-progress-track');
    seekTrack.getBoundingClientRect = vi.fn(() => ({ left: 0, width: 100 }));
    seekTrack.dispatchEvent(new MouseEvent('mousedown', {
      clientX: 50,
      bubbles: true,
      cancelable: true,
    }));
    expect(seekTo).toHaveBeenCalledTimes(1);
    seekTo.mockClear();

    const media = player._media;
    player.destroy();

    media.dispatchEvent(new Event('timeupdate'));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 90 }));

    expect(timeUpdate).not.toHaveBeenCalled();
    expect(seekTo).not.toHaveBeenCalled();
  });

  it('removes restored-position metadata listeners and tolerates repeated destroy calls', () => {
    sessionStorage.setItem('pd-player', JSON.stringify({ currentTime: 42 }));
    const player = new window.PlasmaDeck.MediaPlayer('#player', { type: 'audio' });
    const seekTo = vi.spyOn(player, 'seekTo');
    const media = player._media;

    expect(() => player.destroy()).not.toThrow();
    expect(() => player.destroy()).not.toThrow();

    media.dispatchEvent(new Event('loadedmetadata'));

    expect(seekTo).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('pd-player')).toBeNull();
    expect(document.querySelector('#player').childElementCount).toBe(0);
  });
});
