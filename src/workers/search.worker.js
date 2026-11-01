/* eslint-disable no-undef */
try {
  importScripts('../../vendor/fuse.min.js');
} catch (error) {
  console.warn('[SearchWorker] Failed to load vendored Fuse.js:', error);
}

// Worker is intentionally a classic (importScripts) offline asset; importing
// the app ESM normalizer here would break the worker's current delivery type.
// Keep this equivalent to src/core/searchRanking.js and pin parity in tests.
function normalizeWorkerQuery(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\u064a\u0649]/g, '\u06cc')
    .replace(/\u0643/g, '\u06a9')
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalWorkerIdentity(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const sourceType = normalizeWorkerQuery(item.sourceType);
  const sourceId = item.sourceId == null ? '' : String(item.sourceId).trim();
  if (sourceType && sourceId) return 'source:' + sourceType + ':' + sourceId;
  const category = normalizeWorkerQuery(item.category || item.cat);
  const id = item.id == null ? '' : String(item.id).trim();
  if (id) return 'id:' + category + ':' + id;
  const label = normalizeWorkerQuery(item.label || item.title);
  const href = typeof item.href === 'string' ? item.href.trim() : '';
  if (!label && !href) return null;
  return 'fallback:' + category + ':' + label + ':' + href;
}

const NORMALIZED_FIELD = '__pdNormalizedSearch';
const ORIGINAL_INDEX = '__pdWorkerIndex';

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
  // Keep the same offline content vocabulary as the topbar's lightweight
  // lexical fallback. Commands may still explicitly narrow options.keys.
  const defaultKeys = ['title', 'label', 'description', 'searchText',
    'category', 'tags', 'keywords'];
  const keys = Array.isArray(options.keys) && options.keys.length
    ? options.keys : defaultKeys;
  const fieldNames = keys.map(key => typeof key === 'string' ? key : key?.name)
    .filter(key => typeof key === 'string' && !key.startsWith('__'));
  // Index only private copies so caller-provided records and response items
  // remain byte-for-byte unchanged. Keep raw fields for Fuse fuzzy matching
  // while adding a normalized field for Persian/Arabic keyboard equivalence.
  const indexed = data.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { [ORIGINAL_INDEX]: index, [NORMALIZED_FIELD]: normalizeWorkerQuery(item) };
    }
    // Normalize each source value into its own Fuse array element. Joining
    // unrelated titles, tags and keywords into one long string can place an
    // exact metadata match outside Fuse's distance window (even at threshold 0).
    const normalized = fieldNames.flatMap(key => {
      const value = item[key];
      return Array.isArray(value)
        ? value.map(normalizeWorkerQuery)
        : [normalizeWorkerQuery(value)];
    }).filter(Boolean);
    return { ...item, [ORIGINAL_INDEX]: index, [NORMALIZED_FIELD]: normalized };
  });
  const nextFuse = new Fuse(indexed, {
    threshold: 0.3,
    distance: 100,
    includeMatches: true,
    includeScore: true,
    minMatchCharLength: 2,
    ...options,
    keys: [...keys, NORMALIZED_FIELD],
  });
  // Commit the corpus and its Fuse offsets together. If construction fails,
  // searches must continue to see the previous valid index and revision.
  state.data = data;
  state.fuse = nextFuse;
  state.revision += 1;
}

function search(query, options = {}) {
  if (!state.fuse) throw Object.assign(new Error('Search worker is not initialized'), { code: 'SEARCH_WORKER_NOT_READY' });
  const originalQuery = String(query ?? '');
  const normalized = normalizeWorkerQuery(originalQuery);
  if (!normalized) return { results: [], query: originalQuery, matches: [], indexRevision: state.revision };
  // Match the catalog worker and shared lexical ranker's explicit cap:
  // zero disables results, fractions floor, and invalid numbers use default.
  const requestedLimit = options.limit == null ? 25 : Number(options.limit);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(0, Math.min(250, Math.floor(requestedLimit))) : 25;
  if (!limit) return { results: [], query: originalQuery, matches: [], indexRevision: state.revision };
  // Keep Fuse's fuzzy recall and score order *within* each lexical tier,
  // but make exact/prefix/substring visible labels deterministic across the
  // topbar, command-palette fallback and worker catalog search. These are
  // lightweight buckets over the already-ranked Fuse result set, not a new
  // index or protocol. Dedupe only after sorting, before applying the cap.
  const rankedBuckets = [[], [], [], []];
  const indexedMatches = new Set();
  for (const match of state.fuse.search(normalized)) {
    const index = match.item[ORIGINAL_INDEX];
    indexedMatches.add(index);
    const item = state.data[index];
    const label = normalizeWorkerQuery(item?.label || item?.title);
    const tier = label === normalized ? 0 : label.startsWith(normalized) ? 1
      : label.includes(normalized) ? 2 : 3;
    rankedBuckets[tier].push(match);
  }
  // Fuse may return nothing for a single-character query due to its
  // minMatchCharLength setting. For that case only, scan the canonical title
  // labels to retain exact/prefix/substring navigation, without rebuilding
  // the index, inventing visual offset highlights or mutating source rows.
  // Longer queries continue to rely on the indexed Fuse search path.
  if (Array.from(normalized).length === 1) {
    for (let index = 0; index < state.data.length; index += 1) {
      if (indexedMatches.has(index)) continue;
      const item = state.data[index];
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const label = normalizeWorkerQuery(item.label || item.title);
      if (!label.includes(normalized)) continue;
      const tier = label === normalized ? 0 : label.startsWith(normalized) ? 1 : 2;
      rankedBuckets[tier].push({ item: { [ORIGINAL_INDEX]: index }, matches: [] });
    }
  }
  const results = [];
  const matches = [];
  const seen = new Set();
  for (const result of rankedBuckets.flat()) {
    const item = state.data[result.item[ORIGINAL_INDEX]];
    const id = canonicalWorkerIdentity(item);
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    results.push(item);
    // Synthetic normalized-field offsets do not index user-visible content.
    // Only publish real display-field match offsets under the old protocol.
    matches.push({
      item,
      matches: (result.matches || []).filter(match => match.key !== NORMALIZED_FIELD),
    });
    if (results.length >= limit) break;
  }
  return { results, query: originalQuery, matches, indexRevision: state.revision };
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
