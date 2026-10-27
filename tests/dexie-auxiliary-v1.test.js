import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getTemplate, updateTemplate, closeTemplateStore,
} from '../src/features/noteTemplates.js';
import { WaveformScrubber, closeWaveformCache } from '../src/features/waveformScrubber.js';

function seedNativeV1(dbName, storeName, records) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName, { keyPath: 'id' });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(storeName, 'readwrite');
      for (const record of records) tx.objectStore(storeName).put(record);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}

function readNative(dbName, storeName, key) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const read = store.get(key);
      read.onerror = () => { db.close(); reject(read.error); };
      read.onsuccess = () => {
        const result = {
          version: db.version, stores: [...db.objectStoreNames],
          keyPath: store.keyPath, indexes: [...store.indexNames], record: read.result ?? null,
        };
        db.close();
        resolve(result);
      };
    };
  });
}

function deleteDatabase(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(name + ' still has an open connection'));
  });
}

describe('Dexie compatibility for isolated native IndexedDB v1 stores', () => {
  afterEach(async () => {
    closeTemplateStore();
    closeWaveformCache();
    vi.restoreAllMocks();
    await deleteDatabase('opencoursedeck-templates');
    await deleteDatabase('opencoursedeck-waveforms');
  });

  it('reads and atomically updates existing user note templates without a schema rewrite', async () => {
    await seedNativeV1('opencoursedeck-templates', 'noteTemplates', [
      { id: 'user-legacy', title: 'Original', content: '<h2>Existing</h2>', builtin: false },
      { id: 'user-other', title: 'Keep me', content: '<p>Other</p>', builtin: false },
    ]);
    const original = await getTemplate('user-legacy');
    expect(original.content).toBe('<h2>Existing</h2>');
    const updated = await updateTemplate('user-legacy', { title: 'Updated' });
    expect(updated.title).toBe('Updated');
    closeTemplateStore();
    const current = await readNative('opencoursedeck-templates', 'noteTemplates', 'user-legacy');
    const other = await readNative('opencoursedeck-templates', 'noteTemplates', 'user-other');
    expect(current).toMatchObject({
      version: 1, stores: ['noteTemplates'], keyPath: 'id', indexes: [],
      record: { id: 'user-legacy', title: 'Updated', content: '<h2>Existing</h2>' },
    });
    expect(other.record.title).toBe('Keep me');
  });

  it('reuses a legacy cached waveform without downloading media or changing native v1', async () => {
    await seedNativeV1('opencoursedeck-waveforms', 'waveforms', [
      { id: 'saved-wave', data: [0.2, 0.6, 1.0] },
    ]);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('Cached media must not trigger a download');
    });
    const canvas = document.createElement('canvas');
    const draw = { setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn() };
    canvas.getContext = vi.fn(() => draw);
    canvas.getBoundingClientRect = vi.fn(() => ({ width: 300, height: 40 }));
    const scrubber = new WaveformScrubber();
    await scrubber.render(canvas, 'https://example.org/audio.mp3', { cacheId: 'saved-wave' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(draw.fillRect).toHaveBeenCalledTimes(3);
    scrubber.destroy();
    closeWaveformCache();
    const raw = await readNative('opencoursedeck-waveforms', 'waveforms', 'saved-wave');
    expect(raw).toEqual({
      version: 1, stores: ['waveforms'], keyPath: 'id', indexes: [],
      record: { id: 'saved-wave', data: [0.2, 0.6, 1] },
    });
  });
});
