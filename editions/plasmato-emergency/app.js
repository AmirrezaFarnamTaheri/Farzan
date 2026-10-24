(() => {
  'use strict';

  const FALLBACK_CATALOG_FILES = ['plasmato_full_2026-04-11.json'];
  const RESULT_STEP = 90;
  const MAX_DEPTH = 14;

  const URL_RE = /https?:\/\/[^\s"'<>\\)\]]+/gi;
  const DIRECT_VIDEO_RE = /\.(mp4|m4v|webm|ogv|ogg|mov|m3u8)(?:[?#].*)?$/i;
  const PDF_RE = /\.pdf(?:[?#].*)?$/i;
  const KNOWN_EMBED_RE = /(youtube\.com|youtu\.be|vimeo\.com|aparat\.com|dailymotion\.com|wistia\.com|embed|iframe|player|videohash)/i;
  const BLOCKED_BINARY_RE = /\.(docx?|pptx?|xlsx?|zip|rar|7z|jpg|jpeg|png|gif|webp|svg|ico)(?:[?#].*)?$/i;
  const RTL_RE = /[\u0590-\u08ff]/;

  const STORAGE = {
    lastResourceId: 'farzanEmergency:lastResourceId:v2',
    lastUrl: 'farzanEmergencySelectedUrl',
    favorites: 'farzanEmergency:favorites:v2',
    favoritesOnly: 'farzanEmergency:favoritesOnly:v2',
    scope: 'farzanEmergency:scope:v2',
    media: 'farzanEmergency:media:v2',
    sort: 'farzanEmergency:sort:v2',
    autoNext: 'farzanEmergency:autoNext:v2',
    focus: 'farzanEmergency:focus:v2',
  };
  const POSITION_PREFIX = 'farzanEmergencyPosition:';

  const VALID_SCOPES = new Set(['all', 'course', 'source', 'topic']);
  const VALID_MEDIA = new Set(['all', 'playable', 'pdf', 'link', 'issue']);
  const VALID_SORTS = new Set(['catalog', 'title', 'course', 'progress']);
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

  const state = {
    courses: [],
    flatTopics: [],
    flatResources: [],
    stats: createEmptyStats(),
    activeCourseId: null,
    activeSourceId: null,
    activeTopicId: null,
    activeResourceId: null,
    visibleResources: [],
    resultLimit: RESULT_STEP,
    currentSourceLabel: 'No catalog',
    favorites: loadFavoriteSet(),
    favoritesOnly: safeGet(STORAGE.favoritesOnly) === 'true',
    filterScope: VALID_SCOPES.has(safeGet(STORAGE.scope)) ? safeGet(STORAGE.scope) : 'source',
    mediaFilter: VALID_MEDIA.has(safeGet(STORAGE.media)) ? safeGet(STORAGE.media) : 'all',
    sortMode: VALID_SORTS.has(safeGet(STORAGE.sort)) ? safeGet(STORAGE.sort) : 'catalog',
    autoNext: safeGet(STORAGE.autoNext) === 'true',
    focusMode: safeGet(STORAGE.focus) === 'true',
  };

  const els = {};

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheElements();
    bindEvents();
    syncPersistedControls();
    applyFocusMode();
    loadDefaultCatalog();
  }

  function cacheElements() {
    Object.assign(els, {
      statusText: document.getElementById('statusText'),
      fileInput: document.getElementById('fileInput'),
      reloadButton: document.getElementById('reloadButton'),
      focusToggle: document.getElementById('focusToggle'),
      searchInput: document.getElementById('searchInput'),
      clearSearchButton: document.getElementById('clearSearchButton'),
      scopeSelect: document.getElementById('scopeSelect'),
      mediaSelect: document.getElementById('mediaSelect'),
      sortSelect: document.getElementById('sortSelect'),
      favoritesOnlyButton: document.getElementById('favoritesOnlyButton'),
      courseList: document.getElementById('courseList'),
      sourceList: document.getElementById('sourceList'),
      topicList: document.getElementById('topicList'),
      resourceList: document.getElementById('resourceList'),
      showMoreButton: document.getElementById('showMoreButton'),
      statCourses: document.getElementById('statCourses'),
      statSources: document.getElementById('statSources'),
      statTopics: document.getElementById('statTopics'),
      statVideos: document.getElementById('statVideos'),
      statPdfs: document.getElementById('statPdfs'),
      statIssues: document.getElementById('statIssues'),
      courseCount: document.getElementById('courseCount'),
      sourceCount: document.getElementById('sourceCount'),
      topicCount: document.getElementById('topicCount'),
      resourceCount: document.getElementById('resourceCount'),
      resourceListTitle: document.getElementById('resourceListTitle'),
      videoElement: document.getElementById('videoElement'),
      iframeElement: document.getElementById('iframeElement'),
      emptyPlayer: document.getElementById('emptyPlayer'),
      playerBadge: document.getElementById('playerBadge'),
      resourceTypeBadge: document.getElementById('resourceTypeBadge'),
      nowTitle: document.getElementById('nowTitle'),
      nowMeta: document.getElementById('nowMeta'),
      progressInfo: document.getElementById('progressInfo'),
      prevButton: document.getElementById('prevButton'),
      nextButton: document.getElementById('nextButton'),
      favoriteButton: document.getElementById('favoriteButton'),
      autoNextButton: document.getElementById('autoNextButton'),
      openResourceButton: document.getElementById('openResourceButton'),
      copyResourceButton: document.getElementById('copyResourceButton'),
      openTopicButton: document.getElementById('openTopicButton'),
      openSourceButton: document.getElementById('openSourceButton'),
      openCourseButton: document.getElementById('openCourseButton'),
      resetProgressButton: document.getElementById('resetProgressButton'),
      resourceUrl: document.getElementById('resourceUrl'),
      topicUrl: document.getElementById('topicUrl'),
      sourceUrl: document.getElementById('sourceUrl'),
      courseUrl: document.getElementById('courseUrl'),
      playbackMessage: document.getElementById('playbackMessage'),
    });
  }

  function bindEvents() {
    els.reloadButton.addEventListener('click', () => loadDefaultCatalog({ preferNetwork: true }));
    els.fileInput.addEventListener('change', onFileSelected);
    els.focusToggle.addEventListener('click', toggleFocusMode);
    els.searchInput.addEventListener('input', () => {
      resetResultLimit();
      renderAll();
    });
    els.clearSearchButton.addEventListener('click', () => {
      els.searchInput.value = '';
      els.searchInput.focus();
      resetResultLimit();
      renderAll();
    });
    els.scopeSelect.addEventListener('change', () => {
      state.filterScope = els.scopeSelect.value;
      safeSet(STORAGE.scope, state.filterScope);
      resetResultLimit();
      renderAll();
    });
    els.mediaSelect.addEventListener('change', () => {
      state.mediaFilter = els.mediaSelect.value;
      safeSet(STORAGE.media, state.mediaFilter);
      resetResultLimit();
      renderAll();
    });
    els.sortSelect.addEventListener('change', () => {
      state.sortMode = els.sortSelect.value;
      safeSet(STORAGE.sort, state.sortMode);
      resetResultLimit();
      renderAll();
    });
    els.favoritesOnlyButton.addEventListener('click', toggleFavoritesOnly);
    els.showMoreButton.addEventListener('click', () => {
      state.resultLimit += RESULT_STEP;
      renderResources();
      updateControls();
    });
    els.prevButton.addEventListener('click', () => stepResource(-1));
    els.nextButton.addEventListener('click', () => stepResource(1));
    els.favoriteButton.addEventListener('click', toggleActiveFavorite);
    els.autoNextButton.addEventListener('click', toggleAutoNext);
    els.openResourceButton.addEventListener('click', () => openActiveUrl('resource'));
    els.copyResourceButton.addEventListener('click', () => copyActiveUrl('resource'));
    els.openTopicButton.addEventListener('click', () => openActiveUrl('topic'));
    els.openSourceButton.addEventListener('click', () => openActiveUrl('source'));
    els.openCourseButton.addEventListener('click', () => openActiveUrl('course'));
    els.resetProgressButton.addEventListener('click', resetActiveProgress);
    els.videoElement.addEventListener('timeupdate', rememberPlaybackPosition);
    els.videoElement.addEventListener('loadedmetadata', restorePlaybackPosition);
    els.videoElement.addEventListener('ended', onVideoEnded);
    els.videoElement.addEventListener('error', onVideoError);
    document.addEventListener('keydown', onGlobalKeydown);
  }

  function syncPersistedControls() {
    els.scopeSelect.value = state.filterScope;
    els.mediaSelect.value = state.mediaFilter;
    els.sortSelect.value = state.sortMode;
    els.favoritesOnlyButton.setAttribute('aria-pressed', String(state.favoritesOnly));
    els.autoNextButton.setAttribute('aria-pressed', String(state.autoNext));
  }

  async function loadDefaultCatalog(options = {}) {
    const preferNetwork = Boolean(options.preferNetwork);
    setStatus(preferNetwork ? 'Refreshing catalog from files on disk...' : 'Loading bundled hierarchy-aware catalog...');

    if (preferNetwork) {
      const loadedFromNetwork = await tryLoadCatalogFiles();
      if (loadedFromNetwork) return;
    }

    if (typeof window !== 'undefined' && window.FARZAN_EMBEDDED_CATALOG_GZIP_BASE64) {
      try {
        const raw = await unpackEmbeddedCatalog(window.FARZAN_EMBEDDED_CATALOG_GZIP_BASE64);
        setCatalog(raw, window.FARZAN_EMBEDDED_CATALOG_LABEL || 'bundled Plasmato catalog');
        return;
      } catch (error) {
        setStatus(`Bundled Plasmato catalog is unavailable: ${error.message}. Try Load catalog.`);
      }
    }
    if (typeof window !== 'undefined' && window.FARZAN_EMBEDDED_CATALOG) {
      setCatalog(window.FARZAN_EMBEDDED_CATALOG, window.FARZAN_EMBEDDED_CATALOG_LABEL || 'bundled catalog');
      return;
    }

    if (!preferNetwork) {
      const loadedFromNetwork = await tryLoadCatalogFiles();
      if (loadedFromNetwork) return;
    }

    setNormalizedCatalog(createEmptyCatalog(), 'No catalog');
    setStatus('No playable catalog could be loaded. Use Load catalog to choose the extracted JSON or a CSV export.');
  }

  async function unpackEmbeddedCatalog(encoded) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('Your browser cannot decompress the offline catalog; use a current browser or supply the JSON file');
    }
    // Avoid oversized apply/string spreading; the archived catalog contains
    // hundreds of kilobytes of compressed UTF-8 data.
    if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
      || encoded.length > 2_000_000) throw new Error('Bundled catalog data is invalid');
    const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const response = new Response(stream);
    const text = await response.text();
    if (text.length > 20_000_000) throw new Error('Catalog exceeds allowed size');
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Bundled catalog has invalid root data');
    }
    return parsed;
  }

  async function tryLoadCatalogFiles() {
    const failures = [];
    for (const fileName of FALLBACK_CATALOG_FILES) {
      try {
        const response = await fetch(fileName, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        if (!text.trim()) throw new Error('file is empty');
        const raw = parseCatalogText(text, fileName);
        const normalized = normalizeCatalog(raw);
        if (!normalized.stats.resources) {
          failures.push(`${fileName}: no resources found`);
          continue;
        }
        setNormalizedCatalog(normalized, fileName);
        return true;
      } catch (error) {
        failures.push(`${fileName}: ${error.message}`);
      }
    }
    if (failures.length) {
      setStatus(`Could not refresh disk catalog (${failures.join('; ')}). Using bundled data if available.`);
    }
    return false;
  }

  async function onFileSelected(event) {
    const [file] = event.target.files || [];
    if (!file) return;

    try {
      setStatus(`Reading ${file.name}...`);
      const text = await file.text();
      const raw = parseCatalogText(text, file.name);
      setCatalog(raw, file.name);
    } catch (error) {
      setStatus(`Could not read ${file.name}: ${error.message}`);
      setMessage(`Could not read ${file.name}: ${error.message}`, 'danger');
    } finally {
      event.target.value = '';
    }
  }

  function parseCatalogText(text, name = '') {
    const trimmed = String(text || '').trim();
    if (!trimmed) return { courses: [] };
    if (/\.csv$/i.test(name)) return parseCsv(trimmed);

    try {
      return JSON.parse(trimmed);
    } catch (jsonError) {
      if (looksLikeCsv(trimmed)) return parseCsv(trimmed);
      throw jsonError;
    }
  }

  function setCatalog(raw, sourceLabel) {
    setNormalizedCatalog(normalizeCatalog(raw), sourceLabel);
  }

  function setNormalizedCatalog(normalized, sourceLabel) {
    state.currentSourceLabel = sourceLabel;
    state.courses = normalized.courses;
    state.flatTopics = normalized.flatTopics;
    state.flatResources = normalized.flatResources;
    state.stats = normalized.stats;
    resetResultLimit();

    const savedResourceId = safeGet(STORAGE.lastResourceId);
    const savedUrl = safeGet(STORAGE.lastUrl);
    const savedResource = savedResourceId
      ? state.flatResources.find((resource) => resource.id === savedResourceId)
      : null;
    const savedByUrl = savedUrl ? state.flatResources.find((resource) => resource.url === savedUrl) : null;
    const firstPlayable = state.flatResources.find((resource) => resource.playable) || null;
    const initialResource = savedResource || savedByUrl || firstPlayable || state.flatResources[0] || null;

    if (initialResource) {
      activateHierarchyForResource(initialResource);
      state.activeResourceId = initialResource.id;
    } else {
      state.activeCourseId = state.courses[0]?.id || null;
      state.activeSourceId = state.courses[0]?.sources[0]?.id || null;
      state.activeTopicId = state.courses[0]?.sources[0]?.topics[0]?.id || null;
      state.activeResourceId = null;
      resetPlayback();
    }

    renderAll();

    if (initialResource) {
      // Populate the selection without fetching a remote media URL on startup.
      selectResource(initialResource, { autoplay: false, preserveMessage: true, deferMedia: true });
    }

    const summary = `${formatNumber(state.stats.courses)} courses, ${formatNumber(state.stats.sources)} sources, ${formatNumber(state.stats.topics)} topics, ${formatNumber(state.stats.videos)} playable videos, ${formatNumber(state.stats.pdfs)} PDFs loaded from ${sourceLabel}.`;
    const issueText = state.stats.issues ? ` ${formatNumber(state.stats.issues)} topic issues preserved.` : '';
    setStatus(state.stats.resources ? `${summary}${issueText}` : `${summary} No usable resources were found.`);
  }

  function normalizeCatalog(raw) {
    const plasmato = normalizePlasmatoCatalog(raw);
    if (plasmato) return plasmato;
    return normalizeGenericCatalog(raw);
  }

  function normalizePlasmatoCatalog(raw) {
    if (!isPlainObject(raw) || Array.isArray(raw)) return null;
    const entries = Object.entries(raw).filter(([, value]) => isPlainObject(value) && Array.isArray(value.sources));
    if (!entries.length) return null;

    const courses = [];
    const flatTopics = [];
    const flatResources = [];
    let courseOrder = 0;
    let sourceOrder = 0;
    let topicOrder = 0;
    let resourceOrder = 0;

    entries.forEach(([slug, courseObject]) => {
      const course = {
        id: stableId(`course:${slug}:${courseOrder}`),
        slug: cleanTitle(slug),
        title: cleanTitle(courseObject.title) || titleFromSlug(slug) || `Course ${courseOrder + 1}`,
        productUrl: normalizeUrl(courseObject.productUrl || ''),
        order: courseOrder,
        sources: [],
        counts: createEmptyCounts(),
      };
      courseOrder += 1;

      const rawSources = Array.isArray(courseObject.sources) ? courseObject.sources : [];
      rawSources.forEach((sourceObject, sourceIndex) => {
        if (!isPlainObject(sourceObject)) return;
        const source = {
          id: stableId(`source:${course.id}:${sourceIndex}:${sourceObject.entryUrl || sourceObject.label || sourceOrder}`),
          title: cleanTitle(sourceObject.label) || `Source ${sourceIndex + 1}`,
          entryUrl: normalizeUrl(sourceObject.entryUrl || ''),
          curriculum: arrayStrings(sourceObject.curriculum).map(normalizeUrl).filter(Boolean),
          order: sourceOrder,
          localOrder: sourceIndex,
          topics: [],
          courseId: course.id,
          courseTitle: course.title,
          productUrl: course.productUrl,
          counts: createEmptyCounts(),
        };
        sourceOrder += 1;

        const rawTopics = Array.isArray(sourceObject.topics) ? sourceObject.topics : [];
        rawTopics.forEach((topicObject, topicIndex) => {
          if (!isPlainObject(topicObject)) return;
          const topicUrl = normalizeUrl(topicObject.url || '');
          const title = cleanTitle(topicObject.title) || titleFromUrl(topicUrl) || `Topic ${topicIndex + 1}`;
          const topic = {
            id: stableId(`topic:${source.id}:${topicIndex}:${topicUrl || title}`),
            title,
            url: topicUrl,
            error: cleanTitle(topicObject.error || ''),
            order: topicOrder,
            localOrder: topicIndex,
            courseId: course.id,
            courseTitle: course.title,
            sourceId: source.id,
            sourceTitle: source.title,
            sourceEntryUrl: source.entryUrl,
            productUrl: course.productUrl,
            resources: [],
            counts: createEmptyCounts(),
          };
          topicOrder += 1;

          arrayStrings(topicObject.videos).forEach((url, index) => addResourceToTopic({
            course,
            source,
            topic,
            url,
            title: titleForTopicResource(topic.title, url, index, 'video'),
            hint: 'video mp4 hls stream',
            preferredType: 'video',
          }));

          arrayStrings(topicObject.iframes).forEach((url, index) => addResourceToTopic({
            course,
            source,
            topic,
            url,
            title: titleForTopicResource(topic.title, url, index, 'embed'),
            hint: 'iframe embed player',
            preferredType: 'iframe',
          }));

          arrayStrings(topicObject.pdfs).forEach((url, index) => addResourceToTopic({
            course,
            source,
            topic,
            url,
            title: titleForTopicResource(topic.title, url, index, 'PDF'),
            hint: 'pdf document',
            preferredType: 'pdf',
          }));

          arrayStrings(topicObject.raw).forEach((rawValue, index) => {
            extractUrlEntries(rawValue, 'raw topic resource').forEach((entry) => addResourceToTopic({
              course,
              source,
              topic,
              url: entry.url,
              title: cleanTitle(entry.title) || titleForTopicResource(topic.title, entry.url, index, 'link'),
              hint: entry.hint || 'raw topic resource',
              preferredType: '',
            }));
          });

          if (topic.error) {
            addResourceToTopic({
              course,
              source,
              topic,
              url: topic.url,
              title: topic.title || `Issue ${topic.localOrder + 1}`,
              hint: topic.error,
              preferredType: 'issue',
            });
          }

          if (!topic.resources.length && topic.url) {
            addResourceToTopic({
              course,
              source,
              topic,
              url: topic.url,
              title: `${topic.title} topic page`,
              hint: 'topic page link empty topic',
              preferredType: 'link',
            });
          }

          source.topics.push(topic);
          flatTopics.push(topic);
        });

        course.sources.push(source);
      });

      courses.push(course);
    });

    enrichCounts(courses);
    const stats = buildStats(courses, flatTopics, flatResources);
    return { courses, flatTopics, flatResources, stats };

    function addResourceToTopic({ course, source, topic, url, title, hint = '', preferredType = '' }) {
      const normalizedUrl = normalizeUrl(url || '');
      const classification = classifyCatalogUrl(normalizedUrl, hint, preferredType);
      if (!classification.include) return;

      const resource = {
        id: stableId(`resource:${resourceOrder}:${course.id}:${source.id}:${topic.id}:${classification.type}:${normalizedUrl}`),
        title: cleanTitle(title) || topic.title || titleFromUrl(normalizedUrl) || `Resource ${resourceOrder + 1}`,
        url: normalizedUrl,
        type: classification.type,
        kind: classification.kind,
        playable: classification.playable,
        host: hostLabel(normalizedUrl),
        courseId: course.id,
        courseTitle: course.title,
        sourceId: source.id,
        sourceTitle: source.title,
        sourceEntryUrl: source.entryUrl,
        topicId: topic.id,
        topicTitle: topic.title,
        topicUrl: topic.url,
        productUrl: course.productUrl,
        error: preferredType === 'issue' ? topic.error : '',
        order: resourceOrder,
        topicOrder: topic.order,
        sourceOrder: source.order,
        courseOrder: course.order,
      };
      resourceOrder += 1;
      topic.resources.push(resource);
      flatResources.push(resource);
    }
  }

  function normalizeGenericCatalog(raw) {
    const courseMap = new Map();
    const flatTopics = [];
    const flatResources = [];
    const visited = typeof WeakSet === 'function' ? new WeakSet() : null;
    let courseOrder = 0;
    let sourceOrder = 0;
    let topicOrder = 0;
    let resourceOrder = 0;

    function ensureCourse(title, productUrl = '') {
      const safeTitle = cleanTitle(title) || 'Imported catalog';
      const key = canonicalKey(safeTitle);
      if (!courseMap.has(key)) {
        courseMap.set(key, {
          id: stableId(`generic-course:${key}:${courseOrder}`),
          slug: '',
          title: safeTitle,
          productUrl: normalizeUrl(productUrl),
          order: courseOrder,
          sources: [],
          sourceMap: new Map(),
          counts: createEmptyCounts(),
        });
        courseOrder += 1;
      }
      const course = courseMap.get(key);
      if (!course.productUrl && productUrl) course.productUrl = normalizeUrl(productUrl);
      return course;
    }

    function ensureSource(course, title, entryUrl = '') {
      const safeTitle = cleanTitle(title) || 'Imported source';
      const key = canonicalKey(`${safeTitle}|${entryUrl}`);
      if (!course.sourceMap.has(key)) {
        const source = {
          id: stableId(`generic-source:${course.id}:${key}:${sourceOrder}`),
          title: safeTitle,
          entryUrl: normalizeUrl(entryUrl),
          curriculum: [],
          order: sourceOrder,
          localOrder: course.sources.length,
          topics: [],
          topicMap: new Map(),
          courseId: course.id,
          courseTitle: course.title,
          productUrl: course.productUrl,
          counts: createEmptyCounts(),
        };
        sourceOrder += 1;
        course.sourceMap.set(key, source);
        course.sources.push(source);
      }
      return course.sourceMap.get(key);
    }

    function ensureTopic(source, title, topicUrl = '') {
      const safeTitle = cleanTitle(title) || titleFromUrl(topicUrl) || 'Resources';
      const key = canonicalKey(`${safeTitle}|${topicUrl}`);
      if (!source.topicMap.has(key)) {
        const topic = {
          id: stableId(`generic-topic:${source.id}:${key}:${topicOrder}`),
          title: safeTitle,
          url: normalizeUrl(topicUrl),
          error: '',
          order: topicOrder,
          localOrder: source.topics.length,
          courseId: source.courseId,
          courseTitle: source.courseTitle,
          sourceId: source.id,
          sourceTitle: source.title,
          sourceEntryUrl: source.entryUrl,
          productUrl: source.productUrl,
          resources: [],
          counts: createEmptyCounts(),
        };
        topicOrder += 1;
        source.topicMap.set(key, topic);
        source.topics.push(topic);
        flatTopics.push(topic);
      }
      return source.topicMap.get(key);
    }

    function addResource(entry, context = {}) {
      const url = normalizeUrl(entry.url);
      const classification = classifyCatalogUrl(url, entry.hint || context.hint || '', entry.preferredType || '');
      if (!classification.include) return;
      const course = ensureCourse(entry.courseTitle || context.courseTitle, entry.productUrl || context.productUrl);
      const source = ensureSource(course, entry.sourceTitle || context.sourceTitle || 'Imported source', entry.sourceEntryUrl || context.sourceEntryUrl || '');
      const topic = ensureTopic(source, entry.topicTitle || context.topicTitle || entry.title, entry.topicUrl || context.topicUrl || '');
      const resource = {
        id: stableId(`generic-resource:${resourceOrder}:${course.id}:${source.id}:${topic.id}:${classification.type}:${url}`),
        title: cleanTitle(entry.title || context.itemTitle || context.topicTitle) || titleFromUrl(url) || `Resource ${resourceOrder + 1}`,
        url,
        type: classification.type,
        kind: classification.kind,
        playable: classification.playable,
        host: hostLabel(url),
        courseId: course.id,
        courseTitle: course.title,
        sourceId: source.id,
        sourceTitle: source.title,
        sourceEntryUrl: source.entryUrl,
        topicId: topic.id,
        topicTitle: topic.title,
        topicUrl: topic.url,
        productUrl: course.productUrl,
        error: '',
        order: resourceOrder,
        topicOrder: topic.order,
        sourceOrder: source.order,
        courseOrder: course.order,
      };
      resourceOrder += 1;
      topic.resources.push(resource);
      flatResources.push(resource);
    }

    function process(node, context = {}, role = 'item', depth = 0, keyHint = '') {
      if (node == null || depth > MAX_DEPTH) return;

      if (typeof node === 'string') {
        extractUrlEntries(node, joinHint(context.hint, keyHint)).forEach((entry) => addResource(entry, context));
        return;
      }

      if (Array.isArray(node)) {
        node.forEach((item) => process(item, context, role, depth + 1, keyHint));
        return;
      }

      if (!isPlainObject(node)) return;
      if (visited) {
        if (visited.has(node)) return;
        visited.add(node);
      }

      const local = { ...context, hint: joinHint(context.hint, keyHint) };
      const explicitCourse = firstText(node, COURSE_KEYS);
      const explicitSource = firstText(node, SOURCE_KEYS);
      const explicitTopic = firstText(node, TOPIC_KEYS);
      const explicitItem = firstText(node, ITEM_KEYS);
      const genericTitle = firstText(node, GENERIC_TITLE_KEYS);
      const productUrl = firstUrlFromKeys(node, PRODUCT_URL_KEYS);
      const entryUrl = firstUrlFromKeys(node, SOURCE_URL_KEYS);
      const topicUrl = firstUrlFromKeys(node, TOPIC_URL_KEYS);

      if (explicitCourse) local.courseTitle = explicitCourse;
      if (explicitSource) local.sourceTitle = explicitSource;
      if (explicitTopic) local.topicTitle = explicitTopic;
      if (explicitItem) local.itemTitle = explicitItem;
      if (productUrl) local.productUrl = productUrl;
      if (entryUrl) local.sourceEntryUrl = entryUrl;
      if (topicUrl) local.topicUrl = topicUrl;

      if ((role === 'course' || role === 'source') && !local.courseTitle) local.courseTitle = genericTitle || titleFromSlug(keyHint);
      if (role === 'source' && !local.sourceTitle) local.sourceTitle = genericTitle || titleFromSlug(keyHint);
      if (role === 'topic' && !local.topicTitle) local.topicTitle = genericTitle || titleFromSlug(keyHint);
      if ((role === 'video' || role === 'item') && !local.itemTitle) local.itemTitle = genericTitle || titleFromSlug(keyHint);

      extractObjectResourceEntries(node).forEach((entry) => addResource(entry, local));

      Object.entries(node).forEach(([key, value]) => {
        if (value == null || isScalar(value)) return;
        const lower = key.toLowerCase();
        const nextContext = { ...local, hint: joinHint(local.hint, key) };
        if (COURSE_CONTAINER_KEYS.has(lower)) process(value, nextContext, 'course', depth + 1, key);
        else if (SOURCE_CONTAINER_KEYS.has(lower)) process(value, nextContext, 'source', depth + 1, key);
        else if (TOPIC_CONTAINER_KEYS.has(lower)) process(value, nextContext, 'topic', depth + 1, key);
        else if (VIDEO_CONTAINER_KEYS.has(lower)) process(value, nextContext, 'video', depth + 1, key);
        else if (ITEM_CONTAINER_KEYS.has(lower)) process(value, nextContext, 'item', depth + 1, key);
        else if (depth < 6) process(value, nextContext, role, depth + 1, key);
      });
    }

    process(raw, {}, 'root', 0, '');

    const courses = Array.from(courseMap.values())
      .map((course) => {
        course.sources.forEach((source) => {
          source.topics = source.topics.filter((topic) => topic.resources.length).sort((a, b) => a.order - b.order);
          delete source.topicMap;
        });
        course.sources = course.sources.filter((source) => source.topics.length).sort((a, b) => a.order - b.order);
        delete course.sourceMap;
        return course;
      })
      .filter((course) => course.sources.length)
      .sort((a, b) => a.order - b.order);

    enrichCounts(courses);
    const filteredTopics = [];
    const filteredResources = [];
    courses.forEach((course) => course.sources.forEach((source) => source.topics.forEach((topic) => {
      filteredTopics.push(topic);
      topic.resources.forEach((resource) => filteredResources.push(resource));
    })));
    return { courses, flatTopics: filteredTopics, flatResources: filteredResources, stats: buildStats(courses, filteredTopics, filteredResources) };
  }

  const COURSE_KEYS = ['course_title', 'courseTitle', 'course_name', 'courseName', 'course', 'courseTitleFa'];
  const SOURCE_KEYS = ['source_title', 'sourceTitle', 'source_name', 'sourceName', 'source', 'label'];
  const TOPIC_KEYS = ['topic_title', 'topicTitle', 'topic_name', 'topicName', 'topic', 'chapter', 'section', 'module'];
  const ITEM_KEYS = ['lesson_title', 'lessonTitle', 'video_title', 'videoTitle', 'item_title', 'itemTitle'];
  const GENERIC_TITLE_KEYS = ['title', 'name', 'label', 'filename', 'fileName'];
  const PRODUCT_URL_KEYS = ['productUrl', 'product_url', 'courseUrl', 'course_url'];
  const SOURCE_URL_KEYS = ['entryUrl', 'entry_url', 'sourceUrl', 'source_url'];
  const TOPIC_URL_KEYS = ['topicUrl', 'topic_url'];
  const COURSE_CONTAINER_KEYS = new Set(['courses', 'course', 'courseitems', 'course_items', 'catalog']);
  const SOURCE_CONTAINER_KEYS = new Set(['sources', 'source']);
  const TOPIC_CONTAINER_KEYS = new Set(['topics', 'topic', 'sections', 'section', 'chapters', 'chapter', 'modules', 'module']);
  const VIDEO_CONTAINER_KEYS = new Set(['videos', 'video', 'iframes', 'iframe', 'embeds', 'embed']);
  const ITEM_CONTAINER_KEYS = new Set(['lessons', 'lesson', 'items', 'item', 'materials', 'material', 'resources', 'resource', 'links', 'link', 'pdfs', 'pdf']);
  const RESOURCE_FIELD_RE = /(^|_)(url|href|src|source|file|link|video|video_url|videourl|download|download_url|embed|iframe|hls|mp4|m3u8|stream|pdf)(_|$)/i;

  function extractObjectResourceEntries(object) {
    const entries = [];
    Object.entries(object).forEach(([key, value]) => {
      if (value == null) return;
      const isResourceField = RESOURCE_FIELD_RE.test(key);
      if (typeof value === 'string') {
        if (isResourceField || URL_RE.test(value)) {
          extractUrlEntries(value, key).forEach((entry) => {
            entry.title = entry.title || firstText(object, [...ITEM_KEYS, ...GENERIC_TITLE_KEYS]);
            entry.courseTitle = firstText(object, COURSE_KEYS);
            entry.sourceTitle = firstText(object, SOURCE_KEYS);
            entry.topicTitle = firstText(object, TOPIC_KEYS);
            entries.push(entry);
          });
        }
      } else if (Array.isArray(value) && isResourceField) {
        value.forEach((item) => {
          if (typeof item === 'string') {
            extractUrlEntries(item, key).forEach((entry) => entries.push(entry));
          }
        });
      }
    });
    return entries;
  }

  function classifyCatalogUrl(url, hint = '', preferredType = '') {
    const normalized = normalizeUrl(url);
    const preferred = String(preferredType || '').toLowerCase();

    if (preferred === 'issue') {
      return { include: true, type: 'issue', kind: 'issue', playable: false };
    }
    if (!normalized) return { include: false };
    if (preferred === 'pdf' || PDF_RE.test(normalized)) {
      return { include: true, type: 'pdf', kind: 'pdf', playable: false };
    }
    if (preferred === 'link') {
      return { include: true, type: 'link', kind: 'link', playable: false };
    }
    if (DIRECT_VIDEO_RE.test(normalized)) {
      return { include: true, type: 'video', kind: 'direct', playable: true };
    }
    if (preferred === 'iframe' || KNOWN_EMBED_RE.test(normalized) || /iframe|embed|player/i.test(hint)) {
      return { include: true, type: 'video', kind: 'embed', playable: true };
    }
    if (BLOCKED_BINARY_RE.test(normalized)) return { include: false };
    if (/video|lesson|media|stream|m3u8|mp4|hls/i.test(hint) && !/plasmato\.net\/topics|plasmato\.net\/product/i.test(normalized)) {
      return { include: true, type: 'video', kind: 'direct', playable: true };
    }
    return { include: true, type: 'link', kind: 'link', playable: false };
  }

  function createEmptyCatalog() {
    return { courses: [], flatTopics: [], flatResources: [], stats: createEmptyStats() };
  }

  function createEmptyStats() {
    return { courses: 0, sources: 0, topics: 0, resources: 0, videos: 0, pdfs: 0, links: 0, issues: 0, playable: 0, favorites: 0 };
  }

  function createEmptyCounts() {
    return { topics: 0, resources: 0, videos: 0, pdfs: 0, links: 0, issues: 0, playable: 0 };
  }

  function enrichCounts(courses) {
    courses.forEach((course) => {
      course.counts = createEmptyCounts();
      course.sources.forEach((source) => {
        source.counts = createEmptyCounts();
        source.topics.forEach((topic) => {
          topic.counts = createEmptyCounts();
          topic.counts.topics = 1;
          topic.resources.forEach((resource) => addResourceCount(topic.counts, resource));
          addCounts(source.counts, topic.counts);
        });
        source.counts.topics = source.topics.length;
        addCounts(course.counts, source.counts);
      });
      course.counts.topics = course.sources.reduce((sum, source) => sum + source.topics.length, 0);
    });
  }

  function buildStats(courses, flatTopics, flatResources) {
    const stats = createEmptyStats();
    stats.courses = courses.length;
    stats.sources = courses.reduce((sum, course) => sum + course.sources.length, 0);
    stats.topics = flatTopics.length;
    flatResources.forEach((resource) => addResourceCount(stats, resource));
    stats.favorites = countKnownFavorites(flatResources);
    return stats;
  }

  function addResourceCount(counts, resource) {
    counts.resources += 1;
    if (resource.playable) counts.playable += 1;
    if (resource.type === 'video') counts.videos += 1;
    else if (resource.type === 'pdf') counts.pdfs += 1;
    else if (resource.type === 'issue') counts.issues += 1;
    else counts.links += 1;
  }

  function addCounts(target, source) {
    target.resources += source.resources;
    target.videos += source.videos;
    target.pdfs += source.pdfs;
    target.links += source.links;
    target.issues += source.issues;
    target.playable += source.playable;
  }

  function renderAll() {
    renderStats();
    renderCourses();
    renderSources();
    renderTopics();
    renderResources();
    updateControls();
  }

  function renderStats() {
    els.statCourses.textContent = formatNumber(state.stats.courses);
    els.statSources.textContent = formatNumber(state.stats.sources);
    els.statTopics.textContent = formatNumber(state.stats.topics);
    els.statVideos.textContent = formatNumber(state.stats.videos);
    els.statPdfs.textContent = formatNumber(state.stats.pdfs);
    els.statIssues.textContent = formatNumber(state.stats.issues);
  }

  function renderCourses() {
    els.courseCount.textContent = formatNumber(state.courses.length);
    clear(els.courseList);
    if (!state.courses.length) {
      appendEmpty(els.courseList, 'No courses found.');
      return;
    }

    state.courses.forEach((course) => {
      const button = createHierarchyButton({
        title: course.title,
        meta: `${formatNumber(course.sources.length)} sources • ${formatNumber(course.counts.topics)} topics`,
        count: `${formatNumber(course.counts.videos)} videos`,
        active: course.id === state.activeCourseId,
      });
      button.addEventListener('click', () => selectCourse(course));
      els.courseList.appendChild(button);
    });
    scrollActiveIntoView(els.courseList);
  }

  function renderSources() {
    const course = getActiveCourse();
    const sources = course?.sources || [];
    els.sourceCount.textContent = formatNumber(sources.length);
    clear(els.sourceList);
    if (!sources.length) {
      appendEmpty(els.sourceList, 'No sources found for this course.');
      return;
    }

    sources.forEach((source) => {
      const button = createHierarchyButton({
        title: source.title,
        meta: `${formatNumber(source.curriculum.length || source.counts.topics)} curriculum links • ${hostLabel(source.entryUrl)}`,
        count: `${formatNumber(source.counts.videos)} videos`,
        active: source.id === state.activeSourceId,
      });
      button.addEventListener('click', () => selectSource(source));
      els.sourceList.appendChild(button);
    });
    scrollActiveIntoView(els.sourceList);
  }

  function renderTopics() {
    const source = getActiveSource();
    const topics = source?.topics || [];
    els.topicCount.textContent = formatNumber(topics.length);
    clear(els.topicList);
    if (!topics.length) {
      appendEmpty(els.topicList, 'No topics found for this source.');
      return;
    }

    topics.forEach((topic) => {
      const meta = topic.error
        ? `Issue preserved: ${topic.error}`
        : describeCounts(topic.counts);
      const button = createHierarchyButton({
        title: topic.title,
        meta,
        count: topic.error ? 'Issue' : `${formatNumber(topic.resources.length)} items`,
        active: topic.id === state.activeTopicId,
        extraClass: topic.error ? 'issue' : (!topic.counts.playable ? 'empty-topic' : ''),
      });
      button.addEventListener('click', () => selectTopic(topic));
      els.topicList.appendChild(button);
    });
    scrollActiveIntoView(els.topicList);
  }

  function renderResources() {
    const allMatches = getFilteredResources();
    state.visibleResources = allMatches;
    const shownResources = allMatches.slice(0, state.resultLimit);
    const query = getQuery();

    els.resourceListTitle.textContent = getResourceListTitle(query);
    els.resourceCount.textContent = allMatches.length > shownResources.length
      ? `${formatNumber(shownResources.length)} / ${formatNumber(allMatches.length)}`
      : formatNumber(allMatches.length);
    els.showMoreButton.hidden = shownResources.length >= allMatches.length;
    els.showMoreButton.textContent = `Show ${formatNumber(Math.min(RESULT_STEP, allMatches.length - shownResources.length))} more`;

    clear(els.resourceList);
    if (!shownResources.length) {
      appendEmpty(els.resourceList, query ? 'No resources match this search and filter.' : 'No resources in this view.');
      return;
    }

    shownResources.forEach((resource) => {
      const card = createResourceCard(resource);
      card.addEventListener('click', () => selectResource(resource, { autoplay: resource.playable }));
      els.resourceList.appendChild(card);
    });
    scrollActiveIntoView(els.resourceList);
  }

  function createHierarchyButton({ title, meta, count, active, extraClass = '' }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `list-button ${extraClass}`.trim();
    button.setAttribute('role', 'listitem');
    button.setAttribute('aria-pressed', String(Boolean(active)));
    if (active) button.classList.add('active');

    const textWrap = document.createElement('span');
    textWrap.className = 'button-text';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'title';
    titleSpan.dir = directionFor(title);
    titleSpan.textContent = title;

    const metaSpan = document.createElement('span');
    metaSpan.className = 'meta';
    metaSpan.dir = directionFor(meta);
    metaSpan.textContent = meta;

    const countSpan = document.createElement('span');
    countSpan.className = 'count';
    countSpan.textContent = count;

    textWrap.append(titleSpan, metaSpan);
    button.append(textWrap, countSpan);
    return button;
  }

  function createResourceCard(resource) {
    const active = resource.id === state.activeResourceId;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `resource-card ${resource.type}`.trim();
    button.setAttribute('role', 'listitem');
    button.setAttribute('aria-pressed', String(active));
    if (active) button.classList.add('active');

    const main = document.createElement('span');
    main.className = 'resource-main';

    const title = document.createElement('span');
    title.className = 'title';
    title.dir = directionFor(resource.title);
    title.textContent = resource.title;

    const meta = document.createElement('span');
    meta.className = 'resource-meta';
    const metaText = state.filterScope === 'all'
      ? `${resource.courseTitle} / ${resource.sourceTitle} / ${resource.topicTitle}`
      : `${resource.topicTitle} • ${resource.host || 'source'}`;
    meta.dir = directionFor(metaText);
    meta.textContent = metaText;

    const badges = document.createElement('span');
    badges.className = 'card-badges';
    badges.appendChild(createBadge(resourceBadgeText(resource), resource.type));

    if (resource.playable) badges.appendChild(createBadge(resource.kind === 'direct' ? mediaType(resource.url) : 'Embed', 'video'));
    if (resource.url && state.favorites.has(resource.url)) badges.appendChild(createBadge('Saved', 'favorite'));
    if (resource.error) badges.appendChild(createBadge(resource.error, 'issue'));

    const saved = getSavedPosition(resource);
    if (resource.kind === 'direct' && saved.seconds > 5) badges.appendChild(createBadge(progressBadgeText(saved), 'progress'));

    main.append(title, meta, badges);
    button.appendChild(main);
    return button;
  }

  function createBadge(text, extraClass = '') {
    const span = document.createElement('span');
    span.className = `mini-pill ${extraClass}`.trim();
    span.textContent = text;
    return span;
  }

  function appendEmpty(parent, text) {
    const div = document.createElement('div');
    div.className = 'empty-list';
    div.textContent = text;
    parent.appendChild(div);
  }

  function selectCourse(course) {
    state.activeCourseId = course.id;
    const source = course.sources[0] || null;
    state.activeSourceId = source?.id || null;
    const topic = firstTopicWithResources(source) || source?.topics[0] || null;
    state.activeTopicId = topic?.id || null;
    state.filterScope = 'course';
    els.scopeSelect.value = state.filterScope;
    safeSet(STORAGE.scope, state.filterScope);
    resetResultLimit();
    selectFirstResourceInScope({ autoplay: false });
  }

  function selectSource(source) {
    state.activeCourseId = source.courseId;
    state.activeSourceId = source.id;
    const topic = firstTopicWithResources(source) || source.topics[0] || null;
    state.activeTopicId = topic?.id || null;
    state.filterScope = 'source';
    els.scopeSelect.value = state.filterScope;
    safeSet(STORAGE.scope, state.filterScope);
    resetResultLimit();
    selectFirstResourceInScope({ autoplay: false });
  }

  function selectTopic(topic) {
    state.activeCourseId = topic.courseId;
    state.activeSourceId = topic.sourceId;
    state.activeTopicId = topic.id;
    state.filterScope = 'topic';
    els.scopeSelect.value = state.filterScope;
    safeSet(STORAGE.scope, state.filterScope);
    resetResultLimit();
    const resource = topic.resources.find((item) => item.playable) || topic.resources[0] || null;
    if (resource) selectResource(resource, { autoplay: false });
    else renderAll();
  }

  function selectFirstResourceInScope(options = {}) {
    const resources = getFilteredResources({ ignoreSearch: true, ignoreMedia: true, ignoreFavorites: true });
    const resource = resources.find((item) => item.playable) || resources[0] || null;
    if (resource) selectResource(resource, options);
    else {
      state.activeResourceId = null;
      resetPlayback();
      renderAll();
    }
  }

  function selectResource(resource, options = {}) {
    if (!resource) return;
    activateHierarchyForResource(resource);
    state.activeResourceId = resource.id;
    safeSet(STORAGE.lastResourceId, resource.id);
    if (resource.url) safeSet(STORAGE.lastUrl, resource.url);

    els.nowTitle.textContent = resource.title;
    els.nowTitle.dir = directionFor(resource.title);
    const meta = `${resource.courseTitle} / ${resource.sourceTitle} / ${resource.topicTitle}`;
    els.nowMeta.textContent = meta;
    els.nowMeta.dir = directionFor(meta);
    els.resourceTypeBadge.textContent = resourceBadgeText(resource);
    els.playerBadge.textContent = playerBadgeText(resource);
    setLinkDetails(resource);
    updateProgressInfo(resource);
    if (!options.preserveMessage) setMessage('');

    if (options.deferMedia && resource.playable) {
      clearPlaybackFrame();
      setEmptyPlayer('Video ready to open', 'Choose this resource from the list to load the remote video.');
      els.emptyPlayer.style.display = 'grid';
    } else if (resource.kind === 'embed') {
      els.videoElement.pause();
      els.videoElement.removeAttribute('src');
      els.videoElement.load();
      els.videoElement.style.display = 'none';
      els.iframeElement.src = toEmbedUrl(resource.url);
      els.iframeElement.style.display = 'block';
      setEmptyPlayer('', '');
      els.emptyPlayer.style.display = 'none';
      setMessage('Embedded player loaded. Use Open resource if the provider blocks playback here.');
    } else if (resource.kind === 'direct') {
      els.iframeElement.removeAttribute('src');
      els.iframeElement.style.display = 'none';
      els.videoElement.src = resource.url;
      els.videoElement.style.display = 'block';
      setEmptyPlayer('', '');
      els.emptyPlayer.style.display = 'none';
      els.videoElement.load();
      if (/\.m3u8(?:[?#].*)?$/i.test(resource.url) && !canPlayNativeHls()) {
        setMessage('This is an HLS playlist. Native playback depends on browser support; Safari usually supports it.', 'warning');
      }
      if (options.autoplay) {
        els.videoElement.play().catch(() => setMessage('Autoplay was blocked. Press Play in the video controls.', 'warning'));
      }
    } else {
      clearPlaybackFrame();
      const detail = resource.type === 'pdf'
        ? 'This topic contains a PDF. Use Open resource to view it in a new tab.'
        : resource.type === 'issue'
          ? `This extracted topic was preserved with issue: ${resource.error || 'unavailable content'}. Use Open topic to inspect the source page.`
          : 'This is a link resource. Use Open resource to visit it.';
      setEmptyPlayer(resourceBadgeText(resource), detail);
      els.emptyPlayer.style.display = 'grid';
    }

    renderAll();
  }

  function activateHierarchyForResource(resource) {
    state.activeCourseId = resource.courseId;
    state.activeSourceId = resource.sourceId;
    state.activeTopicId = resource.topicId;
  }

  function clearPlaybackFrame() {
    els.videoElement.pause();
    els.videoElement.removeAttribute('src');
    els.videoElement.load();
    els.videoElement.style.display = 'none';
    els.iframeElement.removeAttribute('src');
    els.iframeElement.style.display = 'none';
  }

  function resetPlayback() {
    clearPlaybackFrame();
    els.emptyPlayer.style.display = 'grid';
    setEmptyPlayer('No playable video selected.', 'Choose a video, PDF, or link from the hierarchy-aware resource list.');
    els.playerBadge.textContent = 'Ready';
    els.resourceTypeBadge.textContent = 'No selection';
    els.nowTitle.textContent = 'Nothing selected';
    els.nowMeta.textContent = 'Load a catalog and choose a resource.';
    els.progressInfo.textContent = 'Progress and resource status will appear here.';
    setLinkDetails(null);
    setMessage('');
    updateControls();
  }

  function setEmptyPlayer(title, detail) {
    clear(els.emptyPlayer);
    if (!title && !detail) return;
    const strong = document.createElement('strong');
    strong.textContent = title;
    const span = document.createElement('span');
    span.textContent = detail;
    els.emptyPlayer.append(strong, span);
  }

  function updateControls() {
    const resource = getActiveResource();
    const index = state.visibleResources.findIndex((item) => item.id === state.activeResourceId);
    const hasResource = Boolean(resource);
    const isFavorite = hasResource && resource.url && state.favorites.has(resource.url);

    els.prevButton.disabled = index <= 0;
    els.nextButton.disabled = index < 0 || index >= state.visibleResources.length - 1;
    els.favoriteButton.disabled = !hasResource || !resource.url;
    els.openResourceButton.disabled = !hasResource || !resource.url;
    els.copyResourceButton.disabled = !hasResource || !resource.url;
    els.openTopicButton.disabled = !getActiveTopic()?.url;
    els.openSourceButton.disabled = !getActiveSource()?.entryUrl;
    els.openCourseButton.disabled = !getActiveCourse()?.productUrl;
    els.resetProgressButton.disabled = !hasResource || resource.kind !== 'direct' || getSavedPosition(resource).seconds <= 5;

    els.favoriteButton.textContent = isFavorite ? 'Saved' : 'Save';
    els.favoriteButton.setAttribute('aria-pressed', String(Boolean(isFavorite)));
    els.favoritesOnlyButton.setAttribute('aria-pressed', String(state.favoritesOnly));
    els.autoNextButton.setAttribute('aria-pressed', String(state.autoNext));
    els.focusToggle.setAttribute('aria-pressed', String(state.focusMode));
    els.focusToggle.textContent = state.focusMode ? 'Show library' : 'Focus mode';

    if (resource) {
      updateProgressInfo(resource);
      setLinkDetails(resource);
    }
  }

  function stepResource(direction, options = {}) {
    const current = getActiveResource();
    const list = options.playableOnly ? state.visibleResources.filter((resource) => resource.playable) : state.visibleResources;
    if (!list.length) return;
    let index = current ? list.findIndex((resource) => resource.id === current.id) : -1;
    if (index < 0 && current && options.playableOnly) {
      index = list.findIndex((resource) => resource.order > current.order);
      index = direction > 0 ? index - 1 : index + 1;
    }
    const next = list[index + direction];
    if (next) selectResource(next, { autoplay: next.playable });
  }

  function toggleActiveFavorite() {
    const resource = getActiveResource();
    if (!resource?.url) return;
    if (state.favorites.has(resource.url)) {
      state.favorites.delete(resource.url);
      setMessage('Removed from saved resources.');
    } else {
      state.favorites.add(resource.url);
      setMessage('Saved resource.');
    }
    persistFavorites();
    state.stats.favorites = countKnownFavorites(state.flatResources);
    renderAll();
  }

  function toggleFavoritesOnly() {
    state.favoritesOnly = !state.favoritesOnly;
    safeSet(STORAGE.favoritesOnly, String(state.favoritesOnly));
    resetResultLimit();
    renderAll();
  }

  function toggleAutoNext() {
    state.autoNext = !state.autoNext;
    safeSet(STORAGE.autoNext, String(state.autoNext));
    els.autoNextButton.setAttribute('aria-pressed', String(state.autoNext));
    setMessage(state.autoNext ? 'Auto-next is on.' : 'Auto-next is off.');
  }

  function toggleFocusMode() {
    state.focusMode = !state.focusMode;
    safeSet(STORAGE.focus, String(state.focusMode));
    applyFocusMode();
  }

  function applyFocusMode() {
    document.body.classList.toggle('focus-mode', state.focusMode);
    if (els.focusToggle) {
      els.focusToggle.setAttribute('aria-pressed', String(state.focusMode));
      els.focusToggle.textContent = state.focusMode ? 'Show library' : 'Focus mode';
    }
  }

  function openActiveUrl(kind) {
    const url = getUrlForKind(kind);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function copyActiveUrl(kind) {
    const url = getUrlForKind(kind);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setMessage('Link copied.', 'success');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
      setMessage('Link copied.', 'success');
    }
  }

  function getUrlForKind(kind) {
    const resource = getActiveResource();
    if (kind === 'resource') return resource?.url || '';
    if (kind === 'topic') return getActiveTopic()?.url || resource?.topicUrl || '';
    if (kind === 'source') return getActiveSource()?.entryUrl || resource?.sourceEntryUrl || '';
    if (kind === 'course') return getActiveCourse()?.productUrl || resource?.productUrl || '';
    return '';
  }

  function resetActiveProgress() {
    const resource = getActiveResource();
    if (!resource) return;
    safeRemove(POSITION_PREFIX + resource.url);
    updateProgressInfo(resource);
    setMessage('Saved progress cleared.');
    renderAll();
  }

  function rememberPlaybackPosition() {
    const resource = getActiveResource();
    if (!resource || resource.kind !== 'direct') return;
    const seconds = Math.floor(els.videoElement.currentTime || 0);
    const duration = Number.isFinite(els.videoElement.duration) ? Math.floor(els.videoElement.duration) : null;
    if (seconds > 5) {
      safeSet(POSITION_PREFIX + resource.url, JSON.stringify({ seconds, duration, updatedAt: Date.now(), completed: false }));
    }
  }

  function restorePlaybackPosition() {
    const resource = getActiveResource();
    if (!resource || resource.kind !== 'direct') return;
    const saved = getSavedPosition(resource);
    const duration = Number.isFinite(els.videoElement.duration) ? els.videoElement.duration : saved.duration;
    if (saved.seconds > 5 && Number.isFinite(duration) && saved.seconds < duration - 5) {
      els.videoElement.currentTime = saved.seconds;
      setMessage(`Resumed at ${formatTime(saved.seconds)}.`, 'success');
    }
    updateProgressInfo(resource);
    updateControls();
  }

  function onVideoEnded() {
    const resource = getActiveResource();
    if (!resource) return;
    const duration = Number.isFinite(els.videoElement.duration) ? Math.floor(els.videoElement.duration) : null;
    if (duration) {
      safeSet(POSITION_PREFIX + resource.url, JSON.stringify({ seconds: duration, duration, updatedAt: Date.now(), completed: true }));
    }
    if (state.autoNext) {
      stepResource(1, { playableOnly: true });
    } else {
      setMessage('Video finished.');
      renderAll();
    }
  }

  function onVideoError() {
    const error = els.videoElement.error;
    const code = error?.code ? ` (media error ${error.code})` : '';
    setMessage(`This browser could not play the video${code}. Try Open resource.`, 'danger');
  }

  function updateProgressInfo(resource) {
    if (!resource) {
      els.progressInfo.textContent = 'Progress and resource status will appear here.';
      return;
    }
    if (resource.kind === 'direct') {
      const saved = getSavedPosition(resource);
      els.progressInfo.textContent = saved.seconds > 5
        ? `${progressBadgeText(saved)} saved for this video.`
        : 'Progress will save automatically for this direct video.';
    } else if (resource.kind === 'embed') {
      els.progressInfo.textContent = 'Embedded progress cannot be tracked locally.';
    } else if (resource.type === 'pdf') {
      els.progressInfo.textContent = 'PDF resource preserved from the extracted JSON.';
    } else if (resource.type === 'issue') {
      els.progressInfo.textContent = `Extractor issue preserved: ${resource.error || 'unknown issue'}.`;
    } else {
      els.progressInfo.textContent = 'Link resource preserved from the hierarchy.';
    }
  }

  function getSavedPosition(resource) {
    if (!resource?.url) return { seconds: 0, duration: null, updatedAt: null, completed: false };
    const raw = safeGet(POSITION_PREFIX + resource.url);
    if (!raw) return { seconds: 0, duration: null, updatedAt: null, completed: false };
    try {
      const parsed = JSON.parse(raw);
      return {
        seconds: Number(parsed.seconds) || 0,
        duration: Number(parsed.duration) || null,
        updatedAt: Number(parsed.updatedAt) || null,
        completed: Boolean(parsed.completed),
      };
    } catch {
      return { seconds: Number(raw) || 0, duration: null, updatedAt: null, completed: false };
    }
  }

  function progressBadgeText(saved) {
    if (saved.completed) return 'Completed';
    if (saved.duration && saved.duration > 0) {
      const percent = Math.min(99, Math.round((saved.seconds / saved.duration) * 100));
      if (percent >= 95) return 'Almost done';
      return `${percent}% watched`;
    }
    return `Resume ${formatTime(saved.seconds)}`;
  }

  function getFilteredResources(options = {}) {
    const query = options.ignoreSearch ? '' : getQuery();
    let resources = getScopedResources();

    if (!options.ignoreFavorites && state.favoritesOnly) {
      resources = resources.filter((resource) => resource.url && state.favorites.has(resource.url));
    }

    if (!options.ignoreMedia) {
      resources = resources.filter((resource) => mediaMatches(resource, state.mediaFilter));
    }

    if (query) {
      resources = resources.filter((resource) => resourceMatches(resource, query));
    }

    return sortResources(resources.slice());
  }

  function getScopedResources() {
    if (state.filterScope === 'all') return state.flatResources;
    const course = getActiveCourse();
    if (!course) return state.flatResources;
    if (state.filterScope === 'course') return course.sources.flatMap((source) => source.topics.flatMap((topic) => topic.resources));
    const source = getActiveSource();
    if (!source) return course.sources.flatMap((item) => item.topics.flatMap((topic) => topic.resources));
    if (state.filterScope === 'source') return source.topics.flatMap((topic) => topic.resources);
    const topic = getActiveTopic();
    return topic?.resources || [];
  }

  function mediaMatches(resource, filter) {
    if (filter === 'all') return true;
    if (filter === 'playable') return resource.playable;
    if (filter === 'pdf') return resource.type === 'pdf';
    if (filter === 'link') return resource.type === 'link';
    if (filter === 'issue') return resource.type === 'issue';
    return true;
  }

  function sortResources(resources) {
    switch (state.sortMode) {
      case 'title':
        return resources.sort((a, b) => compareText(a.title, b.title) || a.order - b.order);
      case 'course':
        return resources.sort((a, b) => compareText(`${a.courseTitle} ${a.sourceTitle} ${a.topicTitle} ${a.title}`, `${b.courseTitle} ${b.sourceTitle} ${b.topicTitle} ${b.title}`) || a.order - b.order);
      case 'progress':
        return resources.sort((a, b) => getProgressScore(b) - getProgressScore(a) || a.order - b.order);
      case 'catalog':
      default:
        return resources.sort((a, b) => a.order - b.order);
    }
  }

  function getProgressScore(resource) {
    const saved = getSavedPosition(resource);
    if (saved.completed) return 2_000_000_000;
    if (saved.updatedAt) return saved.updatedAt;
    return saved.seconds;
  }

  function resourceMatches(resource, query) {
    return normalizeSearchText([
      resource.title,
      resource.topicTitle,
      resource.sourceTitle,
      resource.courseTitle,
      resource.host,
      resource.url,
      resource.topicUrl,
      resource.sourceEntryUrl,
      resource.productUrl,
      resource.error,
    ].join(' ')).includes(query);
  }

  function getResourceListTitle(query) {
    const scope = state.filterScope === 'all'
      ? 'All courses'
      : state.filterScope === 'course'
        ? 'Current course'
        : state.filterScope === 'source'
          ? 'Current source'
          : 'Current topic';
    const media = state.mediaFilter === 'all'
      ? 'resources'
      : state.mediaFilter === 'playable'
        ? 'playable videos'
        : `${state.mediaFilter}s`;
    if (state.favoritesOnly && query) return `Saved ${media} search • ${scope}`;
    if (state.favoritesOnly) return `Saved ${media} • ${scope}`;
    if (query) return `${capitalize(media)} search • ${scope}`;
    return `${capitalize(media)} • ${scope}`;
  }

  function getQuery() {
    return normalizeSearchText(els.searchInput.value.trim());
  }

  function resetResultLimit() {
    state.resultLimit = RESULT_STEP;
  }

  function onGlobalKeydown(event) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === '/' && !isTypingTarget(event.target)) {
      event.preventDefault();
      els.searchInput.focus();
      els.searchInput.select();
      return;
    }
    if (key === 'escape') {
      if (document.activeElement === els.searchInput && els.searchInput.value) {
        els.searchInput.value = '';
        resetResultLimit();
        renderAll();
        event.preventDefault();
      } else if (state.focusMode) {
        toggleFocusMode();
        event.preventDefault();
      }
      return;
    }
    if (isTypingTarget(event.target)) return;
    if (key === 'n') {
      event.preventDefault();
      stepResource(1);
    } else if (key === 'p') {
      event.preventDefault();
      stepResource(-1);
    } else if (key === 'f') {
      event.preventDefault();
      toggleActiveFavorite();
    } else if (key === 't') {
      event.preventDefault();
      toggleFocusMode();
    } else if (key === 'a') {
      event.preventDefault();
      toggleAutoNext();
    }
  }

  function isTypingTarget(target) {
    const tag = target?.tagName?.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
  }

  function getActiveCourse() {
    return state.courses.find((course) => course.id === state.activeCourseId) || state.courses[0] || null;
  }

  function getActiveSource() {
    const course = getActiveCourse();
    return course?.sources.find((source) => source.id === state.activeSourceId) || course?.sources[0] || null;
  }

  function getActiveTopic() {
    const source = getActiveSource();
    return source?.topics.find((topic) => topic.id === state.activeTopicId) || source?.topics[0] || null;
  }

  function getActiveResource() {
    return state.flatResources.find((resource) => resource.id === state.activeResourceId) || null;
  }

  function firstTopicWithResources(source) {
    return source?.topics.find((topic) => topic.resources.length) || null;
  }

  function setLinkDetails(resource) {
    const topic = getActiveTopic();
    const source = getActiveSource();
    const course = getActiveCourse();
    els.resourceUrl.textContent = resource?.url || 'No resource selected';
    els.topicUrl.textContent = resource?.topicUrl || topic?.url || 'No topic selected';
    els.sourceUrl.textContent = resource?.sourceEntryUrl || source?.entryUrl || 'No source selected';
    els.courseUrl.textContent = resource?.productUrl || course?.productUrl || 'No course selected';
  }

  function setStatus(message) {
    els.statusText.textContent = message;
  }

  function setMessage(message, type = '') {
    els.playbackMessage.textContent = message;
    els.playbackMessage.className = `playback-message ${type}`.trim();
  }

  function describeCounts(counts) {
    const parts = [];
    if (counts.videos) parts.push(`${formatNumber(counts.videos)} video${counts.videos === 1 ? '' : 's'}`);
    if (counts.pdfs) parts.push(`${formatNumber(counts.pdfs)} PDF${counts.pdfs === 1 ? '' : 's'}`);
    if (counts.links) parts.push(`${formatNumber(counts.links)} link${counts.links === 1 ? '' : 's'}`);
    if (counts.issues) parts.push(`${formatNumber(counts.issues)} issue${counts.issues === 1 ? '' : 's'}`);
    return parts.length ? parts.join(' • ') : 'No resources';
  }

  function resourceBadgeText(resource) {
    if (!resource) return 'Resource';
    if (resource.type === 'pdf') return 'PDF';
    if (resource.type === 'issue') return 'Issue';
    if (resource.type === 'link') return 'Link';
    return resource.kind === 'embed' ? 'Embedded video' : 'Video';
  }

  function playerBadgeText(resource) {
    if (!resource) return 'Ready';
    if (resource.type === 'pdf') return 'PDF ready';
    if (resource.type === 'issue') return 'Issue preserved';
    if (resource.type === 'link') return 'Link ready';
    return resource.kind === 'direct' ? mediaType(resource.url) : 'Embedded player';
  }

  function toEmbedUrl(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, '');
      if (host === 'youtu.be') {
        const id = parsed.pathname.split('/').filter(Boolean)[0];
        if (id) return `https://www.youtube.com/embed/${id}`;
      }
      if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
        const id = parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).pop();
        if (id) return `https://www.youtube.com/embed/${id}`;
      }
      if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
        const id = parsed.pathname.split('/').filter(Boolean).find((part) => /^\d+$/.test(part));
        if (id) return `https://player.vimeo.com/video/${id}`;
      }
      if (host === 'aparat.com' || host.endsWith('.aparat.com')) {
        const parts = parsed.pathname.split('/').filter(Boolean);
        const vIndex = parts.indexOf('v');
        const id = vIndex >= 0 ? parts[vIndex + 1] : parts[parts.length - 1];
        if (id && !/embed/i.test(parsed.pathname)) return `https://www.aparat.com/video/video/embed/videohash/${id}/vt/frame`;
      }
    } catch {
      return url;
    }
    return url;
  }

  function canPlayNativeHls() {
    const video = document.createElement('video');
    return Boolean(video.canPlayType('application/vnd.apple.mpegurl') || video.canPlayType('application/x-mpegURL'));
  }

  function mediaType(url) {
    if (/\.m3u8(?:[?#].*)?$/i.test(url)) return 'HLS';
    if (/\.webm(?:[?#].*)?$/i.test(url)) return 'WebM';
    if (/\.mov(?:[?#].*)?$/i.test(url)) return 'MOV';
    if (/\.m4v(?:[?#].*)?$/i.test(url)) return 'M4V';
    if (/\.ogv|\.ogg(?:[?#].*)?$/i.test(url)) return 'OGG';
    return 'MP4';
  }

  function hostLabel(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return 'source';
    }
  }

  function titleForTopicResource(topicTitle, url, index, label) {
    if (index === 0) return topicTitle;
    return `${topicTitle} ${cleanTitle(label) || titleFromUrl(url) || index + 1}`;
  }

  function normalizeUrl(url) {
    const raw = String(url || '').trim().replace(/[,.،;؛]+$/g, '');
    if (!raw) return '';
    try {
      const parsed = new URL(raw);
      if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
        || !parsed.hostname || parsed.username || parsed.password) return '';
      return parsed.href;
    } catch {
      return '';
    }
  }

  function cleanTitle(value) {
    if (value == null) return '';
    return String(value)
      .replace(/^\uFEFF/, '')
      .replace(/\.[a-z0-9]{2,5}(?:[?#].*)?$/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function titleFromUrl(url) {
    try {
      const parsed = new URL(url);
      const last = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname);
      return cleanTitle(last) || parsed.hostname;
    } catch {
      return cleanTitle(url);
    }
  }

  function titleFromSlug(value) {
    return cleanTitle(String(value || '').replace(/[-_]+/g, ' '));
  }

  function firstText(object, keys) {
    for (const key of keys) {
      if (object && Object.prototype.hasOwnProperty.call(object, key)) {
        const value = cleanTitle(object[key]);
        if (value) return value;
      }
    }
    return '';
  }

  function firstUrlFromKeys(object, keys) {
    for (const key of keys) {
      if (object && Object.prototype.hasOwnProperty.call(object, key)) {
        const value = normalizeUrl(object[key]);
        if (/^https?:\/\//i.test(value)) return value;
      }
    }
    return '';
  }

  function extractUrlEntries(value, hint = '') {
    const text = String(value || '');
    URL_RE.lastIndex = 0;
    const matches = text.match(URL_RE) || [];
    const urls = matches.length ? matches : (/^https?:\/\//i.test(text.trim()) ? [text.trim()] : []);
    return urls.map((url) => ({ url: normalizeUrl(url), hint, title: titleFromUrl(url) }));
  }

  function isPlainObject(value) {
    return Object.prototype.toString.call(value) === '[object Object]';
  }

  function isScalar(value) {
    return value == null || ['string', 'number', 'boolean'].includes(typeof value);
  }

  function arrayStrings(value) {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => typeof item === 'string' && item.trim());
  }

  function canonicalKey(value) {
    return cleanTitle(value).toLocaleLowerCase();
  }

  function stableId(input) {
    let hash = 2166136261;
    const text = String(input);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `id-${(hash >>> 0).toString(36)}`;
  }

  function compareText(a, b) {
    return collator.compare(a || '', b || '');
  }

  function directionFor(text) {
    return RTL_RE.test(String(text || '')) ? 'rtl' : 'auto';
  }

  function joinHint(...parts) {
    return parts.filter(Boolean).join(' ');
  }

  function normalizeSearchText(value) {
    return String(value || '')
      .toLocaleLowerCase()
      .replace(/[\u064A\u06CC]/g, 'ی')
      .replace(/[\u0643\u06A9]/g, 'ک')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function formatNumber(value) {
    return new Intl.NumberFormat().format(Number(value) || 0);
  }

  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = String(total % 60).padStart(2, '0');
    if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${secs}`;
    return `${minutes}:${secs}`;
  }

  function capitalize(value) {
    const text = String(value || '');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function clear(element) {
    while (element.firstChild) element.removeChild(element.firstChild);
  }

  function scrollActiveIntoView(container) {
    requestAnimationFrame(() => {
      const active = container.querySelector('.active');
      // Browser-wide scrollIntoView also scrolls <body> when the hierarchy
      // fits in its column. On mobile that moved the page away from the
      // catalog title and controls immediately after loading.
      if (!active || container.scrollHeight <= container.clientHeight + 1) return;
      const bounds = container.getBoundingClientRect();
      const row = active.getBoundingClientRect();
      if (row.top < bounds.top) container.scrollTop += row.top - bounds.top;
      else if (row.bottom > bounds.bottom) container.scrollTop += row.bottom - bounds.bottom;
    });
  }

  function loadFavoriteSet() {
    try {
      const parsed = JSON.parse(safeGet(STORAGE.favorites) || '[]');
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  }

  function persistFavorites() {
    safeSet(STORAGE.favorites, JSON.stringify([...state.favorites]));
  }

  function countKnownFavorites(resources = state.flatResources) {
    if (!resources.length) return state.favorites.size;
    const known = new Set(resources.filter((resource) => resource.url && state.favorites.has(resource.url)).map((resource) => resource.url));
    return known.size;
  }

  function safeGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage can be unavailable in private or locked-down browsers.
    }
  }

  function safeRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Storage can be unavailable in private or locked-down browsers.
    }
  }

  function looksLikeCsv(text) {
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    return /,|;|\t/.test(firstLine) && /course|topic|video|url|title|href|src|pdf/i.test(firstLine);
  }

  function parseCsv(text) {
    const delimiter = detectDelimiter(text);
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];
      if (char === '"' && inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        row.push(field);
        field = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && next === '\n') index += 1;
        row.push(field);
        if (row.some((cell) => cell.trim())) rows.push(row);
        row = [];
        field = '';
      } else {
        field += char;
      }
    }
    row.push(field);
    if (row.some((cell) => cell.trim())) rows.push(row);
    if (!rows.length) return [];

    const headers = rows.shift().map((header) => header.replace(/^\uFEFF/, '').trim());
    return rows.map((cells) => {
      const object = {};
      headers.forEach((header, index) => {
        object[header] = cells[index] == null ? '' : cells[index].trim();
      });
      return object;
    });
  }

  function detectDelimiter(text) {
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const candidates = [',', ';', '\t'];
    return candidates
      .map((delimiter) => ({ delimiter, count: firstLine.split(delimiter).length }))
      .sort((a, b) => b.count - a.count)[0].delimiter;
  }

  if (typeof window !== 'undefined') {
    window.FARZAN_PLAYER_DEBUG = {
      normalizeCatalog,
      normalizePlasmatoCatalog,
      normalizeGenericCatalog,
      parseCatalogText,
      classifyCatalogUrl,
      mediaType,
    };
  }
})();
