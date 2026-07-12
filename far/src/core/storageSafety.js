import { installBackupEngine } from './backupEngine.js';

const VALID_SCOPES = new Set([
  'progress',
  'notes',
  'media',
  'playlists',
  'studio',
  'preferences',
  'all',
]);

const PREFERENCE_KEYS = [
  'plasma_accent',
  'plasma_density',
  'plasma_font_scale',
  'plasma_dir',
  'plasma_theme',
  'plasma_sidebar_collapsed',
  'plasma-intro-seen',
  'plasma-session',
  'plasma-theme',
  'plasma-sidebar-collapsed',
  'plasma-accent',
  'plasma-dir',
];

const SESSION_KEYS = [
  'plasma_pending_topic',
  'plasma_pending_position',
  'plasma_pending_course_session',
  'plasma_pending_pdf_doc',
  'plasma_pending_pdf_page',
  'plasma-ai-api-key-session',
];

const AUXILIARY_DATABASES = [
  'opencoursedeck-media',
  'opencoursedeck-translations',
  'opencoursedeck-ai-models',
  'opencoursedeck-templates',
  'opencoursedeck-waveforms',
];

function removeKeys(storage, keys) {
  if (!storage) return;
  for (const key of keys) {
    try { storage.removeItem(key); } catch { /* storage can be blocked */ }
  }
}

function deleteDatabase(factory, name) {
  return new Promise((resolve, reject) => {
    if (!factory) {
      resolve(false);
      return;
    }
    const request = factory.deleteDatabase(name);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error || new Error(`Failed to delete ${name}`));
    request.onblocked = () => reject(new Error(`Deletion of ${name} is blocked by another open tab`));
  });
}

export function installStorageSafety(root = window) {
  const db = root.DB;
  if (!db || db.__storageSafetyInstalled) return db;

  const originalClearUserData = db.clearUserData?.bind(db);
  const originalClearAll = db.clearAll?.bind(db);

  if (typeof originalClearUserData !== 'function' || typeof originalClearAll !== 'function') {
    throw new Error('Storage safety requires clearUserData() and clearAll()');
  }

  db.clearUserData = async (scope) => {
    const normalized = String(scope || '');
    if (!VALID_SCOPES.has(normalized)) {
      throw new TypeError(`Unknown deletion scope: ${normalized || '(empty)'}`);
    }

    if (normalized === 'preferences') {
      removeKeys(root.localStorage, PREFERENCE_KEYS);
      return { scope: normalized, cleared: [...PREFERENCE_KEYS], committed: true };
    }

    if (normalized === 'all') return db.clearAll();
    return originalClearUserData(normalized);
  };

  db.clearAll = async (...args) => {
    const result = await originalClearAll(...args);
    removeKeys(root.sessionStorage, SESSION_KEYS);

    const failures = [];
    const cleared = [];
    for (const name of AUXILIARY_DATABASES) {
      try {
        await deleteDatabase(root.indexedDB, name);
        cleared.push(name);
      } catch (error) {
        failures.push({ name, message: error?.message || String(error) });
      }
    }

    if (failures.length) {
      const error = new Error('Some auxiliary OpenCourseDeck databases could not be cleared');
      error.failures = failures;
      error.cleared = cleared;
      throw error;
    }
    return { result, committed: true, clearedDatabases: cleared, clearedSessionKeys: [...SESSION_KEYS] };
  };

  Object.defineProperty(db, '__storageSafetyInstalled', { value: true });
  root.OpenCourseDeck = root.OpenCourseDeck || {};
  root.OpenCourseDeck.StorageSafety = {
    validScopes: Object.freeze([...VALID_SCOPES]),
    preferenceKeys: Object.freeze([...PREFERENCE_KEYS]),
    sessionKeys: Object.freeze([...SESSION_KEYS]),
    auxiliaryDatabases: Object.freeze([...AUXILIARY_DATABASES]),
  };
  installBackupEngine(root);
  return db;
}
