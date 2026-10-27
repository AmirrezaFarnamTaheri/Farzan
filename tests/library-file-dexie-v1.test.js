import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

const DB_NAME = 'opencoursedeck-library-files';
const STORE = 'files';

function seedNativeV1(dbFactory, records) {
  return new Promise((resolve, reject) => {
    const req = dbFactory.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(STORE, 'readwrite');
      for (const row of records) tx.objectStore(STORE).put(row);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}

function readNative(dbFactory, id) {
  return new Promise((resolve, reject) => {
    const req = dbFactory.open(DB_NAME);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const get = store.get(id);
      const schema = {
        version: db.version,
        stores: [...db.objectStoreNames],
        keyPath: store.keyPath,
        indexes: [...store.indexNames],
      };
      get.onsuccess = () => { db.close(); resolve({ schema, record: get.result ?? null }); };
      get.onerror = () => { db.close(); reject(get.error); };
    };
  });
}

describe('Dexie media-library native v1 compatibility', () => {
  let factory, library, originalCreateObjectURL;

  beforeEach(async () => {
    vi.resetModules();
    factory = new IDBFactory();
    vi.stubGlobal('indexedDB', factory);
    vi.stubGlobal('IDBKeyRange', IDBKeyRange);
    originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:legacy-library-record');
    URL.revokeObjectURL = vi.fn();
    window.OpenCourseDeck = { bus: { emit: vi.fn() } };
    library = await import('../src/features/userLibrary.js');
  });

  afterEach(async () => {
    await library.clearLibraryFiles();
    URL.createObjectURL = originalCreateObjectURL;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reads a native v1 Blob record by its stable library-file identity', async () => {
    const original = {
      id: 'legacy-lecture', name: 'study.mp4', kind: 'video',
      type: 'video/mp4', size: 5, createdAt: 1700,
      blob: new Blob(['video'], { type: 'video/mp4' }),
    };
    await seedNativeV1(factory, [original]);

    expect(await library.resolveMediaUrl('library-file:legacy-lecture'))
      .toBe('blob:legacy-library-record');
    const current = await readNative(factory, 'legacy-lecture');
    expect(current.schema).toEqual({
      version: 1, stores: ['files'], keyPath: 'id', indexes: [],
    });
    expect(current.record).toMatchObject({
      id: 'legacy-lecture', name: 'study.mp4',
      kind: 'video', type: 'video/mp4', size: 5,
    });
  });

  it('commits new file records without rewriting the native-v1 store or changing Blob identity', async () => {
    const file = new File(['PDF-DATA'], 'notes.pdf', { type: 'application/pdf' });
    const imported = await library.putLibraryFile(file, { kind: 'pdf' });
    expect(imported.ref).toBe('library-file:' + imported.id);
    const saved = await readNative(factory, imported.id);
    expect(saved.schema).toEqual({
      version: 1, stores: ['files'], keyPath: 'id', indexes: [],
    });
    expect(saved.record).toMatchObject({
      id: imported.id, name: 'notes.pdf', kind: 'pdf',
      size: file.size, type: 'application/pdf',
    });
    expect(saved.record.blob).toBeTruthy();
  });

  it('fully clears the native store and invalidates blob URLs after reset', async () => {
    await seedNativeV1(factory, [
      { id: 'legacy-one', blob: new Blob(['first']), size: 5 },
      { id: 'legacy-two', blob: new Blob(['second']), size: 6 },
    ]);
    await library.resolveMediaUrl('library-file:legacy-one');
    expect(await library.clearLibraryFiles()).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:legacy-library-record');
    expect((await readNative(factory, 'legacy-one')).record).toBeNull();
    expect((await readNative(factory, 'legacy-two')).record).toBeNull();
    expect(await library.resolveMediaUrl('library-file:legacy-one')).toBe('');
  });
});
