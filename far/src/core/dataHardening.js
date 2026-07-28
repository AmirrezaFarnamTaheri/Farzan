import { createOperationContext } from './operationContext.js';

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

function stableHeaders(headers = {}) {
  const entries = headers instanceof Headers
    ? [...headers.entries()]
    : Array.isArray(headers)
      ? headers
      : Object.entries(headers || {});
  return entries
    .map(([key, value]) => [String(key).toLowerCase(), String(value)])
    .sort(([a], [b]) => a.localeCompare(b));
}

function hasHeader(headers, name) {
  const target = String(name).toLowerCase();
  return stableHeaders(headers).some(([key]) => key === target);
}

function mergeHeaders(...sources) {
  const merged = new Headers();
  for (const source of sources) {
    for (const [key, value] of stableHeaders(source)) merged.set(key, value);
  }
  return merged;
}

function combineSignals(signals) {
  const active = signals.filter(Boolean);
  if (!active.length) return null;
  if (typeof AbortSignal?.any === 'function') return AbortSignal.any(active);
  const controller = new AbortController();
  const cleanups = [];
  const abort = (signal) => {
    controller.abort(signal?.reason);
    cleanups.splice(0).forEach(cleanup => cleanup());
  };
  for (const signal of active) {
    if (signal.aborted) {
      abort(signal);
      break;
    }
    const listener = () => abort(signal);
    signal.addEventListener('abort', listener, { once: true });
    cleanups.push(() => signal.removeEventListener('abort', listener));
  }
  return controller.signal;
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      fn(value);
    };
    const timer = setTimeout(() => finish(resolve), ms);
    const onAbort = () => finish(reject, signal?.reason || new DOMException('Aborted', 'AbortError'));
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function installDataHardening(root = window) {
  const data = root.OpenCourseDeck?.Data;
  if (!data || data.__hardened) return data;

  const LegacyHttpClient = data.HttpClient;
  const LegacyRealtimeClient = data.RealtimeClient;

  class HardenedHttpClient extends LegacyHttpClient {
    async request(method, url, options = {}) {
      const requestedMethod = String(method || 'GET').toUpperCase();
      const {
        body,
        params,
        headers = {},
        cache = false,
        cacheTTL,
        signal,
        retries = 0,
        retryDelay = 500,
        timeout = this._timeout,
      } = options;

      let fullURL = url.startsWith('http') ? url : `${this._base}${url}`;
      if (params) {
        const parsed = new URL(fullURL, root.location?.href || 'http://localhost/');
        for (const [key, value] of Object.entries(params)) {
          if (value != null) parsed.searchParams.set(key, String(value));
        }
        fullURL = /^https?:/i.test(fullURL) ? parsed.href : `${parsed.pathname}${parsed.search}${parsed.hash}`;
      }

      let init = {
        method: requestedMethod,
        headers: mergeHeaders({ 'Content-Type': 'application/json' }, this._headers, headers),
        signal,
      };
      if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);

      for (const interceptor of this._interceptors.request) {
        init = (await interceptor(init, fullURL)) ?? init;
      }

      const normalizedMethod = String(init.method || requestedMethod).toUpperCase();
      init.method = normalizedMethod;
      init.headers = mergeHeaders(init.headers);
      const representationHeaders = stableHeaders(init.headers);
      const authenticated = hasHeader(init.headers, 'authorization') || hasHeader(init.headers, 'proxy-authorization');
      const cacheKey = JSON.stringify([
        normalizedMethod,
        fullURL,
        init.credentials || 'same-origin',
        representationHeaders,
      ]);
      const allowCache = normalizedMethod === 'GET' && cache && !authenticated;
      const isSWR = cache === 'swr';

      if (allowCache) {
        if (!isSWR) {
          const cached = this._cache.get(cacheKey);
          if (cached !== undefined) return cached;
        } else {
          const hit = this._cache.peek(cacheKey);
          if (hit?.value !== undefined) {
            if (hit.stale && !this._pendingRequests.has(cacheKey)) {
              const refresh = (async () => {
                try {
                  const fresh = await this.request(normalizedMethod, url, { ...options, cache: false });
                  this._cache.set(cacheKey, fresh, cacheTTL);
                  root.OpenCourseDeck?.bus?.emit?.('data:cacheUpdate', { url: fullURL, key: cacheKey });
                  return fresh;
                } catch {
                  return hit.value;
                }
              })();
              this._pendingRequests.set(cacheKey, refresh);
              refresh.finally(() => {
                if (this._pendingRequests.get(cacheKey) === refresh) this._pendingRequests.delete(cacheKey);
              });
            }
            return hit.value;
          }
        }
      }

      if (normalizedMethod === 'GET' && this._pendingRequests.has(cacheKey)) {
        return this._pendingRequests.get(cacheKey);
      }

      const timeoutController = new AbortController();
      const timeoutId = Number(timeout) > 0
        ? setTimeout(() => timeoutController.abort(new DOMException(`Request timed out after ${timeout}ms`, 'TimeoutError')), Number(timeout))
        : null;
      init.signal = combineSignals([init.signal, signal, timeoutController.signal]);

      const execute = async (attempt = 0) => {
        try {
          let response = await fetch(fullURL, init);
          for (const interceptor of this._interceptors.response) response = (await interceptor(response)) ?? response;
          if (!response.ok) {
            const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
            error.status = response.status;
            error.response = response;
            throw error;
          }
          const contentType = response.headers.get('content-type') ?? '';
          const result = contentType.includes('application/json')
            ? await response.json()
            : contentType.includes('text/')
              ? await response.text()
              : await response.blob();
          if (allowCache) this._cache.set(cacheKey, result, cacheTTL);
          return result;
        } catch (error) {
          const canRetry = attempt < retries
            && IDEMPOTENT_METHODS.has(normalizedMethod)
            && error?.name !== 'AbortError'
            && error?.name !== 'TimeoutError'
            && (!error?.status || RETRYABLE_STATUS.has(error.status));
          if (canRetry) {
            const retryAfterRaw = error.response?.headers?.get?.('retry-after');
            const retryAfter = retryAfterRaw == null || retryAfterRaw === '' ? NaN : Number(retryAfterRaw);
            const delay = Number.isFinite(retryAfter) && retryAfter >= 0
              ? retryAfter * 1000
              : retryDelay * (2 ** attempt) + Math.floor(Math.random() * Math.max(1, retryDelay));
            await wait(delay, init.signal);
            return execute(attempt + 1);
          }
          for (const interceptor of this._interceptors.error) await interceptor(error);
          throw error;
        }
      };

      const promise = execute();
      if (normalizedMethod === 'GET') this._pendingRequests.set(cacheKey, promise);
      try {
        return await promise;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (this._pendingRequests.get(cacheKey) === promise) this._pendingRequests.delete(cacheKey);
      }
    }

    async upload(url, files, { onProgress, fieldName = 'file', headers = {}, signal, timeout = this._timeout } = {}) {
      const form = new FormData();
      const list = Array.isArray(files) ? files : [files];
      list.forEach((file, index) => form.append(list.length > 1 ? `${fieldName}[${index}]` : fieldName, file));
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let abortListener = null;
        const finish = (fn, value) => {
          if (abortListener) signal?.removeEventListener?.('abort', abortListener);
          fn(value);
        };
        xhr.open('POST', url.startsWith('http') ? url : `${this._base}${url}`);
        xhr.timeout = Number(timeout) > 0 ? Number(timeout) : 0;
        for (const [key, value] of stableHeaders(mergeHeaders(this._headers, headers))) {
          if (key !== 'content-type') xhr.setRequestHeader(key, value);
        }
        if (onProgress) xhr.upload.addEventListener('progress', event => {
          if (event.lengthComputable) onProgress(event.loaded / event.total, event.loaded, event.total);
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { finish(resolve, JSON.parse(xhr.responseText)); } catch { finish(resolve, xhr.responseText); }
          } else finish(reject, new Error(`Upload failed: HTTP ${xhr.status}`));
        });
        xhr.addEventListener('timeout', () => finish(reject, new Error('Upload timed out')));
        xhr.addEventListener('error', () => finish(reject, new Error('Upload network error')));
        xhr.addEventListener('abort', () => finish(reject, new DOMException('Upload aborted', 'AbortError')));
        if (signal) {
          abortListener = () => xhr.abort();
          if (signal.aborted) xhr.abort();
          else signal.addEventListener('abort', abortListener, { once: true });
        }
        xhr.send(form);
      });
    }
  }

  class HardenedRealtimeClient extends LegacyRealtimeClient {
    constructor(options = {}) {
      super(options);
      this._desiredReconnect = options.reconnect ?? true;
      this._reconnectTimer = null;
      this._generation = 0;
      this._connectionContext = null;
      this._maxQueueMessages = options.maxQueueMessages ?? 100;
      this._maxQueueBytes = options.maxQueueBytes ?? 256 * 1024;
      this._queuedBytes = 0;
    }

    _beginConnection(protocol) {
      this._connectionContext?.invalidate();
      this._connectionContext = createOperationContext({
        resource: this._url || null,
        generation: this._generation,
        revision: this._reconnectCount,
        authority: Object.freeze({ capability: 'realtime', protocol }),
      });
      return this._connectionContext;
    }

    connect() {
      this._reconnect = this._desiredReconnect;
      this._generation += 1;
      this._connectionContext?.invalidate();
      if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
      return super.connect();
    }

    _connectWS() {
      const context = this._beginConnection('ws');
      const generation = this._generation;
      this._closeExistingConnections();
      let socket;
      try {
        socket = new WebSocket(this._url);
        this._ws = socket;
      } catch (error) {
        if (context.isCurrent()) {
          this._emit('error', error);
          this._attemptReconnect();
        }
        return;
      }

      const owns = () => context.isCurrent()
        && generation === this._generation
        && this._ws === socket;

      socket.addEventListener('open', () => {
        if (!owns()) return;
        this._connected = true;
        this._reconnectCount = 0;
        this._queuedBytes = 0;
        this._emit('connect', { operationId: context.id, generation });
        const queued = this._queue;
        this._queue = [];
        queued.forEach(message => this.send(message));
        this._subscriptions.forEach(channel => this.send({ type: 'subscribe', channel }));
      });

      socket.addEventListener('message', event => {
        if (!owns()) return;
        try {
          const payload = JSON.parse(event.data);
          this._emit(payload.type ?? 'message', payload);
          this._emit('*', payload);
        } catch {
          this._emit('message', event.data);
        }
      });

      socket.addEventListener('close', event => {
        if (!owns()) return;
        this._connected = false;
        this._ws = null;
        this._emit('disconnect', {
          code: event?.code,
          reason: event?.reason,
          wasClean: event?.wasClean,
          operationId: context.id,
          generation,
        });
        this._attemptReconnect();
      });

      socket.addEventListener('error', error => {
        if (owns()) this._emit('error', error);
      });
    }

    _connectSSE() {
      const context = this._beginConnection('sse');
      const generation = this._generation;
      this._closeExistingConnections();
      let source;
      try {
        source = new EventSource(this._url);
        this._sse = source;
      } catch (error) {
        if (context.isCurrent()) {
          this._emit('error', error);
          this._attemptReconnect();
        }
        return;
      }

      const owns = () => context.isCurrent()
        && generation === this._generation
        && this._sse === source;

      source.addEventListener('open', () => {
        if (!owns()) return;
        this._connected = true;
        this._reconnectCount = 0;
        this._emit('connect', { operationId: context.id, generation });
      });
      source.addEventListener('message', event => {
        if (!owns()) return;
        try {
          const payload = JSON.parse(event.data);
          this._emit(payload.type ?? 'message', payload);
          this._emit('*', payload);
        } catch {
          this._emit('message', event.data);
        }
      });
      source.addEventListener('error', error => {
        if (!owns()) return;
        this._connected = false;
        this._sse = null;
        try { source.close(); } catch { /* already closed */ }
        this._emit('disconnect', { operationId: context.id, generation });
        this._emit('error', error);
        this._attemptReconnect();
      });
    }

    _attemptReconnect() {
      if (!this._reconnect || this._reconnectTimer) return;
      if (this._reconnectCount >= this._maxReconnects) {
        this._emit('reconnectFailed');
        return;
      }
      const generation = this._generation;
      this._reconnectCount += 1;
      const delay = this._reconnectDelay * this._reconnectCount;
      this._emit('reconnecting', { attempt: this._reconnectCount, delay, generation });
      this._reconnectTimer = setTimeout(() => {
        this._reconnectTimer = null;
        if (!this._reconnect || generation !== this._generation) return;
        this.connect();
      }, delay);
    }

    send(message) {
      if (this._protocol === 'sse') throw new Error('Server-Sent Events connections are receive-only');
      if (this._connected && this._ws?.readyState === WebSocket.OPEN) {
        this._ws.send(typeof message === 'string' ? message : JSON.stringify(message));
        return true;
      }
      const serialized = typeof message === 'string' ? message : JSON.stringify(message);
      const bytes = new TextEncoder().encode(serialized).byteLength;
      if (this._queue.length >= this._maxQueueMessages || this._queuedBytes + bytes > this._maxQueueBytes) {
        const error = new Error('Realtime outbound queue limit exceeded');
        this._emit('queueOverflow', { queued: this._queue.length, bytes: this._queuedBytes, rejectedBytes: bytes });
        throw error;
      }
      this._queue.push(message);
      this._queuedBytes += bytes;
      return false;
    }

    disconnect() {
      this._reconnect = false;
      this._generation += 1;
      this._connectionContext?.invalidate();
      this._connectionContext = null;
      if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
      this._queue = [];
      this._queuedBytes = 0;
      super.disconnect();
      this._ws = null;
      this._sse = null;
    }
  }

  data.HttpClient = HardenedHttpClient;
  data.RealtimeClient = HardenedRealtimeClient;
  data.http = new HardenedHttpClient({ baseURL: '', cacheTTL: 30_000 });
  Object.defineProperty(data, '__hardened', { value: true });
  return data;
}
