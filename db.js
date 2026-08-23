// ============================================================
// OpenCourseDeck — db.js
// IndexedDB database engine for OpenCourseDeck
// ============================================================
(() => {
'use strict';

// KDF parameters. v2 envelopes carry a random per-database salt and the
// hardened iteration count; legacy envelopes keep the original values.
const LEGACY_KDF = { salt: 'opencoursedeck-salt', iterations: 10000 };
const KDF_ITERATIONS = 600000;

class OpenCourseDB {

constructor(name, version = 1, schema = []) {
this.name = name;
this.version = version;
this.schema = schema;
this.db = null;
this.encryptionPassphrase = null;
this._opening = null;
}

setPassphrase(passphrase) {
  this.encryptionPassphrase = passphrase;
  this._cryptoKey = null;
}

_getCrypto() {
  if (globalThis.crypto && globalThis.crypto.subtle) return globalThis.crypto;
  if (globalThis.webcrypto && globalThis.webcrypto.subtle) return globalThis.webcrypto;
  try {
    const nodeCrypto = (typeof require !== 'undefined') ? require('node:crypto') : null;
    if (nodeCrypto && nodeCrypto.webcrypto && nodeCrypto.webcrypto.subtle) return nodeCrypto.webcrypto;
  } catch {
  }
  return null;
}

async _deriveKey(passphrase, salt = LEGACY_KDF.salt, iterations = LEGACY_KDF.iterations) {
  const cryptoObj = this._getCrypto();
  if (!cryptoObj || !cryptoObj.subtle) return null;
  const encoder = new TextEncoder();
  const saltBytes = typeof salt === 'string' ? encoder.encode(salt) : salt;
  const baseKey = await cryptoObj.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return cryptoObj.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async encryptPayload(data) {
  if (!this.encryptionPassphrase) return data;
  const cryptoObj = this._getCrypto();
  if (!cryptoObj || !cryptoObj.subtle) return data;
  // v2 envelope: random per-database salt + hardened PBKDF2 iteration count.
  const salt = cryptoObj.getRandomValues(new Uint8Array(16));
  const key = await this._deriveKey(this.encryptionPassphrase, salt, KDF_ITERATIONS);
  if (!key) return data;
  const iv = cryptoObj.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await cryptoObj.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return {
    __encrypted: true,
    v: 2,
    salt: Array.from(salt),
    iterations: KDF_ITERATIONS,
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(ciphertext))
  };
}

async decryptPayload(data) {
  if (!data || !data.__encrypted || !this.encryptionPassphrase) return data;
  const cryptoObj = this._getCrypto();
  if (!cryptoObj || !cryptoObj.subtle) return data;
  // Legacy envelopes (no v field) used the static app-wide salt and the
  // original 10,000-iteration KDF; keep decrypting them transparently.
  const isLegacy = data.v !== 2;
  const key = await this._deriveKey(
    this.encryptionPassphrase,
    isLegacy ? LEGACY_KDF.salt : Uint8Array.from(data.salt ?? []),
    isLegacy ? LEGACY_KDF.iterations : (data.iterations ?? KDF_ITERATIONS)
  );
  if (!key) return data;
  const iv = new Uint8Array(data.iv);
  const ciphertext = new Uint8Array(data.ciphertext);
  const decrypted = await cryptoObj.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(decrypted));
}


async open() {
if (this.db) return this.db;
// Memoize the in-flight open: concurrent first calls (e.g. several reads in
// one Promise.all) must share a single connection instead of each opening —
// and leaking — their own.
if (this._opening) return this._opening;
this._opening = new Promise((resolve, reject) => {
const req = indexedDB.open(this.name, this.version);
req.onupgradeneeded = e => {
const db = e.target.result;
this.schema.forEach(store => {
if (!db.objectStoreNames.contains(store.name)) {
const os = db.createObjectStore(store.name,{
keyPath: store.key || 'id',
autoIncrement: store.autoIncrement ?? true
});
(store.indexes || []).forEach(i => {
if (!os.indexNames.contains(i.field)) os.createIndex(i.field, i.field, { unique: !!i.unique });
});
} else {
const tx = e.target.transaction;
const os = tx.objectStore(store.name);
(store.indexes || []).forEach(i => {
if (!os.indexNames.contains(i.field)) os.createIndex(i.field, i.field, { unique: !!i.unique });
});
}
});
};
req.onsuccess = e => {
this.db = e.target.result;
this.db.onversionchange = () => {
this.db?.close();
this.db = null;
};
resolve(this.db);
};
req.onblocked = () => reject(new Error(`Opening IndexedDB database "${this.name}" was blocked by another connection`));
req.onerror = () => reject(req.error);
});
this._opening.finally(() => { this._opening = null; }).catch(() => {});
return this._opening;
}

async _transaction(store, mode="readonly") {
const db = await this.open();
const tx = db.transaction(store, mode);
return { tx, objectStore: tx.objectStore(store) };
}

_waitForTransaction(tx, request, mapResult = value => value) {
return new Promise((resolve, reject) => {
let requestResult;
let requestCompleted = false;
request.onsuccess = () => {
requestResult = request.result;
requestCompleted = true;
};
request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
tx.oncomplete = () => {
if (!requestCompleted) {
reject(new Error('IndexedDB transaction completed without a request result'));
return;
}
resolve(mapResult(requestResult));
};
tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
});
}

async add(store, data) {
const { tx, objectStore } = await this._transaction(store,"readwrite");
return this._waitForTransaction(tx, objectStore.add(data));
}

async put(store, data) {
const { tx, objectStore } = await this._transaction(store,"readwrite");
return this._waitForTransaction(tx, objectStore.put(data));
}

async get(store,id) {
const { objectStore } = await this._transaction(store);
return new Promise((res,rej)=>{
const r=objectStore.get(id);
r.onsuccess=()=>res(r.result);
r.onerror=()=>rej(r.error);
});
}

async getAll(store) {
const { objectStore } = await this._transaction(store);
return new Promise((res,rej)=>{
const r=objectStore.getAll();
r.onsuccess=()=>res(r.result);
r.onerror=()=>rej(r.error);
});
}

async delete(store,id){
const { tx, objectStore } = await this._transaction(store,"readwrite");
return this._waitForTransaction(tx, objectStore.delete(id), () => true);
}

async clear(store){
const { tx, objectStore } = await this._transaction(store,"readwrite");
return this._waitForTransaction(tx, objectStore.clear(), () => true);
}

async query(store, filterFn){
const all = await this.getAll(store);
return all.filter(filterFn);
}

async getAllByIndex(store, indexName, value){
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

async queryIndex(store, indexName, range, limitOrOptions, legacyOptions = {}){
const options = typeof limitOrOptions === 'object' && limitOrOptions !== null
? limitOrOptions
: { ...legacyOptions, limit: limitOrOptions };
const limit = Number(options.limit) > 0 ? Number(options.limit) : null;
const allowedDirections = new Set(['next', 'nextunique', 'prev', 'prevunique']);
const direction = allowedDirections.has(options.direction) ? options.direction : 'next';
const { objectStore } = await this._transaction(store);
return new Promise((res,rej)=>{
const out = [];
let req;
try {
req = objectStore.index(indexName).openCursor(range, direction);
} catch (err) {
rej(err);
return;
}
req.onsuccess=()=>{
const cursor = req.result;
if (!cursor || (limit && out.length >= limit)) {
res(out);
return;
}
out.push(cursor.value);
cursor.continue();
};
req.onerror=()=>rej(req.error);
});
}

async count(store){
const { objectStore } = await this._transaction(store);
return new Promise((res,rej)=>{
const r=objectStore.count();
r.onsuccess=()=>res(r.result);
r.onerror=()=>rej(r.error);
});
}

async bulkAdd(store, list){
const db = await this.open();
const tx = db.transaction(store,"readwrite");
const s = tx.objectStore(store);
list.forEach(item => s.add(item));
return new Promise((res,rej)=>{
tx.oncomplete=()=>res(true);
tx.onerror=()=>rej(tx.error || new Error('Transaction failed'));
tx.onabort=()=>rej(tx.error || new Error('Transaction aborted'));
});
}

async bulkPut(store,list){
const db = await this.open();
const tx = db.transaction(store,"readwrite");
const s = tx.objectStore(store);
list.forEach(item=>s.put(item));
return new Promise((res,rej)=>{
tx.oncomplete=()=>res(true);
tx.onerror=()=>rej(tx.error || new Error('Transaction failed'));
tx.onabort=()=>rej(tx.error || new Error('Transaction aborted'));
});
}

async bulkPutWithCheckpoint(store,list,checkpoint){
const db = await this.open();
const stores = store === 'settings' ? ['settings'] : [store, 'settings'];
const tx = db.transaction(stores,"readwrite");
const target = tx.objectStore(store);
list.forEach(item=>target.put(item));
if(checkpoint) tx.objectStore('settings').put(checkpoint);
return new Promise((res,rej)=>{
tx.oncomplete=()=>res(true);
tx.onerror=()=>rej(tx.error || new Error('Transaction failed'));
tx.onabort=()=>rej(tx.error || new Error('Transaction aborted'));
});
}

async export(){
const db = await this.open();
const result={};
for(const name of db.objectStoreNames) result[name] = await this.getAll(name);
return result;
}

async import(data){
for(const store in data) await this.bulkPut(store,data[store]);
}

static drop(name){
return new Promise((res,rej)=>{
const r=indexedDB.deleteDatabase(name);
r.onsuccess=()=>res(true);
r.onerror=()=>rej(r.error);
r.onblocked=()=>rej(new Error(`Deletion of IndexedDB database "${name}" was blocked`));
});
}
}

class DBQuery {
constructor(db,store){
this.db=db;
this.store=store;
this.filters=[];
this.sortKey=null;
this.sortDir="asc";
this.limitVal=null;
}
where(fn){
this.filters.push(fn);
return this;
}
orderBy(key,dir="asc"){
this.sortKey=key;
this.sortDir=dir;
return this;
}
limit(n){
this.limitVal=n;
return this;
}
async get(){
let data = await this.db.getAll(this.store);
this.filters.forEach(f=>{ data=data.filter(f); });
if(this.sortKey){
data.sort((a,b)=>{
const av=a[this.sortKey];
const bv=b[this.sortKey];
if(av>bv) return this.sortDir==="asc"?1:-1;
if(av<bv) return this.sortDir==="asc"?-1:1;
return 0;
});
}
if(this.limitVal) data=data.slice(0,this.limitVal);
return data;
}
}

window.OpenCourseDeck = window.OpenCourseDeck || {};
// Historical PlasmaDB name kept as an alias so existing integrations and
// tests continue to resolve the same constructor.
window.OpenCourseDeck.DB = { OpenCourseDB, PlasmaDB: OpenCourseDB, DBQuery };
})();
