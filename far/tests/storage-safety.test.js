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
  const clearAll = vi.fn(async () => true);
  const clearUserData = vi.fn(async (scope) => ({ scope }));
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

    expect(result.scope).toBe('preferences');
    expect(root.localStorage.removeItem).toHaveBeenCalledWith('plasma_theme');
    expect(originalClearUserData).not.toHaveBeenCalled();
    expect(originalClearAll).not.toHaveBeenCalled();
  });

  it('delegates known non-destructive scopes unchanged', async () => {
    const root = createRoot();
    const originalClearUserData = root.DB.clearUserData;
    installStorageSafety(root);

    await expect(root.DB.clearUserData('notes')).resolves.toEqual({ scope: 'notes' });
    expect(originalClearUserData).toHaveBeenCalledWith('notes');
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
