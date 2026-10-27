/**
 * Translation results cache: compatibility facade backed by Dexie.
 *
 * Preserves the original raw IndexedDB database's native version 1,
 * primary key, secondary indexes, records and TTL semantics. Dexie uses
 * versions multiplied by 10 at the IDB boundary; .version(0.1) is native v1.
 *
 * This database contains cached translation results only. Course data,
 * note HTML, progress, saved study records and credentials are not migrated.
 */
import Dexie from 'dexie';

const DB_NAME = 'opencoursedeck-translations';
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

let db = null;

function database() {
  if (!db) {
    db = new Dexie(DB_NAME);
    // Existing raw IndexedDB v1: 'translations' keyPath='key',
    // two nonunique indexes ('createdAt', 'engine'). Do not bump the native
    // version or add a migration just to adopt an existing query wrapper.
    db.version(0.1).stores({ translations: 'key, createdAt, engine' });
  }
  return db;
}

function expired(record, now) {
  return now - record.createdAt > (record.ttl || DEFAULT_TTL_MS);
}

/**
 * Preserve the original deterministic FNV-1a hash. Existing keys must be
 * readable after the adapter swap, even if the params property order differs.
 */
/**
 * Deterministic hash of sorted JSON params.
 * @param {Object} params
 * @returns {string}
 */
export function hashParams(params) {
  if (!params || typeof params !== 'object') return '';
  const sorted = Object.keys(params).sort().reduce((acc, k) => {
    acc[k] = params[k];
    return acc;
  }, {});
  const str = JSON.stringify(sorted);
  // Simple FNV-1a hash
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash = Math.imul(hash ^ str.charCodeAt(i), 16777619);
  }
  return (hash >>> 0).toString(36);
}

function makeKey(text, engine, params) {
  return `${engine}:${hashParams(params)}:${text}`;
}

/** Open the existing schema or create the same schema for a fresh install. */
export async function init() {
  await database().open();
}

/**
 * Read a translation; expired entries are evicted without affecting other
 * providers or sessions. Missing/disabled storage is a cache miss.
 */
export async function get(text, engine, params) {
  const key = makeKey(text, engine, params);
  try {
    const table = database().table('translations');
    const record = await table.get(key);
    if (!record) return null;
    if (expired(record, Date.now())) {
      await table.delete(key);
      return null;
    }
    return record.translation;
  } catch {
    return null;
  }
}

/** Write an entry with the exact same key, attributes and TTL contract. */
export async function set(text, engine, params, translation, ttl) {
  const record = {
    key: makeKey(text, engine, params),
    engine,
    paramsHash: hashParams(params),
    sourceText: text,
    translation,
    createdAt: Date.now(),
    ttl: ttl || DEFAULT_TTL_MS,
  };
  try {
    await database().table('translations').put(record);
  } catch {
    // Offline translation must continue if this optional cache is disabled.
  }
}

/** Clear all cached translations, without deleting the database schema. */
export async function clear() {
  try { await database().table('translations').clear(); } catch {}
}

export async function size() {
  try { return await database().table('translations').count(); } catch { return 0; }
}

/**
 * Remove per-record expired entries in one Dexie transaction.
 * Using a single write transaction avoids raw IDB cursors crossing awaits.
 */
export async function prune() {
  try {
    const table = database().table('translations');
    return await database().transaction('rw', table, async () => {
      const now = Date.now();
      const keys = await table.toCollection().filter(item => expired(item, now)).primaryKeys();
      if (keys.length) await table.bulkDelete(keys);
      return keys.length;
    });
  } catch {
    return 0;
  }
}

/** Delete only the requested provider's keys atomically. */
export async function clearEngine(engine) {
  try { return await database().table('translations').where('engine').equals(engine).delete(); }
  catch { return 0; }
}

/** Release the connection (testing, explicit teardown, or safe app reload). */
export function close() {
  db?.close();
  db = null;
}

export const translationCache = {
  init, get, set, clear, size, prune, clearEngine, hashParams, close,
};
