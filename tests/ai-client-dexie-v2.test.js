import { describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { createAIClient } from '../src/features/aiClient.js';

const DB = 'opencoursedeck-ai-models';

function seedNative(factory, version, rows, withEmbeddings = version >= 2) {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB, version);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('models')) db.createObjectStore('models', { keyPath: 'id' });
      if (withEmbeddings && !db.objectStoreNames.contains('embeddings')) {
        db.createObjectStore('embeddings', { keyPath: 'id' });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const stores = withEmbeddings ? ['models', 'embeddings'] : ['models'];
      const tx = db.transaction(stores, 'readwrite');
      for (const row of rows.models || []) tx.objectStore('models').put(row);
      for (const row of rows.embeddings || []) tx.objectStore('embeddings').put(row);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}

function inspectNative(factory, id) {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(['models', 'embeddings'], 'readonly');
      const modelStore = tx.objectStore('models');
      const embeddingStore = tx.objectStore('embeddings');
      const schema = {
        version: db.version,
        stores: [...db.objectStoreNames],
        modelsKey: modelStore.keyPath,
        embeddingsKey: embeddingStore.keyPath,
        modelsIndexes: [...modelStore.indexNames],
        embeddingsIndexes: [...embeddingStore.indexNames],
      };
      const requestModel = modelStore.get(id);
      requestModel.onsuccess = () => { db.close(); resolve({ schema, model: requestModel.result ?? null }); };
      requestModel.onerror = () => { db.close(); reject(requestModel.error); };
    };
  });
}

describe('Dexie AI model and local embedding v2 compatibility', () => {
  const settings = { getSetting: vi.fn(async () => ({ mode: 'local-gemma' })) };

  it('reads native v2 model bytes and existing lexical embeddings without schema rewriting', async () => {
    const factory = new IDBFactory();
    const model = {
      id: 'active-local-model', name: 'existing.task', size: 5,
      blob: new Blob(['hello']), type: 'application/octet-stream', importedAt: 1234,
    };
    await seedNative(factory, 2, {
      models: [model],
      embeddings: [{
        id: 'legacy-note', textPreview: 'retrieval practice builds memory',
        tokens: ['retrieval', 'practice', 'builds', 'memory'], provider: 'local-lexical-v3',
        metadata: { kind: 'note' }, updatedAt: 10,
      }],
    });
    const root = { indexedDB: factory, IDBKeyRange, DB: settings, sessionStorage };
    const client = createAIClient(root);
    expect(await client.getLocalModelFile()).toMatchObject({ name: 'existing.task', size: 5 });
    const matching = await client.searchEmbeddings('retrieval practice');
    expect(matching[0]).toMatchObject({ id: 'legacy-note', metadata: { kind: 'note' } });
    expect((await inspectNative(factory, model.id)).schema).toEqual({
      version: 2, stores: ['embeddings', 'models'], modelsKey: 'id',
      embeddingsKey: 'id', modelsIndexes: [], embeddingsIndexes: [],
    });
    expect((await inspectNative(factory, model.id)).model.name).toBe('existing.task');
  });

  it('upgrades a raw native v1 model store to v2 without discarding saved model bytes', async () => {
    const factory = new IDBFactory();
    await seedNative(factory, 1, {
      models: [{ id: 'active-local-model', name: 'older.task', size: 4, blob: new Blob(['data']) }],
    }, false);
    const client = createAIClient({ indexedDB: factory, IDBKeyRange, DB: settings, sessionStorage });
    await client.upsertEmbedding({ id: 'study', text: 'spaced recall', metadata: { type: 'note' } });
    expect((await client.getLocalModelFile()).name).toBe('older.task');
    expect((await inspectNative(factory, 'active-local-model')).schema.version).toBe(2);
    expect((await client.searchEmbeddings('spaced recall')).map(item => item.id)).toContain('study');
  });

  it('commits model and embedding clears without changing the other database store', async () => {
    const factory = new IDBFactory();
    const client = createAIClient({ indexedDB: factory, IDBKeyRange, DB: settings, sessionStorage });
    const original = new File(['local-model-contents'], 'offline.task', {
      type: 'application/octet-stream', lastModified: 123,
    });
    await client.importLocalModelFile(original);
    await client.upsertEmbedding({ id: 'note-1', text: 'respiratory physiology' });
    await client.clearEmbeddings();
    expect(await client.searchEmbeddings('respiratory')).toEqual([]);
    expect((await client.getLocalModelFile()).name).toBe('offline.task');
    await client.clearLocalModelFile();
    expect(await client.getLocalModelFile()).toBeUndefined();
    expect((await inspectNative(factory, 'active-local-model')).schema.version).toBe(2);
  });
});
