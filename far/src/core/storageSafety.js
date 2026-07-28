import { installBackupEngine } from './backupEngine.js';
import { installPdfSecurity } from './pdfSecurity.js';
import { committedReceipt, failedReceipt } from './mutationReceipt.js';

const VALID_SCOPES = new Set(['progress', 'notes', 'media', 'playlists', 'studio', 'preferences', 'all']);
const PREFERENCE_KEYS = ['plasma_accent', 'plasma_density', 'plasma_font_scale', 'plasma_dir', 'plasma_theme', 'plasma_sidebar_collapsed', 'plasma-intro-seen', 'plasma-session', 'plasma-theme', 'plasma-sidebar-collapsed', 'plasma-accent', 'plasma-dir'];
const SESSION_KEYS = ['plasma_pending_topic', 'plasma_pending_position', 'plasma_pending_course_session', 'plasma_pending_pdf_doc', 'plasma_pending_pdf_page', 'plasma-ai-api-key-session', 'plasma-ai-authority-session', 'pd-player', 'pd-player-playlist'];
const AUXILIARY_DATABASES = ['opencoursedeck-media', 'opencoursedeck-translations', 'opencoursedeck-ai-models', 'opencoursedeck-templates', 'opencoursedeck-waveforms'];

function removeKeys(storage, keys) {
  const removed = [];
  if (!storage) return removed;
  for (const key of keys) {
    try { storage.removeItem(key); removed.push(key); } catch {}
  }
  return removed;
}

function deleteDatabase(factory, name) {
  return new Promise((resolve, reject) => {
    if (!factory) return resolve(false);
    const request = factory.deleteDatabase(name);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error || new Error(`Failed to delete ${name}`));
    request.onblocked = () => reject(new Error(`Deletion of ${name} is blocked by another open connection`));
  });
}

export function installStorageSafety(root = window) {
  const db = root.DB;
  if (!db || db.__storageSafetyInstalled) return db;
  const originalClearAll = db.clearAll?.bind(db);
  const originalClearUserData = db.clearUserData?.bind(db);
  if (typeof originalClearAll !== 'function' || typeof originalClearUserData !== 'function') {
    throw new Error('Storage safety requires clearUserData() and clearAll()');
  }

  db.clearUserData = async (scope) => {
    const normalized = String(scope || '');
    if (!VALID_SCOPES.has(normalized)) throw new TypeError(`Unknown deletion scope: ${normalized || '(empty)'}`);
    if (normalized === 'preferences') {
      const cleared = removeKeys(root.localStorage, PREFERENCE_KEYS);
      return committedReceipt({ operation: 'clear-preferences', backend: 'localStorage', details: { cleared } });
    }
    if (normalized === 'all') return db.clearAll();
    try {
      const result = await originalClearUserData(normalized);
      return committedReceipt({ operation: `clear-${normalized}`, backend: 'indexedDB', details: result });
    } catch (error) {
      throw Object.assign(error, { receipt: failedReceipt({ operation: `clear-${normalized}`, error: error.message }) });
    }
  };

  db.clearAll = async (...args) => {
    const details = { primary: null, session: [], databases: [], failures: [] };
    try {
      details.primary = await originalClearAll(...args);
      details.session = removeKeys(root.sessionStorage, SESSION_KEYS);
      for (const name of AUXILIARY_DATABASES) {
        try {
          await deleteDatabase(root.indexedDB, name);
          details.databases.push(name);
        } catch (error) {
          details.failures.push({ name, message: error?.message || String(error) });
        }
      }
      if (details.failures.length) {
        const error = new Error('Data reset completed partially; some auxiliary databases remain');
        error.receipt = failedReceipt({
          operation: 'clear-all',
          backend: 'indexedDB+sessionStorage',
          details,
          error: error.message,
        });
        throw error;
      }
      return committedReceipt({
        operation: 'clear-all',
        backend: 'indexedDB+sessionStorage',
        details,
      });
    } catch (error) {
      if (error.receipt) throw error;
      throw Object.assign(error, {
        receipt: failedReceipt({ operation: 'clear-all', error: error.message, details }),
      });
    }
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
  installPdfSecurity(root);
  root.addEventListener?.('opencoursedeck:pdfjs-ready', () => installPdfSecurity(root), { once: true });
  return db;
}
