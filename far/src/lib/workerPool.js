const IDLE_TIMEOUT = 30000;
const IDLE_CHECK_INTERVAL = 10000;

const workerDefs = {
  search: createDefinition(new URL('../workers/search.worker.js', import.meta.url).href),
  catalog: createDefinition(new URL('../workers/catalog.worker.js', import.meta.url).href),
};

let messageId = 0;
let idleTimer = null;

function createDefinition(url) {
  return {
    url,
    instance: null,
    generation: 0,
    pending: new Map(),
    lastUsed: 0,
  };
}

function staleWorkerError(workerName) {
  const error = new Error(`Worker "${workerName}" request became stale`);
  error.code = 'STALE_WORKER_REQUEST';
  return error;
}

function isBusy(def) {
  return def.pending.size > 0;
}

function rejectGeneration(def, generation, error) {
  for (const [id, pending] of def.pending) {
    if (pending.generation !== generation) continue;
    def.pending.delete(id);
    pending.reject(error);
  }
}

function destroyWorker(def, error = null) {
  const generation = def.generation;
  const worker = def.instance;
  def.instance = null;
  def.generation += 1;
  if (worker) {
    try { worker.terminate(); } catch {}
  }
  if (error) rejectGeneration(def, generation, error);
}

function getWorker(name) {
  const def = workerDefs[name];
  if (!def) return null;

  if (def.instance) {
    def.lastUsed = Date.now();
    return { worker: def.instance, generation: def.generation, def };
  }

  try {
    const generation = def.generation;
    const worker = new Worker(def.url, { type: 'classic' });

    worker.onmessage = (event) => {
      const { type, id, ...data } = event.data || {};
      const pending = def.pending.get(id);
      if (!pending || pending.generation !== generation) return;
      if (pending.context && !pending.context()) {
        def.pending.delete(id);
        pending.reject(staleWorkerError(name));
        return;
      }
      def.pending.delete(id);
      def.lastUsed = Date.now();
      if (type === 'error') pending.reject(new Error(data.error || 'Worker error'));
      else pending.resolve({ type, ...data });
    };

    worker.onerror = (event) => {
      if (def.instance !== worker || def.generation !== generation) return;
      const error = new Error(`Worker "${name}" crashed: ${event.message || 'unknown error'}`);
      destroyWorker(def, error);
      console.warn(`[WorkerPool] Worker "${name}" error:`, event.message);
    };

    def.instance = worker;
    def.lastUsed = Date.now();
    return { worker, generation, def };
  } catch (error) {
    console.warn(`[WorkerPool] Failed to create worker "${name}":`, error);
    return null;
  }
}

function terminateIdleWorkers() {
  const now = Date.now();
  for (const def of Object.values(workerDefs)) {
    if (def.instance && !isBusy(def) && now - def.lastUsed > IDLE_TIMEOUT) destroyWorker(def);
  }
}

function startIdleCheck() {
  if (idleTimer) return;
  idleTimer = setInterval(terminateIdleWorkers, IDLE_CHECK_INTERVAL);
}

export function runInWorker(workerName, message, { transfer = [], timeout = 30000, signal, context = null } = {}) {
  return new Promise((resolve, reject) => {
    const handle = getWorker(workerName);
    if (!handle) {
      reject(new Error(`Worker "${workerName}" not available`));
      return;
    }

    const { worker, generation, def } = handle;
    if (isBusy(def)) {
      reject(new Error(`Worker "${workerName}" is busy`));
      return;
    }

    const id = ++messageId;
    let timer = null;
    let abortListener = null;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (abortListener) signal?.removeEventListener?.('abort', abortListener);
    };
    const settle = (fn) => (value) => {
      cleanup();
      fn(value);
    };

    const requestContext = () => !signal?.aborted && (!context || context.isCurrent());

    def.pending.set(id, {
      generation,
      context: requestContext,
      resolve: settle(resolve),
      reject: settle(reject),
    });

    if (signal) {
      abortListener = () => {
        const pending = def.pending.get(id);
        if (!pending) return;
        def.pending.delete(id);
        pending.reject(new DOMException('Worker request aborted', 'AbortError'));
        destroyWorker(def);
      };
      if (signal.aborted) abortListener();
      else signal.addEventListener('abort', abortListener, { once: true });
    }

    if (timeout > 0) {
      timer = setTimeout(() => {
        const pending = def.pending.get(id);
        if (!pending || pending.generation !== generation) return;
        def.pending.delete(id);
        const error = new Error(`Worker "${workerName}" timed out after ${timeout}ms`);
        destroyWorker(def, error);
        pending.reject(error);
      }, timeout);
    }

    try {
      worker.postMessage({ type: message.type, id, data: message.data || {} }, transfer);
    } catch (error) {
      def.pending.delete(id);
      cleanup();
      reject(error);
    }

    startIdleCheck();
  });
}

export function terminateAll() {
  for (const [name, def] of Object.entries(workerDefs)) {
    destroyWorker(def, new Error(`Worker pool terminated: ${name}`));
  }
  if (idleTimer) {
    clearInterval(idleTimer);
    idleTimer = null;
  }
}

export function getWorkerStatus() {
  return Object.fromEntries(Object.entries(workerDefs).map(([name, def]) => [name, {
    available: Boolean(def.instance),
    busy: isBusy(def),
    pending: def.pending.size,
    generation: def.generation,
    lastUsed: def.lastUsed || null,
  }]));
}

const WorkerPool = { runInWorker, terminateAll, getWorkerStatus };
window.OpenCourseDeck = window.OpenCourseDeck || {};
window.OpenCourseDeck.WorkerPool = WorkerPool;
