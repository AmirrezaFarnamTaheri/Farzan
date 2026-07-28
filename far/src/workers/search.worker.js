/* eslint-disable no-undef */
try {
  importScripts('../../vendor/fuse.min.js');
} catch (error) {
  console.warn('[SearchWorker] Failed to load vendored Fuse.js:', error);
}

const MAX_CANCELLED = 2048;
const CANCEL_TTL = 60000;
const state = {
  data: [],
  fuse: null,
  revision: 0,
};
const cancelled = new Map();

function rememberCancelled(id) {
  cancelled.set(id, Date.now());
  while (cancelled.size > MAX_CANCELLED) {
    const oldest = [...cancelled.entries()].sort((a, b) => a[1] - b[1])[0];
    if (!oldest) break;
    cancelled.delete(oldest[0]);
  }
}

function isCancelled(id) {
  const timestamp = cancelled.get(id);
  if (!timestamp) return false;
  if (Date.now() - timestamp > CANCEL_TTL) {
    cancelled.delete(id);
    return false;
  }
  return true;
}

function requestMeta(payload) {
  const meta = {
    id: payload?.id,
    requestId: payload?.requestId,
    generation: payload?.generation,
    resource: payload?.resource ?? null,
    revision: payload?.revision ?? null,
    authority: payload?.authority ?? null,
  };
  if (!Number.isInteger(meta.id) || meta.id <= 0 || meta.requestId !== meta.id) throw Object.assign(new TypeError('Invalid worker request identity'), { code: 'INVALID_WORKER_REQUEST' });
  if (!Number.isInteger(meta.generation) || meta.generation < 0) throw Object.assign(new TypeError('Invalid worker generation'), { code: 'INVALID_WORKER_GENERATION' });
  return meta;
}

function post(type, meta, data = {}) {
  self.postMessage({ type, ...meta, ...data });
}

function assertNotCancelled(meta) {
  if (!isCancelled(meta.requestId)) return;
  throw Object.assign(new Error('Worker request was cancelled'), { code: 'WORKER_CANCELLED' });
}

function initFuse(data, options = {}) {
  if (typeof Fuse !== 'function') throw Object.assign(new Error('Vendored Fuse.js is unavailable'), { code: 'SEARCH_ENGINE_UNAVAILABLE' });
  if (!Array.isArray(data)) throw new TypeError('Search index items must be an array');
  state.data = data;
  state.fuse = new Fuse(data, {
    keys: ['title', 'label', 'description', 'searchText'],
    threshold: 0.3,
    distance: 100,
    includeMatches: true,
    includeScore: true,
    minMatchCharLength: 2,
    ...options,
  });
  state.revision += 1;
}

function search(query, options = {}) {
  if (!state.fuse) throw Object.assign(new Error('Search worker is not initialized'), { code: 'SEARCH_WORKER_NOT_READY' });
  const normalized = String(query ?? '');
  if (!normalized.trim()) return { results: [], query: normalized, matches: [], indexRevision: state.revision };
  const limit = Math.max(1, Math.min(250, Number(options.limit) || 25));
  const fuseResults = state.fuse.search(normalized, { limit });
  return {
    results: fuseResults.map(result => result.item),
    query: normalized,
    matches: fuseResults.map(result => ({ item: result.item, matches: result.matches || [] })),
    indexRevision: state.revision,
  };
}

self.onmessage = function onMessage(event) {
  const payload = event?.data;
  if (payload?.type === 'cancel') {
    if (Number.isInteger(payload.requestId)) rememberCancelled(payload.requestId);
    return;
  }

  let meta = null;
  try {
    meta = requestMeta(payload);
    const data = Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : {};
    assertNotCancelled(meta);
    switch (payload.type) {
      case 'init':
        initFuse(data?.items || [], data?.options || {});
        assertNotCancelled(meta);
        post('init:done', meta, { success: true, itemCount: state.data.length, indexRevision: state.revision });
        break;
      case 'search':
        post('search:done', meta, search(data?.query, data?.options || {}));
        break;
      case 'update':
        if (!Array.isArray(data?.items)) throw new TypeError('Search update requires an items array');
        initFuse(data.items, data.options || {});
        post('update:done', meta, { success: true, itemCount: state.data.length, indexRevision: state.revision });
        break;
      default:
        throw Object.assign(new Error(`Unknown message type: ${payload.type}`), { code: 'UNKNOWN_WORKER_MESSAGE' });
    }
  } catch (error) {
    post('error', meta || {
      id: payload?.id ?? null,
      requestId: payload?.requestId ?? payload?.id ?? null,
      generation: payload?.generation ?? null,
      resource: payload?.resource ?? null,
      revision: payload?.revision ?? null,
      authority: payload?.authority ?? null,
    }, { code: error?.code || 'SEARCH_WORKER_ERROR', error: error?.message || String(error) });
  } finally {
    if (meta) cancelled.delete(meta.requestId);
  }
};
