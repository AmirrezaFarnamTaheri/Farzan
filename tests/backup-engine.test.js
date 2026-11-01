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
    localStorage: createStorage(),
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

  it('observes completion even when a transaction finishes immediately after its last read', async () => {
    const tx = { oncomplete: null, onerror: null, onabort: null };
    const db = {
      version: 3,
      objectStoreNames: { contains: () => true },
      close() {},
      transaction: () => tx,
    };
    let completedReads = 0;
    tx.objectStore = () => ({
      getAll: () => {
        const request = { result: [] };
        queueMicrotask(() => {
          request.onsuccess?.();
          completedReads++;
          if (completedReads === schema.length) tx.oncomplete?.();
        });
        return request;
      },
    });
    const root = rootWithFacade();
    root.indexedDB = {
      open() {
        const request = { result: db };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      },
    };
    installBackupEngine(root);

    const result = await Promise.race([
      root.DB.exportBackup(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Missed transaction completion')), 200)),
    ]);
    expect(result._meta.stores.notes).toBe(0);
    expect(completedReads).toBe(schema.length);
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

  it('removes canonical PDF local fallback copies only after overwrite commits', async () => {
    const root = rootWithFacade();
    root.localStorage.setItem('ocd_pdf_annotations_by_document', '{"doc-a":[{"id":"one"}]}');
    root.localStorage.setItem('ocd_pdf_annotations_by_page', '{"1":[{"id":"one","docId":"doc-a"}]}');
    installBackupEngine(root);
    const receipt = await root.DB.importBackup({
      annotations: [],
    }, { mode: 'overwrite' });
    expect(receipt).toMatchObject({ committed: true, degraded: false });
    expect(root.localStorage.getItem('ocd_pdf_annotations_by_document')).toBeNull();
    expect(root.localStorage.getItem('ocd_pdf_annotations_by_page')).toBeNull();
  });

  it('does not delete PDF local copies if an overwrite transaction aborts', async () => {
    const root = rootWithFacade();
    root.localStorage.setItem('ocd_pdf_annotations_by_document', '{"doc-a":[{"id":"one"}]}');
    installBackupEngine(root);
    await expect(root.DB.importBackup({
      annotations: [], progress: [{ missingTopicId: true }],
    }, { mode: 'overwrite' })).rejects.toThrow();
    expect(root.localStorage.getItem('ocd_pdf_annotations_by_document')).toContain('one');
  });

  it('reports degraded committed annotation recovery when fallback removal fails', async () => {
    const root = rootWithFacade();
    root.localStorage.setItem('ocd_pdf_annotations_by_document', '{"doc-a":[{"id":"one"}]}');
    root.localStorage.removeItem = () => { throw new Error('storage blocked'); };
    installBackupEngine(root);
    const receipt = await root.DB.importBackup({ annotations: [] }, { mode: 'overwrite' });
    expect(receipt).toMatchObject({ committed: true, degraded: true, aiAuthorityInvalidated: true });
    expect(receipt.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MIRROR_CLEANUP_INCOMPLETE' }),
    ]));
  });

  it('recovers the original same-session AI approval after an atomic rollback without exporting it', async () => {
    const original = {
      mode: 'custom-api', model: 'saved-model',
      endpoint: 'https://api.example.test/v1/chat',
      approvedEndpointOrigin: 'https://api.example.test',
      authorityRevision: 7, authorityTransactionId: 'prior-session',
      hasKey: true,
    };
    await putSetting(original);
    const root = rootWithFacade({
      [AI_SESSION_KEY]: 'original-key',
      [AI_BINDING_KEY]: '{"version":1,"prior":true}',
    });
    installBackupEngine(root);
    const snapshot = await root.DB.exportBackup();
    expect(JSON.stringify(snapshot)).not.toContain('original-key');
    expect(JSON.stringify(snapshot)).not.toContain('prior-session');
    expect(snapshot.settings[0].value.approvedEndpointOrigin).toBe('');

    await root.DB.importBackup({ notes: [{ id: 'temp', title: 'temporary' }] }, { mode: 'merge' });
    expect(root.sessionStorage.getItem(AI_SESSION_KEY)).toBeNull();
    const receipt = await root.DB.importBackup(snapshot, {
      mode: 'overwrite', restoreLocalAuthority: true,
    });
    expect(receipt).toMatchObject({
      committed: true, degraded: false, aiAuthorityInvalidated: false, aiAuthorityRestored: true,
    });
    expect(root.sessionStorage.getItem(AI_SESSION_KEY)).toBe('original-key');
    expect(root.sessionStorage.getItem(AI_BINDING_KEY)).toContain('prior');

    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('opencoursedeck', 3);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const originalSaved = await new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readonly');
      const req = tx.objectStore('settings').get(AI_SETTINGS_KEY);
      req.onsuccess = () => resolve(req.result.value);
      req.onerror = () => reject(req.error);
    });
    db.close();
    expect(originalSaved).toEqual(original);
  });

  it('refuses a trusted-rollback opt-in for untrusted portable JSON', async () => {
    const root = rootWithFacade();
    installBackupEngine(root);
    await expect(root.DB.importBackup({ notes: [] }, {
      mode: 'overwrite', restoreLocalAuthority: true,
    })).rejects.toThrow(/same-session snapshot/);
  });

  it('rejects unknown stores before mutating live data', async () => {
    const root = rootWithFacade();
    installBackupEngine(root);
    await expect(root.DB.importBackup({ secrets: [] }, { mode: 'overwrite' }))
      .rejects.toThrow('unknown stores');
  });
});
