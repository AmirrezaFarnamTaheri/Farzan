/**
 * Fluent compatibility adapter over the WHATWG EventTarget standard.
 *
 * Named events are dispatched by EventTarget only, so a listener registered
 * with on() can receive either emit() or dispatchEvent(). Legacy multi-arg
 * callbacks receive the values spread from CustomEvent.detail.
 *
 * Wildcard '*' is a legacy emitter-only convention and is not delivered by
 * the browser for other event names; it remains intentionally separate.
 */
// Node's EventTarget refuses a CustomEvent from jsdom's Window realm.
// Browser smoke tests construct the app under jsdom in Node, so the target
// and its events must originate from the same window when one exists.
const eventRealm = globalThis.window?.EventTarget && globalThis.window?.CustomEvent
  ? globalThis.window : globalThis;
const NativeEventTarget = eventRealm.EventTarget;
const NativeCustomEvent = eventRealm.CustomEvent;

export class EventEmitter extends NativeEventTarget {
  constructor() {
    super();
    /** @type {Map<string, Set<{handler: Function, listener: Function, kind: string}>>} */
    this._listeners = new Map();
  }

  _removeRecord(event, record) {
    const records = this._listeners.get(event);
    if (!records || !records.has(record)) return;
    records.delete(record);
    if (event !== '*') this.removeEventListener(event, record.listener);
    if (!records.size) this._listeners.delete(event);
  }

  _register(event, handler, once = false) {
    if (typeof handler !== 'function') return this;
    let records = this._listeners.get(event);
    if (!records) {
      records = new Set();
      this._listeners.set(event, records);
    }
    // on() has Set-like semantics: the same callback is registered once.
    // once() historically creates a distinct disposable wrapper each time.
    if (!once && [...records].some(record => record.kind === 'on' && record.handler === handler)) {
      return this;
    }

    const record = { handler, listener: null, kind: once ? 'once' : 'on' };
    if (event === '*') {
      record.listener = (...args) => {
        if (once) this._removeRecord(event, record);
        try { handler(...args); }
        catch (error) { console.error('[EventEmitter] *', error); }
      };
    } else {
      record.listener = (nativeEvent) => {
        if (once) this._removeRecord(event, record);
        const detail = nativeEvent?.detail;
        const args = Array.isArray(detail) ? detail : detail === undefined ? [] : [detail];
        try { handler(...args); }
        catch (error) { console.error('[EventEmitter]', event, error); }
      };
    }

    records.add(record);
    if (event !== '*') this.addEventListener(event, record.listener);
    return this;
  }

  /** @returns {this} */
  on(event, handler) {
    return this._register(event, handler);
  }

  /**
   * Remove one original listener (including all of its once registrations),
   * or all fluent listeners for the event. Native listeners registered
   * directly with addEventListener() remain owned by their callers.
   * @returns {this}
   */
  off(event, handler) {
    const records = this._listeners.get(event);
    if (!records) return this;
    for (const record of [...records]) {
      if (handler && record.handler !== handler && record.listener !== handler) continue;
      this._removeRecord(event, record);
    }
    return this;
  }

  /**
   * Emit a standard CustomEvent, then notify the legacy wildcard listeners.
   * Native EventTarget and fluent listeners now share one dispatch path.
   * @returns {this}
   */
  emit(event, ...args) {
    this.dispatchEvent(new NativeCustomEvent(event, { detail: args }));
    if (event !== '*') {
      const records = this._listeners.get('*');
      if (records) {
        const payload = { type: event, args };
        for (const record of [...records]) {
          // Reentrancy: an earlier handler may have removed the next record.
          if (records.has(record)) record.listener(payload);
        }
      }
    } else {
      const records = this._listeners.get('*');
      if (records) {
        for (const record of [...records]) {
          if (records.has(record)) record.listener(...args);
        }
      }
    }
    return this;
  }

  /** Register a callback for only the next native or fluent event. */
  once(event, handler) {
    return this._register(event, handler, true);
  }

  /** Count fluent listeners; native listeners are tracked by EventTarget. */
  listenerCount(event) {
    if (event != null) return this._listeners.get(event)?.size ?? 0;
    let count = 0;
    for (const records of this._listeners.values()) count += records.size;
    return count;
  }

  eventNames() {
    return [...this._listeners.keys()];
  }

  /** Detach all fluent listeners without disturbing external native ones. */
  clear() {
    for (const event of [...this._listeners.keys()]) this.off(event);
  }
}
