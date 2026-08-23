import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import '../db.js';

describe('OpenCourseDB helper (formerly PlasmaDB)', () => {
  beforeEach(async () => {
    await indexedDB.deleteDatabase('plasma-test-db');
  });

  it('rejects failed bulk transactions instead of hanging', async () => {
    const { OpenCourseDB: PlasmaDB } = window.OpenCourseDeck.DB;
    const db = new PlasmaDB('plasma-test-db', 1, [
      { name: 'items', key: 'id', autoIncrement: false },
    ]);

    await expect(db.bulkAdd('items', [{ id: 'a' }, { id: 'a' }])).rejects.toBeTruthy();
  });

  it('can read records by an IndexedDB index', async () => {
    const { OpenCourseDB: PlasmaDB } = window.OpenCourseDeck.DB;
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
    const { OpenCourseDB: PlasmaDB } = window.OpenCourseDeck.DB;
    const db = new PlasmaDB('plasma-test-db', 1, [
      { name: 'items', key: 'id', autoIncrement: false },
    ]);

    await db.put('items', { id: 'saved', value: 42 });
    db.db.close();
    db.db = null;

    await expect(db.get('items', 'saved')).resolves.toEqual({ id: 'saved', value: 42 });
  });

  it('honors descending cursor direction through both supported call shapes', async () => {
    const { OpenCourseDB: PlasmaDB } = window.OpenCourseDeck.DB;
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
    const { OpenCourseDB: PlasmaDB } = window.OpenCourseDeck.DB;
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
    const { OpenCourseDB } = window.OpenCourseDeck.DB;
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

  it('still decrypts legacy envelopes written before the v2 format', async () => {
    const { OpenCourseDB } = window.OpenCourseDeck.DB;
    const db = new OpenCourseDB('ocd-test-db-legacy', 1, []);
    db.setPassphrase('old-passphrase');

    // Reproduce the pre-v2 envelope: static app salt, 10k iterations, no version field.
    const { webcrypto } = await import('node:crypto');
    const enc = new TextEncoder();
    const baseKey = await webcrypto.subtle.importKey(
      'raw',
      enc.encode('old-passphrase'),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    const key = await webcrypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode('opencoursedeck-salt'), iterations: 10000, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify({ legacy: true })));
    const envelope = {
      __encrypted: true,
      iv: Array.from(iv),
      ciphertext: Array.from(new Uint8Array(ciphertext)),
    };

    const decrypted = await db.decryptPayload(envelope);
    expect(decrypted).toEqual({ legacy: true });
  });});
