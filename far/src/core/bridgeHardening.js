const LEGACY_ANNOTATION_KEY = 'plasma-pdf-annotations';
const DOCUMENT_ANNOTATION_KEY = 'plasma-pdf-annotations-by-document';
const ERROR_STATUS_COLOR = '#b91c1c';
const LEGACY_ERROR_STATUS_COLOR = '#ef4444';

function readJson(storage, key, fallback) {
  try {
    const value = JSON.parse(storage?.getItem?.(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(storage, key, value) {
  storage?.setItem?.(key, JSON.stringify(value));
}

function annotationIdentity(annotation) {
  if (annotation?.id) return `id:${annotation.id}`;
  return JSON.stringify([
    annotation?.docId ?? '',
    Number(annotation?.page ?? 0),
    annotation?.type ?? '',
    annotation?.text ?? '',
    annotation?.x ?? null,
    annotation?.y ?? null,
    annotation?.createdAt ?? null,
  ]);
}

function mergeAnnotations(...groups) {
  const merged = new Map();
  for (const group of groups) {
    for (const annotation of Array.isArray(group) ? group : []) {
      if (!annotation || typeof annotation !== 'object') continue;
      const identity = annotationIdentity(annotation);
      // Callers pass authoritative records first. Legacy and document fallback
      // data may fill gaps, but must never overwrite a newer database record.
      if (!merged.has(identity)) merged.set(identity, annotation);
    }
  }
  return [...merged.values()];
}

function documentFallback(storage) {
  const dictionary = readJson(storage, DOCUMENT_ANNOTATION_KEY, {});
  if (!dictionary || Array.isArray(dictionary) || typeof dictionary !== 'object') return [];
  return Object.entries(dictionary).flatMap(([docId, records]) => (
    Array.isArray(records) ? records.map(record => ({ ...record, docId: record?.docId ?? docId })) : []
  ));
}

function explicitLegacyAnnotations(storage) {
  const legacy = readJson(storage, LEGACY_ANNOTATION_KEY, {});
  if (Array.isArray(legacy)) return legacy.filter(record => typeof record?.docId === 'string' && record.docId);
  if (!legacy || typeof legacy !== 'object') return [];
  return Object.values(legacy).flatMap(records => (
    Array.isArray(records)
      ? records.filter(record => typeof record?.docId === 'string' && record.docId)
      : []
  ));
}

function moveFallbackDocument(storage, docId, records, legacyBefore) {
  const legacyAfter = storage?.getItem?.(LEGACY_ANNOTATION_KEY) ?? null;
  const documents = readJson(storage, DOCUMENT_ANNOTATION_KEY, {});
  const nextDocuments = documents && !Array.isArray(documents) && typeof documents === 'object' ? { ...documents } : {};

  if (legacyAfter !== legacyBefore) {
    const legacy = readJson(storage, LEGACY_ANNOTATION_KEY, {});
    if (legacy && !Array.isArray(legacy) && typeof legacy === 'object' && Object.hasOwn(legacy, docId)) {
      const migrated = Array.isArray(legacy[docId]) ? legacy[docId] : records;
      if (migrated.length) nextDocuments[docId] = migrated;
      else delete nextDocuments[docId];
      delete legacy[docId];
      if (Object.keys(legacy).length) writeJson(storage, LEGACY_ANNOTATION_KEY, legacy);
      else storage?.removeItem?.(LEGACY_ANNOTATION_KEY);
    }
  }

  if (!records.length) delete nextDocuments[docId];
  if (Object.keys(nextDocuments).length) writeJson(storage, DOCUMENT_ANNOTATION_KEY, nextDocuments);
  else storage?.removeItem?.(DOCUMENT_ANNOTATION_KEY);
}

function hardenAnnotations(root, db) {
  if (!db || db.__annotationFallbackHardened) return;
  const originalGetAll = db.getAllAnnotations?.bind(db);
  const originalSave = db.saveAnnotations?.bind(db);
  if (typeof originalGetAll !== 'function' || typeof originalSave !== 'function') return;

  db.getAllAnnotations = async () => {
    const primary = await originalGetAll();
    const legacy = readJson(root.localStorage, LEGACY_ANNOTATION_KEY, {});
    const hasAmbiguousPageMap = legacy && !Array.isArray(legacy) && typeof legacy === 'object'
      && Object.keys(legacy).some(key => Number.isFinite(Number(key)))
      && Object.values(legacy).some(records => Array.isArray(records) && records.some(record => !record?.docId));
    const safePrimary = hasAmbiguousPageMap
      ? primary.filter(annotation => annotation?.docId !== 'global')
      : primary;
    return mergeAnnotations(safePrimary, explicitLegacyAnnotations(root.localStorage), documentFallback(root.localStorage));
  };

  db.getAnnotations = async (docId) => (await db.getAllAnnotations()).filter(annotation => annotation.docId === docId);

  db.saveAnnotations = async (docId, pages) => {
    const legacyBefore = root.localStorage?.getItem?.(LEGACY_ANNOTATION_KEY) ?? null;
    const records = await originalSave(docId, pages);
    moveFallbackDocument(root.localStorage, docId, records, legacyBefore);
    return records;
  };

  Object.defineProperty(db, '__annotationFallbackHardened', { value: true });
}

function normalizedColor(root, value) {
  const probe = root.document?.createElement?.('span');
  if (!probe) return value;
  probe.style.color = '';
  probe.style.color = value;
  return probe.style.color;
}

function updateSplashStatus(root, status) {
  const element = root.document?.getElementById?.('splash-status');
  if (!element) return;
  if (status === 'degraded') {
    element.style.color = ERROR_STATUS_COLOR;
    return;
  }
  if (status !== 'authoritative') return;
  const errorColors = new Set([
    normalizedColor(root, LEGACY_ERROR_STATUS_COLOR),
    normalizedColor(root, ERROR_STATUS_COLOR),
  ]);
  if (errorColors.has(element.style.color)) element.style.removeProperty('color');
}

function hardenCatalog(root, dataStore) {
  if (!dataStore || dataStore.__catalogResilienceHardened) return dataStore;
  let lastGood = null;

  const capture = () => {
    const state = dataStore.getState?.();
    if (state?.status === 'authoritative') {
      lastGood = {
        courses: dataStore.allCourses?.() || [],
        topics: dataStore.allTopics?.() || [],
        source: state.source,
        lastSuccessfulAt: state.lastSuccessfulAt,
      };
    }
    updateSplashStatus(root, state?.status);
    return state;
  };

  capture();
  const run = async (method, options) => {
    const result = await dataStore[method](options);
    capture();
    return result;
  };

  const facade = {
    ...dataStore,
    init: options => run('init', options),
    retry: options => run('retry', options),
    getState() {
      const state = dataStore.getState();
      if (state.status !== 'degraded' || !lastGood) return state;
      return Object.freeze({
        ...state,
        source: lastGood.source,
        lastSuccessfulAt: lastGood.lastSuccessfulAt,
        courses: lastGood.courses.length,
        topics: lastGood.topics.length,
        usingLastKnownGood: true,
      });
    },
    allCourses() {
      const state = dataStore.getState();
      return state.status === 'degraded' && lastGood ? lastGood.courses.slice() : dataStore.allCourses();
    },
    allTopics() {
      const state = dataStore.getState();
      return state.status === 'degraded' && lastGood ? lastGood.topics.slice() : dataStore.allTopics();
    },
    catalogPath() {
      const state = dataStore.getState();
      return state.status === 'degraded' && lastGood ? lastGood.source : dataStore.catalogPath?.();
    },
  };
  Object.defineProperty(facade, '__catalogResilienceHardened', { value: true });
  return facade;
}

export function installBridgeHardening(root = window) {
  root.OpenCourseDeck = root.OpenCourseDeck || {};
  const currentStore = root.DataStore || root.OpenCourseDeck.DataStore;
  const hardenedStore = hardenCatalog(root, currentStore);
  if (hardenedStore) {
    root.DataStore = hardenedStore;
    root.OpenCourseDeck.DataStore = hardenedStore;
  }
  hardenAnnotations(root, root.DB);
  root.OpenCourseDeck.BridgeHardening = Object.freeze({
    errorStatusColor: ERROR_STATUS_COLOR,
    documentAnnotationKey: DOCUMENT_ANNOTATION_KEY,
  });
  return { dataStore: hardenedStore, db: root.DB };
}
