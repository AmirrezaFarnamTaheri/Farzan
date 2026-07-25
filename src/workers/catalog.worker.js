const state = {
  catalog: null,
  courses: [],
  topics: [],
};

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
    topics.push({
      topicId: url || `${courseId}-${srcIdx}-${topicIdx}`,
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
    childGroups.forEach((group) => {
      if (!Array.isArray(group)) return;
      group.forEach((child, childIdx) => processTopic(child, childIdx, courseId, courseTitle, srcIdx, src, [
        ...lineage,
        { topicId: url || `${courseId}-${srcIdx}-${topicIdx}`, title },
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
      const t = Array.isArray(src?.topics) ? src.topics : [];
      t.forEach((topic, tIdx) => processTopic(topic, tIdx, courseId, courseTitle, srcIdx, src));
    });

    if (Array.isArray(course?.topics)) {
      course.topics.forEach((topic, tIdx) => processTopic(topic, tIdx, courseId, courseTitle, -1, { label: 'Direct Topics' }));
    }
  }

  return { courses, topics };
}

self.onmessage = function(e) {
  const { type, id, data } = e.data;

  try {
    switch (type) {
      case 'parse': {
        const result = parseCatalog(data.catalogJson);
        state.catalog = data.catalogJson;
        state.courses = result.courses;
        state.topics = result.topics;
        self.postMessage({ type: 'parse:done', id, ...result });
        break;
      }
      case 'filter': {
        const { predicate } = data;
        let filtered;
        if (predicate === 'hasVideo') {
          filtered = state.topics.filter(t => (Array.isArray(t.videos) && t.videos.length) || t.url);
        } else if (predicate === 'hasPdf') {
          filtered = state.topics.filter(t => Array.isArray(t.pdfs) && t.pdfs.length);
        } else if (predicate === 'hasError') {
          filtered = state.topics.filter(t => !!t.error);
        } else if (predicate === 'noMedia') {
          filtered = state.topics.filter(t => {
            const hasVideo = (Array.isArray(t.videos) && t.videos.length) || t.url;
            const hasPdf = Array.isArray(t.pdfs) && t.pdfs.length;
            return !hasVideo && !hasPdf;
          });
        } else {
          filtered = [];
        }
        self.postMessage({ type: 'filter:done', id, topics: filtered });
        break;
      }
      case 'search': {
        const query = (data.query || '').toLowerCase();
        if (!query) {
          self.postMessage({ type: 'search:done', id, results: [] });
          break;
        }
        const results = state.topics
          .filter(t => (t.title || '').toLowerCase().includes(query))
          .slice(0, data.limit || 25);
        self.postMessage({ type: 'search:done', id, results });
        break;
      }
      default:
        self.postMessage({ type: 'error', id, error: `Unknown message type: ${type}` });
    }
  } catch (error) {
    self.postMessage({ type: 'error', id, error: error.message || String(error) });
  }
};
