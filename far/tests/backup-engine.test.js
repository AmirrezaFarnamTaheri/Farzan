import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { installBackupEngine } from '../src/core/backupEngine.js';

const schema = [
  ['progress', 'topicId'],
  ['timestamps', 'id'],
  ['notes', 'id'],
  ['folders', 'id'],
  ['settings', 'key'],
  ['annotations', 'id'],
  ['watchedSegments', 'id'],
  ['pdfBookmarks', 'id'],
];

async function createDatabase() {
  await new Promise((resolve, reject) => {
    const drop = indexedDB.deleteDatabase('opencoursedeck');
    drop.onsuccess = resolve;
    drop.onerror = () => reject(drop.error);
  });
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('opencoursedeck', 3);
    request.onupgradeneeded = () => {
      for (const [name, keyPath] of schema) request.result.createObjectStore(name, { keyPath });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function rootWithFacade() {
  return { indexedDB, DB: {}, OpenCourseDeck: {} };
}

describe('atomic backup engine', () => {
  beforeEach(async () => {
    const db = await createDatabase();
    db.close();
  });

  it('exports all primary stores from one snapshot', async () => {
    const root = rootWithFacade();
    installBackupEngine(root);
    const snapshot = await root.DB.exportBackup();

    expect(snapshot._meta.format).toBe('opencoursedeck-snapshot');
    expect(snapshot._meta.version).toBe(2);
    expect(Object.keys(snapshot._meta.stores).sort()).toEqual(schema.map(([name]) => name).sort());
  });

  it('treats an included empty store as an overwrite-to-empty command', async () => {
    const seed = await new Promise((resolve, reject) => {
      const request = indexedDB.open('opencoursedeck', 3);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = seed.transaction('notes', 'readwrite');
      tx.objectStore('notes').put({ id: 'existing', title: 'old' });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    seed.close();

    const root = rootWithFacade();
    installBackupEngine(root);
    const receipt = await root.DB.importBackup({ notes: [] }, { mode: 'overwrite' });
    const snapshot = await root.DB.exportBackup();

    expect(receipt.committed).toBe(true);
    expect(receipt.stores.notes).toBe(0);
    expect(snapshot.notes).toEqual([]);
  });

  it('rejects unknown stores before mutating live data', async () => {
    const root = rootWithFacade();
    installBackupEngine(root);
    await expect(root.DB.importBackup({ secrets: [] }, { mode: 'overwrite' }))
      .rejects.toThrow('unknown stores');
  });
});
