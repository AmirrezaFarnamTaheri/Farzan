import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import {
  computeBackoffDelay,
  configureMutationRetry,
  isRetryableMutationError,
  withMutationRetry,
} from '../src/core/mutationRetry.js';
import '../db.js';

function domError(name, code) {
  return typeof DOMException === 'function'
    ? new DOMException(name, name)
    : Object.assign(new Error(name), { name, code });
}

describe('isRetryableMutationError', () => {
  const retryable = [
    'TransactionInactiveError',
    'InvalidStateError',
    'AbortError',
    'QuotaExceededError',
    'UnknownError',
  ];
  const permanent = [
    'DataCloneError',
    'DataError',
    'ConstraintError',
    'ReadOnlyError',
    'NotFoundError',
    'VersionError',
  ];

  it.each(retryable)('treats %s as retryable', (name) => {
    expect(isRetryableMutationError(domError(name))).toBe(true);
  });

  it.each(permanent)('treats %s as permanent', (name) => {
    expect(isRetryableMutationError(domError(name))).toBe(false);
  });

  it('maps legacy QUOTA_EXCEEDED_ERR code 22 on bare DOMExceptions', () => {
    expect(isRetryableMutationError({ name: 'DOMException', code: 22 })).toBe(true);
    expect(isRetryableMutationError({ name: 'DOMException', code: 0 })).toBe(false);
  });

  it('rejects non-error junk conservatively', () => {
    expect(isRetryableMutationError(null)).toBe(false);
    expect(isRetryableMutationError(undefined)).toBe(false);
    expect(isRetryableMutationError('QuotaExceededError')).toBe(false);
    expect(isRetryableMutationError({})).toBe(false);
  });
});

describe('computeBackoffDelay', () => {
  it('stays within [2^attempt*base, 2^(attempt+1)*base] and under the cap', () => {
    const opts = { baseDelayMs: 50, maxDelayMs: 2000 };
    for (let attempt = 0; attempt < 10; attempt++) {
      for (let trial = 0; trial < 20; trial++) {
        const delay = computeBackoffDelay(attempt, opts);
        const ceiling = Math.min(2000, 50 * 2 ** (attempt + 1));
        const floor = Math.min(ceiling, 50 * 2 ** attempt);
        expect(delay).toBeGreaterThanOrEqual(floor);
        expect(delay).toBeLessThanOrEqual(ceiling);
      }
    }
  });

  it('never exceeds maxDelayMs even at huge attempts', () => {
    expect(computeBackoffDelay(30, { baseDelayMs: 50, maxDelayMs: 100 })).toBeLessThanOrEqual(100);
  });

  it('uses the injected random source deterministically', () => {
    expect(
      computeBackoffDelay(1, { baseDelayMs: 100, maxDelayMs: 10_000, random: () => 0 })
    ).toBe(200);
    expect(
      computeBackoffDelay(1, { baseDelayMs: 100, maxDelayMs: 10_000, random: () => 0.999 })
    ).toBeLessThan(400);
  });
});

describe('withMutationRetry', () => {
  it('returns the operation result when the first attempt succeeds', async () => {
    const op = vi.fn(async () => 'ok');
    await expect(withMutationRetry(op)).resolves.toBe('ok');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures and then succeeds', async () => {
    let calls = 0;
    const op = vi.fn(async () => {
      if (calls++ < 2) throw domError('TransactionInactiveError');
      return 'recovered';
    });
    await expect(
      withMutationRetry(op, { baseDelayMs: 1, maxDelayMs: 4 })
    ).resolves.toBe('recovered');
    expect(op).toHaveBeenCalledTimes(3);
  });

  it('gives up after the configured retries and rethrows the last error', async () => {
    const boom = domError('UnknownError');
    const op = vi.fn(async () => {
      throw boom;
    });
    await expect(
      withMutationRetry(op, { retries: 2, baseDelayMs: 1, maxDelayMs: 2 })
    ).rejects.toBe(boom);
    expect(op).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('does not retry permanent failures', async () => {
    const bad = domError('DataCloneError');
    const op = vi.fn(async () => {
      throw bad;
    });
    await expect(withMutationRetry(op, { baseDelayMs: 1 })).rejects.toBe(bad);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('honors a custom shouldRetry predicate', async () => {
    const weird = Object.assign(new Error('flaky'), { name: 'FlakeError' });
    let calls = 0;
    const op = vi.fn(async () => {
      if (calls++ === 0) throw weird;
      return 'done';
    });
    await expect(
      withMutationRetry(op, {
        shouldRetry: (error) => error.name === 'FlakeError',
        baseDelayMs: 1,
      })
    ).resolves.toBe('done');
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('reports every retry through onRetry with attempt/error/delay', async () => {
    const onRetry = vi.fn();
    let calls = 0;
    const op = vi.fn(async () => {
      if (calls++ < 2) throw domError('AbortError');
      return true;
    });
    await withMutationRetry(op, { onRetry, baseDelayMs: 10, maxDelayMs: 20 });
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls.map((c) => c[0].attempt)).toEqual([1, 2]);
    expect(onRetry.mock.calls[0][0].error.name).toBe('AbortError');
    expect(onRetry.mock.calls[0][0].delayMs).toBeGreaterThanOrEqual(10);
    expect(onRetry.mock.calls[0][0].delayMs).toBeLessThan(20);
  });

  it('awaits the configured beforeRetry hook (e.g. quota eviction)', async () => {
    const order = [];
    const undo = configureMutationRetry({
      beforeRetry: async ({ error }) => {
        order.push(`evict:${error.name}`);
      },
    });
    try {
      let calls = 0;
      const op = async () => {
        if (calls++ === 0) throw domError('QuotaExceededError');
        return 'saved';
      };
      await expect(
        withMutationRetry(op, { baseDelayMs: 1, maxDelayMs: 2 })
      ).resolves.toBe('saved');
      expect(order).toEqual(['evict:QuotaExceededError']);
    } finally {
      undo();
    }
  });

  it('aborts promptly when the signal fires during backoff', async () => {
    const controller = new AbortController();
    const op = vi.fn(async () => {
      throw domError('TransactionInactiveError');
    });
    const pending = withMutationRetry(op, {
      retries: 5,
      baseDelayMs: 500,
      maxDelayMs: 5000,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 20);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(op).toHaveBeenCalledTimes(1);
  });
});

describe('OpenCourseDB automatic mutation retry integration', () => {
  const DB_NAME = 'mutation-retry-test-db';

  beforeEach(async () => {
    await indexedDB.deleteDatabase(DB_NAME);
  });

  function makeDb() {
    const { OpenCourseDB } = window.OpenCourseDeck.DB;
    return new OpenCourseDB(DB_NAME, 1, [
      { name: 'items', key: 'id', autoIncrement: false },
      { name: 'settings', key: 'id', autoIncrement: false },
    ]);
  }

  it('put() survives a transient transaction failure and persists the record', async () => {
    const db = makeDb();
    const original = db._waitForTransaction.bind(db);
    let failures = 0;
    db._waitForTransaction = (tx, request, mapResult) => {
      if (failures++ === 0) {
        // Abort the transaction after the request is queued: the write rolls
        // back and the promise rejects with a retryable AbortError — exactly
        // what a version-change interruption looks like in production.
        request.onsuccess = () => tx.abort();
      }
      return original(tx, request, mapResult);
    };

    await expect(db.put('items', { id: 'a', value: 1 })).resolves.toBe('a');

    // The retried attempt must have committed durably, and exactly once.
    const stored = await db.get('items', 'a');
    expect(stored).toMatchObject({ id: 'a', value: 1 });
  });

  it('put() surfaces permanent payload failures immediately without writing', async () => {
    const db = makeDb();
    // A function value cannot be structured-cloned into IndexedDB: the
    // DataCloneError fires at request-issue time and must not be retried.
    await expect(
      db.put('items', { id: 'b', value: () => {} })
    ).rejects.toMatchObject({ name: 'DataCloneError' });
    await expect(db.getAll('items')).resolves.toEqual([]);
  });

  it('bulkPutWithCheckpoint() commits records and checkpoint atomically', async () => {
    const db = makeDb();
    await db.bulkPutWithCheckpoint(
      'items',
      [{ id: 'x' }, { id: 'y' }],
      { id: 'sync-checkpoint-items', cursor: 'y' }
    );
    const all = await db.getAll('items');
    expect(all.map((row) => row.id).sort()).toEqual(['x', 'y']);
    const checkpoint = await db.get('settings', 'sync-checkpoint-items');
    expect(checkpoint).toMatchObject({ cursor: 'y' });
  });
});
