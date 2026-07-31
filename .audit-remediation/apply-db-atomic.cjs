#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

function replaceOne(file, before, after) {
  const source = fs.readFileSync(file, 'utf8');
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${file}: expected source anchor was not found`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${file}: source anchor was not unique`);
  fs.writeFileSync(file, source.slice(0, first) + after + source.slice(first + before.length), 'utf8');
}

const anchor = `async getAllByIndex(store, indexName, value){
const { objectStore } = await this._transaction(store);
return new Promise((res,rej)=>{
try {
const r = objectStore.index(indexName).getAll(value);
r.onsuccess=()=>res(r.result);
r.onerror=()=>rej(r.error);
} catch (err) {
rej(err);
}
});
}
`;

const replacement = `${anchor}
async replaceByIndex(store, indexName, value, list){
const records = Array.isArray(list) ? list : [];
for (const record of records) {
if (record?.[indexName] !== value) throw new TypeError(\`Replacement record must have \${indexName}=\${String(value)}\`);
}
const db = await this.open();
const tx = db.transaction(store, 'readwrite');
const objectStore = tx.objectStore(store);
const keep = new Set(records.map(record => record.id));
return new Promise((resolve,reject)=>{
let cursorRequest;
try {
cursorRequest = objectStore.index(indexName).openCursor(value);
for (const record of records) objectStore.put(record);
} catch (error) {
try { tx.abort(); } catch {}
reject(error);
return;
}
cursorRequest.onsuccess=()=>{
const cursor = cursorRequest.result;
if (!cursor) return;
if (!keep.has(cursor.value?.id)) cursor.delete();
cursor.continue();
};
cursorRequest.onerror=()=>reject(cursorRequest.error || new Error('IndexedDB replacement cursor failed'));
tx.oncomplete=()=>resolve(records);
tx.onerror=()=>reject(tx.error || new Error('IndexedDB replacement transaction failed'));
tx.onabort=()=>reject(tx.error || new Error('IndexedDB replacement transaction aborted'));
});
}
`;

replaceOne('far/db.js', anchor, replacement);

const testAnchor = `  it('can read records by an IndexedDB index', async () => {`;
const test = `  it('replaces one indexed document set in a single transaction', async () => {
    const { PlasmaDB } = window.OpenCourseDeck.DB;
    const db = new PlasmaDB('plasma-test-db', 1, [
      { name: 'annotations', key: 'id', autoIncrement: false, indexes: [{ field: 'docId' }] },
    ]);
    await db.bulkPut('annotations', [
      { id: 'keep', docId: 'doc-a', value: 1 },
      { id: 'remove', docId: 'doc-a', value: 2 },
      { id: 'other', docId: 'doc-b', value: 3 },
    ]);

    await db.replaceByIndex('annotations', 'docId', 'doc-a', [
      { id: 'keep', docId: 'doc-a', value: 4 },
      { id: 'add', docId: 'doc-a', value: 5 },
    ]);

    const docA = await db.getAllByIndex('annotations', 'docId', 'doc-a');
    expect(docA).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'keep', value: 4 }),
      expect.objectContaining({ id: 'add', value: 5 }),
    ]));
    expect(docA).toHaveLength(2);
    await expect(db.getAllByIndex('annotations', 'docId', 'doc-b')).resolves.toEqual([
      expect.objectContaining({ id: 'other', value: 3 }),
    ]);
    await expect(db.replaceByIndex('annotations', 'docId', 'doc-a', [
      { id: 'wrong', docId: 'doc-b' },
    ])).rejects.toThrow(/docId=doc-a/);
  });

${testAnchor}`;
replaceOne('far/tests/db.test.js', testAnchor, test);

console.log('[db-atomic] applied database primitive and regression test');
