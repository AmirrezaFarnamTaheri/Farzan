// ============================================================
// PlasmaDeck — db.js
// IndexedDB database engine for PlasmaDeck
// ============================================================
(() => {
'use strict';

class PlasmaDB {

constructor(name, version = 1, schema = []) {
this.name = name;
this.version = version;
this.schema = schema;
this.db = null;
}

async open() {

if (this.db) return this.db;

return new Promise((resolve, reject) => {

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
os.createIndex(i.field, i.field, { unique: !!i.unique });
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

req.onerror = () => reject(req.error);

});

}

async _store(name, mode="readonly") {
const db = await this.open();
return db.transaction(name, mode).objectStore(name);
}


// ------------------------------------------------------------
// INSERT
// ------------------------------------------------------------
async add(store, data) {

const s = await this._store(store,"readwrite");

return new Promise((res,rej)=>{
const r = s.add(data);
r.onsuccess=()=>res(r.result);
r.onerror=()=>rej(r.error);
});

}


// ------------------------------------------------------------
// UPSERT
// ------------------------------------------------------------
async put(store, data) {

const s = await this._store(store,"readwrite");

return new Promise((res,rej)=>{
const r = s.put(data);
r.onsuccess=()=>res(r.result);
r.onerror=()=>rej(r.error);
});

}


// ------------------------------------------------------------
// GET
// ------------------------------------------------------------
async get(store,id) {

const s = await this._store(store);

return new Promise((res,rej)=>{
const r=s.get(id);
r.onsuccess=()=>res(r.result);
r.onerror=()=>rej(r.error);
});

}


// ------------------------------------------------------------
// GET ALL
// ------------------------------------------------------------
async getAll(store) {

const s = await this._store(store);

return new Promise((res,rej)=>{
const r=s.getAll();
r.onsuccess=()=>res(r.result);
r.onerror=()=>rej(r.error);
});

}


// ------------------------------------------------------------
// DELETE
// ------------------------------------------------------------
async delete(store,id){

const s = await this._store(store,"readwrite");

return new Promise((res,rej)=>{
const r=s.delete(id);
r.onsuccess=()=>res(true);
r.onerror=()=>rej(r.error);
});

}


// ------------------------------------------------------------
// CLEAR STORE
// ------------------------------------------------------------
async clear(store){

const s = await this._store(store,"readwrite");

return new Promise((res,rej)=>{
const r=s.clear();
r.onsuccess=()=>res(true);
r.onerror=()=>rej(r.error);
});

}


// ------------------------------------------------------------
// QUERY
// ------------------------------------------------------------
async query(store, filterFn){

const all = await this.getAll(store);
return all.filter(filterFn);

}


// ------------------------------------------------------------
// GET ALL BY INDEX
// ------------------------------------------------------------
async getAllByIndex(store, indexName, value){

const s = await this._store(store);

return new Promise((res,rej)=>{
try {
const idx = s.index(indexName);
const r = idx.getAll(value);
r.onsuccess=()=>res(r.result);
r.onerror=()=>rej(r.error);
} catch (err) {
rej(err);
}
});

}


// ------------------------------------------------------------
// QUERY BY INDEX RANGE
// ------------------------------------------------------------
async queryIndex(store, indexName, range, limit){

const s = await this._store(store);

return new Promise((res,rej)=>{
const out = [];
let req;
try {
req = s.index(indexName).openCursor(range);
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


// ------------------------------------------------------------
// COUNT
// ------------------------------------------------------------
async count(store){

const s = await this._store(store);

return new Promise((res,rej)=>{
const r=s.count();
r.onsuccess=()=>res(r.result);
r.onerror=()=>rej(r.error);
});

}


// ------------------------------------------------------------
// BULK ADD
// ------------------------------------------------------------
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


// ------------------------------------------------------------
// BULK PUT
// ------------------------------------------------------------
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


// ------------------------------------------------------------
// EXPORT DATABASE
// ------------------------------------------------------------
async export(){

const db = await this.open();
const result={};

for(const name of db.objectStoreNames){

result[name] = await this.getAll(name);

}

return result;

}


// ------------------------------------------------------------
// IMPORT
// ------------------------------------------------------------
async import(data){

for(const store in data){

await this.bulkPut(store,data[store]);

}

}


// ------------------------------------------------------------
// DROP DATABASE
// ------------------------------------------------------------
static drop(name){

return new Promise((res,rej)=>{

const r=indexedDB.deleteDatabase(name);

r.onsuccess=()=>res(true);
r.onerror=()=>rej(r.error);

});

}

}


// ------------------------------------------------------------
// Fluent Query API
// ------------------------------------------------------------
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

this.filters.forEach(f=>{
data=data.filter(f);
});

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


// ------------------------------------------------------------
// Export
// ------------------------------------------------------------
window.PlasmaDeck = window.PlasmaDeck || {};

window.PlasmaDeck.DB = {
PlasmaDB,
DBQuery
};

})();
