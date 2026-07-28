const state = {
  catalog: null,
  courses: [],
  topics: [],
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
  return meta;
}

function post(type, meta, data = {}) {
  self.postMessage({ type, ...meta, ...data });
}

function stableTopicId({ courseId, sourceId, lineage, topic, index }) {
  const declared = topic?.id || topic?.topicId;
  if (declared) return `${courseId}:${sourceId}:${declared}`;
  const path = lineage.map(item => item.index).join('.');
  return `${courseId}:${sourceId}:${path || 'root'}:${index}`;
}

function parseCatalog(raw) {
  const courses = [];
  const topics = [];

  if (!raw || typeof raw !== 'object') return { courses, topics };

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

self.onmessage = function(event) {
  const payload = event?.data;
  if (payload?.type === 'cancel') {
    if (Number.isInteger(payload.requestId)) cancelled.add(payload.requestId);
    return;
  }

  let meta;
  try {
    meta = requestMeta(payload);
    const data = payload.data ?? {};
    if (cancelled.has(meta.requestId)) throw Object.assign(new Error('Worker request cancelled'), { code: 'WORKER_CANCELLED' });

    switch (payload.type) {
      case 'parse': {
        const result = parseCatalog(data.catalogJson);
        state.catalog = data.catalogJson;
        state.courses = result.courses;
        state.topics = result.topics;
        post('parse:done', meta, result);
        break;
      }
      case 'filter': {
        const predicate = data.predicate;
        let filtered = [];
        if (predicate === 'hasVideo') filtered = state.topics.filter(t => t.videos.length || t.url);
        else if (predicate === 'hasPdf') filtered = state.topics.filter(t => t.pdfs.length);
        else if (predicate === 'hasError') filtered = state.topics.filter(t => !!t.error);
        else if (predicate === 'noMedia') filtered = state.topics.filter(t => !(t.videos.length || t.url || t.pdfs.length));
        post('filter:done', meta, { topics: filtered });
        break;
      }
      case 'search': {
        const query = String(data.query ?? '').toLowerCase();
        post('search:done', meta, {
          results: query ? state.topics.filter(t => t.title.toLowerCase().includes(query)).slice(0, data.limit ?? 25) : [],
        });
        break;
      }
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
    }, {
      code: error?.code || 'CATALOG_WORKER_ERROR',
      error: error?.message || String(error),
    });
  } finally {
    if (meta) cancelled.delete(meta.requestId);
  }
};
