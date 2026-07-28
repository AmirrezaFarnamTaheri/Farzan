import { createOperationContext } from '../core/operationContext.js';

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

function staleWorkerError(workerName, requestId = null, generation = null) {
  const error = new Error(`Worker "${workerName}" request became stale`);
  error.code = 'STALE_WORKER_REQUEST';
  error.requestId = requestId;
  error.generation = generation;
  return error;
}

function supersededWorkerError(workerName, supersedeKey) {
  const error = new Error(`Worker "${workerName}" request was superseded`);
  error.code = 'WORKER_SUPERSEDED';
  error.supersedeKey = supersedeKey;
  return error;
}

function abortError(reason) {
  if (typeof DOMException === 'function') return new DOMException(reason || 'Worker request aborted', 'AbortError');
  const error = new Error(reason || 'Worker request aborted');
  error.name = 'AbortError';
  return error;
}

function stableIdentity(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableIdentity).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableIdentity(value[key])}`).join(',')}}`;
}

function sameIdentity(left, right) {
  return stableIdentity(left) === stableIdentity(right);
}

function isBusy(def) {
  return def.pending.size > 0;
}

function maybeStopIdleCheck() {
  if (!idleTimer) return;
  const active = Object.values(workerDefs).some(def => def.instance || def.pending.size);
  if (!active) {
    clearInterval(idleTimer);
    idleTimer = null;
  }
}

function rejectGeneration(def, generation, error) {
  for (const [id, pending] of def.pending) {
    if (pending.generation !== generation) continue;
    def.pending.delete(id);
    pending.operationContext.invalidate();
    pending.reject(error);
  }
  maybeStopIdleCheck();
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
  maybeStopIdleCheck();
}

function responseMatchesRequest(payload, pending, workerGeneration) {
  return payload?.id === pending.requestId
    && payload?.requestId === pending.requestId
    && payload?.generation === pending.generation
    && workerGeneration === pending.generation
    && payload?.resource === pending.operationContext.resource
    && payload?.revision === pending.operationContext.revision
    && sameIdentity(payload?.authority ?? null, pending.operationContext.authority ?? null)
    && pending.operationContext.isCurrent()
    && (!pending.parentContext || pending.parentContext.isCurrent());
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
      const payload = event.data || {};
      const pending = def.pending.get(payload.id);
      if (!pending) return;
      if (!responseMatchesRequest(payload, pending, generation)) {
        def.pending.delete(payload.id);
        pending.operationContext.invalidate();
        pending.reject(staleWorkerError(name, payload.id, generation));
        maybeStopIdleCheck();
        return;
      }

      def.pending.delete(payload.id);
      def.lastUsed = Date.now();
      const { type, id, requestId, generation: responseGeneration, resource, revision, authority, ...data } = payload;
      const provenance = Object.freeze({ requestId, generation: responseGeneration, resource, revision, authority });
      if (type === 'error') {
        const error = new Error(data.error || 'Worker error');
        error.code = data.code || 'WORKER_ERROR';
        error.provenance = provenance;
        pending.reject(error);
      } else {
        pending.resolve({ type, ...data, provenance });
      }
      maybeStopIdleCheck();
    };

    worker.onerror = (event) => {
      if (def.instance !== worker || def.generation !== generation) return;
      const error = new Error(`Worker "${name}" crashed: ${event.message || 'unknown error'}`);
      error.code = 'WORKER_CRASH';
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
  maybeStopIdleCheck();
}

function startIdleCheck() {
  if (idleTimer) return;
  idleTimer = setInterval(terminateIdleWorkers, IDLE_CHECK_INTERVAL);
}

function supersedePending(def, workerName, supersedeKey) {
  if (!supersedeKey) return;
  for (const [id, pending] of def.pending) {
    if (pending.supersedeKey !== supersedeKey) continue;
    def.pending.delete(id);
    pending.operationContext.invalidate();
    pending.reject(supersededWorkerError(workerName, supersedeKey));
  }
}

export function runInWorker(workerName, message, {
  transfer = [],
  timeout = 30000,
  signal = null,
  context: parentContext = null,
  resource = null,
  revision = null,
  authority = null,
  supersedeKey = null,
} = {}) {
  return new Promise((resolve, reject) => {
    const handle = getWorker(workerName);
    if (!handle) {
      const error = new Error(`Worker "${workerName}" not available`);
      error.code = 'WORKER_UNAVAILABLE';
      reject(error);
      return;
    }

    const { worker, generation, def } = handle;
    supersedePending(def, workerName, supersedeKey);

    const id = ++messageId;
    const operationContext = createOperationContext({
      resource: resource ?? parentContext?.resource ?? workerName,
      revision: revision ?? parentContext?.revision ?? null,
      generation,
      authority: authority ?? parentContext?.authority ?? null,
      signal,
    });
    let timer = null;
    let abortListener = null;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (abortListener) signal?.removeEventListener?.('abort', abortListener);
    };
    const settle = fn => value => {
      cleanup();
      fn(value);
    };

    def.pending.set(id, {
      requestId: id,
      generation,
      operationContext,
      parentContext,
      supersedeKey,
      resolve: settle(resolve),
      reject: settle(reject),
    });

    if (signal) {
      abortListener = () => {
        const pending = def.pending.get(id);
        if (!pending) return;
        def.pending.delete(id);
        pending.operationContext.invalidate();
        pending.reject(abortError(signal.reason?.message || 'Worker request aborted'));
        maybeStopIdleCheck();
      };
      if (signal.aborted) {
        abortListener();
        return;
      }
      signal.addEventListener('abort', abortListener, { once: true });
    }

    if (timeout > 0) {
      timer = setTimeout(() => {
        const pending = def.pending.get(id);
        if (!pending || pending.generation !== generation) return;
        def.pending.delete(id);
        pending.operationContext.invalidate();
        const error = new Error(`Worker "${workerName}" timed out after ${timeout}ms`);
        error.code = 'WORKER_TIMEOUT';
        pending.reject(error);
        maybeStopIdleCheck();
      }, timeout);
    }

    try {
      worker.postMessage({
        type: message.type,
        id,
        requestId: id,
        generation,
        resource: operationContext.resource,
        revision: operationContext.revision,
        authority: operationContext.authority,
        data: message.data ?? {},
      }, transfer);
    } catch (error) {
      def.pending.delete(id);
      operationContext.invalidate();
      cleanup();
      reject(error);
      maybeStopIdleCheck();
      return;
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
