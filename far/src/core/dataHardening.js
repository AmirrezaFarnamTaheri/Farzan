const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

function stableHeaders(headers = {}) {
  return Object.entries(headers)
    .map(([key, value]) => [String(key).toLowerCase(), String(value)])
    .sort(([a], [b]) => a.localeCompare(b));
}

function combineSignals(signals) {
  const active = signals.filter(Boolean);
  if (!active.length) return null;
  if (typeof AbortSignal?.any === 'function') return AbortSignal.any(active);
  const controller = new AbortController();
  const abort = (event) => controller.abort(event?.target?.reason);
  for (const signal of active) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener('abort', abort, { once: true });
  }
  return controller.signal;
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason || new DOMException('Aborted', 'AbortError'));
    };
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
      const normalizedMethod = String(method || 'GET').toUpperCase();
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

      const mergedHeaders = { 'Content-Type': 'application/json', ...this._headers, ...headers };
      const authenticated = Object.keys(mergedHeaders).some(key => key.toLowerCase() === 'authorization');
      const representationHeaders = stableHeaders(mergedHeaders);
      const cacheKey = JSON.stringify([normalizedMethod, fullURL, representationHeaders]);
      const allowCache = normalizedMethod === 'GET' && cache && !authenticated;
      const isSWR = cache === 'swr';

      if (allowCache) {
        const hit = isSWR ? this._cache.peek(cacheKey) : null;
        if (!isSWR && this._cache.has(cacheKey)) return this._cache.get(cacheKey);
        if (isSWR && hit?.value !== undefined && !hit.stale) return hit.value;
      }

      if (normalizedMethod === 'GET' && this._pendingRequests.has(cacheKey)) {
        return this._pendingRequests.get(cacheKey);
      }

      let init = {
        method: normalizedMethod,
        headers: mergedHeaders,
        signal,
      };
      if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
      for (const interceptor of this._interceptors.request) {
        init = (await interceptor(init, fullURL)) ?? init;
      }

      const timeoutController = new AbortController();
      const timeoutId = Number(timeout) > 0
        ? setTimeout(() => timeoutController.abort(new DOMException(`Request timed out after ${timeout}ms`, 'TimeoutError')), Number(timeout))
        : null;
      init.signal = combineSignals([signal, timeoutController.signal]);

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
        this._pendingRequests.delete(cacheKey);
      }
    }

    async upload(url, files, { onProgress, fieldName = 'file', headers = {}, signal, timeout = this._timeout } = {}) {
      const form = new FormData();
      const list = Array.isArray(files) ? files : [files];
      list.forEach((file, index) => form.append(list.length > 1 ? `${fieldName}[${index}]` : fieldName, file));
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url.startsWith('http') ? url : `${this._base}${url}`);
        xhr.timeout = Number(timeout) > 0 ? Number(timeout) : 0;
        Object.entries({ ...this._headers, ...headers }).forEach(([key, value]) => {
          if (key.toLowerCase() !== 'content-type') xhr.setRequestHeader(key, value);
        });
        if (onProgress) xhr.upload.addEventListener('progress', event => {
          if (event.lengthComputable) onProgress(event.loaded / event.total, event.loaded, event.total);
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)); } catch { resolve(xhr.responseText); }
          } else reject(new Error(`Upload failed: HTTP ${xhr.status}`));
        });
        xhr.addEventListener('timeout', () => reject(new Error('Upload timed out')));
        xhr.addEventListener('error', () => reject(new Error('Upload network error')));
        xhr.addEventListener('abort', () => reject(new DOMException('Upload aborted', 'AbortError')));
        if (signal) {
          if (signal.aborted) xhr.abort();
          else signal.addEventListener('abort', () => xhr.abort(), { once: true });
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
      this._maxQueueMessages = options.maxQueueMessages ?? 100;
      this._maxQueueBytes = options.maxQueueBytes ?? 256 * 1024;
      this._queuedBytes = 0;
    }

    connect() {
      this._reconnect = this._desiredReconnect;
      this._generation += 1;
      if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
      return super.connect();
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
      this._emit('reconnecting', { attempt: this._reconnectCount, delay });
      this._reconnectTimer = setTimeout(() => {
        this._reconnectTimer = null;
        if (!this._reconnect || generation !== this._generation) return;
        super.connect();
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

    _connectWS() {
      const result = super._connectWS();
      const socket = this._ws;
      socket?.addEventListener('open', () => { this._queuedBytes = 0; }, { once: true });
      return result;
    }

    disconnect() {
      this._reconnect = false;
      this._generation += 1;
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
