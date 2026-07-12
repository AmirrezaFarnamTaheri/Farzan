import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeWorker {
  static instances = [];

  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.messages = [];
    this.terminated = false;
    FakeWorker.instances.push(this);
  }

  postMessage(message) {
    this.messages.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  respond(payload) {
    this.onmessage?.({ data: payload });
  }

  crash(message = 'boom') {
    this.onerror?.({ message });
  }
}

async function loadPool() {
  vi.resetModules();
  globalThis.Worker = FakeWorker;
  return import('../src/lib/workerPool.js');
}

describe('worker pool generation isolation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWorker.instances = [];
    delete window.OpenCourseDeck;
  });

  afterEach(async () => {
    try {
      const pool = await import('../src/lib/workerPool.js');
      pool.terminateAll();
    } catch {}
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete globalThis.Worker;
  });

  it('rejects only the crashed generation and restarts on the next request', async () => {
    const pool = await loadPool();
    const first = pool.runInWorker('search', { type: 'query', data: { q: 'a' } });
    const firstRejection = expect(first).rejects.toThrow('crashed');
    const oldWorker = FakeWorker.instances[0];
    oldWorker.crash('crashed');

    await firstRejection;
    expect(oldWorker.terminated).toBe(true);

    const second = pool.runInWorker('search', { type: 'query', data: { q: 'b' } });
    const newWorker = FakeWorker.instances[1];
    expect(newWorker).not.toBe(oldWorker);
    const [{ id }] = newWorker.messages;
    newWorker.respond({ type: 'result', id, items: ['ok'] });
    await expect(second).resolves.toMatchObject({ type: 'result', items: ['ok'] });
  });

  it('ignores late messages from an old generation even when ids are reused externally', async () => {
    const pool = await loadPool();
    const first = pool.runInWorker('search', { type: 'query' });
    const firstRejection = expect(first).rejects.toThrow('restart');
    const oldWorker = FakeWorker.instances[0];
    const oldId = oldWorker.messages[0].id;
    oldWorker.crash('restart');
    await firstRejection;

    const second = pool.runInWorker('search', { type: 'query' });
    const newWorker = FakeWorker.instances[1];
    const newId = newWorker.messages[0].id;
    oldWorker.respond({ type: 'result', id: newId, items: ['stale'] });
    expect(pool.getWorkerStatus().search.pending).toBe(1);
    newWorker.respond({ type: 'result', id: newId, items: ['fresh'] });
    await expect(second).resolves.toMatchObject({ items: ['fresh'] });
    expect(oldId).not.toBe(newId);
  });

  it('allows search and catalog concurrently but rejects a second job on one worker', async () => {
    const pool = await loadPool();
    const search = pool.runInWorker('search', { type: 'query' });
    const catalog = pool.runInWorker('catalog', { type: 'load' });

    await expect(pool.runInWorker('search', { type: 'query' })).rejects.toThrow('busy');

    const [searchWorker, catalogWorker] = FakeWorker.instances;
    searchWorker.respond({ type: 'result', id: searchWorker.messages[0].id });
    catalogWorker.respond({ type: 'result', id: catalogWorker.messages[0].id });
    await expect(Promise.all([search, catalog])).resolves.toHaveLength(2);
  });

  it('terminates a timed-out generation and ignores its late response', async () => {
    const pool = await loadPool();
    const request = pool.runInWorker('search', { type: 'query' }, { timeout: 25 });
    const rejection = expect(request).rejects.toThrow('timed out');
    const worker = FakeWorker.instances[0];
    const id = worker.messages[0].id;

    await vi.advanceTimersByTimeAsync(25);
    await rejection;
    expect(worker.terminated).toBe(true);
    worker.respond({ type: 'result', id });
    expect(pool.getWorkerStatus().search.pending).toBe(0);
  });
});
