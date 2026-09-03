const LIBRARY_SETTING_KEY = 'ocd_user_library';
const FILE_DB_NAME = 'opencoursedeck-library-files';
const FILE_STORE = 'files';
const FILE_PREFIX = 'library-file:';
const DEFAULT_COURSE_ID = 'user-library';
const DEFAULT_COURSE_TITLE = 'My Library';
const REMOTE_PROTOCOLS = new Set(['http:', 'https:']);
/** Tiny-file numeric fallback for IDB clones that flatten Blob (tests / some polyfills). */
const BYTES_FALLBACK_MAX = 256 * 1024;
/** Hard cap so a single lecture cannot exhaust the origin quota. */
export const MAX_LIBRARY_FILE_BYTES = 1536 * 1024 * 1024;

const blobUrls = new Map();
let overlayBound = false;
let fileDb = null;
let fileDbPromise = null;

function emptyLibrary() {
  return { version: 1, courses: {} };
}

function cloneValue(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value); } catch { /* fall through */ }
  }
  return JSON.parse(JSON.stringify(value));
}

function cloneLibrary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyLibrary();
  const courses = value.courses && typeof value.courses === 'object' && !Array.isArray(value.courses)
    ? cloneValue(value.courses)
    : {};
  return { version: Number(value.version) || 1, courses };
}

export function unwrapMediaRef(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') return String(value.url || value.src || '').trim();
  return String(value).trim();
}

export function isLibraryFileRef(value) {
  return unwrapMediaRef(value).startsWith(FILE_PREFIX);
}

export function isSafeRemoteUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return REMOTE_PROTOCOLS.has(String(parsed.protocol || '').toLowerCase());
  } catch {
    return false;
  }
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function openFileDb() {
  if (fileDb) return Promise.resolve(fileDb);
  if (fileDbPromise) return fileDbPromise;
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  fileDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(FILE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      fileDb = request.result;
      fileDb.onclose = () => { fileDb = null; fileDbPromise = null; };
      fileDb.onversionchange = () => {
        try { fileDb.close(); } catch { /* ignore */ }
        fileDb = null;
        fileDbPromise = null;
      };
      resolve(fileDb);
    };
    request.onerror = () => {
      fileDbPromise = null;
      reject(request.error || new Error('Unable to open library file storage'));
    };
  });
  return fileDbPromise;
}

async function withFileStore(mode, fn) {
  const db = await openFileDb();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(FILE_STORE, mode);
    } catch (error) {
      fileDb = null;
      fileDbPromise = null;
      reject(error);
      return;
    }
    const store = tx.objectStore(FILE_STORE);
    const request = fn(store);
    let result;
    if (request) {
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error);
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('Library file transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('Library file transaction aborted'));
  });
}

function revokeCachedUrl(id) {
  const url = blobUrls.get(id);
  if (!url) return;
  try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  blobUrls.delete(id);
}

function revokeAllCachedUrls() {
  for (const id of [...blobUrls.keys()]) revokeCachedUrl(id);
}

function closeFileDb() {
  try { fileDb?.close(); } catch { /* ignore */ }
  fileDb = null;
  fileDbPromise = null;
}

export async function loadLibrary() {
  try {
    const saved = await window.DB?.getSetting?.(LIBRARY_SETTING_KEY);
    return cloneLibrary(saved);
  } catch {
    return emptyLibrary();
  }
}

async function persistLibrary(library, extra = {}) {
  const next = cloneLibrary(library);
  await window.DB?.saveSetting?.(LIBRARY_SETTING_KEY, next);
  overlayLibrary(next);
  window.OpenCourseDeck?.bus?.emit?.('library:changed', {
    courses: Object.keys(next.courses).length,
    ...extra,
  });
  return next;
}

export function overlayLibrary(library) {
  const store = window.DataStore;
  if (typeof store?.mergeRaw !== 'function') return;
  const source = library || emptyLibrary();
  store.mergeRaw(source.courses || {}, { userOwned: true });
}

async function overlayFromStorage() {
  overlayLibrary(await loadLibrary());
}

function normalizeCourseTitle(value) {
  return String(value || '').trim().toLowerCase();
}

function ensureCourse(library, { id, title, description = '', overwriteTitle = false } = {}) {
  const courseId = id || DEFAULT_COURSE_ID;
  const existing = library.courses[courseId];
  if (existing && typeof existing === 'object') {
    if (overwriteTitle && title) existing.title = title;
    if (description) existing.description = description;
    if (!Array.isArray(existing.sources) || !existing.sources.length) {
      existing.sources = [{ label: 'My Library', topics: [] }];
    }
    return existing;
  }
  const course = {
    title: title || (courseId === DEFAULT_COURSE_ID ? DEFAULT_COURSE_TITLE : 'Untitled course'),
    description,
    productUrl: '',
    sources: [{ label: 'My Library', topics: [] }],
  };
  library.courses[courseId] = course;
  return course;
}

function findCourseIdByTitle(library, title) {
  const needle = normalizeCourseTitle(title);
  if (!needle) return '';
  for (const [id, course] of Object.entries(library.courses || {})) {
    if (normalizeCourseTitle(course?.title) === needle) return id;
  }
  return '';
}

function resolveOrCreateCourse(library, { courseId, courseTitle } = {}) {
  const requestedId = String(courseId || '').trim();
  if (requestedId) {
    return { id: requestedId, course: ensureCourse(library, { id: requestedId, title: courseTitle }) };
  }
  const title = String(courseTitle || '').trim();
  const isDefaultTitle = !title || normalizeCourseTitle(title) === normalizeCourseTitle(DEFAULT_COURSE_TITLE);
  if (isDefaultTitle) {
    return {
      id: DEFAULT_COURSE_ID,
      course: ensureCourse(library, { id: DEFAULT_COURSE_ID, title: DEFAULT_COURSE_TITLE }),
    };
  }
  const existingId = findCourseIdByTitle(library, title);
  if (existingId) {
    return { id: existingId, course: ensureCourse(library, { id: existingId }) };
  }
  const id = makeId('course');
  return { id, course: ensureCourse(library, { id, title }) };
}

function collectLibraryFileIds(course, into = new Set()) {
  for (const source of course?.sources || []) {
    for (const topic of source?.topics || []) {
      for (const list of [topic?.videos, topic?.pdfs, topic?.iframes]) {
        for (const item of list || []) {
          const raw = unwrapMediaRef(item);
          if (raw.startsWith(FILE_PREFIX)) into.add(raw.slice(FILE_PREFIX.length));
        }
      }
    }
  }
  return into;
}

async function deleteLibraryFile(id) {
  if (!id) return;
  revokeCachedUrl(id);
  try {
    await withFileStore('readwrite', (store) => store.delete(id));
  } catch { /* ignore missing stores during reset */ }
}

function courseTopics(course) {
  if (!Array.isArray(course.sources) || !course.sources.length) {
    course.sources = [{ label: 'My Library', topics: [] }];
  }
  const source = course.sources[0];
  if (!Array.isArray(source.topics)) source.topics = [];
  return source.topics;
}

export async function putLibraryFile(file, { kind = 'file' } = {}) {
  if (!file) throw new TypeError('A file is required');
  const size = Math.max(0, Number(file.size) || 0);
  if (size > MAX_LIBRARY_FILE_BYTES) {
    throw new Error(`This file is too large to keep in the local library (max ${Math.round(MAX_LIBRARY_FILE_BYTES / (1024 * 1024))} MB).`);
  }
  const id = makeId(kind);
  const type = String(file.type || 'application/octet-stream');
  const blob = file instanceof Blob ? file : new Blob([file], { type });
  const record = {
    id,
    name: String(file.name || kind).slice(0, 200),
    type,
    size: size || blob.size || 0,
    kind,
    createdAt: Date.now(),
    blob,
  };
  // Avoid Array.from(bytes) on lecture-sized files (2× RAM + a giant number array).
  if (record.size > 0 && record.size <= BYTES_FALLBACK_MAX) {
    const buffer = await blob.arrayBuffer();
    record.bytes = Array.from(new Uint8Array(buffer));
  }
  try {
    await withFileStore('readwrite', (store) => store.put(record));
  } catch (error) {
    if (error?.name === 'QuotaExceededError') {
      throw new Error('Not enough storage for this file. Free space or try a smaller file.');
    }
    throw error;
  }
  return { id, ref: `${FILE_PREFIX}${id}`, name: record.name, type: record.type, size: record.size };
}

export async function resolvePlayableUrl(value, sanitize) {
  const resolved = await resolveMediaUrl(value);
  if (!resolved) return null;
  return typeof sanitize === 'function' ? sanitize(resolved) : resolved;
}

function blobFromRecord(record) {
  if (record?.blob instanceof Blob) return record.blob;
  if (record?.buffer instanceof ArrayBuffer) {
    return new Blob([record.buffer], { type: record.type || 'application/octet-stream' });
  }
  if (record?.bytes) {
    return new Blob([Uint8Array.from(record.bytes)], { type: record.type || 'application/octet-stream' });
  }
  return null;
}

export async function resolveMediaUrl(value) {
  const raw = unwrapMediaRef(value);
  if (!raw) return '';
  if (!raw.startsWith(FILE_PREFIX)) return raw;
  const id = raw.slice(FILE_PREFIX.length);
  if (blobUrls.has(id)) return blobUrls.get(id);
  const record = await withFileStore('readonly', (store) => store.get(id));
  const blob = blobFromRecord(record);
  if (!blob || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return '';
  const url = URL.createObjectURL(blob);
  blobUrls.set(id, url);
  return url;
}

export async function upsertCourse({ id, title, description = '' } = {}) {
  if (!String(title || '').trim() && !id) throw new TypeError('Course title is required');
  const library = await loadLibrary();
  const courseId = id || makeId('course');
  ensureCourse(library, {
    id: courseId,
    title: String(title || '').trim() || undefined,
    description: String(description || '').trim(),
    overwriteTitle: Boolean(String(title || '').trim()),
  });
  await persistLibrary(library, { courseId });
  return { id: courseId, title: library.courses[courseId].title };
}

export async function removeCourse(courseId) {
  const library = await loadLibrary();
  const course = library.courses[courseId];
  const doomed = collectLibraryFileIds(course);
  const stillUsed = new Set();
  for (const [id, remaining] of Object.entries(library.courses || {})) {
    if (id === courseId) continue;
    collectLibraryFileIds(remaining, stillUsed);
  }
  delete library.courses[courseId];
  await persistLibrary(library, { courseId });
  for (const id of doomed) {
    if (!stillUsed.has(id)) await deleteLibraryFile(id);
  }
  return true;
}

export async function addTopic({
  courseId,
  courseTitle,
  title,
  videos = [],
  pdfs = [],
  iframes = [],
} = {}) {
  const topicTitle = String(title || '').trim();
  if (!topicTitle) throw new TypeError('Topic title is required');
  const library = await loadLibrary();
  const { id, course } = resolveOrCreateCourse(library, { courseId, courseTitle });
  const topics = courseTopics(course);
  const topicId = makeId('topic');
  topics.push({
    title: topicTitle,
    url: topicId,
    videos: Array.isArray(videos) ? videos : [],
    pdfs: Array.isArray(pdfs) ? pdfs : [],
    iframes: Array.isArray(iframes) ? iframes : [],
  });
  await persistLibrary(library, { courseId: id });
  return { courseId: id, topicId, title: topicTitle };
}

export async function addMediaFiles(files, { kind = 'video', courseId, courseTitle, title } = {}) {
  const list = [...(files || [])].filter(Boolean);
  if (!list.length) return [];
  const type = kind === 'pdf' ? 'pdf' : 'video';
  const library = await loadLibrary();
  const resolved = resolveOrCreateCourse(library, { courseId, courseTitle });
  const topics = courseTopics(resolved.course);
  const sharedTitle = list.length === 1 ? String(title || '').trim() : '';
  const results = [];
  for (const file of list) {
    const stored = await putLibraryFile(file, { kind: type });
    const topicTitle = sharedTitle
      || String(file.name || stored.name).replace(/\.[^.]+$/, '')
      || (type === 'pdf' ? 'PDF' : 'Video');
    const topicId = makeId('topic');
    const media = [{ url: stored.ref, label: stored.name }];
    topics.push({
      title: topicTitle,
      url: topicId,
      videos: type === 'video' ? media : [],
      pdfs: type === 'pdf' ? media : [],
      iframes: [],
    });
    results.push({ courseId: resolved.id, topicId, title: topicTitle });
  }
  await persistLibrary(library, { courseId: resolved.id });
  return results;
}

export async function addVideoFile(file, options = {}) {
  const [result] = await addMediaFiles([file], { ...options, kind: 'video' });
  return result;
}

export async function addPdfFile(file, options = {}) {
  const [result] = await addMediaFiles([file], { ...options, kind: 'pdf' });
  return result;
}

export async function addRemoteLink({ url, title, kind = 'video', courseId, courseTitle } = {}) {
  const href = String(url || '').trim();
  if (!isSafeRemoteUrl(href)) throw new TypeError('Enter an http or https URL');
  const type = ['video', 'pdf', 'embed'].includes(kind) ? kind : 'video';
  const label = String(title || href).trim();
  const media = [{ url: href, label }];
  return addTopic({
    courseId,
    courseTitle,
    title: label,
    videos: type === 'video' ? media : [],
    pdfs: type === 'pdf' ? media : [],
    iframes: type === 'embed' ? media : [],
  });
}

export function initUserLibrary(root = window) {
  const pd = root.OpenCourseDeck = root.OpenCourseDeck || {};
  pd.UserLibrary = {
    settingKey: LIBRARY_SETTING_KEY,
    filePrefix: FILE_PREFIX,
    maxFileBytes: MAX_LIBRARY_FILE_BYTES,
    unwrap: unwrapMediaRef,
    isLibraryFileRef,
    isSafeRemoteUrl,
    resolve: resolveMediaUrl,
    resolvePlayable: resolvePlayableUrl,
    load: loadLibrary,
    overlay: overlayFromStorage,
    upsertCourse,
    removeCourse,
    addTopic,
    addVideoFile,
    addPdfFile,
    addMediaFiles,
    addRemoteLink,
    putLibraryFile,
    revokeCachedUrl,
  };

  if (!overlayBound) {
    overlayBound = true;
    const bus = pd.bus;
    bus?.on?.('data:loaded', overlayFromStorage);
    bus?.on?.('data:degraded', overlayFromStorage);
    bus?.on?.('app:ready', overlayFromStorage);
    const resetCaches = () => {
      revokeAllCachedUrls();
      closeFileDb();
    };
    bus?.on?.('storage:cleared', resetCaches);
    root.addEventListener?.('pagehide', resetCaches);
  }

  if (root.DataStore?.isLoaded?.()) overlayFromStorage();
  return pd.UserLibrary;
}
