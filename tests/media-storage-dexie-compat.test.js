import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MediaStorage } from '../src/features/mediaStorage.js';

const DB_NAME = 'opencoursedeck-media';

function seedLegacyDatabase(version, records) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, version);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('mediaState')) {
        db.createObjectStore('mediaState', { keyPath: 'mediaId' });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('mediaState', 'readwrite');
      for (const record of records) tx.objectStore('mediaState').put(record);
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.oncomplete = () => { db.close(); resolve(); };
    };
  });
}

function readNativeDatabase(mediaId) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('mediaState', 'readonly');
      const store = tx.objectStore('mediaState');
      const schema = {
        version: db.version,
        stores: [...db.objectStoreNames],
        keyPath: store.keyPath,
        indexes: [...store.indexNames],
      };
      const get = store.get(mediaId);
      get.onerror = () => { db.close(); reject(get.error); };
      get.onsuccess = () => { db.close(); resolve({ schema, record: get.result ?? null }); };
    };
  });
}

describe('MediaStorage legacy IndexedDB compatibility', () => {
  let openHandles;
  let nativeOpen;

  beforeEach(() => {
    openHandles = [];
    nativeOpen = indexedDB.open;
    indexedDB.open = function (...args) {
      const request = nativeOpen.apply(this, args);
      request.addEventListener('success', () => {
        if (request.result?.name === DB_NAME) openHandles.push(request.result);
      });
      return request;
    };
  });

  afterEach(async () => {
    for (const db of openHandles) { try { db.close(); } catch {} }
    indexedDB.open = nativeOpen;
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('MediaStorage left a database connection open'));
    });
  });

  it('reads raw v3 player settings and writes through the original mediaState key without changing the schema', async () => {
    await seedLegacyDatabase(3, [
      { mediaId: 'video-legacy', volume: 0.42, muted: true, time: 61, rate: 1.5, quality: '720p', lang: 'fa', captions: true },
      { mediaId: 'audio-other', volume: 0.25, time: 17, rate: 1 },
    ]);

    const storage = new MediaStorage();
    expect(await storage.get('video-legacy')).toEqual({
      volume: 0.42, muted: true, time: 61, rate: 1.5, quality: '720p', lang: 'fa', captions: true,
    });
    expect((await storage.set('video-legacy', 'time', 82)).committed).toBe(true);
    expect((await storage.flush()).committed).toBe(true);
    await storage.destroy();

    const changed = await readNativeDatabase('video-legacy');
    const untouched = await readNativeDatabase('audio-other');
    expect(changed.schema).toEqual({ version: 3, stores: ['mediaState'], keyPath: 'mediaId', indexes: [] });
    expect(changed.record).toMatchObject({ mediaId: 'video-legacy', time: 82, volume: 0.42, lang: 'fa', captions: true });
    expect(untouched.record).toMatchObject({ mediaId: 'audio-other', volume: 0.25, time: 17 });
  });

  it('accepts an earlier raw v1 database and upgrades only the native version, retaining existing media', async () => {
    await seedLegacyDatabase(1, [{ mediaId: 'v1-lesson', time: 19, volume: 0.6, rate: 1.25 }]);
    const storage = new MediaStorage();
    expect(await storage.get('v1-lesson')).toMatchObject({ time: 19, volume: 0.6, rate: 1.25 });
    await storage.set('v1-lesson', 'rate', 1.75);
    expect((await storage.flush()).committed).toBe(true);
    await storage.destroy();
    const { schema, record } = await readNativeDatabase('v1-lesson');
    expect(schema).toEqual({ version: 3, stores: ['mediaState'], keyPath: 'mediaId', indexes: [] });
    expect(record.rate).toBe(1.75);
  });
});
