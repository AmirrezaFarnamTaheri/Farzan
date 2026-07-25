/**
 * TranslationCache — IndexedDB-backed cache for translation results.
 * Composite key: (engine, paramsHash, sourceText). TTL: 30 days.
 *
 * Usage:
 *   await translationCache.init();
 *   const cached = await translationCache.get(text, 'google', { from: 'en', to: 'fa' });
 *   if (!cached) { const result = doTranslate(); await translationCache.set(text, 'google', { from, to }, result); }
 */

const DB_NAME = 'opencoursedeck-translations';
const DB_VERSION = 1;
const STORE_NAME = 'translations';
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

let _db = null;
let _initPromise = null;

function openDb() {
  if (_db) return Promise.resolve(_db);
  if (_initPromise) return _initPromise;

  _initPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('engine', 'engine', { unique: false });
      }
    };

    request.onsuccess = () => {
      _db = request.result;
      resolve(_db);
    };

    request.onerror = () => {
      _initPromise = null;
      reject(request.error);
    };
  });

  return _initPromise;
}

function txStore(mode) {
  return openDb().then(db => {
    const tx = db.transaction(STORE_NAME, mode);
    return tx.objectStore(STORE_NAME);
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

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

/**
 * Initialize the cache. Must be called before get/set.
 * @returns {Promise<void>}
 */
export async function init() {
  await openDb();
}

/**
 * Get a cached translation.
 * @param {string} text — source text
 * @param {string} engine — translator engine name
 * @param {Object} params — translation params (from, to, etc.)
 * @returns {Promise<string|null>} — cached translation or null
 */
export async function get(text, engine, params) {
  const key = makeKey(text, engine, params);
  try {
    const store = await txStore('readonly');
    const record = await reqToPromise(store.get(key));
    if (!record) return null;
    if (Date.now() - record.createdAt > (record.ttl || DEFAULT_TTL_MS)) {
      // Expired — delete asynchronously
      txStore('readwrite').then(s => s.delete(key)).catch(() => {});
      return null;
    }
    return record.translation;
  } catch {
    return null;
  }
}

/**
 * Store a translation in the cache.
 * @param {string} text — source text
 * @param {string} engine — translator engine name
 * @param {Object} params — translation params
 * @param {string} translation — translated text
 * @param {number} [ttl] — TTL in ms (default 30 days)
 * @returns {Promise<void>}
 */
export async function set(text, engine, params, translation, ttl) {
  const key = makeKey(text, engine, params);
  const record = {
    key,
    engine,
    paramsHash: hashParams(params),
    sourceText: text,
    translation,
    createdAt: Date.now(),
    ttl: ttl || DEFAULT_TTL_MS,
  };
  try {
    const store = await txStore('readwrite');
    await reqToPromise(store.put(record));
  } catch {
    // Cache write failure is non-fatal
  }
}

/**
 * Clear all cached translations.
 * @returns {Promise<void>}
 */
export async function clear() {
  try {
    const store = await txStore('readwrite');
    await reqToPromise(store.clear());
  } catch {}
}

/**
 * Count cached translations.
 * @returns {Promise<number>}
 */
export async function size() {
  try {
    const store = await txStore('readonly');
    return await reqToPromise(store.count());
  } catch {
    return 0;
  }
}

/**
 * Remove expired entries.
 * @returns {Promise<number>} — number of pruned entries
 */
export async function prune() {
  try {
    const store = await txStore('readwrite');
    const idx = store.index('createdAt');
    const now = Date.now();
    let pruned = 0;
    await new Promise((resolve, reject) => {
      const req = idx.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) { resolve(); return; }
        const record = cursor.value;
        if (now - record.createdAt > (record.ttl || DEFAULT_TTL_MS)) {
          cursor.delete();
          pruned++;
        }
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
    return pruned;
  } catch {
    return 0;
  }
}

/**
 * Remove all entries for a specific engine.
 * @param {string} engine
 * @returns {Promise<number>}
 */
export async function clearEngine(engine) {
  try {
    const store = await txStore('readwrite');
    const idx = store.index('engine');
    const keys = await reqToPromise(idx.getAllKeys(engine));
    let removed = 0;
    for (const key of keys) {
      await reqToPromise(store.delete(key));
      removed++;
    }
    return removed;
  } catch {
    return 0;
  }
}

export const translationCache = {
  init,
  get,
  set,
  clear,
  size,
  prune,
  clearEngine,
  hashParams,
};
