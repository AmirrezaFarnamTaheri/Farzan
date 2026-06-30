/* eslint-disable no-undef */
try {
  importScripts('https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.min.js');
} catch {
  try {
    importScripts('../../vendor/fuse.min.js');
  } catch (e2) {
    console.warn('[SearchWorker] Failed to load Fuse.js from CDN and vendor:', e2);
  }
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
