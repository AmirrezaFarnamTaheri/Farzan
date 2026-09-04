// ============================================================
// OpenCourseDeck - player.js
// Full Media Player System
// Audio | Video | Playlist | Visualizer | Queue
// ============================================================

(() => {
  'use strict';

  // ──────────────────────────────────────────────────────────
  // UTILITIES
  // ──────────────────────────────────────────────────────────
  const $ = (s, r = document) => r.querySelector(s);
  const uid = (p = 'pd') => `${p}-${Math.random().toString(36).slice(2, 9)}`;

  const clampPct = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.min(100, Math.max(0, n));
  };

  const safeUrlFor = (raw, { dataPattern } = {}) => {
    const value = String(raw ?? '').trim();
    if (!value) return null;
    try {
      const url = new URL(value, document.baseURI);
      if (url.protocol === 'data:') return dataPattern?.test(value) ? url.href : null;
      return ['http:', 'https:', 'blob:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  };

  const safeMediaUrl = (raw) => {
    const helper = window.OpenCourseDeck?.safeMediaUrl;
    if (typeof helper === 'function') return helper(raw);
    return safeUrlFor(raw, { dataPattern: /^data:(?:video|audio|application\/pdf)\//i });
  };

  const safeImageUrl = (raw) => {
    const helper = window.OpenCourseDeck?.safeImageUrl;
    if (typeof helper === 'function') return helper(raw);
    return safeUrlFor(raw, { dataPattern: /^data:image\//i });
  };

  const fmt = {
    /** Format seconds → M:SS or H:MM:SS */
    time(secs) {
      if (isNaN(secs) || secs < 0) return '0:00';
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = Math.floor(secs % 60);
      return h
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${m}:${String(s).padStart(2, '0')}`;
    },
    /** Bytes → human-readable */
    bytes(b) {
      if (b < 1024) return `${b} B`;
      if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
      return `${(b / 1048576).toFixed(1)} MB`;
    },
  };

  /** Merge overlapping/adjacent time intervals */
  function _mergeIntervals(intervals) {
    if (!intervals || intervals.length === 0) return [];
    const sorted = intervals
      .filter(i => i && Number.isFinite(i.start) && Number.isFinite(i.end) && i.start < i.end)
      .slice()
      .sort((a, b) => a.start - b.start);
    if (sorted.length === 0) return [];
    const merged = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const last = merged[merged.length - 1];
      const curr = sorted[i];
      if (curr.start <= last.end) {
        last.end = Math.max(last.end, curr.end);
      } else {
        merged.push(curr);
      }
    }
    return merged;
  }


  // ══════════════════════════════════════════════════════════
  // CLASS: MediaPlayer
  // ══════════════════════════════════════════════════════════
  class MediaPlayer {
    /**
     * @param {string|HTMLElement} container  – Wrapper element or selector
     * @param {Object} options
     */
    constructor(container, options = {}) {
      this._container = typeof container === 'string'
        ? document.querySelector(container)
        : container;

      if (!this._container) {
        throw new Error(`[MediaPlayer] Container not found: ${container}`);
      }

      this._opts = Object.assign({
        type:          'audio',    // 'audio' | 'video'
        autoplay:      false,
        loop:          false,
        muted:         false,
        volume:        0.8,
        preload:       'metadata',
        crossOrigin:   null,
        visualizer:    false,      // enable audio visualizer
        visualizerBars: 64,
        keyboard:      true,
        storageKey:    'pd-player',
        playlist:      [],         // initial playlist
        shuffle:       false,
        repeat:        'none',     // 'none' | 'one' | 'all'
        controls:      true,       // render custom controls
        theme:         'dark',
        mediaId:       null,       // per-video ID for MediaStorage
      }, options);

      // State
      this._state = {
        playing:   false,
        loading:   false,
        buffering: false,
        muted:     this._opts.muted,
        volume:    this._opts.volume,
        currentTime: 0,
        duration:    0,
        shuffle:     this._opts.shuffle,
        repeat:      this._opts.repeat,
        queueIndex:  0,
      };

      this._queue        = [];   // ordered playlist
      this._history      = [];   // played track history
      this._shuffleOrder = [];   // index map when shuffled
      this._listeners    = {};   // event map
      this._domListeners = [];
      this._destroyed    = false;

      // AB loop state
      this._loopA = null;
      this._loopB = null;

      // Watched segment tracking
      this._watchedSegStart = null;
      this._watchedOverlayCanvas = null;
      this._watchedIntervals = [];

      // MediaStorage (per-video IndexedDB persistence)
      this._mediaStorage = window.OpenCourseDeck?.MediaStorage
        ? new window.OpenCourseDeck.MediaStorage()
        : null;

      // Speed presets
      this._speedPresets = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3];

      // Keyboard seek accumulator
      this._seekAccum = 0;
      this._seekAccumTimer = null;

      // Build DOM
      this._buildDOM();
      this._bindNative();
      if (this._opts.keyboard) this._bindKeyboard();
      if (this._opts.visualizer && this._opts.type === 'audio') {
        this._initVisualizer();
      }

      // Load initial playlist
      if (this._opts.playlist.length) {
        this.loadPlaylist(this._opts.playlist);
      }

      // Restore session
      this._restoreSession();
      this._restorePlaylistMode();
    }


    // ─────────────────────────────────────────────────────
    // DOM BUILDER
    // ──────────────────────────────────────────────────────
    _buildDOM() {
      this._container.classList.add('pd-player', `pd-player-${this._opts.type}`, `theme-${this._opts.theme}`);
      this._container.replaceChildren();

      // Native media element
      this._media = document.createElement(this._opts.type === 'video' ? 'video' : 'audio');
      this._media.preload     = this._opts.preload;
      this._media.muted       = this._state.muted;
      this._media.volume      = this._state.volume;
      this._media.loop        = this._opts.repeat === 'one';
      if (this._opts.crossOrigin) this._media.crossOrigin = this._opts.crossOrigin;
      this._media.className   = 'pd-media-element';

      if (this._opts.type === 'video') {
        this._media.style.cssText = 'width:100%;display:block;';
      } else {
        this._media.style.display = 'none';
      }
      this._container.appendChild(this._media);

      if (!this._opts.controls) return;

      // ── Controls wrapper ──────────────────────────────
      const controls = document.createElement('div');
      controls.className = 'pd-controls';
      controls.setAttribute('role', 'region');
      controls.setAttribute('aria-label', 'Media controls');

      // Static player chrome; track and queue metadata are rendered later with textContent.
      controls.innerHTML = `
        <!-- Track info -->
        <div class="pd-info">
          <div class="pd-artwork">
            <img class="pd-art-img" src="" alt="" aria-hidden="true">
            <div class="pd-art-placeholder" aria-hidden="true">${this._opts.type === 'video' ? 'Video' : 'Audio'}</div>
          </div>
          <div class="pd-meta">
            <div class="pd-title" aria-live="polite">Nothing playing</div>
            <div class="pd-artist">Pick a lesson to start</div>
          </div>
          <button class="pd-btn pd-like-btn" aria-label="Like track" data-pd="like">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </button>
        </div>

        <!-- Seek bar -->
        <div class="pd-seek-area">
          <span class="pd-time-cur">0:00</span>
          <div class="pd-progress-track" role="slider" aria-label="Seek"
               aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"
               tabindex="0">
            <canvas class="pd-waveform-canvas" aria-hidden="true"></canvas>
            <div class="pd-watched-overlay" aria-hidden="true"></div>
            <div class="pd-progress-buf"></div>
            <div class="pd-progress-fill"></div>
            <div class="pd-progress-thumb"></div>
            <div class="pd-ab-loop-region" aria-hidden="true"></div>
          </div>
          <span class="pd-time-dur">0:00</span>
        </div>

        <!-- Transport buttons -->
        <div class="pd-transport">
          <button class="pd-btn pd-btn-icon" aria-label="Shuffle" data-pd="shuffle">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
              <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
            </svg>
          </button>
          <button class="pd-btn pd-btn-icon" aria-label="Previous track" data-pd="prev">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/>
            </svg>
          </button>
          <button class="pd-btn pd-btn-play" aria-label="Play" data-pd="play">
            <svg class="icon-play" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            <svg class="icon-pause" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style="display:none">
              <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
            </svg>
          </button>
          <button class="pd-btn pd-btn-icon" aria-label="Next track" data-pd="next">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>
            </svg>
          </button>
          <button class="pd-btn pd-btn-icon" aria-label="Repeat: none" data-pd="repeat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
              <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
          </button>
          <button class="pd-btn pd-btn-icon" aria-label="AB loop" data-pd="abloop">A-B</button>
          <button class="pd-btn pd-btn-icon" aria-label="Screenshot" data-pd="screenshot">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </button>
        </div>

        <!-- Volume + extras -->
        <div class="pd-extras">
          <button class="pd-btn pd-btn-icon" aria-label="Mute" data-pd="mute">
            <svg class="icon-vol" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
            </svg>
          </button>
          <div class="pd-volume-track" role="slider" aria-label="Volume"
               aria-valuemin="0" aria-valuemax="100"
               aria-valuenow="80" tabindex="0">
            <div class="pd-volume-fill"></div>
            <div class="pd-volume-thumb"></div>
          </div>
          <button class="pd-btn pd-btn-icon pd-speed-btn" aria-label="Playback speed" data-pd="speed">1x</button>
          <button class="pd-btn pd-btn-icon" aria-label="Chapters" data-pd="chapters">Ch</button>
          <button class="pd-btn pd-btn-icon" aria-label="Transcript" data-pd="transcript">Tx</button>
          <button class="pd-btn pd-btn-icon" aria-label="Captions" data-pd="captions">CC</button>
          <button class="pd-btn pd-btn-icon" aria-label="Picture in picture" data-pd="pip">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="5" width="18" height="14" rx="2"/>
              <rect x="13" y="11" width="6" height="4" rx="1"/>
            </svg>
          </button>
          <button class="pd-btn pd-btn-icon" aria-label="Queue" data-pd="queue">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
              <line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/>
              <line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- Loading overlay -->
        <div class="pd-loading-overlay" hidden>
          <div class="pd-spinner"></div>
        </div>

        <!-- Resume hint overlay -->
        <div class="pd-resume-hint" hidden>
          <span class="pd-resume-text"></span>
          <button class="pd-btn pd-btn-sm pd-resume-go" data-pd="resume-go">Resume</button>
          <button class="pd-btn pd-btn-sm pd-resume-start" data-pd="resume-start">Start over</button>
        </div>

        <!-- Fine speed control -->
        <div class="pd-speed-panel" hidden>
          <label class="pd-speed-label">Speed: <span class="pd-speed-value">1x</span></label>
          <input type="range" class="pd-speed-slider" min="0.25" max="3" step="0.05" value="1">
          <div class="pd-speed-presets"></div>
        </div>
      `;

      // ── Visualizer canvas (audio mode) ────────────────
      if (this._opts.visualizer && this._opts.type === 'audio') {
        this._vizCanvas = document.createElement('canvas');
        this._vizCanvas.className = 'pd-visualizer';
        controls.insertBefore(this._vizCanvas, controls.firstChild);
      }

      this._container.appendChild(controls);
      this._controls = controls;

      // ── Queue panel (initially hidden) ───────────────
      this._queuePanel = document.createElement('div');
      this._queuePanel.className = 'pd-queue-panel';
      this._queuePanel.hidden = true;
      // Static queue shell; individual queue rows are DOM-built.
      this._queuePanel.innerHTML = `
        <div class="pd-queue-header">
          <span>Queue</span>
          <button class="pd-btn pd-btn-icon" data-pd="queue-close" aria-label="Close queue">x</button>
        </div>
        <div class="pd-queue-list"></div>
        <div class="pd-queue-footer">
          <button class="pd-btn pd-btn-sm" data-pd="queue-clear" type="button">Clear queue</button>
        </div>
      `;
      this._container.appendChild(this._queuePanel);

      this._learningPanel = document.createElement('div');
      this._learningPanel.className = 'pd-learning-panel';
      this._learningPanel.hidden = true;
      this._container.appendChild(this._learningPanel);

      this._captionOverlay = document.createElement('div');
      this._captionOverlay.className = 'pd-caption-overlay';
      this._captionOverlay.hidden = true;
      this._captionOverlay.setAttribute('aria-live', 'polite');
      this._container.appendChild(this._captionOverlay);

      // Cache DOM refs
      this._dom = {
        artImg:     $('.pd-art-img', controls),
        artPlaceholder: $('.pd-art-placeholder', controls),
        title:      $('.pd-title',   controls),
        artist:     $('.pd-artist',  controls),
        timeCur:    $('.pd-time-cur', controls),
        timeDur:    $('.pd-time-dur', controls),
        seekTrack:  $('.pd-progress-track', controls),
        seekFill:   $('.pd-progress-fill',  controls),
        seekBuf:    $('.pd-progress-buf',   controls),
        seekThumb:  $('.pd-progress-thumb', controls),
        waveformCanvas:  $('.pd-waveform-canvas', controls),
        watchedOverlay:  $('.pd-watched-overlay', controls),
        abLoopRegion:    $('.pd-ab-loop-region', controls),
        resumeHint:      $('.pd-resume-hint', controls),
        resumeText:      $('.pd-resume-text', controls),
        speedPanel:      $('.pd-speed-panel', controls),
        speedSlider:     $('.pd-speed-slider', controls),
        speedValue:      $('.pd-speed-value', controls),
        speedPresetsContainer: $('.pd-speed-presets', controls),
        volTrack:   $('.pd-volume-track',   controls),
        volFill:    $('.pd-volume-fill',    controls),
        playBtn:    $('[data-pd="play"]',   controls),
        playIcon:   $('.icon-play',  controls),
        pauseIcon:  $('.icon-pause', controls),
        shuffleBtn: $('[data-pd="shuffle"]', controls),
        repeatBtn:  $('[data-pd="repeat"]',  controls),
        speedBtn:   $('[data-pd="speed"]',   controls),
        abLoopBtn:  $('[data-pd="abloop"]',  controls),
        screenshotBtn: $('[data-pd="screenshot"]', controls),
        chaptersBtn: $('[data-pd="chapters"]', controls),
        transcriptBtn: $('[data-pd="transcript"]', controls),
        captionsBtn: $('[data-pd="captions"]', controls),
        pipBtn:     $('[data-pd="pip"]',     controls),
        likeBtn:    $('[data-pd="like"]',    controls),
        loadingOverlay: $('.pd-loading-overlay', controls),
        queueList:  $('.pd-queue-list', this._queuePanel),
      };
      this._learningMode = null;
      this._captionsEnabled = false;
    }


    // ──────────────────────────────────────────────────────
    // NATIVE MEDIA EVENTS
    // ──────────────────────────────────────────────────────
    _bindNative() {
      const m = this._media;

      this._on(m, 'loadstart',  () => this._setLoading(true));
      this._on(m, 'canplay',    () => this._setLoading(false));
      this._on(m, 'waiting',    () => this._setBuffering(true));
      this._on(m, 'playing',    () => { this._setBuffering(false); this._onPlay(); });
      this._on(m, 'pause',      () => this._onPause());
      this._on(m, 'ended',      () => this._onEnded());
      this._on(m, 'error',      () => this._onError());
      this._on(m, 'durationchange', () => this._onDurationChange());
      this._on(m, 'timeupdate',    () => this._onTimeUpdate());
      this._on(m, 'seeked',        () => this._onSeeked());
      this._on(m, 'volumechange',  () => this._onVolumeChange());

      // Buffer progress
      this._on(m, 'progress', () => {
        if (!m.buffered.length || !Number.isFinite(m.duration) || m.duration <= 0) return;
        const pct = clampPct((m.buffered.end(m.buffered.length - 1) / m.duration) * 100);
        if (this._dom?.seekBuf) this._dom.seekBuf.style.width = `${pct}%`;
      });

      // ── Controls interaction ───────────────────────────
      if (!this._opts.controls) return;

      // Play/pause button
      this._on(this._controls, 'click', e => {
        const btn = e.target.closest('[data-pd]');
        if (!btn) return;
        switch (btn.dataset.pd) {
          case 'play':       this.toggle();                  break;
          case 'prev':       this.prev();                    break;
          case 'next':       this.next();                    break;
          case 'mute':       this.toggleMute();              break;
          case 'shuffle':    this.toggleShuffle();           break;
          case 'repeat':     this.cycleRepeat();             break;
          case 'speed':      this.cycleSpeed();              break;
          case 'abloop':     this.toggleLoop();              break;
          case 'screenshot': this.screenshot();              break;
          case 'chapters':   this.showChapters();            break;
          case 'transcript': this.showTranscript();          break;
          case 'captions':   this.toggleCaptions();          break;
          case 'pip':        this.togglePictureInPicture();  break;
          case 'like':       this._toggleLike();             break;
          case 'queue':      this.showQueue();               break;
          case 'queue-close': this.hideQueue();              break;
          case 'queue-clear': this.clearQueue();             break;
          case 'resume-go':  this._handleResumeGo();         break;
          case 'resume-start': this._handleResumeStart();    break;
        }
      });

      // Speed panel: slider
      if (this._dom?.speedSlider) {
        this._on(this._dom.speedSlider, 'input', e => {
          const rate = parseFloat(e.target.value) || 1;
          this._media.playbackRate = rate;
          if (this._dom.speedValue) this._dom.speedValue.textContent = this._formatSpeedLabel(rate);
          if (this._dom.speedBtn) this._dom.speedBtn.textContent = this._formatSpeedLabel(rate);
          this._emit('speed', rate);
          this._saveSession(true);
          if (this._mediaStorage && this._currentTrack()) {
            this._mediaStorage.set(this._mediaId(), 'rate', rate);
          }
        });
      }

      // Speed panel: preset buttons
      this._initSpeedPresets();

      this._on(this._queuePanel, 'click', e => {
        const btn = e.target.closest('[data-pd]');
        if (!btn) return;
        switch (btn.dataset.pd) {
          case 'queue-close': this.hideQueue(); break;
          case 'queue-clear': this.clearQueue(); break;
        }
      });

      // Seek bar drag
      this._bindDrag(this._dom.seekTrack, pct => {
        const time = pct * (this._media.duration || 0);
        this.seekTo(time);
      });

      // Volume bar drag
      this._bindDrag(this._dom.volTrack, pct => {
        this.setVolume(pct);
      });
    }

    _bindDrag(track, onPct) {
      if (!track) return;
      let dragging = false;

      const calc = e => {
        const rect = track.getBoundingClientRect();
        const x    = (e.touches?.[0] ?? e).clientX;
        return Math.min(1, Math.max(0, (x - rect.left) / rect.width));
      };

      const start = e => {
        dragging = true;
        onPct(calc(e));
        e.preventDefault();
      };
      const move = e => { if (dragging) onPct(calc(e)); };
      const end  = ()  => { dragging = false; };

      this._on(track, 'mousedown',  start);
      this._on(track, 'touchstart', start, { passive: false });
      this._on(window, 'mousemove', move);
      this._on(window, 'touchmove', move, { passive: false });
      this._on(window, 'mouseup',   end);
      this._on(window, 'touchend',  end);

      // Click also works
      this._on(track, 'click', e => onPct(calc(e)));

      // Keyboard for seek/volume
      this._on(track, 'keydown', e => {
        const step = e.shiftKey ? 0.10 : 0.02;
        const role = track.getAttribute('aria-label') ?? '';
        const isSeek = role.toLowerCase().includes('seek');
        const cur  = isSeek
          ? (this._media.currentTime / (this._media.duration || 1))
          : this._state.volume;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp')
          onPct(Math.min(1, cur + step));
        if (e.key === 'ArrowLeft'  || e.key === 'ArrowDown')
          onPct(Math.max(0, cur - step));
        if (e.key === 'Home') onPct(0);
        if (e.key === 'End')  onPct(1);
      });
    }

    _bindKeyboard() {
      this._on(document, 'keydown', e => {
        const focusedWithin =
          this._container.matches(':focus-within') ||
          this._container.contains(document.activeElement) ||
          this._container.contains(e.target);
        if (!this._container.isConnected || !focusedWithin) return;
        const t = e.target;
        if (t?.matches?.('input,textarea,select,[contenteditable],[contenteditable="true"]')) return;
        if (t?.closest?.('[contenteditable],[contenteditable="true"]')) return;

        // Shift+A/B/L for AB loop
        if (e.shiftKey) {
          switch (e.code) {
            case 'KeyA': e.preventDefault(); this.setLoopA(); return;
            case 'KeyB': e.preventDefault(); this.setLoopB(); return;
            case 'KeyL': e.preventDefault(); this.toggleLoop(); return;
          }
        }

        // Number keys 0-9: seek to percentage
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey && e.code.startsWith('Digit')) {
          const digit = parseInt(e.code.slice(5), 10);
          if (digit >= 0 && digit <= 9 && this._state.duration > 0) {
            e.preventDefault();
            this.seekTo((digit / 10) * this._state.duration);
            return;
          }
        }

        switch (e.code) {
          case 'Space': case 'KeyK': e.preventDefault(); this.toggle();       break;
          case 'KeyM':               e.preventDefault(); this.toggleMute();   break;
          case 'KeyJ': {
            e.preventDefault();
            this._seekAccum -= 10;
            this._applySeekAccum();
            break;
          }
          case 'KeyL': {
            if (!e.shiftKey) {
              e.preventDefault();
              this._seekAccum += 10;
              this._applySeekAccum();
            }
            break;
          }
          case 'ArrowLeft': e.preventDefault(); this.seekBy(-5); break;
          case 'ArrowRight':e.preventDefault(); this.seekBy(+5); break;
          case 'ArrowUp':            e.preventDefault(); this.setVolume(Math.min(1, this._state.volume + 0.1)); break;
          case 'ArrowDown':          e.preventDefault(); this.setVolume(Math.max(0, this._state.volume - 0.1)); break;
          case 'KeyN':               this.next();   break;
          case 'KeyP':               this.prev();   break;
          case 'KeyS':               this.toggleShuffle(); break;
          case 'KeyR':               this.cycleRepeat();   break;
          case 'BracketLeft': {
            e.preventDefault();
            this._media.playbackRate = Math.max(0.25, this._media.playbackRate - 0.05);
            if (this._dom?.speedBtn) this._dom.speedBtn.textContent = this._formatSpeedLabel(this._media.playbackRate);
            this._emit('speed', this._media.playbackRate);
            break;
          }
          case 'BracketRight': {
            e.preventDefault();
            this._media.playbackRate = Math.min(3, this._media.playbackRate + 0.05);
            if (this._dom?.speedBtn) this._dom.speedBtn.textContent = this._formatSpeedLabel(this._media.playbackRate);
            this._emit('speed', this._media.playbackRate);
            break;
          }
          case 'Period': {
            if (this._state.playing) {
              e.preventDefault();
              this._media.currentTime += 1 / 30;
            }
            break;
          }
          case 'Comma': {
            if (this._state.playing) {
              e.preventDefault();
              this._media.currentTime -= 1 / 30;
            }
            break;
          }
        }
      });
    }

    _applySeekAccum() {
      if (this._seekAccumTimer) clearTimeout(this._seekAccumTimer);
      this._seekAccumTimer = setTimeout(() => {
        if (this._seekAccum !== 0) {
          this.seekBy(this._seekAccum);
          this._seekAccum = 0;
        }
        this._seekAccumTimer = null;
      }, 300);
    }


    // ──────────────────────────────────────────────────────
    // NATIVE EVENT HANDLERS
    // ──────────────────────────────────────────────────────
    _onPlay() {
      this._state.playing = true;
      if (this._dom) {
        this._dom.playIcon.style.display  = 'none';
        this._dom.pauseIcon.style.display = '';
        this._dom.playBtn.setAttribute('aria-label', 'Pause');
      }
      this._emit('play', this._currentTrack());
      if (this._vizAnimId == null && this._analyser) this._startViz();
      this._startWatchedSegmentTracking();
    }

    _onPause() {
      this._state.playing = false;
      if (this._dom) {
        this._dom.playIcon.style.display  = '';
        this._dom.pauseIcon.style.display = 'none';
        this._dom.playBtn.setAttribute('aria-label', 'Play');
      }
      this._emit('pause', this._currentTrack());
      this._saveWatchedSegment();
    }

    _onEnded() {
      this._saveWatchedSegment();
      this._emit('ended', this._currentTrack());
      switch (this._state.repeat) {
        case 'one': this.seekTo(0); this.play(); break;
        case 'all': this.next(true); break;
        default:
          if (this._state.queueIndex < this._queue.length - 1) {
            this.next();
          } else {
            this._emit('playlistEnd');
          }
      }
    }

    _onError() {
      const err = this._media.error;
      const msg = err
        ? ['', 'Aborted', 'Network error', 'Decode error', 'Format unsupported'][err.code] ?? 'Unknown'
        : 'Unknown';
      console.warn(`[MediaPlayer] Error: ${msg}`);
      this._setLoading(false);
      this._emit('error', { code: err?.code, message: msg });
    }

    _onDurationChange() {
      this._state.duration = Number.isFinite(this._media.duration) ? this._media.duration : 0;
      if (this._dom) {
        this._dom.timeDur.textContent = fmt.time(this._state.duration);
        this._dom.seekTrack?.setAttribute('aria-valuemax', '100');
      }
      this._emit('durationchange', this._state.duration);
    }

    _onTimeUpdate() {
      const cur = this._media.currentTime;
      this._state.currentTime = cur;
      const dur = this._state.duration;
      const pct = dur > 0 ? clampPct((cur / dur) * 100) : 0;

      // AB loop: auto-seek to A when position >= B
      if (this._loopA != null && this._loopB != null && cur >= this._loopB) {
        this._media.currentTime = this._loopA;
        return;
      }

      if (this._dom) {
        this._dom.timeCur.textContent = fmt.time(cur);
        this._dom.seekFill.style.width = `${pct}%`;
        this._dom.seekThumb.style.left = `${pct}%`;
        this._dom.seekTrack?.setAttribute('aria-valuenow', String(Math.round(pct)));
      }

      // Update waveform progress
      if (this._waveformScrubber && this._dom?.waveformCanvas && dur > 0) {
        const track = this._currentTrack();
        const cacheId = track?.id || track?.src || '';
        this._waveformScrubber.repaintProgress(this._dom.waveformCanvas, cacheId, cur / dur);
      }

      this._updateCaptionCue(cur);
      this._highlightTimedPanelItem(cur);
      this._emit('timeupdate', { currentTime: cur, duration: dur || 0, percent: pct });
      this._saveSession();

      // Persist time to MediaStorage (throttled internally)
      if (this._mediaStorage && this._currentTrack()) {
        this._mediaStorage.set(this._mediaId(), 'time', cur);
      }
    }

    _onSeeked() {
      const cur = this._media.currentTime;
      const dur = this._state.duration || this._media.duration || 0;
      const pct = dur > 0 ? clampPct((cur / dur) * 100) : 0;
      this._emit('seeked', {
        track: this._currentTrack(),
        currentTime: cur,
        duration: dur,
        percent: pct,
      });
      // Forced: seeks are explicit user actions worth persisting immediately.
      this._saveSession(true);
    }

    _onVolumeChange() {
      this._state.volume = this._media.volume;
      this._state.muted  = this._media.muted;
      if (this._dom) {
        const pct = this._state.muted ? 0 : this._state.volume * 100;
        this._dom.volFill.style.width = `${pct}%`;
        this._dom.volTrack?.setAttribute('aria-valuenow', String(Math.round(pct)));
      }
      // Persist to MediaStorage
      if (this._mediaStorage && this._currentTrack()) {
        const id = this._mediaId();
        this._mediaStorage.set(id, 'volume', this._state.volume);
        this._mediaStorage.set(id, 'muted', this._state.muted);
      }
    }


    // ──────────────────────────────────────────────────────
    // PUBLIC TRANSPORT API
    // ──────────────────────────────────────────────────────
    play() {
      return this._media.play().catch(err => {
        if (err.name !== 'AbortError') console.warn('[MediaPlayer]', err);
      });
    }

    pause() {
      this._media.pause();
    }

    toggle() {
      return this._state.playing ? this.pause() : this.play();
    }

    seekTo(seconds) {
      if (!isFinite(seconds)) return;
      if (!this._state.duration) return;
      this._media.currentTime = Math.min(
        Math.max(0, seconds),
        this._state.duration
      );
    }

    seekBy(delta) {
      this.seekTo(this._media.currentTime + delta);
    }

    setVolume(level) {
      const v = Math.min(1, Math.max(0, level));
      this._media.volume = v;
      this._state.volume = v;
      if (v > 0) this._media.muted = false;
    }

    setVolumeBoost(multiplier = 1.0) {
      const boost = Math.max(0.5, Math.min(3.0, Number(multiplier) || 1.0));
      this._state.volumeBoost = boost;
      if (!this._audioEnhancer && this._media) {
        const EnhancerClass = window.OpenCourseDeck?.AudioEnhancer;
        if (typeof EnhancerClass === 'function') {
          try {
            this._audioEnhancer = new EnhancerClass(this._media);
            this._audioEnhancer.init();
          } catch {}
        }
      }
      if (this._audioEnhancer) {
        this._audioEnhancer.setVolumeBoost(boost);
      }
      this._emit('volume:boost', boost);
    }

    toggleMute() {
      this._media.muted = !this._media.muted;
    }

    toggleShuffle() {
      this._state.shuffle = !this._state.shuffle;
      if (this._state.shuffle) this._buildShuffleOrder();
      this._dom?.shuffleBtn?.classList.toggle('active', this._state.shuffle);
      this._emit('shuffle', this._state.shuffle);
    }

    cycleRepeat() {
      const modes = ['none', 'all', 'one'];
      const idx   = modes.indexOf(this._state.repeat);
      this._state.repeat = modes[(idx + 1) % modes.length];
      this._media.loop   = this._state.repeat === 'one';
      this._updateRepeatUI();
      this._emit('repeat', this._state.repeat);
    }

    _updateRepeatUI() {
      const btn = this._dom?.repeatBtn;
      if (!btn) return;
      btn.classList.toggle('active', this._state.repeat !== 'none');
      btn.setAttribute('aria-label', `Repeat: ${this._state.repeat}`);
      // Show "1" badge on icon when repeat-one
      btn.dataset.repeatMode = this._state.repeat;
    }

    /** Cycle playback speeds: 0.5 → 0.75 → 1 → 1.25 → 1.5 → 2 */
    cycleSpeed() {
      if (this._dom?.speedPanel) {
        this._dom.speedPanel.hidden = !this._dom.speedPanel.hidden;
      }
    }

    _formatSpeedLabel(rate) {
      return `${Number(rate) || 1}x`;
    }

    _initSpeedPresets() {
      const container = this._dom?.speedPresetsContainer;
      if (!container) return;
      container.replaceChildren();
      for (const rate of this._speedPresets) {
        const btn = document.createElement('button');
        btn.className = 'pd-btn pd-btn-sm pd-speed-preset';
        btn.type = 'button';
        btn.textContent = this._formatSpeedLabel(rate);
        btn.dataset.rate = String(rate);
        btn.addEventListener('click', () => {
          this._media.playbackRate = rate;
          if (this._dom.speedSlider) this._dom.speedSlider.value = String(rate);
          if (this._dom.speedValue) this._dom.speedValue.textContent = this._formatSpeedLabel(rate);
          if (this._dom.speedBtn) this._dom.speedBtn.textContent = this._formatSpeedLabel(rate);
          this._emit('speed', rate);
          this._saveSession(true);
          if (this._mediaStorage && this._currentTrack()) {
            this._mediaStorage.set(this._mediaId(), 'rate', rate);
          }
        });
        container.appendChild(btn);
      }
    }


    // ──────────────────────────────────────────────────────
    // PLAYLIST / QUEUE API
    // ──────────────────────────────────────────────────────
    /**
     * Load a full playlist
     * @param {Array<TrackObject>} tracks
     * @param {boolean} autoplay
     */
    loadPlaylist(tracks, autoplay = false) {
      this._queue = tracks.map((t, i) => ({ ...t, _id: t.id ?? uid('trk'), _index: i }));
      this._state.queueIndex = 0;
      if (this._state.shuffle) this._buildShuffleOrder();
      if (!this._queue.length) {
        this.pause();
        this._media.removeAttribute('src');
        this._media.load();
        this._updateTrackUI({});
        this._renderLearningPanel();
        this._updateCaptionCue(0);
        this._renderQueue();
        this._emit('playlistLoaded', this._queue);
        return;
      }
      this._loadTrack(0);
      this._renderQueue();
      if (autoplay) this.play();
      this._emit('playlistLoaded', this._queue);
    }

    /**
     * Add single track or array to end of queue
     */
    addToQueue(track) {
      const tracks = Array.isArray(track) ? track : [track];
      tracks.forEach(t => {
        this._queue.push({ ...t, _id: t.id ?? uid('trk'), _index: this._queue.length });
      });
      if (this._state.shuffle) this._buildShuffleOrder();
      this._renderQueue();
      this._emit('queueUpdated', this._queue);
    }

    removeFromQueue(index) {
      if (index < 0 || index >= this._queue.length) return;
      const wasCurrent = index === this._state.queueIndex;
      this._queue.splice(index, 1);
      if (index < this._state.queueIndex) this._state.queueIndex--;
      if (!this._queue.length) {
        this.pause();
        this._media.removeAttribute('src');
        this._media.load();
        this._state.queueIndex = 0;
        this._updateTrackUI({});
      } else if (wasCurrent) {
        this._state.queueIndex = Math.min(index, this._queue.length - 1);
        this._loadTrack(this._state.queueIndex);
      }
      if (this._state.shuffle) this._buildShuffleOrder();
      this._renderQueue();
      this._emit('queueUpdated', this._queue);
    }

    moveQueueItem(fromIndex, toIndex) {
      if (fromIndex < 0 || fromIndex >= this._queue.length) return false;
      const target = Math.max(0, Math.min(this._queue.length - 1, toIndex));
      if (fromIndex === target) return false;
      const currentTrack = this._currentTrack();
      const [track] = this._queue.splice(fromIndex, 1);
      this._queue.splice(target, 0, track);
      this._queue.forEach((item, i) => { item._index = i; });
      this._state.queueIndex = Math.max(0, this._queue.indexOf(currentTrack));
      if (this._state.shuffle) this._buildShuffleOrder();
      this._renderQueue();
      this._emit('queueUpdated', this._queue);
      return true;
    }

    clearQueue() {
      this.pause();
      this._queue = [];
      this._history = [];
      this._state.queueIndex = 0;
      this._media.removeAttribute('src');
      this._container.classList.remove('pd-has-source');
      this._media.load();
      this._updateTrackUI({});
      this._renderLearningPanel();
      this._updateCaptionCue(0);
      this._renderQueue();
      this._emit('queueUpdated', this._queue);
    }

    next(wrap = false) {
      if (!this._queue.length) return;
      let idx = this._state.queueIndex;
      if (this._state.shuffle) {
        const pos = this._shuffleOrder.indexOf(idx);
        idx = this._shuffleOrder[(pos + 1) % this._shuffleOrder.length];
      } else {
        idx = wrap || this._state.repeat === 'all'
          ? (idx + 1) % this._queue.length
          : Math.min(idx + 1, this._queue.length - 1);
      }
      this._loadTrack(idx);
      if (this._state.playing) this.play();
    }

    prev() {
      if (!this._queue.length) return;
      // If > 3s into track, restart; else go to previous
      if (this._media.currentTime > 3) {
        this.seekTo(0);
        return;
      }
      let idx = this._state.queueIndex;
      if (this._state.shuffle) {
        const pos = this._shuffleOrder.indexOf(idx);
        idx = this._shuffleOrder[(pos - 1 + this._shuffleOrder.length) % this._shuffleOrder.length];
      } else {
        idx = Math.max(0, idx - 1);
      }
      this._loadTrack(idx);
      if (this._state.playing) this.play();
    }

    playAt(index) {
      if (index < 0 || index >= this._queue.length) return;
      this._loadTrack(index);
      this.play();
    }

    _loadTrack(index) {
      if (!this._queue.length) return;
      const track = this._queue[index];
      if (!track) return;
      const previous = this._currentTrack();
      if (previous && previous !== track) {
        this._emit('beforeTrackChange', previous);
        this._saveWatchedSegment();
      }

      this._state.queueIndex = index;
      this._history.push(index);

      const rawSrc = track.src ?? track.url;
      const unwrapped = typeof rawSrc === 'string'
        ? rawSrc.trim()
        : String(rawSrc?.url || rawSrc?.src || '').trim();
      const applySource = (source) => {
        if (this._destroyed || this._queue[this._state.queueIndex] !== track) return;
        if (source) this._media.src = source;
        else this._media.removeAttribute('src');
        this._container.classList.toggle('pd-has-source', Boolean(source));
        this._media.load();
      };
      if (unwrapped.startsWith('library-file:') && typeof window.OpenCourseDeck?.UserLibrary?.resolvePlayable === 'function') {
        Promise.resolve(window.OpenCourseDeck.UserLibrary.resolvePlayable(rawSrc, safeMediaUrl))
          .then((resolved) => applySource(resolved || null))
          .catch(() => applySource(null));
      } else {
        applySource(safeMediaUrl(rawSrc));
      }
      this._loadTextTracks(track);

      // Update info UI
      this._updateTrackUI(track);
      this._renderLearningPanel();
      this._updateCaptionCue(0);
      this._renderQueue();
      this._emit('trackChange', track);

      // Restore per-video state from MediaStorage
      this._restoreMediaState(track);
      // Show resume hint if saved position exists
      this._showResumeHint(track);
      // Render watched overlay
      this._renderWatchedOverlay(track);
      // Render waveform
      this._renderWaveform(track);
    }

    _updateTrackUI(track) {
      if (!this._dom) return;
      const { title = 'Nothing playing', artist = '', artwork = '', album = '' } = track;

      this._dom.title.textContent  = title;
      this._dom.artist.textContent = artist || album || (track.title ? '—' : 'Pick a lesson to start');

      const artworkUrl = safeImageUrl(artwork);
      if (artworkUrl) {
        this._dom.artImg.src = artworkUrl;
        this._dom.artImg.style.display = '';
        this._dom.artPlaceholder.style.display = 'none';
      } else {
        this._dom.artImg.src = '';
        this._dom.artImg.style.display = 'none';
        this._dom.artPlaceholder.style.display = '';
      }

      // Like state
      if (this._dom.likeBtn) {
        this._dom.likeBtn.classList.toggle('liked', track._liked ?? false);
      }

      // Page title
      if (track.title) document.title = `${track.title} — OpenCourseDeck`;
    }

    _buildShuffleOrder() {
      if (!this._queue.length) {
        this._shuffleOrder = [];
        return;
      }
      const arr = Array.from({ length: this._queue.length }, (_, i) => i);
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      this._shuffleOrder = arr;
    }

    _currentTrack() {
      return this._queue[this._state.queueIndex] ?? null;
    }

    _toggleLike() {
      const track = this._currentTrack();
      if (!track) return;
      track._liked = !track._liked;
      this._dom?.likeBtn?.classList.toggle('liked', track._liked);
      this._emit('like', { track, liked: track._liked });
    }


    // ──────────────────────────────────────────────────────
    // QUEUE PANEL
    // ──────────────────────────────────────────────────────
    showQueue() {
      this._queuePanel.hidden = false;
      this._renderQueue();
      this._emit('queueOpen');
    }

    hideQueue() {
      this._queuePanel.hidden = true;
      this._emit('queueClose');
    }

    _renderQueue() {
      const list = this._dom?.queueList;
      if (!list || this._queuePanel.hidden) return;

      list.replaceChildren();
      if (!this._queue.length) {
        const empty = document.createElement('div');
        empty.className = 'pd-queue-empty';
        empty.textContent = 'Queue is empty.';
        list.appendChild(empty);
        return;
      }
      this._queue.forEach((track, i) => {
        const item = document.createElement('div');
        item.className = `pd-queue-item ${i === this._state.queueIndex ? 'active' : ''}`;
        item.draggable = true;
        item.dataset.queueIndex = String(i);
        const num = document.createElement('div');
        num.className = 'pd-queue-num';
        if (i === this._state.queueIndex) {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('width', '12');
          svg.setAttribute('height', '12');
          svg.setAttribute('viewBox', '0 0 24 24');
          svg.setAttribute('fill', 'currentColor');
          svg.setAttribute('aria-hidden', 'true');
          const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
          polygon.setAttribute('points', '5 3 19 12 5 21 5 3');
          svg.appendChild(polygon);
          num.appendChild(svg);
        } else {
          num.textContent = String(i + 1);
        }

        const info = document.createElement('div');
        info.className = 'pd-queue-info';
        const title = document.createElement('div');
        title.className = 'pd-queue-title';
        title.textContent = track.title ?? 'Unknown';
        const artist = document.createElement('div');
        artist.className = 'pd-queue-artist';
        artist.textContent = track.artist ?? '—';
        info.append(title, artist);

        const duration = document.createElement('div');
        duration.className = 'pd-queue-duration';
        duration.textContent = track.duration ? fmt.time(track.duration) : '—';

        const remove = document.createElement('button');
        remove.className = 'pd-btn pd-btn-icon pd-queue-remove';
        remove.dataset.removeIndex = String(i);
        remove.setAttribute('aria-label', 'Remove from queue');
        remove.textContent = 'x';
        const actions = document.createElement('div');
        actions.className = 'pd-queue-actions';
        const play = document.createElement('button');
        play.className = 'pd-btn pd-btn-icon';
        play.setAttribute('aria-label', `Play ${track.title ?? 'track'}`);
        play.textContent = 'Play';
        const up = document.createElement('button');
        up.className = 'pd-btn pd-btn-icon';
        up.setAttribute('aria-label', 'Move up');
        up.disabled = i === 0;
        up.textContent = 'Up';
        const down = document.createElement('button');
        down.className = 'pd-btn pd-btn-icon';
        down.setAttribute('aria-label', 'Move down');
        down.disabled = i === this._queue.length - 1;
        down.textContent = 'Down';
        actions.append(play, up, down, remove);
        item.append(num, info, duration, actions);
        item.addEventListener('dblclick', () => this.playAt(i));
        item.addEventListener('click', e => {
          if (e.target.closest('button')) return;
          this.playAt(i);
        });
        play.addEventListener('click', e => {
          e.stopPropagation();
          this.playAt(i);
        });
        up.addEventListener('click', e => {
          e.stopPropagation();
          this.moveQueueItem(i, i - 1);
        });
        down.addEventListener('click', e => {
          e.stopPropagation();
          this.moveQueueItem(i, i + 1);
        });
        remove.addEventListener('click', e => {
          e.stopPropagation();
          this.removeFromQueue(i);
        });
        list.appendChild(item);
      });

      // Scroll active into view
      const active = list.querySelector('.active');
      active?.scrollIntoView({ block: 'nearest' });
    }

    _trackCues(type) {
      const value = this._currentTrack()?.[type];
      if (!Array.isArray(value)) return [];
      return value
        .map((cue, index) => ({
          start: Number(cue.start ?? cue.time ?? cue.at ?? 0) || 0,
          end: Number(cue.end ?? cue.stop ?? cue.to ?? Number(cue.start ?? cue.time ?? cue.at ?? 0) + 4) || 0,
          title: String(cue.title ?? cue.label ?? cue.text ?? `Cue ${index + 1}`),
          text: String(cue.text ?? cue.body ?? cue.title ?? cue.label ?? ''),
          index,
        }))
        .sort((a, b) => a.start - b.start);
    }

    _loadTextTracks(track) {
      this._media.querySelectorAll?.('track[data-pd-caption-track]').forEach(el => el.remove());
      const tracks = Array.isArray(track?.captionTracks) ? track.captionTracks : [];
      tracks.forEach((item, index) => {
        const src = safeUrlFor(item?.src ?? item?.url, { dataPattern: /^data:text\/vtt/i });
        if (!src) return;
        const trackEl = document.createElement('track');
        trackEl.dataset.pdCaptionTrack = 'true';
        trackEl.kind = item.kind || 'subtitles';
        trackEl.label = item.label || `Captions ${index + 1}`;
        trackEl.srclang = item.srclang || item.lang || 'en';
        trackEl.src = src;
        if (item.default) trackEl.default = true;
        this._media.appendChild(trackEl);
      });
    }

    showChapters() {
      this._learningMode = this._learningMode === 'chapters' ? null : 'chapters';
      this._renderLearningPanel();
    }

    showTranscript() {
      this._learningMode = this._learningMode === 'transcript' ? null : 'transcript';
      this._renderLearningPanel();
    }

    toggleCaptions(force) {
      this._captionsEnabled = typeof force === 'boolean' ? force : !this._captionsEnabled;
      this._dom?.captionsBtn?.classList.toggle('active', this._captionsEnabled);
      this._dom?.captionsBtn?.setAttribute('aria-pressed', this._captionsEnabled ? 'true' : 'false');
      this._updateCaptionCue(this._media.currentTime || 0);
      this._emit('captions', this._captionsEnabled);
      return this._captionsEnabled;
    }

    _renderLearningPanel() {
      if (!this._learningPanel) return;
      this._dom?.chaptersBtn?.classList.toggle('active', this._learningMode === 'chapters');
      this._dom?.transcriptBtn?.classList.toggle('active', this._learningMode === 'transcript');
      this._dom?.chaptersBtn?.setAttribute('aria-pressed', this._learningMode === 'chapters' ? 'true' : 'false');
      this._dom?.transcriptBtn?.setAttribute('aria-pressed', this._learningMode === 'transcript' ? 'true' : 'false');
      this._learningPanel.replaceChildren();
      if (!this._learningMode) {
        this._learningPanel.hidden = true;
        return;
      }
      const cues = this._trackCues(this._learningMode);
      const header = document.createElement('div');
      header.className = 'pd-learning-header';
      const title = document.createElement('span');
      title.textContent = this._learningMode === 'chapters' ? 'Chapters' : 'Transcript';
      const close = document.createElement('button');
      close.className = 'pd-btn pd-btn-icon';
      close.type = 'button';
      close.setAttribute('aria-label', 'Close media panel');
      close.textContent = 'x';
      close.addEventListener('click', () => {
        this._learningMode = null;
        this._renderLearningPanel();
      });
      header.append(title, close);
      this._learningPanel.appendChild(header);
      if (!cues.length) {
        const empty = document.createElement('div');
        empty.className = 'pd-learning-empty';
        empty.textContent = this._learningMode === 'chapters' ? 'No chapters for this track.' : 'No transcript for this track.';
        this._learningPanel.appendChild(empty);
      } else {
        const list = document.createElement('div');
        list.className = 'pd-learning-list';
        cues.forEach(cue => {
          const item = document.createElement('button');
          item.className = 'pd-learning-item';
          item.type = 'button';
          item.dataset.cueStart = String(cue.start);
          const time = document.createElement('span');
          time.className = 'pd-learning-time';
          time.textContent = fmt.time(cue.start);
          const copy = document.createElement('span');
          copy.className = 'pd-learning-copy';
          copy.textContent = this._learningMode === 'chapters' ? cue.title : cue.text;
          item.append(time, copy);
          item.addEventListener('click', () => this.seekTo(cue.start));
          list.appendChild(item);
        });
        this._learningPanel.appendChild(list);
      }
      this._learningPanel.hidden = false;
      this._highlightTimedPanelItem(this._media.currentTime || 0);
    }

    _highlightTimedPanelItem(currentTime) {
      if (!this._learningPanel || this._learningPanel.hidden) return;
      const items = Array.from(this._learningPanel.querySelectorAll('[data-cue-start]'));
      let active = null;
      for (const item of items) {
        const start = Number(item.dataset.cueStart);
        if (Number.isFinite(start) && start <= currentTime) active = item;
      }
      items.forEach(item => item.classList.toggle('active', item === active));
    }

    _updateCaptionCue(currentTime) {
      if (!this._captionOverlay) return;
      if (!this._captionsEnabled) {
        this._captionOverlay.hidden = true;
        this._captionOverlay.textContent = '';
        return;
      }
      const cue = this._trackCues('captions').find(item => currentTime >= item.start && currentTime <= item.end);
      this._captionOverlay.textContent = cue?.text || '';
      this._captionOverlay.hidden = !cue?.text;
    }


    // ──────────────────────────────────────────────────────
    // AUDIO VISUALIZER
    // ──────────────────────────────────────────────────────
    _initVisualizer() {
      if (this._opts.type !== 'audio') return;

      try {
        const ctx        = new (window.AudioContext || window.webkitAudioContext)();
        this._audioCtx   = ctx;
        this._analyser   = ctx.createAnalyser();
        this._analyser.fftSize = this._opts.visualizerBars * 4;
        const source     = ctx.createMediaElementSource(this._media);
        this._audioSource = source;
        source.connect(this._analyser);
        this._analyser.connect(ctx.destination);
        this._setupVisualizerResize();
      } catch (e) {
        console.warn('[MediaPlayer] Visualizer init failed:', e);
      }
    }

    _setupVisualizerResize() {
      if (!this._vizCanvas) return;
      const resize = () => {
        const rect = this._vizCanvas.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;
        const width = Math.max(1, Math.round(rect.width * ratio));
        const height = Math.max(1, Math.round(rect.height * ratio));
        if (this._vizCanvas.width !== width) this._vizCanvas.width = width;
        if (this._vizCanvas.height !== height) this._vizCanvas.height = height;
      };
      this._resizeVisualizer = resize;
      resize();
      if ('ResizeObserver' in window) {
        this._vizResizeObserver = new ResizeObserver(resize);
        this._vizResizeObserver.observe(this._vizCanvas);
      } else {
        this._on(window, 'resize', resize);
      }
    }

    _visualizerMotionReduced() {
      try {
        return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
      } catch {
        return false;
      }
    }

    _startViz() {
      if (!this._analyser || !this._vizCanvas) return;

      const canvas   = this._vizCanvas;
      const ctx      = canvas.getContext('2d');
      if (this._visualizerMotionReduced()) {
        ctx?.clearRect?.(0, 0, canvas.width, canvas.height);
        this._vizAnimId = null;
        return;
      }
      const bufLen   = this._analyser.frequencyBinCount;
      const dataArr  = new Uint8Array(bufLen);
      const barCount = this._opts.visualizerBars;

      const draw = () => {
        if (!this._state.playing) {
          this._vizAnimId = null;
          return;
        }
        this._vizAnimId = requestAnimationFrame(draw);

        this._analyser.getByteFrequencyData(dataArr);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const barW    = (canvas.width / barCount) * 0.8;
        const gap     = (canvas.width / barCount) * 0.2;

        for (let i = 0; i < barCount; i++) {
          const dataIdx = Math.floor(i * bufLen / barCount);
          const val     = dataArr[dataIdx] / 255;
          const barH    = val * canvas.height;
          const x       = i * (barW + gap);
          const y       = canvas.height - barH;

          // Gradient bar
          const grad = ctx.createLinearGradient(0, y, 0, canvas.height);
          grad.addColorStop(0,   `rgba(99, 102, 241, ${0.9 * val + 0.1})`);
          grad.addColorStop(0.5, `rgba(6, 182, 212, ${0.7 * val + 0.1})`);
          grad.addColorStop(1,   `rgba(16, 185, 129, 0.2)`);

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect?.(x, y, barW, barH, 2) ?? ctx.rect(x, y, barW, barH);
          ctx.fill();
        }
      };
      draw();
    }


    // ──────────────────────────────────────────────────────
    // SESSION PERSISTENCE
    // ──────────────────────────────────────────────────────
    _saveSession(force = false) {
      // timeupdate fires ~4x/s; without throttling that is ~8 synchronous
      // storage writes per second for the whole playback session. Explicit
      // user actions (seek, speed change, teardown) pass force=true.
      const now = Date.now();
      if (!force && now - (this._lastSessionSaveAt || 0) < 1000) return;
      this._lastSessionSaveAt = now;
      try {
        const data = {
          volume:      this._state.volume,
          muted:       this._state.muted,
          queueIndex:  this._state.queueIndex,
          currentTime: this._state.currentTime,
          shuffle:     this._state.shuffle,
          repeat:      this._state.repeat,
          playbackRate: this._media.playbackRate,
        };
        sessionStorage.setItem(this._opts.storageKey, JSON.stringify(data));
        // The playlist-mode key only changes with shuffle/repeat; skip the
        // redundant write otherwise.
        const playlistSig = `${this._state.shuffle}|${this._state.repeat}`;
        if (playlistSig !== this._lastPlaylistSig) {
          this._lastPlaylistSig = playlistSig;
          sessionStorage.setItem(this._opts.storageKey + '-playlist', JSON.stringify({
            shuffle: this._state.shuffle,
            repeat: this._state.repeat,
          }));
        }
      } catch { /* quota exceeded or private browsing */ }
    }

    _restoreSession() {
      try {
        const raw  = sessionStorage.getItem(this._opts.storageKey);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data.volume != null) this.setVolume(data.volume);
        if (data.muted)          this._media.muted = true;
        if (data.shuffle)        this.toggleShuffle();
        if (data.repeat && data.repeat !== 'none') {
          this._state.repeat = data.repeat;
          this._media.loop   = data.repeat === 'one';
          this._updateRepeatUI();
        }
        if (data.playbackRate)   this._media.playbackRate = data.playbackRate;
        // Restore position after metadata loads
        if (data.currentTime > 5) {
          this._on(this._media, 'loadedmetadata', () => {
            this.seekTo(data.currentTime);
          }, { once: true });
        }
      } catch { /* ignore */ }
    }


    // ──────────────────────────────────────────────────────
    // LOADING STATES
    // ──────────────────────────────────────────────────────
    _setLoading(on) {
      this._state.loading = on;
      if (this._dom?.loadingOverlay) this._dom.loadingOverlay.hidden = !on;
    }

    _setBuffering(on) {
      this._state.buffering = on;
      this._container.classList.toggle('pd-buffering', on);
    }


    // ──────────────────────────────────────────────────────
    // EVENT EMITTER
    // ──────────────────────────────────────────────────────
    on(event, handler) {
      (this._listeners[event] = this._listeners[event] ?? []).push(handler);
      return this;
    }

    off(event, handler) {
      this._listeners[event] = (this._listeners[event] ?? []).filter(h => h !== handler);
      return this;
    }

    _emit(event, data) {
      (this._listeners[event] ?? []).forEach(h => h(data));
      window.OpenCourseDeck?.bus?.emit?.(`player:${event}`, data);
    }

    _on(target, type, handler, options) {
      if (!target?.addEventListener) return null;
      target.addEventListener(type, handler, options);
      this._domListeners.push({ target, type, handler, options });
      return handler;
    }

    _removeDomListeners() {
      for (const { target, type, handler, options } of this._domListeners) {
        try { target.removeEventListener(type, handler, options); } catch {}
      }
      this._domListeners = [];
    }


    // ──────────────────────────────────────────────────────
    // PUBLIC GETTERS
    // ──────────────────────────────────────────────────────
    get currentTime() { return this._media.currentTime; }
    get duration()    { return this._media.duration;    }
    get volume()      { return this._media.volume;      }
    get paused()      { return this._media.paused;      }
    get queue()       { return [...this._queue];        }
    get trackIndex()  { return this._state.queueIndex;  }

    snapshot() {
      const cloneTrack = (track) => track ? { ...track } : null;
      const currentTime = Number.isFinite(this._media.currentTime) ? this._media.currentTime : this._state.currentTime;
      const duration = Number.isFinite(this._media.duration) ? this._media.duration : this._state.duration;
      return {
        queue: this._queue.map(cloneTrack),
        queueIndex: this._state.queueIndex,
        currentTime: Math.max(0, currentTime || 0),
        duration: Math.max(0, duration || 0),
        playing: Boolean(this._state.playing && !this._media.paused),
        volume: this._state.volume,
        muted: this._state.muted,
        shuffle: this._state.shuffle,
        repeat: this._state.repeat,
        playbackRate: Number.isFinite(this._media.playbackRate) ? this._media.playbackRate : 1,
        track: cloneTrack(this._currentTrack()),
      };
    }

    restoreSnapshot(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') return false;
      const queue = Array.isArray(snapshot.queue) ? snapshot.queue.filter(Boolean) : [];
      if (!queue.length) return false;

      const queueIndex = Math.max(0, Math.min(queue.length - 1, Number(snapshot.queueIndex) || 0));
      const currentTime = Math.max(0, Number(snapshot.currentTime) || 0);
      const shouldPlay = Boolean(snapshot.playing);
      const volume = Number(snapshot.volume);
      const playbackRate = Number(snapshot.playbackRate);

      this.loadPlaylist(queue, false);
      if (snapshot.repeat === 'one' || snapshot.repeat === 'all' || snapshot.repeat === 'none') {
        this._state.repeat = snapshot.repeat;
        this._media.loop = snapshot.repeat === 'one';
        this._updateRepeatUI();
      }
      if (typeof snapshot.shuffle === 'boolean' && snapshot.shuffle !== this._state.shuffle) {
        this.toggleShuffle();
      }
      if (Number.isFinite(volume)) this.setVolume(volume);
      if (typeof snapshot.muted === 'boolean') {
        this._media.muted = snapshot.muted;
        this._state.muted = snapshot.muted;
      }
      if (Number.isFinite(playbackRate) && playbackRate > 0) {
        this._media.playbackRate = playbackRate;
        if (this._dom?.speedBtn) this._dom.speedBtn.textContent = this._formatSpeedLabel(playbackRate);
      }
      if (queueIndex > 0) {
        this._loadTrack(queueIndex);
      }
      if (currentTime > 0) {
        const seek = () => {
          try { this.seekTo(currentTime); } catch {}
        };
        seek();
        try { this._media?.addEventListener?.('loadedmetadata', seek, { once: true }); } catch {}
        setTimeout(seek, 80);
      }
      if (shouldPlay) {
        this.play();
      } else {
        this.pause();
      }
      return true;
    }

    canPictureInPicture() {
      return this._opts.type === 'video'
        && typeof this._media?.requestPictureInPicture === 'function'
        && document.pictureInPictureEnabled !== false;
    }

    async togglePictureInPicture() {
      if (!this.canPictureInPicture()) {
        return { active: false, supported: false, reason: 'unsupported' };
      }
      try {
        if (document.pictureInPictureElement === this._media) {
          await document.exitPictureInPicture?.();
          this._emit('pip:change', { active: false });
          return { active: false, supported: true };
        }
        await this._media.requestPictureInPicture();
        this._emit('pip:change', { active: true });
        return { active: true, supported: true };
      } catch (error) {
        this._emit('pip:error', { error });
        return { active: false, supported: true, error };
      }
    }


    // ──────────────────────────────────────────────────────

    // AB LOOP
    setLoopA() {
      this._loopA = this._media.currentTime;
      this._updateABLoopUI();
      this._emit('abloop', { a: this._loopA, b: this._loopB });
    }

    setLoopB() {
      this._loopB = this._media.currentTime;
      if (this._loopA != null && this._loopB <= this._loopA) {
        this._loopB = null;
      }
      this._updateABLoopUI();
      this._emit('abloop', { a: this._loopA, b: this._loopB });
    }

    clearLoop() {
      this._loopA = null;
      this._loopB = null;
      this._updateABLoopUI();
      this._emit('abloop', { a: null, b: null });
    }

    toggleLoop() {
      if (this._loopA == null) {
        this.setLoopA();
      } else if (this._loopB == null) {
        this.setLoopB();
      } else {
        this.clearLoop();
      }
    }

    _updateABLoopUI() {
      const btn = this._dom?.abLoopBtn;
      if (btn) {
        const active = this._loopA != null;
        btn.classList.toggle('active', active);
        if (this._loopA != null && this._loopB != null) {
          btn.textContent = 'A-B';
          btn.setAttribute('aria-label', 'AB loop: ' + fmt.time(this._loopA) + ' - ' + fmt.time(this._loopB));
        } else if (this._loopA != null) {
          btn.textContent = 'A-?';
          btn.setAttribute('aria-label', 'Loop A set at ' + fmt.time(this._loopA) + ', press again for B');
        } else {
          btn.textContent = 'A-B';
          btn.setAttribute('aria-label', 'AB loop');
        }
      }
      const region = this._dom?.abLoopRegion;
      if (region) {
        if (this._loopA != null && this._loopB != null && this._state.duration > 0) {
          const startPct = clampPct((this._loopA / this._state.duration) * 100);
          const endPct = clampPct((this._loopB / this._state.duration) * 100);
          region.style.left = startPct + '%';
          region.style.width = (endPct - startPct) + '%';
          region.style.display = '';
        } else {
          region.style.display = 'none';
        }
      }
    }

    // SCREENSHOT
    screenshot() {
      try {
        const canvas = document.createElement('canvas');
        const video = this._media;
        if (video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        } else {
          canvas.width = 640;
          canvas.height = 360;
        }
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');
        this._emit('screenshot', { dataUrl, track: this._currentTrack(), time: this._media.currentTime });
        return dataUrl;
      } catch (e) {
        console.warn('[MediaPlayer] Screenshot failed:', e);
        return null;
      }
    }

    async screenshotToClipboard() {
      try {
        const canvas = document.createElement('canvas');
        const video = this._media;
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(function(r) { canvas.toBlob(r, 'image/png'); });
        if (blob && navigator.clipboard && navigator.clipboard.write) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        }
        return true;
      } catch (e) {
        console.warn('[MediaPlayer] Screenshot to clipboard failed:', e);
        return false;
      }
    }

    // MEDIA STORAGE INTEGRATION
    _mediaId() {
      var track = this._currentTrack();
      return this._opts.mediaId || track?.id || track?.src || 'track-' + this._state.queueIndex;
    }

    async _restoreMediaState(track) {
      if (!this._mediaStorage) return;
      var mediaId = this._opts.mediaId || track?.id || track?.src || 'track-' + this._state.queueIndex;
      try {
        const state = await this._mediaStorage.get(mediaId);
        if (state) {
          if (Number.isFinite(state.volume) && state.volume >= 0) this.setVolume(state.volume);
          if (typeof state.muted === 'boolean') this._media.muted = state.muted;
          if (Number.isFinite(state.rate) && state.rate > 0) {
            this._media.playbackRate = state.rate;
            if (this._dom?.speedBtn) this._dom.speedBtn.textContent = this._formatSpeedLabel(state.rate);
            if (this._dom?.speedSlider) this._dom.speedSlider.value = String(state.rate);
          }
        }
      } catch { /* ignore */ }
    }

    // WAVEFORM SCRUBBER INTEGRATION
    async _renderWaveform(track) {
      const canvas = this._dom?.waveformCanvas;
      if (!canvas) return;
      const ScrubberClass = window.OpenCourseDeck?.WaveformScrubber;
      if (!ScrubberClass) {
        canvas.style.display = 'none';
        return;
      }
      if (!this._waveformScrubber) this._waveformScrubber = new ScrubberClass();
      let audioUrl = track?.src || track?.url;
      const raw = typeof audioUrl === 'string'
        ? audioUrl.trim()
        : String(audioUrl?.url || audioUrl?.src || '').trim();
      if (raw.startsWith('library-file:') && typeof window.OpenCourseDeck?.UserLibrary?.resolvePlayable === 'function') {
        try {
          audioUrl = await window.OpenCourseDeck.UserLibrary.resolvePlayable(audioUrl, safeMediaUrl);
        } catch {
          audioUrl = '';
        }
      } else if (audioUrl) {
        audioUrl = safeMediaUrl(audioUrl) || audioUrl;
      }
      if (!audioUrl || String(audioUrl).startsWith('library-file:')) {
        canvas.style.display = 'none';
        return;
      }
      canvas.style.display = '';
      const cacheId = track?.id || raw || audioUrl;
      try {
        await this._waveformScrubber.render(canvas, audioUrl, {
          cacheId,
          progress: this._state.duration > 0 ? this._media.currentTime / this._state.duration : 0,
          bars: 200,
        });
      } catch {
        canvas.style.display = 'none';
      }
    }

    // WATCHED SEGMENT TRACKING
    _startWatchedSegmentTracking() {
      const track = this._currentTrack();
      if (!track) return;
      this._watchedSegStart = this._media.currentTime;
    }

    _saveWatchedSegment() {
      if (this._watchedSegStart == null) return;
      const track = this._currentTrack();
      if (!track) { this._watchedSegStart = null; return; }
      const topicId = track.topicId || track.id;
      if (!topicId) { this._watchedSegStart = null; return; }
      const start = this._watchedSegStart;
      const end = this._media.currentTime;
      this._watchedSegStart = null;
      if (end - start < 1) return;

      this._watchedIntervals = _mergeIntervals([...this._watchedIntervals, { start, end }]);

      const db = window.DB;
      if (db?.addWatchedSegment) {
        db.addWatchedSegment({
          topicId,
          courseId: track.courseId || '',
          start,
          end,
        }).catch(() => {});
      }

      this._renderWatchedOverlay(track);
    }

    _renderWatchedOverlay(_track) {
      const overlay = this._dom?.watchedOverlay;
      if (!overlay) return;
      const dur = this._state.duration || this._media.duration || 0;
      if (!dur || !this._watchedIntervals.length) {
        overlay.style.display = 'none';
        return;
      }
      overlay.style.display = '';
      overlay.replaceChildren();
      for (const seg of this._watchedIntervals) {
        const startPct = clampPct((seg.start / dur) * 100);
        const endPct = clampPct((seg.end / dur) * 100);
        if (endPct <= startPct) continue;
        const bar = document.createElement('div');
        bar.className = 'pd-watched-bar';
        bar.style.left = startPct + '%';
        bar.style.width = (endPct - startPct) + '%';
        overlay.appendChild(bar);
      }
    }

    async _showResumeHint(track) {
      const hint = this._dom?.resumeHint;
      const text = this._dom?.resumeText;
      if (!hint || !text) return;
      hint.hidden = true;

      // Staleness guard: rapid track changes can leave an older call
      // resolving after a newer one; without this token the previous
      // track's resume state would overwrite the current track's.
      const requestToken = (this._resumeHintToken = (this._resumeHintToken || 0) + 1);
      const isStale = () => requestToken !== this._resumeHintToken || this._currentTrack() !== track;

      let savedTime = 0;
      const mediaId = this._opts.mediaId || track?.id || track?.src || '';
      if (this._mediaStorage && mediaId) {
        try {
          const state = await this._mediaStorage.get(mediaId);
          savedTime = Number(state?.time) || 0;
        } catch { /* ignore */ }
        if (isStale()) return;
      }

      // One segments read serves both the fallback resume time and the
      // watched-intervals overlay.
      const topicId = track?.topicId || track?.id;
      const db = window.DB;
      let segments = null;
      if (topicId && db?.getWatchedSegments) {
        try { segments = await db.getWatchedSegments(topicId); } catch { /* ignore */ }
        if (isStale()) return;
      }

      if (!savedTime && segments?.length) {
        const maxEnd = segments.reduce((max, s) => Math.max(max, Number(s.end) || 0), 0);
        if (maxEnd > 10) savedTime = maxEnd;
      }

      if (segments) {
        this._watchedIntervals = segments.length
          ? segments
              .filter(s => s.start != null && s.end != null)
              .map(s => ({ start: Number(s.start), end: Number(s.end) }))
          : [];
      }

      if (savedTime > 10) {
        text.textContent = 'Resume from ' + fmt.time(savedTime) + '?';
        hint.hidden = false;
        this._pendingResumeTime = savedTime;
      }
    }

    _handleResumeGo() {
      if (this._pendingResumeTime > 0) {
        this.seekTo(this._pendingResumeTime);
      }
      if (this._dom?.resumeHint) this._dom.resumeHint.hidden = true;
      this._pendingResumeTime = 0;
    }

    _handleResumeStart() {
      this.seekTo(0);
      if (this._dom?.resumeHint) this._dom.resumeHint.hidden = true;
      this._pendingResumeTime = 0;
    }

    // RESTORE PLAYLIST MODE
    _restorePlaylistMode() {
      try {
        const raw = sessionStorage.getItem(this._opts.storageKey + '-playlist');
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data.shuffle != null && data.shuffle !== this._state.shuffle) {
          this.toggleShuffle();
        }
        if (data.repeat && data.repeat !== 'none' && data.repeat !== this._state.repeat) {
          this._state.repeat = data.repeat;
          this._media.loop = data.repeat === 'one';
          this._updateRepeatUI();
        }
      } catch { /* ignore */ }
    }


    // DESTROY
    // ──────────────────────────────────────────────────────
    destroy() {
      if (this._destroyed) return;
      this._destroyed = true;
      this._saveWatchedSegment();
      this._removeDomListeners();
      try { this._media.pause(); } catch {}
      this._media.src = '';
      try { this._media.load(); } catch {}
      if (this._audioCtx) {
        try { this._audioCtx.close(); } catch {}
        this._audioCtx = null;
      }
      if (this._audioEnhancer) {
        try { this._audioEnhancer.dispose(); } catch {}
        this._audioEnhancer = null;
      }
      if (this._vizAnimId) cancelAnimationFrame(this._vizAnimId);
      this._vizAnimId = null;
      this._vizResizeObserver?.disconnect?.();
      this._vizResizeObserver = null;
      this._resizeVisualizer = null;
      if (this._waveformScrubber) {
        this._waveformScrubber.destroy();
        this._waveformScrubber = null;
      }
      if (this._mediaStorage) {
        // destroy() flushes and removes the storage's pagehide listener so
        // destroyed players don't accumulate window listeners.
        if (typeof this._mediaStorage.destroy === 'function') this._mediaStorage.destroy();
        else this._mediaStorage.flush();
        this._mediaStorage = null;
      }
      if (this._seekAccumTimer) {
        clearTimeout(this._seekAccumTimer);
        this._seekAccumTimer = null;
      }
      this._container.replaceChildren();
      this._listeners = {};
      this._dom = null;
      this._controls = null;
      this._queuePanel = null;
      sessionStorage.removeItem(this._opts.storageKey);
      sessionStorage.removeItem(this._opts.storageKey + '-playlist');
    }
  }


  // ══════════════════════════════════════════════════════════
  // AUTO-INIT: [data-player] elements
  // ══════════════════════════════════════════════════════════
  function autoInit() {
    document.querySelectorAll('[data-player]').forEach(el => {
      if (el._pdPlayer) return;
      try {
        const opts = JSON.parse(el.dataset.playerOptions ?? '{}');
        el._pdPlayer = new MediaPlayer(el, opts);
      } catch (e) {
        console.warn('[MediaPlayer] Auto-init error:', e);
      }
    });
  }

  function destroyAll(root = document) {
    root.querySelectorAll('[data-player]').forEach(el => {
      try { el._pdPlayer?.destroy?.(); } catch {}
      delete el._pdPlayer;
    });
  }

  function getActiveSnapshot(root = document) {
    const players = Array.from(root.querySelectorAll?.('[data-player]') ?? [])
      .map(el => el._pdPlayer)
      .filter(Boolean);
    for (const player of players) {
      try {
        const snapshot = player.snapshot?.();
        if (snapshot?.track || snapshot?.queue?.length) return snapshot;
      } catch {}
    }
    return null;
  }

  async function requestActivePictureInPicture(root = document) {
    const players = Array.from(root.querySelectorAll?.('[data-player]') ?? [])
      .map(el => el._pdPlayer)
      .filter(Boolean);
    const player = players.find(item => item?.canPictureInPicture?.());
    if (!player) return { active: false, supported: false, reason: 'unsupported' };
    return player.togglePictureInPicture();
  }

  document.addEventListener('DOMContentLoaded', autoInit);

  // ── Export ────────────────────────────────────────────────
  window.OpenCourseDeck            = window.OpenCourseDeck ?? {};
  window.OpenCourseDeck.MediaPlayer = MediaPlayer;
  window.OpenCourseDeck.Player      = { init: autoInit, destroyAll, getActiveSnapshot, requestActivePictureInPicture };

})();
