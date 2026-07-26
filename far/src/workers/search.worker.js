/* eslint-disable no-undef */
// Vendored copy only: a CDN fallback would execute remote code without
// integrity pinning and contradicts the offline-first security posture.
// If the vendored library is missing, searches fail soft with an error
// message posted back to the caller.
try {
  importScripts('../../vendor/fuse.min.js');
} catch (error) {
  console.warn('[SearchWorker] Failed to load vendored Fuse.js:', error);
}

const state = {
  data: [],
  fuse: null,
};

function initFuse(data, options = {}) {
  const defaultOptions = {
    keys: ['title', 'label', 'description'],
    threshold: 0.3,
    distance: 100,
    includeMatches: true,
    includeScore: true,
    minMatchCharLength: 2,
  };
  state.data = data;
  state.fuse = new Fuse(data, { ...defaultOptions, ...options });
}

function search(query, options = {}) {
  if (!state.fuse || !query?.trim()) {
    return { results: [], query: query || '', matches: [] };
  }
  const fuseResults = state.fuse.search(query, { limit: options.limit || 25 });
  return {
    results: fuseResults.map(r => r.item),
    query,
    matches: fuseResults.map(r => ({ item: r.item, matches: r.matches || [] })),
  };
}

self.onmessage = function(e) {
  const { type, id, data } = e.data;

  try {
    switch (type) {
      case 'init': {
        initFuse(data.items || [], data.options || {});
        self.postMessage({ type: 'init:done', id, success: true });
        break;
      }
      case 'search': {
        const results = search(data.query, data.options || {});
        self.postMessage({ type: 'search:done', id, ...results });
        break;
      }
      case 'update': {
        if (data.items) {
          initFuse(data.items, data.options || {});
        }
        self.postMessage({ type: 'update:done', id, success: true });
        break;
      }
      default:
        self.postMessage({ type: 'error', id, error: `Unknown message type: ${type}` });
    }
  } catch (error) {
    self.postMessage({ type: 'error', id, error: error.message || String(error) });
  }
};
