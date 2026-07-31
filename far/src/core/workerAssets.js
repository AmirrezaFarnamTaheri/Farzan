const WORKER_FILES = Object.freeze({
  search: 'search.worker.js',
  catalog: 'catalog.worker.js',
});

export function resolveWorkerAsset(name, base = globalThis.document?.baseURI || globalThis.location?.href || import.meta.url) {
  const file = WORKER_FILES[name];
  if (!file) throw new Error(`Unknown OpenCourseDeck worker asset: ${name}`);
  return new URL(`src/workers/${file}`, base).href;
}

export const workerAssets = Object.freeze(Object.fromEntries(
  Object.keys(WORKER_FILES).map(name => [name, resolveWorkerAsset(name)]),
));
