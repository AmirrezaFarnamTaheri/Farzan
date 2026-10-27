/**
 * Strictly read an existing native IndexedDB database through Dexie's dynamic
 * schema mode. Do not declare a Dexie version here: the main app's native v3
 * schema, encryption, migrations and multi-store writes remain authoritative.
 *
 * A short-lived Dexie connection avoids long-lived cross-tab upgrade/reset
 * blockers; the native OpenCourseDB adapter still owns all write transactions.
 */
import Dexie from 'dexie';

export async function withExistingIndexedDBStore(nativeConnection, store, operation) {
  if (!nativeConnection?.name) {
    throw new Error('An existing native IndexedDB connection is required');
  }
  if (typeof operation !== 'function') throw new TypeError('A database read operation is required');
  const db = new Dexie(nativeConnection.name, {
    indexedDB: globalThis.indexedDB,
    IDBKeyRange: globalThis.IDBKeyRange || Dexie.dependencies.IDBKeyRange,
    cache: 'disabled',
  });
  try {
    // No version() call: dynamic mode reads the actual installed native
    // version/indexes and refuses a missing database.
    await db.open();
    if (db.backendDB().version !== nativeConnection.version) {
      throw new Error('Primary database schema changed during the read');
    }
    const table = db.table(store);
    return await operation(table);
  } finally {
    db.close();
  }
}
