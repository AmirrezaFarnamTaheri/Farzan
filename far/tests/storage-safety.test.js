import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installStorageSafety } from '../src/core/storageSafety.js';

function createStorage() {
  const values = new Map();
  return {
    getItem: vi.fn((key) => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, String(value))),
    removeItem: vi.fn((key) => values.delete(key)),
  };
}

function createRoot() {
  const clearAll = vi.fn(async () => ({ committed: true, durable: true, failures: [], parts: [] }));
  const clearUserData = vi.fn(async (scope) => ({ committed: true, durable: true, failures: [], parts: [], scope }));
  return {
    DB: { clearAll, clearUserData },
    OpenCourseDeck: { Toast: { error: vi.fn() } },
    localStorage: createStorage(),
    sessionStorage: createStorage(),
  };
}

describe('storage safety', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unknown scopes instead of falling through to a full wipe', async () => {
    const root = createRoot();
    const originalClearAll = root.DB.clearAll;
    installStorageSafety(root);

    await expect(root.DB.clearUserData('typo')).rejects.toThrow('Unknown deletion scope');
    expect(originalClearAll).not.toHaveBeenCalled();
  });

  it('clears only preference keys for the preferences scope', async () => {
    const root = createRoot();
    const originalClearAll = root.DB.clearAll;
    const originalClearUserData = root.DB.clearUserData;
    installStorageSafety(root);

    const result = await root.DB.clearUserData('preferences');

    expect(result).toMatchObject({
      scope: 'preferences',
      committed: true,
      durable: true,
      status: 'committed',
      operation: 'clear-preferences',
    });
    expect(root.localStorage.removeItem).toHaveBeenCalledWith('plasma_theme');
    expect(originalClearUserData).not.toHaveBeenCalled();
    expect(originalClearAll).not.toHaveBeenCalled();
  });

  it('wraps known non-destructive scopes in a durable mutation receipt', async () => {
    const root = createRoot();
    const originalClearUserData = root.DB.clearUserData;
    installStorageSafety(root);

    const result = await root.DB.clearUserData('notes');

    expect(result).toMatchObject({
      scope: 'notes',
      committed: true,
      durable: true,
      degraded: false,
      status: 'committed',
      operation: 'clear-notes',
      backend: 'indexedDB',
      details: { scope: 'notes' },
      failures: [],
      cleared: [],
    });
    expect(result.id).toMatch(/^mutation-/);
    expect(originalClearUserData).toHaveBeenCalledWith('notes');
  });


  it('does not convert a failed primary clear into a committed receipt', async () => {
    const root = createRoot();
    root.DB.clearUserData.mockResolvedValue({
      committed: false,
      durable: false,
      status: 'failed',
      failures: [{ backend: 'indexedDB', store: 'notes', message: 'clear failed' }],
    });
    installStorageSafety(root);

    const error = await root.DB.clearUserData('notes').catch(value => value);

    expect(error).toMatchObject({ committed: false, durable: false, status: 'failed' });
    expect(error.failures).toEqual([expect.objectContaining({ store: 'notes' })]);
  });

  it('rejects preference deletion when storage reports the key still exists', async () => {
    const root = createRoot();
    root.localStorage.getItem.mockImplementation(key => key === 'plasma_theme' ? 'dark' : null);
    installStorageSafety(root);

    const error = await root.DB.clearUserData('preferences').catch(value => value);

    expect(error).toMatchObject({ committed: false, status: 'failed' });
    expect(error.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({ backend: 'localStorage', key: 'plasma_theme' }),
    ]));
  });

  it('surfaces blocked auxiliary database details before rejecting a full reset', async () => {
    const root = createRoot();
    root.indexedDB = {
      deleteDatabase: vi.fn((name) => {
        const request = {};
        queueMicrotask(() => {
          if (name === 'opencoursedeck-templates') request.onblocked?.();
          else request.onsuccess?.();
        });
        return request;
      }),
    };
    installStorageSafety(root);

    const error = await root.DB.clearAll().catch(value => value);

    expect(error).toMatchObject({
      committed: false,
      durable: false,
      status: 'failed',
      operation: 'clear-all',
    });
    expect(error.failures).toEqual([
      expect.objectContaining({ name: 'opencoursedeck-templates' }),
    ]);
    expect(root.OpenCourseDeck.Toast.error).toHaveBeenCalledWith(
      expect.stringContaining('opencoursedeck-templates'),
    );
    expect(root.OpenCourseDeck.Toast.error).toHaveBeenCalledWith(
      expect.stringContaining('blocked by another open tab'),
    );
  });
});
