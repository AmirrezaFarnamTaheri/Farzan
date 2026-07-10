import { beforeEach, describe, expect, it, vi } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { createAIClient, GEMMA_MODEL_OPTIONS, initAIClient } from '../src/features/aiClient.js';

describe('AI client', () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
  });

  it('stays unavailable when AI is hidden or disabled', async () => {
    const root = {
      DB: { getSetting: vi.fn(async () => ({ mode: 'hidden' })) },
      sessionStorage,
    };
    const client = createAIClient(root);

    await expect(client.status()).resolves.toMatchObject({ available: false, reason: 'hidden' });

    root.DB.getSetting.mockResolvedValueOnce({ mode: 'disabled' });
    await expect(client.summarizeText('One useful sentence. Another useful sentence.')).resolves.toMatchObject({
      ok: false,
      reason: 'disabled',
    });
  });

  it('provides a private local extractive summary when local Gemma mode has no runtime yet', async () => {
    const root = {
      DB: { getSetting: vi.fn(async () => ({ mode: 'local-gemma', model: 'gemma-local', localModelStatus: 'installed' })) },
      sessionStorage,
    };
    const client = createAIClient(root);

    const result = await client.summarizeText(`
      Retrieval practice improves long term memory because it forces recall.
      Spaced repetition improves long term memory by reviewing material at expanding intervals.
      Passive rereading feels fluent but often produces weaker recall.
      Short summaries are useful when they preserve the source claims.
    `);

    expect(result).toMatchObject({ ok: true, mode: 'local-gemma', provider: 'private-local-extractive' });
    expect(result.text).toContain('- ');
    expect(result.text).toContain('long term memory');
    await expect(client.status()).resolves.toMatchObject({
      available: true,
      localModelStatus: 'installed',
      localModelSource: GEMMA_MODEL_OPTIONS[0].url,
    });
  });

  it('normalizes Gemma settings and exposes package options', async () => {
    const root = {
      DB: { getSetting: vi.fn(async () => ({
        mode: 'local-gemma',
        model: 'gemma-4-local',
        localModelStatus: 'unknown',
        localModelSource: '',
      })) },
      sessionStorage,
    };
    const client = createAIClient(root);

    await expect(client.status()).resolves.toMatchObject({
      available: true,
      mode: 'local-gemma',
      localModelStatus: 'not-installed',
      localModelSource: GEMMA_MODEL_OPTIONS[0].url,
    });
    expect(client.gemmaModelOptions.map(option => option.id)).toContain('gemma-4-local');
  });

  it('reports imported local model file metadata', async () => {
    const root = {
      DB: { getSetting: vi.fn(async () => ({
        mode: 'local-gemma',
        model: 'gemma-4-local',
        localModelStatus: 'imported',
        localModelFile: {
          name: 'gemma.task',
          size: 1234,
          type: 'application/octet-stream',
          lastModified: 100,
          importedAt: 200,
        },
      })) },
      sessionStorage,
    };
    const client = createAIClient(root);

    await expect(client.status()).resolves.toMatchObject({
      available: true,
      localModelStatus: 'imported',
      localModelFile: { name: 'gemma.task', size: 1234, importedAt: 200 },
    });
  });

  it('stores and clears local model file bytes in an app-owned IndexedDB cache', async () => {
    const root = {
      DB: { getSetting: vi.fn(async () => ({ mode: 'local-gemma' })) },
      indexedDB,
      sessionStorage,
    };
    const client = createAIClient(root);
    const file = new File(['model-bytes'], 'gemma.task', { type: 'application/octet-stream', lastModified: 300 });

    const imported = await client.importLocalModelFile(file);
    expect(imported).toMatchObject({ name: 'gemma.task', size: 11, type: 'application/octet-stream', lastModified: 300 });

    const cached = await client.getLocalModelFile();
    expect(cached).toMatchObject({ name: 'gemma.task', size: 11 });
    expect(cached.blob).toBeTruthy();

    await client.clearLocalModelFile();
    await expect(client.getLocalModelFile()).resolves.toBeUndefined();
  });

  it('rejects model files beyond the configured safety limit', async () => {
    const root = {
      DB: { getSetting: vi.fn(async () => ({ mode: 'local-gemma' })) },
      indexedDB,
      sessionStorage,
    };
    const client = createAIClient(root);
    const file = new File(['too-large'], 'oversized.task', { type: 'application/octet-stream' });

    await expect(client.importLocalModelFile(file, { maxBytes: 4 })).rejects.toThrow('safety limit');
  });

  it('downloads a remote model file into the local model cache with private request options', async () => {
    const bytes = new TextEncoder().encode('remote-model!');
    let delivered = false;
    const root = {
      DB: { getSetting: vi.fn(async () => ({ mode: 'local-gemma' })) },
      indexedDB,
      sessionStorage,
      fetch: vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: {
          get(name) {
            const key = String(name).toLowerCase();
            if (key === 'content-type') return 'application/octet-stream';
            if (key === 'content-length') return String(bytes.byteLength);
            return null;
          },
        },
        body: {
          getReader() {
            return {
              async read() {
                if (delivered) return { done: true, value: undefined };
                delivered = true;
                return { done: false, value: bytes };
              },
            };
          },
        },
      })),
    };
    const client = createAIClient(root);
    const progress = vi.fn();

    const downloaded = await client.downloadLocalModel('https://models.example.test/gemma.task', { onProgress: progress });
    expect(downloaded).toMatchObject({ name: 'gemma.task', size: 13, type: 'application/octet-stream' });
    expect(root.fetch).toHaveBeenCalledWith('https://models.example.test/gemma.task', expect.objectContaining({
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: expect.anything(),
    }));
    expect(progress).toHaveBeenCalledWith({ loaded: 13, total: 13, percent: 100 });
    await expect(client.getLocalModelFile()).resolves.toMatchObject({ name: 'gemma.task', size: 13 });
  });

  it('rejects insecure remote model URLs and oversized downloads', async () => {
    const root = {
      DB: { getSetting: vi.fn(async () => ({ mode: 'local-gemma' })) },
      indexedDB,
      sessionStorage,
      fetch: vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: name => String(name).toLowerCase() === 'content-length' ? '100' : null },
      })),
    };
    const client = createAIClient(root);

    await expect(client.downloadLocalModel('http://models.example.test/model.bin')).rejects.toThrow('HTTPS');
    await expect(client.downloadLocalModel('https://models.example.test/model.bin', { maxBytes: 10 })).rejects.toThrow('safety limit');
  });

  it('indexes and searches lightweight local embeddings', async () => {
    const root = {
      DB: { getSetting: vi.fn(async () => ({ mode: 'local-gemma' })) },
      indexedDB,
      sessionStorage,
    };
    const client = createAIClient(root);

    await client.clearEmbeddings();
    await client.upsertEmbedding({ id: 'note-memory', text: 'Retrieval practice strengthens long term memory.', metadata: { type: 'note' } });
    await client.upsertEmbedding({ id: 'note-cooking', text: 'Sourdough starter needs flour and water.', metadata: { type: 'note' } });

    const results = await client.searchEmbeddings('memory retrieval study', { limit: 1 });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: 'note-memory', metadata: { type: 'note' }, provider: 'local-hash-v1' });
    expect(results[0].score).toBeGreaterThan(0);

    await client.clearEmbeddings();
    await expect(client.searchEmbeddings('memory')).resolves.toEqual([]);
  });

  it('uses a registered local runtime when one is available', async () => {
    const localProvider = vi.fn(async ({ prompt, model }) => ({ text: `${model}: ${prompt.slice(0, 7)}` }));
    const root = {
      DB: { getSetting: vi.fn(async () => ({ mode: 'local-gemma', model: 'gemma-4-local' })) },
      OpenCourseDeck: { bus: { emit: vi.fn() } },
      sessionStorage,
    };
    const client = createAIClient(root);

    const unregister = client.registerLocalProvider(localProvider);
    const result = await client.complete({ prompt: 'Explain retrieval practice.' });

    expect(result).toEqual({
      ok: true,
      mode: 'local-gemma',
      provider: 'registered-local-runtime',
      text: 'gemma-4-local: Explain',
    });
    expect(localProvider).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemma-4-local' }));
    expect(root.OpenCourseDeck.bus.emit).toHaveBeenCalledWith('ai:provider-ready', { provider: 'local' });

    unregister();
    await client.complete({ prompt: 'Local fallback sentence.' });
    expect(localProvider).toHaveBeenCalledTimes(1);
  });

  it('requires explicit approval before sending a session key to a custom endpoint', async () => {
    sessionStorage.setItem('plasma-ai-api-key-session', 'sk-session');
    const root = {
      DB: { getSetting: vi.fn(async () => ({
        mode: 'custom-api',
        model: 'user-model',
        endpoint: 'https://ai.example.test/v1/chat/completions',
        hasKey: true,
      })) },
      fetch: vi.fn(),
      sessionStorage,
    };
    const client = createAIClient(root);

    await expect(client.status()).resolves.toMatchObject({
      available: false,
      reason: 'unapproved-endpoint',
      endpointOrigin: 'https://ai.example.test',
    });
    await expect(client.complete({ prompt: 'Do not send this.' })).resolves.toMatchObject({
      ok: false,
      reason: 'unapproved-endpoint',
    });
    expect(root.fetch).not.toHaveBeenCalled();
  });

  it('calls an approved OpenAI-compatible API endpoint with a session-only key', async () => {
    sessionStorage.setItem('plasma-ai-api-key-session', 'sk-session');
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Remote summary' } }] }),
    }));
    const root = {
      DB: { getSetting: vi.fn(async () => ({
        mode: 'custom-api',
        model: 'user-model',
        endpoint: 'https://ai.example.test/v1/chat/completions',
        approvedEndpointOrigin: 'https://ai.example.test',
        keyStorage: 'local',
        apiKey: 'persisted-key-must-be-ignored',
        hasKey: true,
      })) },
      fetch,
      sessionStorage,
    };
    const client = createAIClient(root);

    const result = await client.complete({ prompt: 'Summarize this note.' });

    expect(result).toEqual({ ok: true, mode: 'custom-api', provider: 'custom-api', text: 'Remote summary' });
    expect(fetch).toHaveBeenCalledWith('https://ai.example.test/v1/chat/completions', expect.objectContaining({
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      headers: expect.objectContaining({ Authorization: 'Bearer sk-session' }),
    }));
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      model: 'user-model',
      messages: [{ role: 'user', content: 'Summarize this note.' }],
    });
    await expect(client.getSettings()).resolves.toMatchObject({ keyStorage: 'session' });
    await expect(client.getApiKey()).resolves.toBe('sk-session');
  });

  it('rejects insecure or credential-bearing custom endpoints', async () => {
    sessionStorage.setItem('plasma-ai-api-key-session', 'sk-session');
    const root = {
      DB: { getSetting: vi.fn() },
      fetch: vi.fn(),
      sessionStorage,
    };
    const client = createAIClient(root);

    root.DB.getSetting.mockResolvedValueOnce({
      mode: 'custom-api',
      endpoint: 'http://ai.example.test/v1/chat/completions',
      approvedEndpointOrigin: 'http://ai.example.test',
      hasKey: true,
    });
    await expect(client.status()).resolves.toMatchObject({ available: false, reason: 'invalid-endpoint' });

    root.DB.getSetting.mockResolvedValueOnce({
      mode: 'custom-api',
      endpoint: 'https://user:secret@ai.example.test/v1/chat/completions',
      approvedEndpointOrigin: 'https://ai.example.test',
      hasKey: true,
    });
    await expect(client.status()).resolves.toMatchObject({ available: false, reason: 'invalid-endpoint' });
    expect(root.fetch).not.toHaveBeenCalled();
  });

  it('installs the client on OpenCourseDeck once', () => {
    const root = { OpenCourseDeck: {}, DB: {}, sessionStorage };
    const first = initAIClient(root);
    const second = initAIClient(root);

    expect(first).toBe(second);
    expect(root.OpenCourseDeck.AI).toBe(first);
  });
});
