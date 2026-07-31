import {
  AI_BINDING_KEY,
  AI_SESSION_KEY,
  AI_SETTINGS_KEY,
  stripPortableAIAuthority,
} from './aiAuthority.js';

const DATABASE_NAME = 'opencoursedeck';
const DATABASE_VERSION = 3;
const MAIN_STORES = Object.freeze([
  'progress',
  'timestamps',
  'notes',
  'folders',
  'settings',
  'annotations',
  'watchedSegments',
  'pdfBookmarks',
]);

function openDatabase(root) {
  return new Promise((resolve, reject) => {
    if (!root.indexedDB) {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }
    const request = root.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    let settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    request.onsuccess = () => {
      if (settled) {
        try { request.result.close(); } catch {}
        return;
      }
      settle(resolve, request.result);
    };
    request.onerror = () => settle(reject, request.error || new Error('Unable to open OpenCourseDeck storage'));
    request.onblocked = () => settle(reject, new Error('OpenCourseDeck storage is blocked by another tab'));
    request.onupgradeneeded = () => {
      request.transaction?.abort?.();
      settle(reject, new Error('Backup engine cannot create or upgrade the application schema'));
    };
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function sanitizeSettingsRecords(records = []) {
  return records.map((record) => {
    if (!record || record.key !== AI_SETTINGS_KEY) return record;
    return { ...record, value: stripPortableAIAuthority(record.value) };
  });
}

function sanitizePortableBackup(input) {
  const sanitized = { ...input };
  if (Array.isArray(input?.settings)) sanitized.settings = sanitizeSettingsRecords(input.settings);
  if (input?._meta && typeof input._meta === 'object') sanitized._meta = { ...input._meta };
  return sanitized;
}

function clearSessionAuthority(root) {
  const failures = [];
  for (const key of [AI_SESSION_KEY, AI_BINDING_KEY]) {
    try {
      root.sessionStorage?.removeItem?.(key);
      if (root.sessionStorage?.getItem?.(key) != null) throw new Error(`Session key ${key} remained after deletion`);
    } catch (error) { failures.push({ key, message: error?.message || String(error) }); }
  }
  return failures;
}

function validateBackup(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Backup must be a JSON object');
  }
  const unknown = Object.keys(input).filter(key => key !== '_meta' && !MAIN_STORES.includes(key));
  if (unknown.length) throw new TypeError(`Backup contains unknown stores: ${unknown.join(', ')}`);

  const included = [];
  for (const store of MAIN_STORES) {
    if (!Object.prototype.hasOwnProperty.call(input, store)) continue;
    if (!Array.isArray(input[store])) throw new TypeError(`Backup store "${store}" must be an array`);
    for (const [index, record] of input[store].entries()) {
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        throw new TypeError(`Backup store "${store}" contains an invalid record at index ${index}`);
      }
    }
    included.push(store);
  }
  if (!included.length) throw new TypeError('Backup contains no recognized stores');
  return included;
}

function countRecords(data, stores) {
  return Object.fromEntries(stores.map(store => [store, data[store]?.length ?? 0]));
}

export function installBackupEngine(root = window) {
  const facade = root.DB;
  if (!facade || facade.__backupEngineInstalled) return facade;

  facade.exportBackup = async () => {
    const db = await openDatabase(root);
    try {
      const available = MAIN_STORES.filter(store => db.objectStoreNames.contains(store));
      const transaction = db.transaction(available, 'readonly');
      const result = {};
      const reads = available.map(async (store) => {
        const records = await requestResult(transaction.objectStore(store).getAll());
        result[store] = store === 'settings' ? sanitizeSettingsRecords(records) : records;
      });
      await Promise.all(reads);
      await transactionDone(transaction);
      result._meta = {
        format: 'opencoursedeck-snapshot',
        version: 3,
        databaseVersion: db.version,
        exportedAt: new Date().toISOString(),
        portableAuthority: false,
        stores: countRecords(result, available),
      };
      return result;
    } finally {
      db.close();
    }
  };

  facade.importBackup = async (input, { mode = 'merge' } = {}) => {
    if (!['merge', 'overwrite'].includes(mode)) throw new TypeError(`Unsupported import mode: ${mode}`);
    const portable = sanitizePortableBackup(input);
    const included = validateBackup(portable);
    const db = await openDatabase(root);
    try {
      const missing = included.filter(store => !db.objectStoreNames.contains(store));
      if (missing.length) throw new Error(`Current database is missing backup stores: ${missing.join(', ')}`);

      const transaction = db.transaction(included, 'readwrite');
      const completion = transactionDone(transaction);
      const counts = {};
      try {
        for (const storeName of included) {
          const store = transaction.objectStore(storeName);
          if (mode === 'overwrite') store.clear();
          for (const record of portable[storeName]) store.put(record);
          counts[storeName] = portable[storeName].length;
        }
      } catch (error) {
        try { transaction.abort(); } catch {}
        throw error;
      }
      await completion;
      const authorityFailures = clearSessionAuthority(root);
      const degraded = authorityFailures.length > 0;

      const receipt = {
        committed: true,
        durable: true,
        status: degraded ? 'committed-degraded' : 'committed',
        degraded,
        retrySafe: false,
        mode,
        importedAt: new Date().toISOString(),
        stores: counts,
        totalRecords: Object.values(counts).reduce((sum, count) => sum + count, 0),
        aiAuthorityInvalidated: !degraded,
        warnings: degraded ? [{
          code: 'AI_AUTHORITY_INVALIDATION_INCOMPLETE',
          message: 'Backup data committed, but session AI authority could not be fully invalidated. Close this tab before retrying or using AI features.',
          failures: authorityFailures,
        }] : [],
      };
      root.OpenCourseDeck?.bus?.emit?.('storage:import-complete', receipt);
      if (degraded) {
        root.OpenCourseDeck?.bus?.emit?.('ai:authority-invalidation-incomplete', {
          reason: 'backup-import',
          committed: true,
          retrySafe: false,
          failures: authorityFailures,
        });
      } else {
        root.OpenCourseDeck?.bus?.emit?.('ai:authority-invalidated', { reason: 'backup-import' });
      }
      return receipt;
    } finally {
      db.close();
    }
  };

  Object.defineProperty(facade, '__backupEngineInstalled', { value: true });
  root.OpenCourseDeck = root.OpenCourseDeck || {};
  root.OpenCourseDeck.BackupEngine = {
    databaseName: DATABASE_NAME,
    stores: MAIN_STORES,
    sanitizePortableBackup,
    validateBackup,
  };
  return facade;
}
