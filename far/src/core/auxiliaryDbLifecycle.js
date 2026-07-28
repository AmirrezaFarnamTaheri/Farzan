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
  const tracked = new Map(AUXILIARY_DATABASES.map(name => [name, new Set()]));
  const source = makeId('tab');
  let channel = null;
  let originalOpen = null;
  let wrapped = false;

  const forget = (name, db) => tracked.get(name)?.delete(db);
  const track = (name, db) => {
    if (!AUXILIARY_SET.has(name) || !db) return db;
    tracked.get(name).add(db);
    const onClose = () => forget(name, db);
    const onVersionChange = () => {
      try {
        db.close();
      } finally {
        forget(name, db);
      }
    };
    try { db.addEventListener?.('close', onClose, { once: true }); } catch {}
    try { db.addEventListener?.('versionchange', onVersionChange, { once: true }); } catch {}
    return db;
  };

  const closeLocal = async (names = AUXILIARY_DATABASES, reason = 'requested') => {
    const closed = [];
    const failures = [];
    for (const name of normalizeNames(names)) {
      const connections = [...(tracked.get(name) || [])];
      for (const db of connections) {
        try {
          db.close();
          forget(name, db);
          closed.push(name);
        } catch (error) {
          failures.push({ name, message: error?.message || String(error) });
        }
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

  if (typeof root?.BroadcastChannel === 'function') {
    try {
      channel = new root.BroadcastChannel('opencoursedeck-db-lifecycle');
      channel.onmessage = async (event) => {
        const message = event?.data;
        if (!message || message.source === source || message.type !== 'close-request') return;
        const result = await closeLocal(message.names, message.reason || 'cross-tab-request');
        try {
          channel.postMessage({
            type: 'close-ack',
            source,
            requestId: message.requestId,
            closed: result.closed,
            failures: result.failures,
          });
        } catch {}
      };
    } catch {
      channel = null;
    }
  }

  const requestClose = async (names = AUXILIARY_DATABASES, {
    reason = 'storage-reset',
    settleMs = 75,
  } = {}) => {
    const normalized = normalizeNames(names);
    const requestId = makeId('close');
    const acknowledgements = [];
    const onMessage = (event) => {
      const message = event?.data;
      if (message?.type === 'close-ack' && message.requestId === requestId) acknowledgements.push(message);
    };
    try { channel?.addEventListener?.('message', onMessage); } catch {}
    try {
      channel?.postMessage?.({ type: 'close-request', source, requestId, names: normalized, reason });
      const local = await closeLocal(normalized, reason);
      if (channel && settleMs > 0) await new Promise(resolve => setTimeout(resolve, settleMs));
      return { requestId, local, acknowledgements };
    } finally {
      try { channel?.removeEventListener?.('message', onMessage); } catch {}
    }
  };

  const manager = Object.freeze({
    databases: AUXILIARY_DATABASES,
    track,
    closeLocal,
    requestClose,
    status() {
      return Object.freeze(Object.fromEntries([...tracked].map(([name, set]) => [name, set.size])));
    },
    dispose() {
      void closeLocal(AUXILIARY_DATABASES, 'dispose');
      try { channel?.close?.(); } catch {}
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
