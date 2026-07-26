/**
 * RequestQueue — deferred callback queue with keyed dedup from Vidstack.
 * Duplicate keys auto-deduped (last write wins).
 */
export class RequestQueue {
  constructor() {
    /** @type {Map<string, Function>} */
    this._queue = new Map();
    this._started = false;
  }

  /**
   * Serve a request. If started, run immediately; else queue.
   * @param {string} key
   * @param {Function} callback
   */
  serve(key, callback) {
    if (this._started) {
      callback();
    } else {
      this._queue.set(key, callback);
    }
  }

  /**
   * Start the queue — flush all queued items.
   */
  start() {
    this._started = true;
    // Snapshot before flushing: iterating the live Map meant a callback that
    // called reset() cleared it mid-iteration, silently dropping every
    // remaining queued callback without an error.
    const entries = [...this._queue];
    this._queue.clear();
    for (const [key, callback] of entries) {
      try { callback(); } catch (e) { console.error('[RequestQueue]', key, e); }
    }
  }

  /**
   * Stop serving (items will be queued).
   */
  stop() {
    this._started = false;
  }

  /**
   * Clear queue and stop.
   */
  reset() {
    this._queue.clear();
    this._started = false;
  }

  /**
   * Check if a key is queued.
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this._queue.has(key);
  }

  /**
   * Number of queued items.
   * @returns {number}
   */
  get size() {
    return this._queue.size;
  }
}
