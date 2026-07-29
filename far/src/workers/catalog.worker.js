const MAX_CANCELLED_REQUESTS = 256;
const CANCEL_RETENTION_MS = 30000;

const state = {
  status: 'uninitialized',
  failure: null,
  catalog: null,
  courses: [],
  topics: [],
};
const cancelled = new Map();

function pruneCancelled(now = Date.now()) {
  for (const [requestId, expiresAt] of cancelled) {
    if (expiresAt > now) continue;
    cancelled.delete(requestId);
  }
  while (cancelled.size > MAX_CANCELLED_REQUESTS) {
    const oldest = cancelled.keys().next().value;
    if (oldest === undefined) break;
    cancelled.delete(oldest);
  }
}

function rememberCancellation(requestId) {
  pruneCancelled();
  cancelled.delete(requestId);
  cancelled.set(requestId, Date.now() + CANCEL_RETENTION_MS);
  pruneCancelled();
}

function forgetCancellation(requestId) {
  cancelled.delete(requestId);
}

function assertNotCancelled(meta) {
  pruneCancelled();
  if (!cancelled.has(meta.requestId)) return;
  const error = new Error('Worker request cancelled');
  error.code = 'WORKER_CANCELLED';
  throw error;
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

function assertCatalogReady() {
  if (state.status === 'ready') return;
  const failed = state.status === 'failed';
  const error = new Error(failed
    ? `Catalog load failed${state.failure ? `: ${state.failure}` : ''}`
    : 'Catalog worker is not initialized; parse a catalog before querying it');
  error.code = failed ? 'CATALOG_LOAD_FAILED' : 'WORKER_NOT_READY';
  error.catalogState = state.status;
  throw error;
}

function stableTopicId({ courseId, sourceId, lineage, topic, index }) {
  const declared = topic?.id || topic?.topicId;
  if (declared) return `${courseId}:${sourceId}:${declared}`;
  const path = lineage.map(item => item.index).join('.');
  return `${courseId}:${sourceId}:${path || 'root'}:${index}`;
}

function parseCatalog(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    const error = new TypeError('Catalog payload must be an object keyed by course id');
    error.code = 'INVALID_CATALOG';
    throw error;
  }

  const courses = [];
  const topics = [];
  const processTopic = (topic, topicIdx, courseId, courseTitle, srcIdx, src, lineage = []) => {
    const url = topic?.url ?? '';
    let title = topic?.title ?? url ?? `Topic ${topicIdx + 1}`;
    let catalogIssue = false;
    if (!topic?.title && topic?.error) {
      title = `Catalog issue: ${topic.error}`;
      catalogIssue = true;
    }

    const topicId = stableTopicId({
      courseId,
      sourceId: src?.id || src?.label || srcIdx,
      lineage,
      topic,
      index: topicIdx,
    });

    topics.push({
      topicId,
      courseId,
      courseTitle,
      url,
      title,
      sourceIndex: srcIdx,
      sourceLabel: src?.label || `Source ${srcIdx + 1}`,
      sourceEntryUrl: src?.entryUrl || '',
      sourceCurriculum: src?.curriculum || '',
      parentTopicId: lineage.at(-1)?.topicId || '',
      depth: lineage.length,
      videos: Array.isArray(topic?.videos) ? topic.videos : [],
      pdfs: Array.isArray(topic?.pdfs) ? topic.pdfs : [],
      iframes: Array.isArray(topic?.iframes) ? topic.iframes : [],
      raw: Array.isArray(topic?.raw) ? topic.raw : [],
      error: topic?.error,
      catalogIssue,
    });

    const childGroups = [topic?.topics, topic?.children, topic?.lessons, topic?.items];
    childGroups.forEach(group => {
      if (!Array.isArray(group)) return;
      group.forEach((child, childIdx) => processTopic(child, childIdx, courseId, courseTitle, srcIdx, src, [
        ...lineage,
        { topicId, index: topicIdx, title },
      ]));
    });
  };

  for (const [courseId, course] of Object.entries(raw)) {
    const courseTitle = course?.title ?? courseId;
    courses.push({
      id: courseId,
      title: courseTitle,
      productUrl: course?.productUrl ?? '',
      sources: Array.isArray(course?.sources) ? course.sources : [],
    });

    const sources = Array.isArray(course?.sources) ? course.sources : [];
    sources.forEach((src, srcIdx) => {
      (src?.topics || []).forEach((topic, idx) => processTopic(topic, idx, courseId, courseTitle, srcIdx, src));
    });
    if (Array.isArray(course?.topics)) {
      course.topics.forEach((topic, idx) => processTopic(topic, idx, courseId, courseTitle, -1, { label: 'Direct Topics' }));
    }
  }

  return { courses, topics };
}

self.onmessage = function onMessage(event) {
  const payload = event?.data;
  if (payload?.type === 'cancel') {
    if (Number.isInteger(payload.requestId)) rememberCancellation(payload.requestId);
    return;
  }

  let meta = null;
  try {
    meta = requestMeta(payload);
    const data = payload.data ?? {};
    assertNotCancelled(meta);

    switch (payload.type) {
      case 'parse': {
        state.status = 'loading';
        state.failure = null;
        const result = parseCatalog(data.catalogJson);
        assertNotCancelled(meta);
        state.catalog = data.catalogJson;
        state.courses = result.courses;
        state.topics = result.topics;
        state.status = 'ready';
        post('parse:done', meta, {
          ...result,
          catalogState: state.status,
          empty: result.courses.length === 0 && result.topics.length === 0,
        });
        break;
      }
      case 'filter': {
        assertCatalogReady();
        const predicate = data.predicate;
        let filtered = [];
        if (predicate === 'hasVideo') filtered = state.topics.filter(t => t.videos.length || t.url);
        else if (predicate === 'hasPdf') filtered = state.topics.filter(t => t.pdfs.length);
        else if (predicate === 'hasError') filtered = state.topics.filter(t => !!t.error);
        else if (predicate === 'noMedia') filtered = state.topics.filter(t => !(t.videos.length || t.url || t.pdfs.length));
        assertNotCancelled(meta);
        post('filter:done', meta, { topics: filtered, catalogState: state.status, empty: filtered.length === 0 });
        break;
      }
      case 'search': {
        assertCatalogReady();
        const query = String(data.query ?? '').toLowerCase();
        const results = query
          ? state.topics.filter(t => t.title.toLowerCase().includes(query)).slice(0, data.limit ?? 25)
          : [];
        assertNotCancelled(meta);
        post('search:done', meta, { results, catalogState: state.status, empty: results.length === 0 });
        break;
      }
      default: {
        const error = new Error(`Unknown message type: ${payload.type}`);
        error.code = 'UNKNOWN_WORKER_MESSAGE';
        throw error;
      }
    }
  } catch (error) {
    if (payload?.type === 'parse' && error?.code !== 'WORKER_CANCELLED') {
      state.status = 'failed';
      state.failure = error?.message || String(error);
      state.catalog = null;
      state.courses = [];
      state.topics = [];
    }
    post('error', meta || {
      id: payload?.id ?? null,
      requestId: payload?.requestId ?? payload?.id ?? null,
      generation: payload?.generation ?? null,
      resource: payload?.resource ?? null,
      revision: payload?.revision ?? null,
      authority: payload?.authority ?? null,
    }, {
      code: error?.code || 'CATALOG_WORKER_ERROR',
      error: error?.message || String(error),
      catalogState: error?.catalogState || state.status,
    });
  } finally {
    if (meta) forgetCancellation(meta.requestId);
  }
};
