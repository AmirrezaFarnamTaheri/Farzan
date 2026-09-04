export const AUXILIARY_DATABASES = Object.freeze([
  'opencoursedeck-media',
  'opencoursedeck-translations',
  'opencoursedeck-ai-models',
  'opencoursedeck-templates',
  'opencoursedeck-waveforms',
  'opencoursedeck-library-files',
]);

const AUXILIARY_SET = new Set(AUXILIARY_DATABASES);
const MAX_FAILURES_PER_CONNECTION = 32;
const managers = new WeakMap();

function makeId(prefix = 'db-lifecycle') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeNames(names) {
  const values = Array.isArray(names) ? names : [names];
  return [...new Set(values.map(String).filter(name => AUXILIARY_SET.has(name)))];
}

function failureRecord(name, error, phase) {
  return Object.freeze({
    name,
    message: error?.message || String(error),
    phase,
  });
}

function rememberFailure(record, failure) {
  record.failures.push(failure);
  if (record.failures.length > MAX_FAILURES_PER_CONNECTION) {
    record.failures.splice(0, record.failures.length - MAX_FAILURES_PER_CONNECTION);
  }
}

export function installAuxiliaryDbLifecycle(root = window) {
  if (managers.has(root)) return managers.get(root);

  const factory = root?.indexedDB;
  const tracked = new Map(AUXILIARY_DATABASES.map(name => [name, new Map()]));
  let originalOpen = null;
  let wrapped = false;

  const forget = (name, db) => tracked.get(name)?.delete(db);
  const track = (name, db) => {
    if (!AUXILIARY_SET.has(name) || !db) return db;
    const existing = tracked.get(name).get(db);
    if (existing) return db;

    const record = { db, failures: [] };
    tracked.get(name).set(db, record);
    const onClose = () => forget(name, db);
    const onVersionChange = () => {
      try {
        db.close();
        forget(name, db);
      } catch (error) {
        rememberFailure(record, failureRecord(name, error, 'versionchange-close'));
      }
    };
    try { db.addEventListener?.('close', onClose, { once: true }); } catch (error) {
      rememberFailure(record, failureRecord(name, error, 'close-listener'));
    }
    try { db.addEventListener?.('versionchange', onVersionChange); } catch (error) {
      rememberFailure(record, failureRecord(name, error, 'versionchange-listener'));
    }
    return db;
  };

  const status = () => Object.freeze(Object.fromEntries(
    [...tracked].map(([name, records]) => [name, records.size]),
  ));

  const closeLocal = async (names = AUXILIARY_DATABASES, reason = 'requested') => {
    const closed = [];
    const failures = [];
    for (const name of normalizeNames(names)) {
      const connections = [...(tracked.get(name)?.values() || [])];
      for (const record of connections) {
        failures.push(...record.failures);
        try {
          record.db.close();
          forget(name, record.db);
          closed.push(name);
        } catch (error) {
          const failure = failureRecord(name, error, 'explicit-close');
          rememberFailure(record, failure);
          failures.push(failure);
        }
      }
    }
    const remaining = status();
    const remainingNames = Object.entries(remaining)
      .filter(([, count]) => count > 0)
      .map(([name]) => name);
    for (const name of remainingNames) {
      if (!failures.some(failure => failure.name === name)) {
        failures.push(Object.freeze({ name, phase: 'still-open', message: 'Auxiliary database connection remained open after close request' }));
      }
    }
    return Object.freeze({
      reason,
      closed: [...new Set(closed)],
      failures,
      remaining,
      committed: failures.length === 0 && remainingNames.length === 0,
    });
  };

  if (factory && typeof factory.open === 'function') {
    originalOpen = factory.open.bind(factory);
    const open = function open(name, version) {
      const request = version === undefined ? originalOpen(name) : originalOpen(name, version);
      if (AUXILIARY_SET.has(String(name))) {
        const capture = () => track(String(name), request.result);
        try { request.addEventListener('success', capture, { once: true }); }
        catch {
          const previous = request.onsuccess;
          request.onsuccess = (event) => {
            capture();
            previous?.call(request, event);
          };
        }
      }
      return request;
    };
    try {
      Object.defineProperty(factory, 'open', { configurable: true, writable: true, value: open });
      wrapped = true;
    } catch {
      try { factory.open = open; wrapped = factory.open === open; } catch {}
    }
  }

  const manager = Object.freeze({
    databases: AUXILIARY_DATABASES,
    track,
    closeLocal,
    requestClose: async (names = AUXILIARY_DATABASES, { reason = 'storage-reset' } = {}) => {
      const local = await closeLocal(names, reason);
      return Object.freeze({
        requestId: makeId('close'),
        local,
        acknowledgements: [],
        committed: local.committed,
      });
    },
    status,
    failures() {
      return Object.freeze(Object.fromEntries(
        [...tracked].map(([name, records]) => [name, Object.freeze(
          [...records.values()].flatMap(record => record.failures),
        )]),
      ));
    },
    async dispose() {
      const result = await closeLocal(AUXILIARY_DATABASES, 'dispose');
      if (wrapped && factory && originalOpen) {
        try { Object.defineProperty(factory, 'open', { configurable: true, writable: true, value: originalOpen }); } catch {}
      }
      managers.delete(root);
      return result;
    },
  });

  managers.set(root, manager);
  root.OpenCourseDeck = root.OpenCourseDeck || {};
  root.OpenCourseDeck.AuxiliaryDbLifecycle = manager;
  return manager;
}
