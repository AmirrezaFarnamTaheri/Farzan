export const AUXILIARY_DATABASES = Object.freeze([
  'opencoursedeck-media',
  'opencoursedeck-translations',
  'opencoursedeck-ai-models',
  'opencoursedeck-templates',
  'opencoursedeck-waveforms',
]);

const AUXILIARY_SET = new Set(AUXILIARY_DATABASES);
const managers = new WeakMap();

function makeId(prefix = 'db-lifecycle') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeNames(names) {
  const values = Array.isArray(names) ? names : [names];
  return [...new Set(values.map(String).filter(name => AUXILIARY_SET.has(name)))];
}

export function installAuxiliaryDbLifecycle(root = window) {
  if (managers.has(root)) return managers.get(root);

  const factory = root?.indexedDB;
  const tracked = new Map(AUXILIARY_DATABASES.map(name => [name, new Map()]));
  const source = makeId('tab');
  let channel = null;
  let originalOpen = null;
  let wrapped = false;

  const forget = (name, db) => tracked.get(name)?.delete(db);
  const track = (name, db) => {
    if (!AUXILIARY_SET.has(name) || !db) return db;
    const record = { db, failures: [] };
    tracked.get(name).set(db, record);
    const onClose = () => forget(name, db);
    const onVersionChange = () => {
      try {
        db.close();
      } catch (error) {
        record.failures.push({ name, message: error?.message || String(error), phase: 'versionchange-close' });
      } finally {
        forget(name, db);
      }
    };
    try { db.addEventListener?.('close', onClose, { once: true }); } catch (error) {
      record.failures.push({ name, message: error?.message || String(error), phase: 'close-listener' });
    }
    try { db.addEventListener?.('versionchange', onVersionChange, { once: true }); } catch (error) {
      record.failures.push({ name, message: error?.message || String(error), phase: 'versionchange-listener' });
    }
    return db;
  };

  const closeLocal = async (names = AUXILIARY_DATABASES, reason = 'requested') => {
    const closed = [];
    const failures = [];
    for (const name of normalizeNames(names)) {
      const connections = [...(tracked.get(name)?.values() || [])];
      for (const record of connections) {
        try {
          record.db.close();
          forget(name, record.db);
          closed.push(name);
        } catch (error) {
          failures.push({ name, message: error?.message || String(error), phase: 'explicit-close' });
        }
        failures.push(...record.failures);
      }
    }
    return { reason, closed: [...new Set(closed)], failures };
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
    requestClose: async (names = AUXILIARY_DATABASES, { reason = 'storage-reset' } = {}) => ({
      requestId: makeId('close'),
      local: await closeLocal(names, reason),
      acknowledgements: [],
    }),
    status() {
      return Object.freeze(Object.fromEntries([...tracked].map(([name, records]) => [name, records.size])));
    },
    dispose() {
      void closeLocal(AUXILIARY_DATABASES, 'dispose');
      if (wrapped && factory && originalOpen) {
        try { Object.defineProperty(factory, 'open', { configurable: true, writable: true, value: originalOpen }); } catch {}
      }
      managers.delete(root);
    },
  });

  managers.set(root, manager);
  root.OpenCourseDeck = root.OpenCourseDeck || {};
  root.OpenCourseDeck.AuxiliaryDbLifecycle = manager;
  return manager;
}
