/**
 * RAFLoop — clean requestAnimationFrame wrapper with start/stop, auto-pause on hidden.
 * Based on Vidstack RAFLoop.
 */
export class RAFLoop {
  /**
   * @param {function(number): void} callback — called each frame with timestamp
   */
  constructor(callback) {
    this._callback = callback;
    this._rafId = 0;
    this._running = false;
    this._onVisibilityChange = () => {
      if (document.hidden) {
        this._cancelFrame();
      } else if (this._running) {
        this._requestFrame();
      }
    };
  }

  /**
   * Begin the RAF loop.
   */
  start() {
    if (this._running) return;
    this._running = true;
    document.addEventListener('visibilitychange', this._onVisibilityChange);
    this._requestFrame();
  }

  /**
   * Cancel the RAF loop.
   */
  stop() {
    this._running = false;
    this._cancelFrame();
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
  }

  /**
   * Whether the loop is currently running.
   * @returns {boolean}
   */
  get running() {
    return this._running;
  }

  /** @internal */
  _requestFrame() {
    this._cancelFrame();
    this._rafId = requestAnimationFrame((ts) => {
      if (!this._running) return;
      try {
        this._callback(ts);
      } catch (error) {
        // A throwing callback used to skip the re-arm below, leaving the loop
        // dead while _running stayed true: `running` lied, start() was a
        // no-op, and a tab hide/show cycle silently resurrected it.
        console.error('[RAFLoop] frame callback failed', error);
      }
      // Re-check: the callback may have called stop(), and re-arming then
      // would schedule one extra dead frame.
      if (this._running) this._requestFrame();
    });
  }

  /** @internal */
  _cancelFrame() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
  }
}
