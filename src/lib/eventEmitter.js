/**
 * Fluent named-event facade over the WHATWG EventTarget standard.
 * Both emit() and native dispatchEvent() use the same event pipeline.
 * Named listeners receive CustomEvent.detail values as callback arguments.
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
    this.removeEventListener(event, record.listener);
    if (!records.size) this._listeners.delete(event);
  }

  _register(event, handler, once = false) {
    if (event === '*') throw new TypeError('Wildcard event subscriptions are unsupported');
    if (typeof handler !== 'function') return this;
    let records = this._listeners.get(event);
    if (!records) {
      records = new Set();
      this._listeners.set(event, records);
    }
    // on() has Set-like semantics: the same callback is registered once.
    // once() creates a distinct disposable wrapper each time.
    if (!once && [...records].some(record => record.kind === 'on' && record.handler === handler)) {
      return this;
    }

    const record = { handler, listener: null, kind: once ? 'once' : 'on' };
    record.listener = nativeEvent => {
      if (once) this._removeRecord(event, record);
      const detail = nativeEvent?.detail;
      const args = Array.isArray(detail) ? detail : detail === undefined ? [] : [detail];
      try { handler(...args); }
      catch (error) { console.error('[EventEmitter]', event, error); }
    };
    records.add(record);
    this.addEventListener(event, record.listener);
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

  /** Emit one named native CustomEvent with arguments in detail. */
  emit(event, ...args) {
    this.dispatchEvent(new NativeCustomEvent(event, { detail: args }));
    return this;
  }

  /** Register a callback for only the next native or fluent event. */
  once(event, handler) {
    return this._register(event, handler, true);
  }


}
