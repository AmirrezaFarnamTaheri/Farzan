import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { MediaStorage } from '../src/features/mediaStorage.js';

const DB_NAME = 'opencoursedeck-media';
const STORE_NAME = 'mediaState';

// A storage reset closes auxiliary databases through AuxiliaryDbLifecycle while
// MediaStorage may still hold the handle in its module cache. Operations on a
// closed handle throw InvalidStateError; the cache must recover rather than
// fail every write until reload.
function readDirect(mediaId) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'mediaId' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STORE_NAME, 'readonly');
      const get = tx.objectStore(STORE_NAME).get(mediaId);
      get.onsuccess = () => { db.close(); resolve(get.result ?? null); };
      get.onerror = () => { db.close(); reject(get.error); };
    };
    request.onerror = () => reject(request.error);
  });
}

describe('MediaStorage closed-connection recovery', () => {
  let openHandles;

  beforeEach(() => {
    openHandles = [];
    // Observe every connection the module opens so the test can close them.
    const originalOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = function open(name, ...rest) {
      const request = originalOpen(name, ...rest);
      request.addEventListener('success', () => {
        if (request.result?.name === DB_NAME) openHandles.push(request.result);
      });
      return request;
    };
  });

  afterEach(async () => {
    indexedDB.deleteDatabase?.(DB_NAME);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('persists through a fresh connection after the cached one is closed', async () => {
    const storage = new MediaStorage();
    await storage.set('media-a', 'volume', 0.5);
    await storage.flush();
    expect((await readDirect('media-a')).volume).toBe(0.5);

    // Simulate the reset path: close the handle the module is caching.
    expect(openHandles.length).toBeGreaterThanOrEqual(1);
    for (const db of openHandles) {
      try { db.close(); } catch { /* already closed */ }
    }

    // Without recovery this throws InvalidStateError and nothing is written.
    await storage.set('media-a', 'volume', 0.25);
    await storage.flush();

    // Read through a connection that has never been cached, so the assertion
    // reflects what is actually in the database rather than the live cache.
    const persisted = await readDirect('media-a');
    expect(persisted.volume).toBe(0.25);
  });
});
