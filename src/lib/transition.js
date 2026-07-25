/**
 * Transition — Task-based cancellable animation extending Promise.
 * Based on Ripl transition.ts + Anime.js RAF engine.
 */

import { parseEasing } from './easing.js';

/**
 * @typedef {(t: number) => void} OnUpdate
 * @typedef {() => void} OnEnd
 */

export class Transition {
  /**
   * @param {number} duration — in ms
   * @param {string|Function} easing
   * @param {OnUpdate} onUpdate — called with t ∈ [0,1]
   * @param {OnEnd} [onEnd]
   */
  constructor(duration, easing, onUpdate, onEnd) {
    this._duration = Math.max(0, duration);
    this._easingFn = typeof easing === 'function' ? easing : parseEasing(easing);
    this._onUpdate = onUpdate;
    this._onEnd = onEnd;
    this._startTime = 0;
    this._currentTime = 0;
    this._paused = true;
    this._finished = false;
    this._rafId = 0;
    this._abortController = new AbortController();
    this._reject = null;
    this._resolve = null;

    this._promise = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });

    this._onVisibilityChange = () => {
      if (document.hidden) {
        this._pauseInternal();
      } else if (!this._paused && !this._finished) {
        this._resumeInternal();
      }
    };
    document.addEventListener('visibilitychange', this._onVisibilityChange);
  }

  /**
   * Start or resume the transition.
   * @returns {this}
   */
  play() {
    if (this._finished) return this;
    if (!this._paused) return this;
    this._paused = false;
    this._resumeInternal();
    return this;
  }

  /**
   * Pause the transition.
   * @returns {this}
   */
  pause() {
    this._paused = true;
    this._pauseInternal();
    return this;
  }

  /**
   * Seek to a specific time (ms).
   * @param {number} time
   * @returns {this}
   */
  seek(time) {
    const t = Math.max(0, Math.min(this._duration, time));
    this._currentTime = t;
    const progress = this._duration > 0 ? t / this._duration : 1;
    const eased = this._easingFn(Math.min(1, progress));
    this._onUpdate(eased);
    if (progress >= 1 && !this._finished) {
      this._finish();
    }
    return this;
  }

  /**
   * Cancel the transition.
   */
  cancel() {
    if (this._finished) return;
    this._finished = true;
    this._paused = true;
    this._pauseInternal();
    this._abortController.abort();
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    this._reject?.(new DOMException('Transition cancelled', 'AbortError'));
  }

  /**
   * Promise interface — await the transition.
   * @returns {Promise<void>}
   */
  then(onFulfilled, onRejected) {
    return this._promise.then(onFulfilled, onRejected);
  }

  catch(onRejected) {
    return this._promise.catch(onRejected);
  }

  finally(onFinally) {
    return this._promise.finally(onFinally);
  }

  /** @internal */
  _tick(timestamp) {
    if (this._paused || this._finished) return;
    if (!this._startTime) this._startTime = timestamp - this._currentTime;
    const elapsed = timestamp - this._startTime;
    this._currentTime = elapsed;
    const progress = this._duration > 0 ? Math.min(1, elapsed / this._duration) : 1;
    const eased = this._easingFn(progress);
    this._onUpdate(eased);
    if (progress >= 1) {
      this._finish();
    } else {
      this._rafId = requestAnimationFrame((ts) => this._tick(ts));
    }
  }

  /** @internal */
  _finish() {
    this._finished = true;
    this._paused = true;
    this._pauseInternal();
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    this._onUpdate(1);
    this._onEnd?.();
    this._resolve?.();
  }

  /** @internal */
  _pauseInternal() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
  }

  /** @internal */
  _resumeInternal() {
    if (this._finished || this._paused) return;
    this._rafId = requestAnimationFrame((ts) => this._tick(ts));
  }
}
