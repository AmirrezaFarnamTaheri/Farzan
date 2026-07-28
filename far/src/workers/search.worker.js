/* eslint-disable no-undef */
// Vendored copy only: a CDN fallback would execute remote code without
// integrity pinning and contradicts the offline-first security posture.
try {
  importScripts('../../vendor/fuse.min.js');
} catch (error) {
  console.warn('[SearchWorker] Failed to load vendored Fuse.js:', error);
}

const state = {
  data: [],
  fuse: null,
  revision: 0,
};
const cancelled = new Set();

function requestMeta(payload) {
  const meta = {
    id: payload?.id,
    requestId: payload?.requestId,
    generation: payload?.generation,
    resource: payload?.resource ?? null,
    revision: payload?.revision ?? null,
    authority: payload?.authority ?? null,
  };
  if (!Number.isInteger(meta.id) || meta.id <= 0 || meta.requestId !== meta.id) {
    const error = new TypeError('Invalid worker request identity');
    error.code = 'INVALID_WORKER_REQUEST';
    throw error;
  }
  if (!Number.isInteger(meta.generation) || meta.generation < 0) {
    const error = new TypeError('Invalid worker generation');
    error.code = 'INVALID_WORKER_GENERATION';
    throw error;
  }
  return meta;
}

function post(type, meta, data = {}) {
  self.postMessage({ type, ...meta, ...data });
}

function assertNotCancelled(meta) {
  if (!cancelled.has(meta.requestId)) return;
  cancelled.delete(meta.requestId);
  const error = new Error('Worker request was cancelled');
  error.code = 'WORKER_CANCELLED';
  throw error;
}

function initFuse(data, options = {}) {
  if (typeof Fuse !== 'function') {
    const error = new Error('Vendored Fuse.js is unavailable');
    error.code = 'SEARCH_ENGINE_UNAVAILABLE';
    throw error;
  }
  if (!Array.isArray(data)) throw new TypeError('Search index items must be an array');
  const defaultOptions = {
    keys: ['title', 'label', 'description', 'searchText'],
    threshold: 0.3,
    distance: 100,
    includeMatches: true,
    includeScore: true,
    minMatchCharLength: 2,
  };
  state.data = data;
  state.fuse = new Fuse(data, { ...defaultOptions, ...options });
  state.revision += 1;
}

function search(query, options = {}) {
  const normalized = String(query ?? '');
  if (!normalized.trim()) return { results: [], query: normalized, matches: [], indexRevision: state.revision };
  if (!state.fuse) {
    const error = new Error('Search worker is not initialized');
    error.code = 'SEARCH_WORKER_NOT_READY';
    throw error;
  }
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
    if (Number.isInteger(payload.requestId)) cancelled.add(payload.requestId);
    return;
  }

  let meta = null;
  try {
    meta = requestMeta(payload);
    const type = payload.type;
    const data = Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : {};
    assertNotCancelled(meta);

    switch (type) {
      case 'init': {
        initFuse(data?.items || [], data?.options || {});
        assertNotCancelled(meta);
        post('init:done', meta, { success: true, itemCount: state.data.length, indexRevision: state.revision });
        break;
      }
      case 'search': {
        const results = search(data?.query, data?.options || {});
        assertNotCancelled(meta);
        post('search:done', meta, results);
        break;
      }
      case 'update': {
        if (!Array.isArray(data?.items)) throw new TypeError('Search update requires an items array');
        initFuse(data.items, data.options || {});
        assertNotCancelled(meta);
        post('update:done', meta, { success: true, itemCount: state.data.length, indexRevision: state.revision });
        break;
      }
      default: {
        const error = new Error(`Unknown message type: ${type}`);
        error.code = 'UNKNOWN_WORKER_MESSAGE';
        throw error;
      }
    }
  } catch (error) {
    const fallbackMeta = meta || {
      id: payload?.id ?? null,
      requestId: payload?.requestId ?? payload?.id ?? null,
      generation: payload?.generation ?? null,
      resource: payload?.resource ?? null,
      revision: payload?.revision ?? null,
      authority: payload?.authority ?? null,
    };
    post('error', fallbackMeta, {
      code: error?.code || 'SEARCH_WORKER_ERROR',
      error: error?.message || String(error),
    });
  } finally {
    if (meta) cancelled.delete(meta.requestId);
  }
};
