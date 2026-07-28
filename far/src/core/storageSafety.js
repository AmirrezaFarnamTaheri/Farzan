import { installAuxiliaryDbLifecycle, AUXILIARY_DATABASES } from './auxiliaryDbLifecycle.js';
import { installBackupEngine } from './backupEngine.js';
import { installPdfSecurity } from './pdfSecurity.js';
import { committedReceipt, failedReceipt } from './mutationReceipt.js';

const VALID_SCOPES = new Set(['progress', 'notes', 'media', 'playlists', 'studio', 'preferences', 'all']);
const PREFERENCE_KEYS = ['plasma_accent', 'plasma_density', 'plasma_font_scale', 'plasma_dir', 'plasma_theme', 'plasma_sidebar_collapsed', 'plasma-intro-seen', 'plasma-session', 'plasma-theme', 'plasma-sidebar-collapsed', 'plasma-accent', 'plasma-dir'];
const SESSION_KEYS = ['plasma_pending_topic', 'plasma_pending_position', 'plasma_pending_course_session', 'plasma_pending_pdf_doc', 'plasma_pending_pdf_page', 'plasma-ai-api-key-session', 'plasma-ai-authority-session', 'pd-player', 'pd-player-playlist'];

function removeKeys(storage, keys) {
  if (!storage) return;
  for (const key of keys) {
    try { storage.removeItem(key); } catch {}
  }
}

function withCompatibility(receipt, details = {}) {
  return Object.freeze({
    ...receipt,
    ...details,
    failures: details.failures || receipt.details?.failures || [],
    cleared: details.cleared || receipt.details?.cleared || [],
  });
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

function notifyDeletionFailure(root, failures) {
  if (!failures.length) return;
  const names = failures.map(failure => failure.name).join(', ');
  const blocked = failures.some(failure => /blocked/i.test(failure.message));
  const guidance = blocked
    ? 'Deletion is blocked by another open tab or process. Close other OpenCourseDeck tabs and retry.'
    : 'Close other OpenCourseDeck tabs, check browser storage permissions, and retry.';
  const message = `Local data reset incomplete for: ${names}. ${guidance}`;
  try { root.OpenCourseDeck?.Toast?.error?.(message); } catch {}
}

export function installStorageSafety(root = window) {
  const db = root.DB;
  if (!db || db.__storageSafetyInstalled) return db;
  const lifecycle = installAuxiliaryDbLifecycle(root);
  const originalClearAll = db.clearAll?.bind(db);
  const originalClearUserData = db.clearUserData?.bind(db);
  if (typeof originalClearAll !== 'function' || typeof originalClearUserData !== 'function') throw new Error('Storage safety requires clearUserData() and clearAll()');

  db.clearUserData = async (scope) => {
    const normalized = String(scope || '');
    if (!VALID_SCOPES.has(normalized)) throw new TypeError(`Unknown deletion scope: ${normalized || '(empty)'}`);
    if (normalized === 'preferences') {
      removeKeys(root.localStorage, PREFERENCE_KEYS);
      return withCompatibility(committedReceipt({ backend: 'localStorage', operation: 'clear-preferences', details: { scope: normalized, keys: PREFERENCE_KEYS } }), { scope: normalized });
    }
    if (normalized === 'all') return db.clearAll();
    const result = await originalClearUserData(normalized);
    return withCompatibility(committedReceipt({ backend: 'indexedDB', operation: `clear-${normalized}`, details: result }), { scope: normalized });
  };

  db.clearAll = async (...args) => {
    const receipt = { primary: null, auxiliary: null, session: false };
    const failures = [];
    try {
      receipt.primary = await originalClearAll(...args);
      receipt.session = true;
      removeKeys(root.sessionStorage, SESSION_KEYS);
      receipt.auxiliary = await lifecycle.requestClose(AUXILIARY_DATABASES, { reason: 'clear-all' });
      for (const name of AUXILIARY_DATABASES) {
        try { await deleteDatabase(root.indexedDB, name); }
        catch (error) { failures.push({ name, message: error?.message || String(error) }); }
      }
      if (failures.length) throw new Error('Auxiliary database deletion incomplete');
      return withCompatibility(committedReceipt({ backend: 'indexedDB', operation: 'clear-all', details: receipt }), { cleared: AUXILIARY_DATABASES });
    } catch (error) {
      notifyDeletionFailure(root, failures);
      return withCompatibility(failedReceipt({ backend: 'indexedDB', operation: 'clear-all', error: error?.message || String(error), details: { ...receipt, failures } }), { failures });
    }
  };

  Object.defineProperty(db, '__storageSafetyInstalled', { value: true });
  root.OpenCourseDeck = root.OpenCourseDeck || {};
  root.OpenCourseDeck.StorageSafety = { validScopes: Object.freeze([...VALID_SCOPES]), auxiliaryDatabases: AUXILIARY_DATABASES };
  installBackupEngine(root);
  installPdfSecurity(root);
  return db;
}
