

// ============================================================
// PlasmaDeck — data.js
// Data Layer: Fetch, Transform, Cache, Reactive Store
// ============================================================

(() => {
  'use strict';

  // ══════════════════════════════════════════════════════════
  // 1. REQUEST CACHE
  // ══════════════════════════════════════════════════════════
  class RequestCache {
    constructor(ttl = 60_000) {
      this._store = new Map();
      this._ttl   = ttl;
    }

    set(key, value, ttl = this._ttl) {
      this._store.set(key, { value, ts: Date.now(), ttl });
    }

    /**
     * Return cached entry (even if stale), plus freshness info.
     * @param {string} key
     * @returns {{value:any, stale:boolean, ageMs:number, ttlMs:number}|null}
     */
    peek(key) {
      const entry = this._store.get(key);
      if (!entry) return null;
      const ttlMs = entry.ttl ?? this._ttl;
      const ageMs = Date.now() - entry.ts;
      return { value: entry.value, stale: ageMs > ttlMs, ageMs, ttlMs };
    }

    get(key) {
      const entry = this._store.get(key);
      if (!entry) return undefined;
      const ttl = entry.ttl ?? this._ttl;
      if (Date.now() - entry.ts > ttl) {
        this._store.delete(key);
        return undefined;
      }
      return entry.value;
    }

    has(key) { return this.get(key) !== undefined; }
    invalidate(key) { this._store.delete(key); }
    invalidateAll() { this._store.clear(); }

    invalidatePattern(pattern) {
      for (const key of this._store.keys()) {
        if (key.includes(pattern)) this._store.delete(key);
      }
    }
  }


  // ══════════════════════════════════════════════════════════
  // 2. HTTP CLIENT
  // ══════════════════════════════════════════════════════════
  class HttpClient {
    constructor(options = {}) {
      this._base    = options.baseURL    ?? '';
      this._headers = options.headers    ?? {};
      this._timeout = options.timeout    ?? 30_000;
      this._cache   = new RequestCache(options.cacheTTL ?? 60_000);
      this._interceptors = {
        request:  [],
        response: [],
        error:    [],
      };
      this._pendingRequests = new Map();   // For deduplication
    }

    // ── Interceptors ─────────────────────────────────────
    useRequest(fn)  { this._interceptors.request.push(fn);  return this; }
    useResponse(fn) { this._interceptors.response.push(fn); return this; }
    useError(fn)    { this._interceptors.error.push(fn);    return this; }

    // ── Core request ─────────────────────────────────────
    async request(method, url, { body, params, headers = {},
                                  cache = false, cacheTTL,
                                  signal, retries = 0,
                                  retryDelay = 500 } = {}) {
      let fullURL = url.startsWith('http') ? url : `${this._base}${url}`;
      if (params) {
        const qs = new URLSearchParams(
          Object.entries(params).filter(([, v]) => v != null)
        ).toString();
        if (qs) fullURL += `?${qs}`;
      }

      // Cache key (GET ignores body)
      const cacheKey = method === 'GET'
        ? `${method}:${fullURL}`
        : `${method}:${fullURL}:${JSON.stringify(body ?? '')}`;

      // Cache hit for GET
      // - cache=true: only fresh entries are returned
      // - cache='swr': stale-while-revalidate (return cached immediately, refresh in background)
      const isSWR = cache === 'swr';
      if ((cache || isSWR) && method === 'GET') {
        const hit = isSWR ? this._cache.peek(cacheKey) : null;
        if (!isSWR && this._cache.has(cacheKey)) return this._cache.get(cacheKey);
        if (isSWR && hit?.value !== undefined) {
          // If stale, revalidate in background (deduped by _pendingRequests)
          if (hit.stale && !this._pendingRequests.has(cacheKey)) {
            const bg = (async () => {
              try {
                const fresh = await this.request('GET', url, {
                  params,
                  headers,
                  cache: false,
                  cacheTTL,
                  signal,
                  retries,
                  retryDelay,
                });
                // refresh cache with new ts
                this._cache.set(cacheKey, fresh, cacheTTL);
                window.PlasmaDeck?.bus?.emit?.('data:cacheUpdate', { url: fullURL, key: cacheKey });
              } catch {
                // ignore background refresh errors
              }
            })();
            this._pendingRequests.set(cacheKey, bg);
            bg.finally(() => this._pendingRequests.delete(cacheKey));
          }
          return hit.value;
        }
      }

      // Deduplication for simultaneous identical requests
      if (method === 'GET' && this._pendingRequests.has(cacheKey)) {
        return this._pendingRequests.get(cacheKey);
      }

      // Build init
      let init = {
        method,
        headers: { 'Content-Type': 'application/json', ...this._headers, ...headers },
        signal,
      };
      if (body) init.body = typeof body === 'string' ? body : JSON.stringify(body);

      // Run request interceptors
      for (const fn of this._interceptors.request) {
        init = (await fn(init, fullURL)) ?? init;
      }

      // Timeout controller
      let timeoutId;
      const controller = new AbortController();
      if (!signal) {
        timeoutId = setTimeout(() => controller.abort(), this._timeout);
        init.signal = controller.signal;
      }

      const execute = async (attempt = 0) => {
        try {
          let response = await fetch(fullURL, init);
          clearTimeout(timeoutId);

          // Run response interceptors
          for (const fn of this._interceptors.response) {
            response = (await fn(response)) ?? response;
          }

          if (!response.ok) {
            const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
            error.status   = response.status;
            error.response = response;
            throw error;
          }

          const contentType = response.headers.get('content-type') ?? '';
          let data;
          if (contentType.includes('application/json')) {
            data = await response.json();
          } else if (contentType.includes('text/')) {
            data = await response.text();
          } else {
            data = await response.blob();
          }

          // Store in cache
          if (cache && method === 'GET') {
            this._cache.set(cacheKey, data, cacheTTL);
          }

          return data;

        } catch (err) {
          // Retry logic
          if (attempt < retries && !err.message?.includes('aborted')) {
            await new Promise(r => setTimeout(r, retryDelay * (attempt + 1)));
            return execute(attempt + 1);
          }

          clearTimeout(timeoutId);
          for (const fn of this._interceptors.error) await fn(err);
          throw err;
        }
      };

      const promise = execute();
      if (method === 'GET') this._pendingRequests.set(cacheKey, promise);

      try {
        const result = await promise;
        return result;
      } finally {
        this._pendingRequests.delete(cacheKey);
      }
    }

    // ── Convenience methods ───────────────────────────────
    get(url,  opts = {}) { return this.request('GET',    url, opts); }
    post(url, opts = {}) { return this.request('POST',   url, opts); }
    put(url,  opts = {}) { return this.request('PUT',    url, opts); }
    patch(url,opts = {}) { return this.request('PATCH',  url, opts); }
    delete(url,opts= {}) { return this.request('DELETE', url, opts); }

    /** Upload file(s) with progress */
    async upload(url, files, { onProgress, fieldName = 'file', ...opts } = {}) {
      const form = new FormData();
      const arr  = Array.isArray(files) ? files : [files];
      arr.forEach((f, i) => form.append(arr.length > 1 ? `${fieldName}[${i}]` : fieldName, f));

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url.startsWith('http') ? url : `${this._base}${url}`);

        // Apply default headers (except Content-Type – browser sets boundary)
        Object.entries({ ...this._headers, ...(opts.headers ?? {}) }).forEach(([k, v]) => {
          if (k.toLowerCase() !== 'content-type') xhr.setRequestHeader(k, v);
        });

        if (onProgress) {
          xhr.upload.addEventListener('progress', e => {
            if (e.lengthComputable) onProgress(e.loaded / e.total, e.loaded, e.total);
          });
        }

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)); }
            catch { resolve(xhr.responseText); }
          } else {
            reject(new Error(`Upload failed: HTTP ${xhr.status}`));
          }
        });
        xhr.addEventListener('error', () => reject(new Error('Upload network error')));
        xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));
        xhr.send(form);
      });
    }

    /** Invalidate cache externally */
    clearCache(pattern) {
      pattern ? this._cache.invalidatePattern(pattern) : this._cache.invalidateAll();
    }
  }


  // ══════════════════════════════════════════════════════════
  // 3. REACTIVE STORE (observable state)
  // ══════════════════════════════════════════════════════════
  class Store {
    /**
     * @param {Object}   initialState
     * @param {Object}   [mutations]   – named functions that modify state
     * @param {Object}   [actions]     – async functions (can call commit)
     * @param {Function} [persist]     – 'local' | 'session' | null
     */
    constructor({ state = {}, mutations = {}, actions = {}, persist = null, storageKey = 'pd-store' } = {}) {
      this._mutations = mutations;
      this._actions   = actions;
      this._listeners = new Map();
      this._history   = [];
      this._maxHistory = 50;
      this._storageKey = storageKey;

      // Restore persisted state
      let restored = {};
      if (persist) {
        try {
          const storage = persist === 'local' ? localStorage : sessionStorage;
          const raw     = storage.getItem(storageKey);
          if (raw) restored = JSON.parse(raw);
        } catch { /* ignore */ }
      }

      // Create reactive Proxy
      this.state = this._reactive({ ...state, ...restored }, persist);
    }

    _reactive(obj, persist) {
      const self = this;
      return new Proxy(obj, {
        set(target, key, value) {
          const oldVal = target[key];
          target[key]  = value;

          // Notify key-specific listeners
          if (self._listeners.has(key)) {
            self._listeners.get(key).forEach(fn => fn(value, oldVal, key));
          }
          // Notify wildcard listeners
          if (self._listeners.has('*')) {
            self._listeners.get('*').forEach(fn => fn({ [key]: value }, { [key]: oldVal }, key));
          }

          // Persist
          if (persist) {
            try {
              const storage = persist === 'local' ? localStorage : sessionStorage;
              storage.setItem(self._storageKey, JSON.stringify(target));
            } catch { /* quota */ }
          }

          return true;
        },
      });
    }

    /** Subscribe to state changes */
    watch(key, fn) {
      if (!this._listeners.has(key)) this._listeners.set(key, new Set());
      this._listeners.get(key).add(fn);
      return () => this._listeners.get(key).delete(fn);   // unsubscribe fn
    }

    /** Apply a named mutation */
    commit(mutation, payload) {
      const fn = this._mutations[mutation];
      if (!fn) throw new Error(`[Store] Unknown mutation: "${mutation}"`);

      // Record history snapshot
      this._history.push({ mutation, payload, snapshot: { ...this.state } });
      if (this._history.length > this._maxHistory) this._history.shift();

      fn(this.state, payload);
    }

    /** Dispatch a named action (async) */
    async dispatch(action, payload) {
      const fn = this._actions[action];
      if (!fn) throw new Error(`[Store] Unknown action: "${action}"`);
      return fn(
        { state: this.state, commit: this.commit.bind(this), dispatch: this.dispatch.bind(this) },
        payload
      );
    }

    /** Undo last mutation */
    undo() {
      if (!this._history.length) return;
      const { snapshot } = this._history.pop();
      Object.assign(this.state, snapshot);
    }

    /** Reset to a partial or full state */
    reset(partial = null) {
      const target = partial ?? {};
      Object.keys(this.state).forEach(k => {
        if (k in target) this.state[k] = target[k];
      });
    }

    /** Get a snapshot copy */
    snapshot() { return { ...this.state }; }
  }


  // ══════════════════════════════════════════════════════════
  // 4. COLLECTION (array store with sorting/filtering)
  // ══════════════════════════════════════════════════════════
  class Collection {
    constructor(items = [], { idKey = 'id' } = {}) {
      this._idKey     = idKey;
      this._raw       = [];
      this._filters   = {};
      this._sortKey   = null;
      this._sortDir   = 'asc';
      this._listeners = new Set();
      this.load(items);
    }

    // ── Mutation ────────────────────────────────────────
    load(items) {
      this._raw = items.map(i => ({ ...i }));
      this._notify('load');
      return this;
    }

    add(item) {
      this._raw.push({ ...item, [this._idKey]: item[this._idKey] ?? this._uid() });
      this._notify('add', item);
      return this;
    }

    update(id, patch) {
      const idx = this._raw.findIndex(i => i[this._idKey] === id);
      if (idx === -1) return this;
      this._raw[idx] = { ...this._raw[idx], ...patch };
      this._notify('update', this._raw[idx]);
      return this;
    }

    remove(id) {
      const idx = this._raw.findIndex(i => i[this._idKey] === id);
      if (idx === -1) return this;
      const removed = this._raw.splice(idx, 1)[0];
      this._notify('remove', removed);
      return this;
    }

    clear() {
      this._raw = [];
      this._notify('clear');
      return this;
    }

    // ── Query ────────────────────────────────────────────
    filter(key, fn) {
      if (fn === null) { delete this._filters[key]; }
      else             { this._filters[key] = fn; }
      return this;
    }

    sort(key, dir = 'asc') {
      this._sortKey = key;
      this._sortDir = dir;
      return this;
    }

    search(query, keys = []) {
      const q = query.toLowerCase();
      return this.filter('_search', item =>
        keys.some(k => String(item[k] ?? '').toLowerCase().includes(q))
      );
    }

    clearSearch() { return this.filter('_search', null); }

    /** Get processed array */
    get items() {
      let result = [...this._raw];

      // Apply filters
      for (const fn of Object.values(this._filters)) {
        result = result.filter(fn);
      }

      // Sort
      if (this._sortKey) {
        const key = this._sortKey;
        const dir = this._sortDir === 'asc' ? 1 : -1;
        result.sort((a, b) => {
          const av = a[key], bv = b[key];
          if (av == null) return 1;
          if (bv == null) return -1;
          if (typeof av === 'string') return av.localeCompare(bv) * dir;
          return (av > bv ? 1 : av < bv ? -1 : 0) * dir;
        });
      }

      return result;
    }

    get count() { return this.items.length; }
    get total() { return this._raw.length; }

    findById(id) { return this._raw.find(i => i[this._idKey] === id) ?? null; }

    /** Pagination */
    paginate(page = 1, perPage = 20) {
      const all   = this.items;
      const start = (page - 1) * perPage;
      return {
        items:       all.slice(start, start + perPage),
        page,
        perPage,
        total:       all.length,
        totalPages:  Math.ceil(all.length / perPage),
        hasNext:     start + perPage < all.length,
        hasPrev:     page > 1,
      };
    }

    // ── Reactivity ───────────────────────────────────────
    onChange(fn) {
      this._listeners.add(fn);
      return () => this._listeners.delete(fn);
    }

    _notify(event, data) {
      this._listeners.forEach(fn => fn({ event, data, items: this.items }));
    }

    _uid() { return `item-${Math.random().toString(36).slice(2, 9)}`; }
  }


  // ══════════════════════════════════════════════════════════
  // 5. DATA PIPELINE (transform chains)
  // ══════════════════════════════════════════════════════════
  class Pipeline {
    constructor() { this._steps = []; }

    pipe(fn) { this._steps.push(fn); return this; }

    map(fn)     { return this.pipe(data => (Array.isArray(data) ? data.map(fn) : fn(data))); }
    filter(fn)  { return this.pipe(data => Array.isArray(data) ? data.filter(fn) : data); }
    sort(fn)    { return this.pipe(data => Array.isArray(data) ? [...data].sort(fn) : data); }
    limit(n)    { return this.pipe(data => Array.isArray(data) ? data.slice(0, n) : data); }
    skip(n)     { return this.pipe(data => Array.isArray(data) ? data.slice(n) : data); }
    pluck(key)  { return this.map(item => item[key]); }
    unique(key) { return this.pipe(data => {
      if (!Array.isArray(data)) return data;
      const seen = new Set();
      return data.filter(item => {
        const v = key ? item[key] : item;
        if (seen.has(v)) return false;
        seen.add(v); return true;
      });
    }); }

    /** Normalize flat array → keyed by property */
    normalize(key = 'id') {
      return this.pipe(data => {
        if (!Array.isArray(data)) return data;
        return data.reduce((acc, item) => {
          acc[item[key]] = item;
          return acc;
        }, {});
      });
    }

    /** Group array by property */
    groupBy(key) {
      return this.pipe(data => {
        if (!Array.isArray(data)) return data;
        return data.reduce((acc, item) => {
          const k = item[key];
          (acc[k] = acc[k] ?? []).push(item);
          return acc;
        }, {});
      });
    }

    /** Flatten one level */
    flatten() {
      return this.pipe(data => Array.isArray(data) ? data.flat() : data);
    }

    /** Async step support */
    async execute(data) {
      let result = data;
      for (const step of this._steps) {
        result = await step(result);
      }
      return result;
    }

    run(data) { return this.execute(data); }
  }


  // ══════════════════════════════════════════════════════════
  // 6. REAL-TIME (WebSocket + SSE wrapper)
  // ══════════════════════════════════════════════════════════
  class RealtimeClient {
    constructor({ url, protocol = 'ws', reconnect = true,
                  reconnectDelay = 2000, maxReconnects = 10 } = {}) {
      this._url             = url;
      this._protocol        = protocol;   // 'ws' | 'sse'
      this._reconnect       = reconnect;
      this._reconnectDelay  = reconnectDelay;
      this._maxReconnects   = maxReconnects;
      this._reconnectCount  = 0;
      this._listeners       = new Map();
      this._subscriptions   = new Set();
      this._ws              = null;
      this._sse             = null;
      this._connected       = false;
      this._queue           = [];         // messages queued while disconnected
    }

    connect() {
      if (this._protocol === 'sse') return this._connectSSE();
      return this._connectWS();
    }

    _connectWS() {
      try {
        this._ws = new WebSocket(this._url);

        this._ws.addEventListener('open', () => {
          this._connected      = true;
          this._reconnectCount = 0;
          this._emit('connect');

          // Flush queued messages
          this._queue.forEach(msg => this.send(msg));
          this._queue = [];

          // Re-subscribe
          this._subscriptions.forEach(channel => {
            this.send({ type: 'subscribe', channel });
          });
        });

        this._ws.addEventListener('message', e => {
          try {
            const data = JSON.parse(e.data);
            this._emit(data.type ?? 'message', data);
            this._emit('*', data);
          } catch {
            this._emit('message', e.data);
          }
        });

        this._ws.addEventListener('close', ev => {
          this._connected = false;
          this._emit('disconnect', {
            code: ev?.code,
            reason: ev?.reason,
            wasClean: ev?.wasClean,
          });
          this._attemptReconnect();
        });

        this._ws.addEventListener('error', err => {
          this._emit('error', err);
        });
      } catch (e) {
        this._emit('error', e);
        this._attemptReconnect();
      }
    }

    _connectSSE() {
      this._sse = new EventSource(this._url);

      this._sse.addEventListener('open', () => {
        this._connected = true;
        this._reconnectCount = 0;
        this._emit('connect');
      });

      this._sse.addEventListener('message', e => {
        try {
          const data = JSON.parse(e.data);
          this._emit(data.type ?? 'message', data);
          this._emit('*', data);
        } catch {
          this._emit('message', e.data);
        }
      });

      this._sse.addEventListener('error', () => {
        this._connected = false;
        this._emit('disconnect');
        if (this._reconnect) this._attemptReconnect();
      });
    }

    _attemptReconnect() {
      if (!this._reconnect) return;
      if (this._reconnectCount >= this._maxReconnects) {
        this._emit('reconnectFailed');
        return;
      }
      this._reconnectCount++;
      const delay = this._reconnectDelay * this._reconnectCount;
      this._emit('reconnecting', { attempt: this._reconnectCount, delay });
      setTimeout(() => this.connect(), delay);
    }

    send(data) {
      if (!this._connected || !this._ws) {
        this._queue.push(data);
        return;
      }
      this._ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    }

    subscribe(channel) {
      this._subscriptions.add(channel);
      if (this._connected) this.send({ type: 'subscribe', channel });
      return () => this.unsubscribe(channel);
    }

    unsubscribe(channel) {
      this._subscriptions.delete(channel);
      if (this._connected) this.send({ type: 'unsubscribe', channel });
    }

    on(event, fn) {
      if (!this._listeners.has(event)) this._listeners.set(event, new Set());
      this._listeners.get(event).add(fn);
      return () => this._listeners.get(event).delete(fn);
    }

    _emit(event, data) {
      this._listeners.get(event)?.forEach(fn => fn(data));
    }

    disconnect() {
      this._reconnect = false;
      this._ws?.close();
      this._sse?.close();
      this._connected = false;
    }
  }


  // ══════════════════════════════════════════════════════════
  // 7. DATA BINDING (DOM ↔ store)
  // ══════════════════════════════════════════════════════════
  const DataBind = {
    _bindings: new Map(),

    /**
     * Bind store key to DOM element(s)
     * @param {Store}           store
     * @param {string}          key        store key
     * @param {string|Element}  selector
     * @param {string}          [attr]     e.g. 'textContent' | 'value' | 'innerHTML'
     * @param {Function}        [transform]
     */
    bind(store, key, selector, attr = 'textContent', transform = null) {
      const elements = typeof selector === 'string'
        ? [...document.querySelectorAll(selector)]
        : [selector];

      const update = (val) => {
        const display = transform ? transform(val) : val;
        elements.forEach(el => {
          if (!el) return;
          if (attr === 'class') {
            el.className = display;
          } else if (attr === 'style') {
            Object.assign(el.style, display);
          } else if (attr in el) {
            el[attr] = display;
          } else {
            el.setAttribute(attr, display);
          }
        });
      };

      // Apply immediately
      update(store.state[key]);

      // Watch for changes
      const unsub = store.watch(key, update);
      const id    = `${key}:${selector}:${attr}`;
      this._bindings.set(id, unsub);
      return () => { unsub(); this._bindings.delete(id); };
    },

    /**
     * Two-way bind an input to a store key
     */
    bindInput(store, key, selector) {
      const el = typeof selector === 'string'
        ? document.querySelector(selector)
        : selector;
      if (!el) return () => {};

      // Store → DOM
      const unsub = store.watch(key, val => {
        if (document.activeElement !== el) el.value = val ?? '';
      });

      // DOM → Store
      const onInput = () => { store.state[key] = el.value; };
      el.addEventListener('input', onInput);

      // Set initial
      el.value = store.state[key] ?? '';

      return () => {
        unsub();
        el.removeEventListener('input', onInput);
      };
    },
  };


  // ══════════════════════════════════════════════════════════
  // 8. QUERY BUILDER (for REST APIs)
  // ══════════════════════════════════════════════════════════
  class QueryBuilder {
    constructor(client, resource) {
      this._client   = client;
      this._resource = resource;
      this._params   = {};
      this._headers  = {};
    }

    where(key, value)        { this._params[key]     = value;  return this; }
    page(n)                  { this._params.page      = n;     return this; }
    perPage(n)               { this._params.per_page  = n;     return this; }
    limit(n)                 { this._params.limit     = n;     return this; }
    offset(n)                { this._params.offset    = n;     return this; }
    orderBy(field, dir='asc'){ this._params.sort = `${dir === 'desc' ? '-' : ''}${field}`; return this; }
    include(relations)       { this._params.include   = Array.isArray(relations) ? relations.join(',') : relations; return this; }
    fields(...f)             { this._params.fields    = f.join(','); return this; }
    search(q)                { this._params.q         = q;     return this; }
    withHeader(k, v)         { this._headers[k]       = v;     return this; }
    cache(ttl)               { this._cacheTTL         = ttl;   return this; }
    swr(ttl)                 { this._swrTTL           = ttl;   return this; }

    async get() {
      const cacheTTL = this._swrTTL ?? this._cacheTTL;
      const cache = this._swrTTL ? 'swr' : (!!this._cacheTTL);
      return this._client.get(this._resource, {
        params: this._params,
        headers: this._headers,
        cache,
        cacheTTL,
      });
    }
    async find(id)       { return this._client.get(`${this._resource}/${id}`, { params: this._params, headers: this._headers }); }
    async create(data)   { return this._client.post(this._resource,           { body: data, headers: this._headers }); }
    async update(id, d)  { return this._client.put(`${this._resource}/${id}`, { body: d, headers: this._headers }); }
    async patch(id, d)   { return this._client.patch(`${this._resource}/${id}`,{ body: d, headers: this._headers }); }
    async remove(id)     { return this._client.delete(`${this._resource}/${id}`,{ headers: this._headers }); }
  }


  // ══════════════════════════════════════════════════════════
  // EXPORT
  // ══════════════════════════════════════════════════════════
  window.PlasmaDeck      = window.PlasmaDeck ?? {};
  window.PlasmaDeck.Data = {
    HttpClient,
    Store,
    Collection,
    Pipeline,
    RealtimeClient,
    DataBind,
    QueryBuilder,
    RequestCache,

    /** Default shared HTTP client */
    http: new HttpClient({ baseURL: '', cacheTTL: 30_000 }),

    /** Quick factory helpers */
    createStore:      (opts) => new Store(opts),
    createCollection: (items, opts) => new Collection(items, opts),
    createPipeline:   ()     => new Pipeline(),
    createQuery:      (resource, client) =>
      new QueryBuilder(client ?? window.PlasmaDeck.Data.http, resource),
  };

})();