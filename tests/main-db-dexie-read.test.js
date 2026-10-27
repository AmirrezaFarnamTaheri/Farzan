import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { OpenCourseDB } from '../db.js';
import { withExistingIndexedDBStore } from '../src/core/mainDbDexieRead.js';

const NAME = 'farzan-native-primary-compat-test';
const SCHEMA = [
  { name: 'notes', key: 'id', autoIncrement: false, indexes: [{ field: 'courseId' }, { field: 'updatedAt' }] },
  { name: 'progress', key: 'topicId', autoIncrement: false, indexes: [{ field: 'courseId' }] },
  { name: 'settings', key: 'key', autoIncrement: false },
];
let connections = [];

function inspectRaw() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('notes');
      const store = tx.objectStore('notes');
      const schema = {
        version: db.version,
        stores: [...db.objectStoreNames],
        keyPath: store.keyPath,
        autoIncrement: store.autoIncrement,
        indexes: [...store.indexNames],
      };
      const request = store.get('note-1');
      request.onsuccess = () => { db.close(); resolve({ schema, value: request.result }); };
      request.onerror = () => { db.close(); reject(request.error); };
    };
  });
}

describe('Dexie read-only adapter for existing primary IndexedDB v3', () => {
  afterEach(async () => {
    for (const db of connections) { try { db.db?.close(); } catch {} }
    connections = [];
    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('A read adapter leaked an IndexedDB handle'));
    });
  });

  it('reads existing IndexedDB v3 notes and course index without rewriting the schema', async () => {
    const db = new OpenCourseDB(NAME, 3, SCHEMA);
    connections.push(db);
    await db.put('notes', { id: 'note-1', courseId: 'medicine', updatedAt: 100, content: '<p>Heart 你好</p>' });
    await db.put('notes', { id: 'note-2', courseId: 'biology', updatedAt: 200, content: 'Cell' });

    const existing = await db.open();
    expect((await withExistingIndexedDBStore(existing, 'notes', t => t.get('note-1'))).content)
      .toContain('Heart 你好');
    expect((await withExistingIndexedDBStore(existing, 'notes',
      t => t.where('courseId').equals('medicine').toArray())).map(n => n.id)).toEqual(['note-1']);

    const live = await inspectRaw();
    expect(live.schema).toEqual({
      version: 3, stores: ['notes', 'progress', 'settings'],
      keyPath: 'id', autoIncrement: false, indexes: ['courseId', 'updatedAt'],
    });
    expect(live.value.content).toBe('<p>Heart 你好</p>');
  });

  it('preserves encrypted envelopes and existing plaintext-index metadata', async () => {
    const db = new OpenCourseDB(NAME, 3, SCHEMA);
    connections.push(db);
    db.setPassphrase('secret');
    await db.put('notes', { id: 'note-1', courseId: 'medicine', updatedAt: 123, content: 'Confidential' });
    const native = await db.open();
    const raw = await withExistingIndexedDBStore(native, 'notes', t =>
      t.where('courseId').equals('medicine').first());
    expect(raw.__encrypted).toBe(true);
    expect(raw.content).toBeUndefined();
    expect(raw.courseId).toBe('medicine');
    expect(await db.getAllByIndex('notes', 'courseId', 'medicine')).toEqual([
      { id: 'note-1', courseId: 'medicine', updatedAt: 123, content: 'Confidential' },
    ]);
    db.setPassphrase(null);
    await expect(db.getAllByIndex('notes', 'courseId', 'medicine')).rejects.toThrow(/passphrase/i);
  });

  it('reads individual records, full stores and counts through Dexie without changing encrypted records', async () => {
    const db = new OpenCourseDB(NAME, 3, SCHEMA);
    connections.push(db);
    db.setPassphrase('sensitive-data');
    await db.put('notes', { id: 'note-1', courseId: 'medicine', updatedAt: 200, content: '<p>علاج 你好</p>' });
    await db.put('notes', { id: 'note-2', courseId: 'biology', updatedAt: 300, content: 'Cell biology' });

    expect(await db.get('notes', 'note-1')).toEqual({
      id: 'note-1', courseId: 'medicine', updatedAt: 200, content: '<p>علاج 你好</p>',
    });
    expect(await db.get('notes', 'absent')).toBeUndefined();
    expect((await db.getAll('notes')).map(x => x.id).sort()).toEqual(['note-1', 'note-2']);
    expect(await db.count('notes')).toBe(2);
    expect((await inspectRaw()).value.__encrypted).toBe(true);
    expect((await inspectRaw()).schema.version).toBe(3);
    db.setPassphrase(null);
    await expect(db.get('notes', 'note-1')).rejects.toThrow(/passphrase/i);
    await expect(db.getAll('notes')).rejects.toThrow(/passphrase/i);
  });

  it('reads an empty store and zero count without starting a schema migration', async () => {
    const db = new OpenCourseDB(NAME, 3, SCHEMA);
    connections.push(db);
    expect(await db.getAll('notes')).toEqual([]);
    expect(await db.get('notes', 'unknown')).toBeUndefined();
    expect(await db.count('notes')).toBe(0);
    expect((await inspectRaw()).schema.version).toBe(3);
  });

  it('retains failure behavior for a missing index and leaves the database usable', async () => {
    const db = new OpenCourseDB(NAME, 3, SCHEMA);
    connections.push(db);
    await db.put('notes', { id: 'note-1', courseId: 'medicine', content: 'Saved' });
    const native = await db.open();
    await expect(withExistingIndexedDBStore(native, 'notes',
      t => t.where('unknown-index').equals('medicine').toArray())).rejects.toThrow();
    expect(await db.get('notes', 'note-1')).toMatchObject({ content: 'Saved' });
  });

  it('does not open missing database names or accidentally create schemas', async () => {
    const db = new OpenCourseDB(NAME, 3, SCHEMA);
    connections.push(db);
    await expect(withExistingIndexedDBStore(null, 'notes', t => t.toArray())).rejects.toThrow(/existing/i);
    const native = await db.open();
    expect((await withExistingIndexedDBStore(native, 'progress', t => t.count()))).toBe(0);
    expect((await inspectRaw()).schema.version).toBe(3);
  });
});
