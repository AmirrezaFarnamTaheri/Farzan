import { installAuxiliaryDbLifecycle, AUXILIARY_DATABASES } from './auxiliaryDbLifecycle.js';
import { installBackupEngine } from './backupEngine.js';
import { installPdfSecurity } from './pdfSecurity.js';
import { committedReceipt, failedReceipt } from './mutationReceipt.js';

const VALID_SCOPES = new Set(['progress', 'notes', 'media', 'playlists', 'studio', 'preferences', 'all']);
const PREFERENCE_KEYS = ['ocd_accent', 'ocd_density', 'ocd_font_scale', 'ocd_dir', 'ocd_theme', 'ocd_sidebar_collapsed', 'plasma_accent', 'plasma_density', 'plasma_font_scale', 'plasma_dir', 'plasma_theme', 'plasma_sidebar_collapsed', 'plasma-intro-seen', 'plasma-session', 'plasma-theme', 'plasma-sidebar-collapsed', 'plasma-accent', 'plasma-dir'];
const SESSION_KEYS = ['ocd_pending_topic', 'ocd_pending_position', 'ocd_pending_course_session', 'ocd_pending_pdf_doc', 'ocd_pending_pdf_page', 'ocd_ai_api_key_session', 'ocd_ai_authority_session', 'plasma-ai-api-key-session', 'plasma-ai-authority-session', 'pd-player', 'pd-player-playlist'];

function unavailableFailure(backend) {
  return {
    backend,
    name: backend,
    unavailable: true,
    message: `${backend} is unavailable; deletion could not be verified`,
  };
}

function removeKeys(storage, keys, backend) {
  const cleared = [];
  const failures = [];
  if (typeof storage?.removeItem !== 'function' || typeof storage?.getItem !== 'function') {
    failures.push(unavailableFailure(backend));
    return { cleared, failures, backend, available: false };
  }
  for (const key of keys) {
    try {
      storage.removeItem(key);
      if (storage.getItem(key) != null) throw new Error(`Key ${key} remained after deletion`);
      cleared.push(key);
    } catch (error) {
      failures.push({ backend, key, name: key, message: error?.message || String(error) });
    }
  }
  return { cleared, failures, backend, available: true };
}

function requireCommitted(result, operation) {
  const parts = Array.isArray(result?.parts) ? result.parts : [];
  const failures = Array.isArray(result?.failures) ? [...result.failures] : [];
  for (const part of parts) {
    if (part?.available === false) failures.push(unavailableFailure(part.backend || 'indexedDB'));
    if (part?.durable === false && !part?.failures?.length) {
      failures.push({
        backend: part.backend || 'indexedDB',
        name: part.backend || 'indexedDB',
        message: `${part.backend || 'storage'} did not return durable deletion evidence`,
      });
    }
  }
  if (result?.committed === true && result?.durable !== false && failures.length === 0) return result;
  const receipt = failedReceipt({
    backend: result?.backend || 'indexedDB',
    operation,
    error: result?.error || `${operation} did not return a durable committed receipt`,
    details: { ...(result || {}), failures },
  });
  throw deletionFailure(new Error(receipt.error), withCompatibility(receipt, { failures }));
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
    if (!factory) return reject(new Error(`IndexedDB is unavailable; ${name} deletion could not be verified`));
    const request = factory.deleteDatabase(name);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error || new Error(`Failed to delete ${name}`));
    request.onblocked = () => reject(new Error(`Deletion of ${name} is blocked by another open connection`));
  });
}

const FRIENDLY_FAILURE_LABELS = new Map([
  ['notes', 'Notes'],
  ['folders', 'Notes'],
  ['opencoursedeck-templates', 'Notes'],
  ['progress', 'Learning progress'],
  ['timestamps', 'Media progress'],
  ['watchedSegments', 'Media progress'],
  ['pdfBookmarks', 'Document data'],
  ['annotations', 'Document data'],
  ['opencoursedeck-translations', 'Translation cache'],
  ['opencoursedeck-media', 'Offline media'],
  ['plasma-playlists', 'Playlists'],
  ['plasma-studio-board', 'Studio data'],
  ['plasma-canvas-board', 'Studio data'],
  ['primary-storage', 'Primary app data'],
  ['localStorage', 'Browser storage'],
  ['sessionStorage', 'Session data'],
  ['indexedDB', 'Local app data'],
  ['settings', 'App settings'],
]);

function failureLabel(failure) {
  const candidates = [failure?.name, failure?.key, failure?.store, failure?.backend].filter(Boolean);
  for (const candidate of candidates) {
    if (FRIENDLY_FAILURE_LABELS.has(candidate)) return FRIENDLY_FAILURE_LABELS.get(candidate);
    if (PREFERENCE_KEYS.includes(candidate)) return 'Preferences';
    if (SESSION_KEYS.includes(candidate)) return 'Session data';
    if (/note|folder|template/i.test(candidate)) return 'Notes';
    if (/progress|timestamp|watched/i.test(candidate)) return 'Learning progress';
    if (/pdf|annotation|document/i.test(candidate)) return 'Document data';
    if (/playlist/i.test(candidate)) return 'Playlists';
    if (/studio|canvas/i.test(candidate)) return 'Studio data';
  }
  return 'Local app data';
}

function notifyDeletionFailure(root, failures) {
  if (!failures.length) return;
  const labels = [...new Set(failures.map(failureLabel))].join(', ');
  const blocked = failures.some(failure => /blocked/i.test(failure.message));
  const guidance = blocked
    ? 'Deletion is blocked by another open tab or process. Close other OpenCourseDeck tabs and retry.'
    : 'Close other OpenCourseDeck tabs, check browser storage permissions, and retry.';
  try { root.OpenCourseDeck?.Toast?.error?.(`Local data reset incomplete for: ${labels}. ${guidance}`); } catch {}
}

function deletionFailure(error, receipt) {
  const failure = error instanceof Error ? error : new Error(String(error || 'Local data reset failed'));
  failure.code = failure.code || 'STORAGE_RESET_INCOMPLETE';
  Object.assign(failure, receipt);
  failure.receipt = receipt;
  return failure;
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
      const result = removeKeys(root.localStorage, PREFERENCE_KEYS, 'localStorage');
      if (result.failures.length) {
        notifyDeletionFailure(root, result.failures);
        const failed = withCompatibility(failedReceipt({
          backend: 'localStorage',
          operation: 'clear-preferences',
          error: 'Preference deletion incomplete',
          details: result,
        }), { scope: normalized, failures: result.failures, cleared: result.cleared });
        throw deletionFailure(new Error('Preference deletion incomplete'), failed);
      }
      return withCompatibility(committedReceipt({
        backend: 'localStorage',
        operation: 'clear-preferences',
        details: { scope: normalized, keys: result.cleared },
      }), { scope: normalized, cleared: result.cleared });
    }
    if (normalized === 'all') return db.clearAll();
    let result;
    try {
      result = requireCommitted(await originalClearUserData(normalized), `clear-${normalized}`);
    } catch (error) {
      notifyDeletionFailure(root, error?.failures || error?.receipt?.failures || []);
      throw error;
    }
    return withCompatibility(committedReceipt({
      backend: 'indexedDB+localStorage',
      operation: `clear-${normalized}`,
      details: result,
    }), { scope: normalized, cleared: result.parts?.flatMap(part => part.cleared || []) || [] });
  };

  db.clearAll = async (...args) => {
    const receipt = { primary: null, auxiliary: null, session: null };
    const failures = [];
    try {
      try {
        receipt.primary = requireCommitted(await originalClearAll(...args), 'clear-all');
      } catch (error) {
        receipt.primary = error?.receipt || error?.receipt?.details || null;
        failures.push(...(error?.failures || error?.receipt?.failures || [{ name: 'primary-storage', message: error?.message || String(error) }]));
      }

      receipt.session = removeKeys(root.sessionStorage, SESSION_KEYS, 'sessionStorage');
      failures.push(...receipt.session.failures);

      receipt.auxiliary = await lifecycle.requestClose(AUXILIARY_DATABASES, { reason: 'clear-all' });
      failures.push(...(receipt.auxiliary?.local?.failures || []));
      for (const acknowledgement of receipt.auxiliary?.acknowledgements || []) failures.push(...(acknowledgement.failures || []));
      for (const name of AUXILIARY_DATABASES) {
        try { await deleteDatabase(root.indexedDB, name); }
        catch (error) { failures.push({ name, backend: 'indexedDB', message: error?.message || String(error) }); }
      }
      if (failures.length) throw new Error('Storage deletion incomplete');
      return withCompatibility(committedReceipt({
        backend: 'indexedDB+localStorage+sessionStorage',
        operation: 'clear-all',
        details: receipt,
      }), { cleared: [...(receipt.primary?.parts?.flatMap(part => part.cleared || []) || []), ...AUXILIARY_DATABASES] });
    } catch (error) {
      notifyDeletionFailure(root, failures);
      const failed = withCompatibility(failedReceipt({
        backend: 'indexedDB+localStorage+sessionStorage',
        operation: 'clear-all',
        error: error?.message || String(error),
        details: { ...receipt, failures },
      }), { failures });
      throw deletionFailure(error, failed);
    }
  };

  Object.defineProperty(db, '__storageSafetyInstalled', { value: true });
  root.OpenCourseDeck = root.OpenCourseDeck || {};
  root.OpenCourseDeck.StorageSafety = { validScopes: Object.freeze([...VALID_SCOPES]), auxiliaryDatabases: AUXILIARY_DATABASES };
  installBackupEngine(root);
  installPdfSecurity(root);
  return db;
}
