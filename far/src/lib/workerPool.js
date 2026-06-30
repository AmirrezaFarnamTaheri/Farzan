const IDLE_TIMEOUT = 30000;

const workerDefs = {
  search: { url: new URL('../workers/search.worker.js', import.meta.url).href, instance: null, busy: false, lastUsed: 0 },
  catalog: { url: new URL('../workers/catalog.worker.js', import.meta.url).href, instance: null, busy: false, lastUsed: 0 },
};

let _messageId = 0;
const _pending = new Map();

function _getWorker(name) {
  const def = workerDefs[name];
  if (!def) return null;

  if (def.instance) {
    def.lastUsed = Date.now();
    return def.instance;
  }

  try {
    const worker = new Worker(def.url, { type: 'classic' });
    worker.onmessage = (e) => {
      const { type, id, ...data } = e.data || {};
      const pending = _pending.get(id);
      if (pending) {
        _pending.delete(id);
        def.busy = false;
        def.lastUsed = Date.now();
        if (type === 'error') {
          pending.reject(new Error(data.error || 'Worker error'));
        } else {
          pending.resolve({ type, ...data });
        }
      }
    };
    worker.onerror = (e) => {
      def.busy = false;
      def.instance = null;
      for (const [id, pending] of _pending) {
        _pending.delete(id);
        pending.reject(new Error(`Worker "${name}" crashed: ${e.message || 'unknown error'}`));
      }
      console.warn(`[WorkerPool] Worker "${name}" error:`, e.message);
    };
    def.instance = worker;
    def.lastUsed = Date.now();
    return worker;
  } catch (error) {
    console.warn(`[WorkerPool] Failed to create worker "${name}":`, error);
    return null;
  }
}

function _terminateIdle() {
  const now = Date.now();
  for (const def of Object.values(workerDefs)) {
    if (def.instance && !def.busy && now - def.lastUsed > IDLE_TIMEOUT) {
      try { def.instance.terminate(); } catch { /* */ }
      def.instance = null;
      def.busy = false;
    }
  }
}

let _idleTimer = null;
function _startIdleCheck() {
  if (_idleTimer) return;
  _idleTimer = setInterval(_terminateIdle, 10000);
}

export function runInWorker(workerName, message, { transfer = [], timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const worker = _getWorker(workerName);
    if (!worker) {
      reject(new Error(`Worker "${workerName}" not available`));
      return;
    }

    const def = workerDefs[workerName];
    if (def.busy) {
      reject(new Error(`Worker "${workerName}" is busy`));
      return;
    }

    const id = ++_messageId;
    def.busy = true;

    let timer = null;
    if (timeout > 0) {
      timer = setTimeout(() => {
        _pending.delete(id);
        def.busy = false;
        reject(new Error(`Worker "${workerName}" timed out after ${timeout}ms`));
      }, timeout);
    }

    _pending.set(id, {
      resolve: (result) => {
        if (timer) clearTimeout(timer);
        resolve(result);
      },
      reject: (error) => {
        if (timer) clearTimeout(timer);
        reject(error);
      },
    });

    try {
      worker.postMessage({ type: message.type, id, data: message.data || {} }, transfer);
    } catch (error) {
      _pending.delete(id);
      def.busy = false;
      if (timer) clearTimeout(timer);
      reject(error);
    }

    _startIdleCheck();
  });
}

export function terminateAll() {
  for (const [id, pending] of _pending) {
    _pending.delete(id);
    pending.reject(new Error('Worker pool terminated'));
  }
  for (const def of Object.values(workerDefs)) {
    if (def.instance) {
      try { def.instance.terminate(); } catch { /* */ }
      def.instance = null;
      def.busy = false;
    }
  }
  if (_idleTimer) {
    clearInterval(_idleTimer);
    _idleTimer = null;
  }
}

export function getWorkerStatus() {
  return Object.fromEntries(
    Object.entries(workerDefs).map(([name, def]) => [name, {
      available: !!def.instance,
      busy: def.busy,
      lastUsed: def.lastUsed || null,
    }])
  );
}

const WorkerPool = { runInWorker, terminateAll, getWorkerStatus };
window.OpenCourseDeck = window.OpenCourseDeck || {};
window.OpenCourseDeck.WorkerPool = WorkerPool;
