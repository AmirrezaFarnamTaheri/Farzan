import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installDataHardening } from '../src/core/dataHardening.js';

class LegacyHttpClient {
  constructor(options = {}) {
    this._base = options.baseURL ?? '';
    this._headers = options.headers ?? {};
    this._timeout = options.timeout ?? 30_000;
    this._cache = {
      values: new Map(),
      get(key) { return this.values.get(key); },
      has(key) { return this.values.has(key); },
      set(key, value) { this.values.set(key, value); },
      peek(key) { return this.values.has(key) ? { value: this.values.get(key), stale: false } : null; },
    };
    this._interceptors = { request: [], response: [], error: [] };
    this._pendingRequests = new Map();
  }
}

class LegacyRealtimeClient {
  constructor(options = {}) {
    Object.assign(this, {
      _url: options.url,
      _protocol: options.protocol ?? 'ws',
      _reconnect: options.reconnect ?? true,
      _reconnectDelay: options.reconnectDelay ?? 1,
      _maxReconnects: options.maxReconnects ?? 10,
      _reconnectCount: 0,
      _listeners: new Map(),
      _subscriptions: new Set(),
      _queue: [],
      _connected: false,
      _ws: null,
      _sse: null,
    });
  }
  connect() { return this._protocol === 'sse' ? this._connectSSE() : this._connectWS(); }
  _connectWS() { this._ws = { addEventListener: vi.fn(), close: vi.fn() }; }
  _connectSSE() { this._sse = { close: vi.fn() }; }
  _emit() {}
  disconnect() { this._reconnect = false; this._ws?.close(); this._sse?.close(); this._connected = false; }
}

function createRoot() {
  return {
    location: { href: 'https://app.example/' },
    OpenCourseDeck: {
      Data: {
        HttpClient: LegacyHttpClient,
        RealtimeClient: LegacyRealtimeClient,
        http: new LegacyHttpClient(),
      },
    },
  };
}

describe('data hardening', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
  });

  it('serializes falsey request bodies and keeps timeout active through parsing', async () => {
    const root = createRoot();
    installDataHardening(root);
    fetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true }),
    });

    const client = new root.OpenCourseDeck.Data.HttpClient({ timeout: 1000 });
    await client.post('/flag', { body: false });

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][1].body).toBe('false');
    expect(fetch.mock.calls[0][1].signal).toBeTruthy();
  });

  it('does not deduplicate authenticated requests with different headers', async () => {
    const root = createRoot();
    installDataHardening(root);
    fetch.mockImplementation(async () => ({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true }),
    }));
    const client = new root.OpenCourseDeck.Data.HttpClient();

    await Promise.all([
      client.get('/me', { headers: { Authorization: 'Bearer a' } }),
      client.get('/me', { headers: { Authorization: 'Bearer b' } }),
    ]);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('cancels reconnect timers and clears buffered messages on disconnect', () => {
    vi.useFakeTimers();
    const root = createRoot();
    installDataHardening(root);
    const Client = root.OpenCourseDeck.Data.RealtimeClient;
    const client = new Client({ url: 'wss://example.test', reconnectDelay: 10 });
    client._attemptReconnect();
    client._queue.push({ type: 'queued' });
    client.disconnect();
    vi.runAllTimers();

    expect(client._reconnectTimer).toBeNull();
    expect(client._queue).toEqual([]);
    vi.useRealTimers();
  });

  it('rejects outbound sends in SSE mode and enforces queue bounds', () => {
    const root = createRoot();
    installDataHardening(root);
    const Client = root.OpenCourseDeck.Data.RealtimeClient;
    expect(() => new Client({ protocol: 'sse' }).send({ hello: true })).toThrow('receive-only');

    const ws = new Client({ protocol: 'ws', maxQueueMessages: 1 });
    expect(ws.send({ first: true })).toBe(false);
    expect(() => ws.send({ second: true })).toThrow('queue limit');
  });
});
