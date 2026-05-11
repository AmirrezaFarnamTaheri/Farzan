// ============================================================
// PlasmaDeck — player.js
// Full Media Player System
// Audio | Video | Playlist | Visualizer | Queue
// ============================================================

(() => {
  'use strict';

  // ──────────────────────────────────────────────────────────
  // UTILITIES
  // ──────────────────────────────────────────────────────────
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const uid = (p = 'pd') => `${p}-${Math.random().toString(36).slice(2, 9)}`;

  const clampPct = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.min(100, Math.max(0, n));
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
      }, options);

      // ── State ──────────────────────────────────────────
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

      // ── Build DOM ──────────────────────────────────────
      this._buildDOM();
      this._bindNative();
      if (this._opts.keyboard) this._bindKeyboard();
      if (this._opts.visualizer && this._opts.type === 'audio') {
        this._initVisualizer();
      }

      // ── Load initial playlist ──────────────────────────
      if (this._opts.playlist.length) {
        this.loadPlaylist(this._opts.playlist);
      }

      // ── Restore session ────────────────────────────────
      this._restoreSession();
    }


    // ──────────────────────────────────────────────────────
    // DOM BUILDER
    // ──────────────────────────────────────────────────────
    _buildDOM() {
      this._container.classList.add('pd-player', `pd-player-${this._opts.type}`, `theme-${this._opts.theme}`);
      this._container.innerHTML = '';

      // Native media element
      this._media = document.createElement(this._opts.type === 'video' ? 'video' : 'audio');
      this._media.preload     = this._opts.preload;
      this._media.muted       = this._state.muted;
      this._media.volume      = this._state.volume;
      this._media.loop        = this._opts.repeat === 'one';
      if (this._opts.crossOrigin) this._media.crossOrigin = this._opts.crossOrigin;
      this._media.className   = 'pd-media-element';

      if (this._opts.type === 'video') {
        this._media.style.cssText = 'width:100%;display:block;background:#000;border-radius:inherit;';
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

      controls.innerHTML = `
        <!-- Track info -->
        <div class="pd-info">
          <div class="pd-artwork">
            <img class="pd-art-img" src="" alt="" aria-hidden="true">
            <div class="pd-art-placeholder" aria-hidden="true">🎵</div>
          </div>
          <div class="pd-meta">
            <div class="pd-title" aria-live="polite">—</div>
            <div class="pd-artist">—</div>
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
            <div class="pd-progress-buf"></div>
            <div class="pd-progress-fill"></div>
            <div class="pd-progress-thumb"></div>
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
          <button class="pd-btn pd-btn-icon pd-speed-btn" aria-label="Playback speed" data-pd="speed">1×</button>
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
      this._queuePanel.innerHTML = `
        <div class="pd-queue-header">
          <span>Queue</span>
          <button class="pd-btn pd-btn-icon" data-pd="queue-close" aria-label="Close queue">×</button>
        </div>
        <div class="pd-queue-list"></div>
      `;
      this._container.appendChild(this._queuePanel);

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
        volTrack:   $('.pd-volume-track',   controls),
        volFill:    $('.pd-volume-fill',    controls),
        playBtn:    $('[data-pd="play"]',   controls),
        playIcon:   $('.icon-play',  controls),
        pauseIcon:  $('.icon-pause', controls),
        shuffleBtn: $('[data-pd="shuffle"]', controls),
        repeatBtn:  $('[data-pd="repeat"]',  controls),
        speedBtn:   $('[data-pd="speed"]',   controls),
        likeBtn:    $('[data-pd="like"]',    controls),
        loadingOverlay: $('.pd-loading-overlay', controls),
        queueList:  $('.pd-queue-list', this._queuePanel),
      };
    }


    // ──────────────────────────────────────────────────────
    // NATIVE MEDIA EVENTS
    // ──────────────────────────────────────────────────────
    _bindNative() {
      const m = this._media;

      m.addEventListener('loadstart',  () => this._setLoading(true));
      m.addEventListener('canplay',    () => this._setLoading(false));
      m.addEventListener('waiting',    () => this._setBuffering(true));
      m.addEventListener('playing',    () => { this._setBuffering(false); this._onPlay(); });
      m.addEventListener('pause',      () => this._onPause());
      m.addEventListener('ended',      () => this._onEnded());
      m.addEventListener('error',      () => this._onError());
      m.addEventListener('durationchange', () => this._onDurationChange());
      m.addEventListener('timeupdate',    () => this._onTimeUpdate());
      m.addEventListener('volumechange',  () => this._onVolumeChange());

      // Buffer progress
      m.addEventListener('progress', () => {
        if (!m.buffered.length || !Number.isFinite(m.duration) || m.duration <= 0) return;
        const pct = clampPct((m.buffered.end(m.buffered.length - 1) / m.duration) * 100);
        if (this._dom?.seekBuf) this._dom.seekBuf.style.width = `${pct}%`;
      });

      // ── Controls interaction ───────────────────────────
      if (!this._opts.controls) return;

      // Play/pause button
      this._controls.addEventListener('click', e => {
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
          case 'like':       this._toggleLike();             break;
          case 'queue':      this.showQueue();               break;
          case 'queue-close': this.hideQueue();              break;
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

      track.addEventListener('mousedown',  start);
      track.addEventListener('touchstart', start, { passive: false });
      window.addEventListener('mousemove', move);
      window.addEventListener('touchmove', move, { passive: false });
      window.addEventListener('mouseup',   end);
      window.addEventListener('touchend',  end);

      // Click also works
      track.addEventListener('click', e => onPct(calc(e)));

      // Keyboard for seek/volume
      track.addEventListener('keydown', e => {
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
      document.addEventListener('keydown', e => {
        if (!this._container.matches(':focus-within') &&
            !['Space','KeyK','KeyM','KeyJ','KeyL'].includes(e.code)) return;
        const t = e.target;
        if (t?.matches?.('input,textarea,select,[contenteditable],[contenteditable="true"]')) return;
        if (t?.closest?.('[contenteditable],[contenteditable="true"]')) return;

        switch (e.code) {
          case 'Space': case 'KeyK': e.preventDefault(); this.toggle();       break;
          case 'KeyM':               e.preventDefault(); this.toggleMute();   break;
          case 'KeyJ': case 'ArrowLeft': e.preventDefault(); this.seekBy(-10); break;
          case 'KeyL': case 'ArrowRight':e.preventDefault(); this.seekBy(+10); break;
          case 'ArrowUp':            e.preventDefault(); this.setVolume(Math.min(1, this._state.volume + 0.1)); break;
          case 'ArrowDown':          e.preventDefault(); this.setVolume(Math.max(0, this._state.volume - 0.1)); break;
          case 'KeyN':               this.next();   break;
          case 'KeyP':               this.prev();   break;
          case 'KeyS':               this.toggleShuffle(); break;
          case 'KeyR':               this.cycleRepeat();   break;
        }
      });
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
    }

    _onPause() {
      this._state.playing = false;
      if (this._dom) {
        this._dom.playIcon.style.display  = '';
        this._dom.pauseIcon.style.display = 'none';
        this._dom.playBtn.setAttribute('aria-label', 'Play');
      }
      this._emit('pause', this._currentTrack());
    }

    _onEnded() {
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

      if (this._dom) {
        this._dom.timeCur.textContent = fmt.time(cur);
        this._dom.seekFill.style.width = `${pct}%`;
        this._dom.seekThumb.style.left = `${pct}%`;
        this._dom.seekTrack?.setAttribute('aria-valuenow', String(Math.round(pct)));
      }

      this._emit('timeupdate', { currentTime: cur, duration: dur || 0, percent: pct });
      this._saveSession();
    }

    _onVolumeChange() {
      this._state.volume = this._media.volume;
      this._state.muted  = this._media.muted;
      if (this._dom) {
        const pct = this._state.muted ? 0 : this._state.volume * 100;
        this._dom.volFill.style.width = `${pct}%`;
        this._dom.volTrack?.setAttribute('aria-valuenow', String(Math.round(pct)));
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
      const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
      const cur    = this._media.playbackRate;
      const idx    = speeds.indexOf(cur);
      const next   = speeds[(idx + 1) % speeds.length];
      this._media.playbackRate = next;
      if (this._dom?.speedBtn) this._dom.speedBtn.textContent = `${next}×`;
      this._emit('speed', next);
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
      this._queue.splice(index, 1);
      if (index < this._state.queueIndex) this._state.queueIndex--;
      this._renderQueue();
      this._emit('queueUpdated', this._queue);
    }

    next(wrap = false) {
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

      this._state.queueIndex = index;
      this._history.push(index);

      // Set source
      this._media.src = track.src ?? track.url ?? '';
      this._media.load();

      // Update info UI
      this._updateTrackUI(track);
      this._renderQueue();
      this._emit('trackChange', track);
    }

    _updateTrackUI(track) {
      if (!this._dom) return;
      const { title = '—', artist = '—', artwork = '', album = '' } = track;

      this._dom.title.textContent  = title;
      this._dom.artist.textContent = artist || album || '—';

      if (artwork) {
        this._dom.artImg.src = artwork;
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
      if (track.title) document.title = `${track.title} — PlasmaDeck`;
    }

    _buildShuffleOrder() {
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

      list.innerHTML = '';
      this._queue.forEach((track, i) => {
        const item = document.createElement('div');
        item.className = `pd-queue-item ${i === this._state.queueIndex ? 'active' : ''}`;
        item.draggable = true;
        item.dataset.queueIndex = String(i);
        item.innerHTML = `
          <div class="pd-queue-num">${i === this._state.queueIndex
            ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
            : i + 1}</div>
          <div class="pd-queue-info">
            <div class="pd-queue-title">${track.title ?? 'Unknown'}</div>
            <div class="pd-queue-artist">${track.artist ?? '—'}</div>
          </div>
          <div class="pd-queue-duration">${track.duration ? fmt.time(track.duration) : '—'}</div>
          <button class="pd-btn pd-btn-icon pd-queue-remove" data-remove-index="${i}" aria-label="Remove from queue">×</button>
        `;
        item.addEventListener('dblclick', () => this.playAt(i));
        item.querySelector('[data-remove-index]').addEventListener('click', e => {
          e.stopPropagation();
          this.removeFromQueue(i);
        });
        list.appendChild(item);
      });

      // Scroll active into view
      const active = list.querySelector('.active');
      active?.scrollIntoView({ block: 'nearest' });
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
        window.addEventListener('resize', resize);
      }
    }

    _startViz() {
      if (!this._analyser || !this._vizCanvas) return;

      const canvas   = this._vizCanvas;
      const ctx      = canvas.getContext('2d');
      const bufLen   = this._analyser.frequencyBinCount;
      const dataArr  = new Uint8Array(bufLen);
      const barCount = this._opts.visualizerBars;

      const draw = () => {
        if (!this._state.playing) {
          this._vizAnimId = null;
          return;
        }
        this._vizAnimId = requestAnimationFrame(draw);

        this._resizeVisualizer?.();

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
    _saveSession() {
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
          this._media.addEventListener('loadedmetadata', () => {
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
      window.PlasmaDeck?.bus?.emit?.(`player:${event}`, data);
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


    // ──────────────────────────────────────────────────────
    // DESTROY
    // ──────────────────────────────────────────────────────
    destroy() {
      this._media.pause();
      this._media.src = '';
      if (this._audioCtx) this._audioCtx.close();
      if (this._vizAnimId) cancelAnimationFrame(this._vizAnimId);
      this._vizResizeObserver?.disconnect?.();
      if (!this._vizResizeObserver && this._resizeVisualizer) {
        window.removeEventListener('resize', this._resizeVisualizer);
      }
      this._container.innerHTML = '';
      this._listeners = {};
      sessionStorage.removeItem(this._opts.storageKey);
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

  document.addEventListener('DOMContentLoaded', autoInit);

  // ── Export ────────────────────────────────────────────────
  window.PlasmaDeck            = window.PlasmaDeck ?? {};
  window.PlasmaDeck.MediaPlayer = MediaPlayer;
  window.PlasmaDeck.Player      = { init: autoInit };

})();
