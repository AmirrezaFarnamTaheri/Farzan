/**
 * Keep the public WorkerPool method signatures available synchronously while
 * deferring its sizable implementation until the first real worker request.
 *
 * Both getWorkerStatus() and terminateAll() remain synchronous. A request made
 * while the loader is pending is suppressed if terminateAll() wins the race.
 * This adapter does not create, preload or precache workers on its own.
 */
function coldStatus() {
  const state = () => ({
    available: false,
    busy: false,
    pending: 0,
    generation: 0,
    lastUsed: null,
  });
  return { search: state(), catalog: state() };
}

function validModule(api) {
  return api && ['runInWorker', 'terminateAll', 'getWorkerStatus']
    .every(name => typeof api[name] === 'function');
}

export function createLazyWorkerPool({ load } = {}) {
  if (typeof load !== 'function') throw new TypeError('WorkerPool loader must be a function');

  let loaded = null;
  let loading = null;
  let epoch = 0;

  const getModule = () => {
    if (loaded) return Promise.resolve(loaded);
    if (loading) return loading;
    let importResult;
    try {
      importResult = load();
    } catch (error) {
      return Promise.reject(error);
    }
    loading = Promise.resolve(importResult)
      .then(module => {
        if (!validModule(module)) throw new TypeError('Invalid WorkerPool module API');
        loaded = module;
        return module;
      })
      .catch(error => {
        // A transient chunk/network failure must not permanently poison
        // the public namespace; the next explicit request may try again.
        loading = null;
        throw error;
      });
    return loading;
  };

  return {
    runInWorker(name, message, options) {
      const requestEpoch = epoch;
      return getModule().then(module => {
        if (requestEpoch !== epoch) {
          const error = new Error('Worker pool terminated during module loading');
          error.code = 'WORKER_POOL_TERMINATED';
          throw error;
        }
        return module.runInWorker(name, message, options);
      });
    },
    terminateAll() {
      epoch += 1;
      loaded?.terminateAll();
    },
    getWorkerStatus() {
      return loaded ? loaded.getWorkerStatus() : coldStatus();
    },
  };
}
