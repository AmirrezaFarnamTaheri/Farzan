import { createOperationContext } from '../core/operationContext.js';

const IDLE_TIMEOUT = 30000;
const IDLE_CHECK_INTERVAL = 10000;
const MAX_CANCELLED = 2048;
const CANCEL_TTL = 60000;

const workerDefs = {
  search: createDefinition(new URL('../workers/search.worker.js', import.meta.url).href),
  catalog: createDefinition(new URL('../workers/catalog.worker.js', import.meta.url).href),
};

let messageId = 0;
let idleTimer = null;

function createDefinition(url) {
  return { url, instance: null, generation: 0, pending: new Map(), cancelled: new Map(), lastUsed: 0 };
}

function rememberCancelled(def, id) {
  def.cancelled.set(id, Date.now());
  while (def.cancelled.size > MAX_CANCELLED) {
    const oldest = [...def.cancelled.entries()].sort((a, b) => a[1] - b[1])[0];
    if (!oldest) break;
    def.cancelled.delete(oldest[0]);
  }
}

function wasCancelled(def, id) {
  const time = def.cancelled.get(id);
  if (!time) return false;
  if (Date.now() - time > CANCEL_TTL) {
    def.cancelled.delete(id);
    return false;
  }
  return true;
}

function safeReject(pending, error) {
  try { pending.reject(error); } catch (rejectError) { console.warn('[WorkerPool] teardown rejection', rejectError); }
}

function destroyWorker(def, error = null) {
  const generation = def.generation;
  const worker = def.instance;
  def.instance = null;
  def.generation += 1;
  try { worker?.terminate?.(); } catch {}
  for (const [id, pending] of def.pending) {
    if (pending.generation !== generation) continue;
    def.pending.delete(id);
    pending.operationContext.invalidate();
    rememberCancelled(def, id);
    if (error) safeReject(pending, error);
  }
}

function getWorker(name) {
  const def = workerDefs[name];
  if (!def) return null;
  if (def.instance) return { worker: def.instance, generation: def.generation, def };
  const generation = def.generation;
  const worker = new Worker(def.url, { type: 'classic' });
  worker.onmessage = (event) => {
    if (def.instance !== worker || def.generation !== generation) return;
    const payload = event.data ?? {};
    if (wasCancelled(def, payload.id)) return;
    const pending = def.pending.get(payload.id);
    if (!pending) return;
    if (!pending.operationContext.isCurrent()) {
      def.pending.delete(payload.id);
      safeReject(pending, staleWorkerError(name, payload.id, generation));
      return;
    }
    def.pending.delete(payload.id);
    if (payload.type === 'error') {
      const error = new Error(payload.error || 'Worker error');
      error.code = payload.code || 'WORKER_ERROR';
      safeReject(pending, error);
      return;
    }
    pending.resolve(payload);
  };
  worker.onerror = () => destroyWorker(def, new Error(`Worker ${name} crashed`));
  def.instance = worker;
  return { worker, generation, def };
}

export function runInWorker(workerName, message, options = {}) {
  return new Promise((resolve, reject) => {
    const handle = getWorker(workerName);
    if (!handle) return reject(new Error(`Worker ${workerName} unavailable`));
    const { worker, generation, def } = handle;
    const id = ++messageId;
    const operationContext = createOperationContext({
      resource: options.resource ?? workerName,
      revision: options.revision ?? null,
      generation,
      authority: options.authority ?? null,
      signal: options.signal,
    });
    const pending = { generation, operationContext, resolve, reject };
    def.pending.set(id, pending);
    const cancel = () => {
      def.pending.delete(id);
      rememberCancelled(def, id);
      operationContext.invalidate();
      try { worker.postMessage({ type: 'cancel', id, requestId: id, generation }); } catch {}
    };
    if (options.signal) options.signal.addEventListener('abort', cancel, { once: true });
    if (options.timeout) setTimeout(() => {
      if (!def.pending.has(id)) return;
      cancel();
      destroyWorker(def, new Error('Worker timeout'));
    }, options.timeout);
    try {
      worker.postMessage({ ...message, id, requestId: id, generation, resource: operationContext.resource, revision: operationContext.revision, authority: operationContext.authority });
    } catch (error) {
      cancel();
      reject(error);
    }
  });
}

export function terminateAll() {
  Object.values(workerDefs).forEach(def => destroyWorker(def, new Error('Worker pool terminated')));
  if (idleTimer) clearInterval(idleTimer);
  idleTimer = null;
}

export function getWorkerStatus() {
  return Object.fromEntries(Object.entries(workerDefs).map(([name, def]) => [name, { pending: def.pending.size, generation: def.generation, available: Boolean(def.instance) }]));
}

const WorkerPool = { runInWorker, terminateAll, getWorkerStatus };
if (typeof window !== 'undefined') {
  window.OpenCourseDeck = window.OpenCourseDeck || {};
  window.OpenCourseDeck.WorkerPool = WorkerPool;
}
