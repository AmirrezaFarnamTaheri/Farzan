/**
 * EventEmitter — Map-based event emitter with wildcard support.
 * Based on wolf-table event.ts with bug fixes and wildcard '*' support.
 */
export class EventEmitter {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /**
   * Register a listener for an event. Use '*' to receive all events.
   * @param {string} event
   * @param {Function} handler
   * @returns {this}
   */
  on(event, handler) {
    if (typeof handler !== 'function') return this;
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(handler);
    return this;
  }

  /**
   * Remove a specific listener for an event, or all listeners for an event if no handler given.
   * @param {string} event
   * @param {Function} [handler]
   * @returns {this}
   */
  off(event, handler) {
    const set = this._listeners.get(event);
    if (set) {
      if (handler) {
        set.delete(handler);
        if (set.size === 0) this._listeners.delete(event);
      } else {
        this._listeners.delete(event);
      }
    }
    return this;
  }

  /**
   * Emit an event, calling all listeners for that event and wildcard '*' listeners.
   * @param {string} event
   * @param  {...any} args
   * @returns {this}
   */
  emit(event, ...args) {
    const set = this._listeners.get(event);
    if (set) {
      for (const handler of set) {
        try { handler(...args); } catch (e) { console.error('[EventEmitter]', event, e); }
      }
    }
    if (event !== '*') {
      const wildcardSet = this._listeners.get('*');
      if (wildcardSet) {
        const payload = { type: event, args };
        for (const handler of wildcardSet) {
          try { handler(payload); } catch (e) { console.error('[EventEmitter] *', e); }
        }
      }
    }
    return this;
  }

  /**
   * Register a one-time listener that auto-removes after first fire.
   * @param {string} event
   * @param {Function} handler
   * @returns {this}
   */
  once(event, handler) {
    if (typeof handler !== 'function') return this;
    const wrapper = (...args) => {
      this.off(event, wrapper);
      handler(...args);
    };
    return this.on(event, wrapper);
  }

  /**
   * Count listeners for a given event (or total across all events if no event specified).
   * @param {string} [event]
   * @returns {number}
   */
  listenerCount(event) {
    if (event != null) {
      return this._listeners.get(event)?.size ?? 0;
    }
    let count = 0;
    for (const set of this._listeners.values()) count += set.size;
    return count;
  }

  /**
   * List all registered event names.
   * @returns {string[]}
   */
  eventNames() {
    return [...this._listeners.keys()];
  }

  /**
   * Remove all listeners.
   */
  clear() {
    this._listeners.clear();
  }
}
