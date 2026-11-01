import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import DBExports from '../db.js';

describe('OpenCourseDB helper (formerly PlasmaDB)', () => {
  beforeEach(async () => {
    await indexedDB.deleteDatabase('plasma-test-db');
  });

  it('rejects failed bulk transactions instead of hanging', async () => {
    const { OpenCourseDB: PlasmaDB } = DBExports;
    const db = new PlasmaDB('plasma-test-db', 1, [
      { name: 'items', key: 'id', autoIncrement: false },
    ]);

    await expect(db.bulkAdd('items', [{ id: 'a' }, { id: 'a' }])).rejects.toBeTruthy();
  });

  it.each(['bulkAdd', 'bulkPut'])('%s aborts earlier queued writes if a later key is invalid', async (method) => {
    const { OpenCourseDB } = DBExports;
    const db = new OpenCourseDB('plasma-test-db', 1, [
      { name: 'items', key: 'id', autoIncrement: false },
    ]);
    await expect(db[method]('items', [
      { id: 'would-be-partial', value: 'do not commit' },
      { value: 'missing primary key' },
    ])).rejects.toBeTruthy();
    // Inspect canonical persisted state after the failed mutation.
    expect(await db.getAll('items')).toEqual([]);
    db.db?.close();
  });

  it('bulkPutWithCheckpoint aborts data writes if the checkpoint key is invalid', async () => {
    const { OpenCourseDB } = DBExports;
    const db = new OpenCourseDB('plasma-test-db', 1, [
      { name: 'items', key: 'id', autoIncrement: false },
      { name: 'settings', key: 'key', autoIncrement: false },
    ]);
    await expect(db.bulkPutWithCheckpoint('items', [
      { id: 'would-be-partial', value: 1 },
    ], { value: 'missing setting key' })).rejects.toBeTruthy();
    expect(await db.getAll('items')).toEqual([]);
    expect(await db.getAll('settings')).toEqual([]);
    db.db?.close();
  });

  it('can read records by an IndexedDB index', async () => {
    const { OpenCourseDB: PlasmaDB } = DBExports;
    const db = new PlasmaDB('plasma-test-db', 1, [
      { name: 'items', key: 'id', autoIncrement: false, indexes: [{ field: 'kind' }] },
    ]);

    await db.bulkPut('items', [
      { id: 'a', kind: 'note' },
      { id: 'b', kind: 'task' },
      { id: 'c', kind: 'note' },
    ]);

    const notes = await db.getAllByIndex('items', 'kind', 'note');
    expect(notes.map((item) => item.id).sort()).toEqual(['a', 'c']);
  });

  it('returns only after a single-record write is durably readable', async () => {
    const { OpenCourseDB: PlasmaDB } = DBExports;
    const db = new PlasmaDB('plasma-test-db', 1, [
      { name: 'items', key: 'id', autoIncrement: false },
    ]);

    await db.put('items', { id: 'saved', value: 42 });
    db.db.close();
    db.db = null;

    await expect(db.get('items', 'saved')).resolves.toEqual({ id: 'saved', value: 42 });
  });

  it('honors descending cursor direction through both supported call shapes', async () => {
    const { OpenCourseDB: PlasmaDB } = DBExports;
    const db = new PlasmaDB('plasma-test-db', 1, [
      { name: 'items', key: 'id', autoIncrement: false, indexes: [{ field: 'updatedAt' }] },
    ]);
    await db.bulkPut('items', [
      { id: 'old', updatedAt: 10 },
      { id: 'middle', updatedAt: 20 },
      { id: 'new', updatedAt: 30 },
    ]);

    const objectShape = await db.queryIndex('items', 'updatedAt', null, { limit: 2, direction: 'prev' });
    const legacyShape = await db.queryIndex('items', 'updatedAt', null, 2, { direction: 'prev' });

    expect(objectShape.map(item => item.id)).toEqual(['new', 'middle']);
    expect(legacyShape.map(item => item.id)).toEqual(['new', 'middle']);
  });

  it('encrypts and decrypts payloads using AES-256-GCM passphrase derivation', async () => {
    const { OpenCourseDB: PlasmaDB } = DBExports;
    const db = new PlasmaDB('plasma-test-db-crypto', 1, []);
    db.setPassphrase('secret-study-key');

    const originalData = { title: 'Confidential Study Note', body: 'Sensitive research payload' };
    const encrypted = await db.encryptPayload(originalData);

    expect(encrypted.__encrypted).toBe(true);
    expect(encrypted.ciphertext).toBeDefined();

    const decrypted = await db.decryptPayload(encrypted);
    expect(decrypted).toEqual(originalData);
  });

  it('writes v2 envelopes with a random per-database salt and hardened KDF', async () => {
    const { OpenCourseDB } = DBExports;
    const db = new OpenCourseDB('ocd-test-db-kdf', 1, []);
    db.setPassphrase('secret-study-key');
    const a = await db.encryptPayload({ n: 1 });
    const b = await db.encryptPayload({ n: 2 });
    expect(a.v).toBe(2);
    expect(a.iterations).toBe(600000);
    expect(Array.isArray(a.salt)).toBe(true);
    expect(a.salt.length).toBe(16);
    // Each payload gets its own salt and IV.
    expect(a.salt).not.toEqual(b.salt);
    expect(a.iv).not.toEqual(b.iv);
  });

  it('rejects unpublished unversioned AES envelopes before key derivation', async () => {
    const { OpenCourseDB } = DBExports;
    const db = new OpenCourseDB('ocd-test-db-unversioned', 1, []);
    db.setPassphrase('private-passphrase');
    const derive = vi.spyOn(db, '_deriveKey');
    const historical = {
      __encrypted: true,
      iv: Array(12).fill(1),
      ciphertext: Array(32).fill(2),
    };
    await expect(db.decryptPayload(historical)).rejects.toThrow(/version/i);
    expect(derive).not.toHaveBeenCalled();
    derive.mockRestore();
  });

  it('refuses encrypted reads with missing or incorrect passphrases', async () => {
    const { OpenCourseDB } = DBExports;
    const db = new OpenCourseDB('ocd-test-db-missing-key', 1, [
      { name: 'notes', key: 'id', autoIncrement: false },
    ]);
    db.setPassphrase('correct-passphrase');
    await db.put('notes', { id: 'secret', text: 'Research notes' });
    db.setPassphrase(null);
    await expect(db.get('notes', 'secret')).rejects.toThrow(/passphrase/i);
    db.setPassphrase('wrong-passphrase');
    await expect(db.getAll('notes')).rejects.toThrow();
    db.db?.close();
  });

  it('never silently stores plaintext when Web Crypto is unavailable', async () => {
    const { OpenCourseDB } = DBExports;
    const db = new OpenCourseDB('ocd-test-db-no-crypto', 1, [
      { name: 'notes', key: 'id', autoIncrement: false },
    ]);
    db.setPassphrase('private');
    db._getCrypto = () => null;
    await expect(db.put('notes', { id: 'unprotected', text: 'secret' }))
      .rejects.toThrow(/Web Crypto/);
    expect(await db.get('notes', 'unprotected')).toBeUndefined();
    db.db?.close();
  });

  it('bounds KDF work on malicious or corrupt imported envelopes', async () => {
    const { OpenCourseDB } = DBExports;
    const db = new OpenCourseDB('ocd-test-db-kdf-validation');
    db.setPassphrase('private');
    await expect(db.decryptPayload({
      __encrypted: true, v: 2, iv: Array(12).fill(1), salt: Array(16).fill(1),
      iterations: 999999999, ciphertext: [1],
    })).rejects.toThrow(/parameters/);
    await expect(db.decryptPayload({
      __encrypted: true, v: 99, iv: Array(12).fill(1), ciphertext: [1],
    })).rejects.toThrow(/version/);
  });

  it('encrypts put/get write paths while keeping IndexedDB indexes queryable', async () => {
    await indexedDB.deleteDatabase('ocd-test-db-write-crypto');
    const { OpenCourseDB } = DBExports;
    const db = new OpenCourseDB('ocd-test-db-write-crypto', 1, [
      { name: 'progress', key: 'topicId', autoIncrement: false, indexes: [{ field: 'courseId' }] },
    ]);
    db.setPassphrase('secret-study-key');

    await db.put('progress', { topicId: 'topic-1', courseId: 'course-a', percent: 40, notes: 'private' });
    await db.put('progress', { topicId: 'topic-2', courseId: 'course-a', percent: 80, notes: 'also private' });
    await db.put('progress', { topicId: 'topic-3', courseId: 'course-b', percent: 10, notes: 'other' });

    const raw = await new Promise((resolve, reject) => {
      const req = indexedDB.open('ocd-test-db-write-crypto', 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const tx = req.result.transaction('progress', 'readonly');
        const getReq = tx.objectStore('progress').get('topic-1');
        getReq.onsuccess = () => {
          const value = getReq.result;
          req.result.close();
          resolve(value);
        };
        getReq.onerror = () => reject(getReq.error);
      };
    });
    expect(raw.__encrypted).toBe(true);
    expect(raw.topicId).toBe('topic-1');
    expect(raw.courseId).toBe('course-a');
    expect(raw.notes).toBeUndefined();
    expect(raw.ciphertext).toBeDefined();

    await expect(db.get('progress', 'topic-1')).resolves.toEqual(expect.objectContaining({
      topicId: 'topic-1',
      courseId: 'course-a',
      notes: 'private',
    }));
    const byCourse = await db.getAllByIndex('progress', 'courseId', 'course-a');
    expect(byCourse.map((item) => item.topicId).sort()).toEqual(['topic-1', 'topic-2']);
    expect(byCourse.every((item) => item.__encrypted !== true)).toBe(true);
  });
});
