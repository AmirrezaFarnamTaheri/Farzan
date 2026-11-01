import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { OpenCourseDB } from '../db.js';

const name = 'farzan-dexie-mutation-compat-v3';
const schema = [
  { name: 'notes', key: 'id', autoIncrement: false, indexes: [{ field: 'courseId' }] },
  { name: 'settings', key: 'key', autoIncrement: false },
];
const opened = [];

async function raw(id) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const store = db.transaction('notes').objectStore('notes');
      const query = store.get(id);
      query.onsuccess = () => {
        const record = query.result;
        const version = db.version;
        const indexes = [...store.indexNames];
        db.close();
        resolve({ record, version, indexes });
      };
      query.onerror = () => { db.close(); reject(query.error); };
    };
  });
}

describe('Dexie primary-database mutations retain native-v3 semantics', () => {
  afterEach(async () => {
    opened.forEach(db => { try { db.db?.close(); } catch {} });
    opened.length = 0;
    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = resolve;
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('A primary Dexie mutation leaked a connection'));
    });
  });

  it('preserves add/put/delete/clear return contracts and native indexes', async () => {
    const db = new OpenCourseDB(name, 3, schema);
    opened.push(db);
    expect(await db.add('notes', { id: 'a', courseId: 'medicine', content: 'First' })).toBe('a');
    expect(await db.put('notes', { id: 'a', courseId: 'medicine', content: 'Revised' })).toBe('a');
    expect((await raw('a')).record.content).toBe('Revised');
    expect((await raw('a')).version).toBe(3);
    expect((await raw('a')).indexes).toEqual(['courseId']);
    expect(await db.delete('notes', 'a')).toBe(true);
    expect(await db.get('notes', 'a')).toBeUndefined();
    expect(await db.put('notes', { id: 'b', content: 'To clear' })).toBe('b');
    expect(await db.clear('notes')).toBe(true);
    expect(await db.count('notes')).toBe(0);
  });

  it.each(['bulkAdd', 'bulkPut'])('%s rolls back all earlier records on invalid later key', async method => {
    const db = new OpenCourseDB(name, 3, schema);
    opened.push(db);
    await db.put('notes', { id: 'previous', content: 'Must remain' });
    await expect(db[method]('notes', [
      { id: 'partial', courseId: 'medicine', content: 'Do not save' },
      { courseId: 'medicine', content: 'Missing id' },
    ])).rejects.toBeTruthy();
    expect((await db.getAll('notes')).map(n => n.id)).toEqual(['previous']);
    expect(await db.get('notes', 'partial')).toBeUndefined();
  });

  it('bulk-writes sealed records while keeping plaintext index metadata queryable', async () => {
    const db = new OpenCourseDB(name, 3, schema);
    opened.push(db);
    db.setPassphrase('saved phrase');
    expect(await db.bulkPut('notes', [
      { id: 'one', courseId: 'medicine', content: 'Secret Arabic طب' },
      { id: 'two', courseId: 'medicine', content: 'Secret 中文' },
    ])).toBe(true);
    const persisted = await raw('one');
    expect(persisted.record.__encrypted).toBe(true);
    expect(persisted.record.content).toBeUndefined();
    expect(persisted.record.courseId).toBe('medicine');
    expect((await db.getAllByIndex('notes', 'courseId', 'medicine')).map(n => n.content))
      .toEqual(['Secret Arabic طب', 'Secret 中文']);
  });
});
