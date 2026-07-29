/**
 * Timeline — sequenced/parallel animations with labels and position offsets.
 * Based on Anime.js timeline system.
 */

import { parseEasing } from './easing.js';

/**
 * Parse position parameter.
 * @param {number|string} position
 * @param {Map<string, number>} labels
 * @param {number} lastEnd
 * @param {number} defaultGap
 * @returns {number}
 */
function parsePosition(position, labels, lastEnd, defaultGap) {
  if (position == null) return lastEnd + defaultGap;
  if (typeof position === 'number') return position;
  if (typeof position === 'string') {
    const str = position.trim();
    if (labels.has(str)) return labels.get(str);
    const addMatch = str.match(/^\+=([\d.]+)$/);
    if (addMatch) return lastEnd + parseFloat(addMatch[1]);
    const subMatch = str.match(/^-=(\d+\.?\d*)$/);
    if (subMatch) return Math.max(0, lastEnd - parseFloat(subMatch[1]));
    if (str === '<<') return lastEnd;
    const num = parseFloat(str);
    if (!isNaN(num)) return num;
  }
  return lastEnd + defaultGap;
}

/**
 * @typedef {{ targets: any, params: Object, start: number, end: number, type: 'animate'|'set'|'call' }} TimelineEntry
 */

export class Timeline {
  constructor() {
    /** @type {TimelineEntry[]} */
    this._entries = [];
    /** @type {Map<string, number>} */
    this._labels = new Map();
    this._duration = 0;
    this._position = 0;
    this._playing = false;
    this._paused = true;
    this._startTime = 0;
    this._currentTime = 0;
    this._rafId = 0;
    this._direction = 1; // 1 = forward, -1 = reverse
    this._reverseStartPosition = 0;
    this._onUpdateCallbacks = [];
    this._firedCalls = new Set();
    this._started = false;
    this._finished = false;
  }

  /**
   * Add animation to timeline.
   * @param {any} targets
   * @param {Object} params — { duration, easing, delay, ...props }
   * @param {number|string} [position]
   * @returns {this}
   */
  add(targets, params, position) {
    const duration = params.duration ?? 0;
    const delay = params.delay ?? 0;
    const pos = parsePosition(position, this._labels, this._position, 0);
    const start = pos + delay;
    const end = start + duration;

    this._entries.push({ targets, params: { ...params }, start, end, type: 'animate' });
    this._position = end;
    this._duration = Math.max(this._duration, end);
    return this;
  }

  /**
   * Instant set at position.
   * @param {any} targets
   * @param {Object} params
   * @param {number|string} [position]
   * @returns {this}
   */
  set(targets, params, position) {
    const pos = parsePosition(position, this._labels, this._position, 0);
    this._entries.push({ targets, params: { ...params }, start: pos, end: pos, type: 'set' });
    return this;
  }

  /**
   * Callback at position.
   * @param {Function} fn
   * @param {number|string} [position]
   * @returns {this}
   */
  call(fn, position) {
    const pos = parsePosition(position, this._labels, this._position, 0);
    this._entries.push({ targets: null, params: { fn }, start: pos, end: pos, type: 'call' });
    return this;
  }

  /**
   * Name a position.
   * @param {string} name
   * @param {number|string} [position]
   * @returns {this}
   */
  label(name, position) {
    const pos = parsePosition(position, this._labels, this._position, 0);
    this._labels.set(name, pos);
    return this;
  }

  /**
   * Register an update callback.
   * @param {Function} fn — called with (currentTime)
   * @returns {this}
   */
  onUpdate(fn) {
    this._onUpdateCallbacks.push(fn);
    return this;
  }

  /**
   * Play the timeline.
   * @returns {this}
   */
  play() {
    if (this._playing) return this;
    this._playing = true;
    this._paused = false;
    this._startTime = 0;
    // _started distinguishes a fresh start / replay-after-completion from a
    // resume. Inferring it from _currentTime would be ambiguous when the
    // timeline is paused at exactly t=0. A resume must NOT clear
    // _firedCalls, or every call()/set() entry before the pause point would
    // fire a second time (duplicate DOM inserts, double toasts).
    if (!this._started || this._finished) {
      this._started = true;
      this._finished = false;
      this._direction = 1;
      this._currentTime = 0;
      this._firedCalls.clear();
    } else if (this._direction < 0) {
      // Resuming a paused reverse playback: re-anchor the reverse
      // origin at the pause position.
      this._reverseStartPosition = this._currentTime;
    }
    this._rafId = requestAnimationFrame((ts) => this._tick(ts));
    return this;
  }

  /**
   * Pause the timeline.
   * @returns {this}
   */
  pause() {
    this._paused = true;
    this._playing = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
    return this;
  }

  /**
   * Cancel the timeline and clean up RAF.
   */
  cancel() {
    this._paused = true;
    this._playing = false;
    // A cancelled timeline restarts from the top on the next play().
    this._started = false;
    this._finished = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
  }

  /**
   * Seek to time.
   * @param {number} time
   * @returns {this}
   */
  seek(time) {
    this._currentTime = Math.max(0, Math.min(this._duration, time));
    // Seeking establishes an explicit playhead, so a following play()
    // resumes from it rather than rewinding to 0.
    this._started = true;
    this._finished = false;
    this._startTime = 0;
    this._applyState(this._currentTime);
    return this;
  }

  /**
   * Reverse playback direction.
   * @returns {this}
   */
  reverse() {
    this._direction *= -1;
    if (this._direction < 0) {
      this._reverseStartPosition = this._currentTime;
      this._startTime = 0;
    } else {
      this._startTime = 0;
    }
    return this;
  }

  /**
   * Total duration of the timeline.
   * @returns {number}
   */
  get duration() {
    return this._duration;
  }

  /** @internal */
  _tick(timestamp) {
    if (this._paused) return;

    if (this._direction > 0) {
      // Forward playback
      if (!this._startTime) this._startTime = timestamp - this._currentTime;
      const elapsed = timestamp - this._startTime;
      this._currentTime = elapsed;

      if (elapsed >= this._duration) {
        this._applyState(this._duration);
        this._paused = true;
        this._playing = false;
        // Mark complete so the next play() restarts (re-arming call/set
        // entries) rather than resuming a finished timeline.
        this._finished = true;
        for (const cb of this._onUpdateCallbacks) cb(this._duration);
        return;
      }

      this._applyState(elapsed);
      for (const cb of this._onUpdateCallbacks) cb(elapsed);
    } else {
      // Reverse playback
      if (!this._startTime) this._startTime = timestamp;
      const elapsed = timestamp - this._startTime;
      this._currentTime = Math.max(0, this._reverseStartPosition - elapsed);

      if (this._currentTime <= 0) {
        this._applyState(0);
        this._paused = true;
        this._playing = false;
        this._currentTime = 0;
        this._finished = true;
        for (const cb of this._onUpdateCallbacks) cb(0);
        return;
      }

      this._applyState(this._currentTime);
      for (const cb of this._onUpdateCallbacks) cb(this._currentTime);
    }

    this._rafId = requestAnimationFrame((ts) => this._tick(ts));
  }

  /** @internal */
  _applyState(time) {
    for (const entry of this._entries) {
      if (entry.type === 'call') {
        if (time >= entry.start && this._wasBefore(entry, time)) {
          this._markFired(entry);
          entry.params.fn();
        }
        continue;
      }

      if (entry.type === 'set') {
        if (time >= entry.start && this._wasBefore(entry, time)) {
          this._markFired(entry);
          this._applyProps(entry.targets, entry.params);
        }
        continue;
      }

      // animate
      if (entry.start === entry.end) continue;
      const progress = Math.max(0, Math.min(1, (time - entry.start) / (entry.end - entry.start)));
      const easingFn = entry.params.easing ? parseEasing(entry.params.easing) : (t) => t;
      const eased = easingFn(progress);
      this._applyInterpolated(entry.targets, entry.params, eased);
    }
  }

  /** @internal */
  _wasBefore(entry, _time) {
    const key = this._entries.indexOf(entry);
    return !this._firedCalls.has(key);
  }

  /** @internal */
  _markFired(entry) {
    const key = this._entries.indexOf(entry);
    this._firedCalls.add(key);
  }

  /** @internal */
  _applyProps(targets, params) {
    if (!targets) return;
    const els = Array.isArray(targets) ? targets : [targets];
    for (const el of els) {
      if (!el || !el.style) continue;
      for (const [key, value] of Object.entries(params)) {
        if (key === 'duration' || key === 'easing' || key === 'delay' || key === 'fn') continue;
        if (key === 'opacity' || key === 'scale' || key === 'rotate') {
          el.style[key] = typeof value === 'number' ? String(value) : value;
        } else {
          el.style[key] = value;
        }
      }
    }
  }

  /** @internal */
  _applyInterpolated(targets, params, progress) {
    if (!targets) return;
    const els = Array.isArray(targets) ? targets : [targets];
    for (const el of els) {
      if (!el || !el.style) continue;
      for (const [key, value] of Object.entries(params)) {
        if (key === 'duration' || key === 'easing' || key === 'delay') continue;
        if (typeof value === 'number') {
          el.style[key] = String(value * progress);
        }
      }
    }
  }
}
