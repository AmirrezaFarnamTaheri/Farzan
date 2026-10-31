import { describe, expect, it, vi } from 'vitest';
import { createLazyWorkerPool } from '../src/core/lazyWorkerPool.js';

const STATUS = {
  available: false, busy: false, pending: 0, generation: 0, lastUsed: null,
};

describe('lazy WorkerPool public compatibility facade', () => {
  it('keeps synchronous status and termination methods without loading worker code', () => {
    const load = vi.fn();
    const api = createLazyWorkerPool({ load });
    expect(api.getWorkerStatus()).toEqual({ search: STATUS, catalog: STATUS });
    expect(api.terminateAll()).toBeUndefined();
    expect(api.getWorkerStatus()).toEqual({ search: STATUS, catalog: STATUS });
    expect(load).not.toHaveBeenCalled();
  });

  it('keeps runInWorker Promise semantics and shares one lazy import across requests', async () => {
    const mod = {
      runInWorker: vi.fn(async (name, message, options) => ({ name, message, options })),
      terminateAll: vi.fn(),
      getWorkerStatus: vi.fn(() => ({
        search: { ...STATUS, generation: 1 }, catalog: STATUS,
      })),
    };
    const load = vi.fn(async () => mod);
    const api = createLazyWorkerPool({ load });
    const first = api.runInWorker('search', { type: 'search' }, { timeout: 120 });
    const second = api.runInWorker('catalog', { type: 'init' });
    expect(first).toBeInstanceOf(Promise);
    expect(load).toHaveBeenCalledOnce();
    await expect(first).resolves.toMatchObject({
      name: 'search', message: { type: 'search' }, options: { timeout: 120 },
    });
    await expect(second).resolves.toMatchObject({ name: 'catalog' });
    expect(mod.runInWorker).toHaveBeenCalledTimes(2);
    expect(api.getWorkerStatus().search.generation).toBe(1);
    expect(api.terminateAll()).toBeUndefined();
    expect(mod.terminateAll).toHaveBeenCalledOnce();
  });

  it('allows retry after a failed lazy import without publishing a broken API', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('offline import rejected'))
      .mockResolvedValueOnce({ runInWorker: async () => 'recovered',
        getWorkerStatus: () => ({ search: STATUS, catalog: STATUS }),
        terminateAll: vi.fn() });
    const api = createLazyWorkerPool({ load });
    await expect(api.runInWorker('search', { type: 'init' })).rejects.toThrow('offline import rejected');
    expect(api.getWorkerStatus()).toEqual({ search: STATUS, catalog: STATUS });
    await expect(api.runInWorker('search', { type: 'init' })).resolves.toBe('recovered');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not start a worker request when terminateAll supersedes a pending lazy import', async () => {
    let resolveLoad;
    const live = {
      runInWorker: vi.fn(async () => true),
      terminateAll: vi.fn(),
      getWorkerStatus: vi.fn(() => ({ search: STATUS, catalog: STATUS })),
    };
    const api = createLazyWorkerPool({
      load: () => new Promise(resolve => { resolveLoad = resolve; }),
    });
    const pending = api.runInWorker('search', { type: 'search' });
    api.terminateAll();
    resolveLoad(live);
    await expect(pending).rejects.toMatchObject({ code: 'WORKER_POOL_TERMINATED' });
    expect(live.runInWorker).not.toHaveBeenCalled();
  });

  it('refuses malformed module contracts before invoking any worker request', async () => {
    const api = createLazyWorkerPool({
      load: async () => ({ runInWorker: null, terminateAll: () => {}, getWorkerStatus: () => ({}) }),
    });
    await expect(api.runInWorker('search', { type: 'init' })).rejects.toThrow(/invalid.*WorkerPool/i);
    expect(api.getWorkerStatus()).toEqual({ search: STATUS, catalog: STATUS });
  });
});
