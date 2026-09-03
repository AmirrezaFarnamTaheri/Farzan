const LIBRARY_SETTING_KEY = 'ocd_user_library';
const FILE_DB_NAME = 'opencoursedeck-library-files';
const FILE_STORE = 'files';
const FILE_PREFIX = 'library-file:';
const DEFAULT_COURSE_ID = 'user-library';
const DEFAULT_COURSE_TITLE = 'My Library';

const blobUrls = new Map();
let overlayBound = false;

function emptyLibrary() {
  return { version: 1, courses: {} };
}

function cloneLibrary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyLibrary();
  const courses = value.courses && typeof value.courses === 'object' && !Array.isArray(value.courses)
    ? value.courses
    : {};
  return { version: 1, courses: { ...courses } };
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

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function openFileDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FILE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to open library file storage'));
  });
}

async function withFileStore(mode, fn) {
  const db = await openFileDb();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, mode);
    const store = tx.objectStore(FILE_STORE);
    const request = fn(store);
    let result;
    if (request) {
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error);
    }
    tx.oncomplete = () => {
      try { db.close(); } catch {}
      resolve(result);
    };
    tx.onerror = () => {
      try { db.close(); } catch {}
      reject(tx.error || new Error('Library file transaction failed'));
    };
    tx.onabort = () => {
      try { db.close(); } catch {}
      reject(tx.error || new Error('Library file transaction aborted'));
    };
  });
}

export async function loadLibrary() {
  try {
    const saved = await window.DB?.getSetting?.(LIBRARY_SETTING_KEY);
    return cloneLibrary(saved);
  } catch {
    return emptyLibrary();
  }
}

async function persistLibrary(library) {
  const next = cloneLibrary(library);
  await window.DB?.saveSetting?.(LIBRARY_SETTING_KEY, next);
  overlayLibrary(next);
  window.OpenCourseDeck?.bus?.emit?.('library:changed', {
    courses: Object.keys(next.courses).length,
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

function ensureCourse(library, { id, title, description = '' } = {}) {
  const courseId = id || DEFAULT_COURSE_ID;
  const existing = library.courses[courseId];
  if (existing && typeof existing === 'object') {
    if (title) existing.title = title;
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
  const id = makeId(kind);
  const type = String(file.type || 'application/octet-stream');
  const buffer = file instanceof Blob && typeof file.arrayBuffer === 'function'
    ? await file.arrayBuffer()
    : file;
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer);
  const blob = new Blob([bytes], { type });
  const record = {
    id,
    name: String(file.name || `${kind}`).slice(0, 200),
    type,
    size: Math.max(0, Number(file.size) || bytes.byteLength || 0),
    kind,
    createdAt: Date.now(),
    blob,
    bytes: Array.from(bytes),
  };
  await withFileStore('readwrite', (store) => store.put(record));
  return { id, ref: `${FILE_PREFIX}${id}`, name: record.name, type: record.type, size: record.size };
}

export async function resolvePlayableUrl(value, sanitize) {
  const resolved = await resolveMediaUrl(value);
  if (!resolved) return null;
  return typeof sanitize === 'function' ? sanitize(resolved) : resolved;
}

export async function resolveMediaUrl(value) {
  const raw = unwrapMediaRef(value);
  if (!raw) return '';
  if (!raw.startsWith(FILE_PREFIX)) return raw;
  const id = raw.slice(FILE_PREFIX.length);
  if (blobUrls.has(id)) return blobUrls.get(id);
  const record = await withFileStore('readonly', (store) => store.get(id));
  let blob = record?.blob instanceof Blob ? record.blob : null;
  if (!blob && record?.bytes && typeof Blob === 'function') {
    blob = new Blob([Uint8Array.from(record.bytes)], { type: record.type || 'application/octet-stream' });
  }
  if (!blob || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return '';
  const url = URL.createObjectURL(blob);
  blobUrls.set(id, url);
  return url;
}

export async function upsertCourse({ id, title, description = '' } = {}) {
  if (!String(title || '').trim() && !id) throw new TypeError('Course title is required');
  const library = await loadLibrary();
  const courseId = id || makeId('course');
  ensureCourse(library, { id: courseId, title: String(title || '').trim() || undefined, description: String(description || '').trim() });
  await persistLibrary(library);
  return { id: courseId, title: library.courses[courseId].title };
}

export async function removeCourse(courseId) {
  const library = await loadLibrary();
  delete library.courses[courseId];
  await persistLibrary(library);
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
  const id = courseId || DEFAULT_COURSE_ID;
  const course = ensureCourse(library, { id, title: courseTitle });
  const topics = courseTopics(course);
  const topicId = makeId('topic');
  topics.push({
    title: topicTitle,
    url: topicId,
    videos: Array.isArray(videos) ? videos : [],
    pdfs: Array.isArray(pdfs) ? pdfs : [],
    iframes: Array.isArray(iframes) ? iframes : [],
  });
  await persistLibrary(library);
  return { courseId: id, topicId, title: topicTitle };
}

export async function addVideoFile(file, options = {}) {
  const stored = await putLibraryFile(file, { kind: 'video' });
  const title = String(options.title || stored.name.replace(/\.[^.]+$/, '') || 'Video').trim();
  return addTopic({
    courseId: options.courseId,
    courseTitle: options.courseTitle,
    title,
    videos: [{ url: stored.ref, label: stored.name }],
  });
}

export async function addPdfFile(file, options = {}) {
  const stored = await putLibraryFile(file, { kind: 'pdf' });
  const title = String(options.title || stored.name.replace(/\.[^.]+$/, '') || 'PDF').trim();
  return addTopic({
    courseId: options.courseId,
    courseTitle: options.courseTitle,
    title,
    pdfs: [{ url: stored.ref, label: stored.name }],
  });
}

export async function addRemoteLink({ url, title, kind = 'video', courseId, courseTitle } = {}) {
  const href = String(url || '').trim();
  if (!href) throw new TypeError('A URL is required');
  const label = String(title || href).trim();
  const media = [{ url: href, label }];
  return addTopic({
    courseId,
    courseTitle,
    title: label,
    videos: kind === 'pdf' ? [] : media,
    pdfs: kind === 'pdf' ? media : [],
    iframes: kind === 'embed' ? media : [],
  });
}

export function initUserLibrary(root = window) {
  const pd = root.OpenCourseDeck = root.OpenCourseDeck || {};
  pd.UserLibrary = {
    settingKey: LIBRARY_SETTING_KEY,
    filePrefix: FILE_PREFIX,
    unwrap: unwrapMediaRef,
    isLibraryFileRef,
    resolve: resolveMediaUrl,
    resolvePlayable: resolvePlayableUrl,
    load: loadLibrary,
    overlay: overlayFromStorage,
    upsertCourse,
    removeCourse,
    addTopic,
    addVideoFile,
    addPdfFile,
    addRemoteLink,
    putLibraryFile,
  };

  if (!overlayBound) {
    overlayBound = true;
    const bus = pd.bus;
    bus?.on?.('data:loaded', overlayFromStorage);
    bus?.on?.('data:degraded', overlayFromStorage);
    bus?.on?.('app:ready', overlayFromStorage);
  }

  if (root.DataStore?.isLoaded?.()) overlayFromStorage();
  return pd.UserLibrary;
}
