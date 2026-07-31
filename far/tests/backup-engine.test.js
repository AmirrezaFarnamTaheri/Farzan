import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { installBackupEngine } from '../src/core/backupEngine.js';
import { AI_BINDING_KEY, AI_SESSION_KEY, AI_SETTINGS_KEY } from '../src/core/aiAuthority.js';

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

function createStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function rootWithFacade(sessionEntries) {
  return {
    indexedDB,
    DB: {},
    OpenCourseDeck: { bus: { emit() {} } },
    sessionStorage: createStorage(sessionEntries),
  };
}

async function putSetting(value) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('opencoursedeck', 3);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put({ key: AI_SETTINGS_KEY, value });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
}

describe('atomic backup engine', () => {
  beforeEach(async () => {
    const db = await createDatabase();
    db.close();
  });

  it('exports all primary stores from one portable snapshot', async () => {
    const root = rootWithFacade();
    installBackupEngine(root);
    const snapshot = await root.DB.exportBackup();

    expect(snapshot._meta.format).toBe('opencoursedeck-snapshot');
    expect(snapshot._meta.version).toBe(3);
    expect(snapshot._meta.portableAuthority).toBe(false);
    expect(Object.keys(snapshot._meta.stores).sort()).toEqual(schema.map(([name]) => name).sort());
  });

  it('removes endpoint approval and credential authority from exported settings', async () => {
    await putSetting({
      mode: 'custom-api',
      model: 'private-model',
      endpoint: 'https://api.example.test/v1/chat',
      apiKey: 'must-not-export',
      approvedEndpointOrigin: 'https://api.example.test',
      authorityRevision: 7,
      authorityTransactionId: 'ai-auth-live',
      hasKey: true,
    });
    const root = rootWithFacade({
      [AI_SESSION_KEY]: 'session-secret',
      [AI_BINDING_KEY]: '{"version":1}',
    });
    installBackupEngine(root);

    const snapshot = await root.DB.exportBackup();
    const exported = snapshot.settings.find(record => record.key === AI_SETTINGS_KEY)?.value;

    expect(exported).toMatchObject({
      mode: 'custom-api',
      model: 'private-model',
      endpoint: 'https://api.example.test/v1/chat',
      approvedEndpointOrigin: '',
      authorityRevision: 0,
      authorityTransactionId: '',
      hasKey: false,
    });
    expect(exported).not.toHaveProperty('apiKey');
  });

  it('invalidates live session authority only after a successful import commit', async () => {
    const root = rootWithFacade({
      [AI_SESSION_KEY]: 'session-secret',
      [AI_BINDING_KEY]: '{"version":1}',
    });
    installBackupEngine(root);

    const receipt = await root.DB.importBackup({
      settings: [{
        key: AI_SETTINGS_KEY,
        value: {
          mode: 'custom-api',
          endpoint: 'https://restored.example.test/v1/chat',
          approvedEndpointOrigin: 'https://restored.example.test',
          authorityRevision: 99,
          authorityTransactionId: 'restored-authority',
          hasKey: true,
        },
      }],
    }, { mode: 'merge' });

    expect(receipt).toMatchObject({ committed: true, aiAuthorityInvalidated: true });
    expect(root.sessionStorage.getItem(AI_SESSION_KEY)).toBeNull();
    expect(root.sessionStorage.getItem(AI_BINDING_KEY)).toBeNull();

    const snapshot = await root.DB.exportBackup();
    expect(snapshot.settings[0].value).toMatchObject({
      approvedEndpointOrigin: '',
      authorityRevision: 0,
      authorityTransactionId: '',
      hasKey: false,
    });
  });


  it('returns a committed-degraded receipt when post-commit authority invalidation fails', async () => {
    const root = rootWithFacade({
      [AI_SESSION_KEY]: 'session-secret',
      [AI_BINDING_KEY]: '{"version":1}',
    });
    const originalRemove = root.sessionStorage.removeItem.bind(root.sessionStorage);
    root.sessionStorage.removeItem = (key) => {
      if (key === AI_BINDING_KEY) throw new Error('storage denied');
      return originalRemove(key);
    };
    installBackupEngine(root);

    const receipt = await root.DB.importBackup({ notes: [{ id: 'committed-note', title: 'Committed' }] });
    const snapshot = await root.DB.exportBackup();

    expect(receipt).toMatchObject({
      committed: true,
      durable: true,
      degraded: true,
      status: 'committed-degraded',
      retrySafe: false,
      aiAuthorityInvalidated: false,
    });
    expect(receipt.warnings).toEqual([
      expect.objectContaining({ code: 'AI_AUTHORITY_INVALIDATION_INCOMPLETE' }),
    ]);
    expect(snapshot.notes).toEqual([expect.objectContaining({ id: 'committed-note' })]);
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
