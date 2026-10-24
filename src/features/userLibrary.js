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
let libraryMutationQueue = Promise.resolve();

// Serialize the entire read-modify-write cycle. Individual IndexedDB settings
// puts are atomic, but two independent library readers can otherwise each
// overwrite the other one's course/topic additions.
function mutateLibrary(operation) {
  const run = libraryMutationQueue.catch(() => {}).then(() => {
    const perform = async () => operation(await loadLibrary());
    const locks = window.navigator?.locks;
    return typeof locks?.request === 'function'
      ? locks.request('opencoursedeck:user-library', { mode: 'exclusive' }, perform)
      : perform();
  });
  libraryMutationQueue = run.catch(() => {});
  return run;
}

function emptyLibrary() {
  return { version: 1, courses: {} };
}

function cloneValue(value) {
  if (value == null) return value;
  try { return structuredClone(value); }
  catch { return JSON.parse(JSON.stringify(value)); }
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
  return typeof crypto?.randomUUID === 'function'
    ? `${prefix}-${crypto.randomUUID().slice(0, 8)}`
    : `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function openFileDb() {
  if (typeof indexedDB === 'undefined' || indexedDB == null) return Promise.resolve(null);
  if (fileDb) return Promise.resolve(fileDb);
  if (fileDbPromise) return fileDbPromise;
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

async function withFileStore(mode, fn, { required = false } = {}) {
  const db = await openFileDb();
  if (!db) {
    if (required) throw new Error('Library file storage is unavailable; file data cannot be cleared.');
    return null;
  }
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
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('Library file transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('Library file transaction aborted'));
    try {
      const request = fn(tx.objectStore(FILE_STORE));
      if (request) {
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => reject(request.error || new Error('Library file request failed'));
      }
    } catch (error) {
      try { tx.abort(); } catch { /* transaction already finished */ }
      reject(error);
    }
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
  if (typeof window.DB?.getSetting !== 'function') {
    throw new Error('Unable to read the user library: persistent storage is unavailable');
  }
  let saved;
  try {
    saved = await window.DB?.getSetting?.(LIBRARY_SETTING_KEY);
  } catch (error) {
    // A read failure must not masquerade as an empty library: every mutator
    // loads and then persists, so an empty snapshot here would overwrite the
    // user's real data. Verified absence (below) is the only safe empty.
    throw new Error('Unable to read the user library from storage', { cause: error });
  }
  return cloneLibrary(saved);
}

async function persistLibrary(library, extra = {}) {
  if (typeof window.DB?.saveSetting !== 'function') {
    throw new Error('Unable to save the user library: persistent storage is unavailable');
  }
  const next = cloneLibrary(library);
  await window.DB.saveSetting(LIBRARY_SETTING_KEY, next);
  // The canonical mutation is durable now. View refresh failures must not
  // make the caller delete blobs which this committed metadata references.
  try {
    overlayLibrary(next);
  } catch (error) {
    console.warn('[UserLibrary] Refresh after committed save failed:', error);
  }
  try {
    window.OpenCourseDeck?.bus?.emit?.('library:changed', {
      courses: Object.keys(next.courses).length,
      ...extra,
    });
  } catch (error) {
    console.warn('[UserLibrary] Change notification failed after committed save:', error);
  }
  return next;
}

/**
 * Reset the auxiliary file database as part of an explicitly confirmed "all
 * local app data" reset. Do not claim success if the file store was unavailable.
 */
export async function clearLibraryFiles() {
  const result = await withFileStore('readwrite', (store) => store.clear(), { required: true });
  if (result === false) throw new Error('Library file deletion was not acknowledged');
  revokeAllCachedUrls();
  closeFileDb();
  return true;
}

export function overlayLibrary(library) {
  const store = window.DataStore;
  if (typeof store?.mergeRaw !== 'function') return;
  const source = library || emptyLibrary();
  store.mergeRaw(source.courses || {}, { userOwned: true });
}

async function overlayFromStorage() {
  try {
    overlayLibrary(await loadLibrary());
  } catch {
    // Best-effort refresh: a transient read failure leaves any previously
    // overlaid library in place and retries on a later storage event.
  }
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
    // Explicit destination IDs must come from an existing saved course.
    // Silently creating a replacement for a deleted course would attach
    // users' media to a phantom "Untitled course" after a stale menu choice.
    if (!library.courses[requestedId] && requestedId !== DEFAULT_COURSE_ID) {
      throw new Error('The selected course no longer exists. Choose another destination before importing.');
    }
    return { id: requestedId, course: ensureCourse(library, { id: requestedId }) };
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

/**
 * List imported-asset references without copying large Blob data. The source
 * identifier belongs to the course/topic and survives metadata-only backups.
 */
export async function listLibraryFileReferences(library = null) {
  const source = library || await loadLibrary();
  const references = new Map();
  for (const [courseId, course] of Object.entries(source.courses || {})) {
    for (const section of course.sources || []) {
      for (const topic of section.topics || []) {
        for (const [field, kind] of [['videos', 'video'], ['pdfs', 'pdf'], ['iframes', 'embed']]) {
          for (const media of topic[field] || []) {
            const ref = unwrapMediaRef(media);
            if (!ref.startsWith(FILE_PREFIX)) continue;
            if (!references.has(ref)) {
              references.set(ref, {
                id: ref.slice(FILE_PREFIX.length),
                ref,
                kind,
                courseId,
                courseTitle: course.title || courseId,
                topicTitle: topic.title || 'Untitled topic',
                label: media?.label || topic.title || 'Local file',
              });
            }
          }
        }
      }
    }
  }
  return [...references.values()];
}

/** Missing bytes are not treated as a missing course or a new source ID. */
export async function listMissingLibraryFiles() {
  const references = await listLibraryFileReferences();
  if (!references.length) return [];
  const keys = await withFileStore('readonly', store => store.getAllKeys(), { required: true });
  const available = new Set(keys || []);
  return references.filter(item => !available.has(item.id));
}

/**
 * Reattach a user-chosen file to an existing source ID without changing notes,
 * annotations, course membership, progress or bookmark references.
 */
export async function relinkLibraryFile(reference, file) {
  const ref = unwrapMediaRef(reference);
  const existing = (await listLibraryFileReferences()).find(item => item.ref === ref);
  if (!existing) throw new Error('This file reference is no longer in your library');
  if (!file) throw new TypeError('Choose a replacement file');
  const size = Math.max(0, Number(file.size) || 0);
  if (size > MAX_LIBRARY_FILE_BYTES) throw new Error('Replacement file exceeds the local library size limit');
  const name = String(file.name || existing.label).slice(0, 200);
  const type = String(file.type || (existing.kind === 'pdf' ? 'application/pdf' : 'application/octet-stream'));
  if (existing.kind === 'pdf' && !/\.pdf$/i.test(name) && type !== 'application/pdf') {
    throw new TypeError('Choose a PDF to relink this PDF source');
  }
  if (existing.kind === 'video' && !/\.(mp4|webm|ogg|ogv|mov|m4v|avi|mkv)$/i.test(name)
      && !type.startsWith('video/')) {
    throw new TypeError('Choose a video to relink this video source');
  }
  const blob = file instanceof Blob ? file : new Blob([file], { type });
  const record = {
    id: existing.id, name, type, size: size || blob.size || 0,
    kind: existing.kind, createdAt: Date.now(), blob,
  };
  if (record.size && record.size <= BYTES_FALLBACK_MAX) {
    record.bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
  }
  await withFileStore('readwrite', store => store.put(record), { required: true });
  // Revoke only after a committed replacement so the old viewer remains usable
  // on failed writes.
  revokeCachedUrl(existing.id);
  window.OpenCourseDeck?.bus?.emit?.('library:file-relinked', { ref, courseId: existing.courseId });
  return { ref, id: existing.id, courseId: existing.courseId, name };
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
    if (typeof indexedDB === 'undefined') {
      throw new Error('Local file storage is unavailable. Enable browser storage before importing files.');
    }
    const db = await openFileDb();
    if (!db) throw new Error('Local file storage is unavailable. The file was not imported.');
    await withFileStore('readwrite', (store) => store.put(record));
  } catch (error) {
    if (error?.name === 'QuotaExceededError') {
      throw new Error('Not enough storage for this file. Free space or try a smaller file.', { cause: error });
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
  return mutateLibrary(async (library) => {
    const courseId = id || makeId('course');
    ensureCourse(library, {
      id: courseId,
      title: String(title || '').trim() || undefined,
      description: String(description || '').trim(),
      overwriteTitle: Boolean(String(title || '').trim()),
    });
    await persistLibrary(library, { courseId });
    return { id: courseId, title: library.courses[courseId].title };
  });
}

/**
 * Promote outlines from the old independent My Courses setting, but ONLY when
 * no canonical user library has ever been stored. The caller must establish
 * that the canonical setting is absent, not merely empty: an empty canonical
 * library can mean that the user intentionally deleted their last course.
 * The entire batch commits in one settings write, avoiding partial migration.
 */
export async function migrateLegacyCourses(records) {
  if (!Array.isArray(records)) throw new TypeError('Legacy courses must be an array');
  return mutateLibrary(async library => {
    if (Object.keys(library.courses).length) {
      return { migrated: 0, courses: Object.keys(library.courses).length };
    }
    let migrated = 0;
    for (const record of records) {
      if (!record || typeof record !== 'object') continue;
      const id = String(record.id || '').trim();
      const title = String(record.title || '').trim().slice(0, 120);
      // Avoid reserved prototype properties and malformed course identifiers.
      if (!/^[a-z0-9_-]{1,160}$/i.test(id) || !title || id === DEFAULT_COURSE_ID) continue;
      const course = ensureCourse(library, {
        id, title,
        description: String(record.description || '').trim().slice(0, 600),
        overwriteTitle: true,
      });
      if (Number.isFinite(record.createdAt)) course.createdAt = record.createdAt;
      if (Number.isFinite(record.updatedAt)) course.updatedAt = record.updatedAt;
      migrated += 1;
    }
    if (migrated) await persistLibrary(library, { migratedLegacyCourses: migrated });
    return { migrated, courses: Object.keys(library.courses).length };
  });
}

export async function updateCourse({ id, title, description } = {}) {
  const courseId = String(id || '').trim();
  if (!courseId || courseId === DEFAULT_COURSE_ID) throw new TypeError('A personal course ID is required');
  const nextTitle = String(title ?? '').trim();
  if (!nextTitle) throw new TypeError('Course title is required');
  return mutateLibrary(async library => {
    const course = library.courses[courseId];
    if (!course || typeof course !== 'object') throw new Error('Course does not exist');
    course.title = nextTitle.slice(0, 120);
    if (description !== undefined) course.description = String(description || '').trim().slice(0, 600);
    course.updatedAt = Date.now();
    await persistLibrary(library, { courseId });
    return { id: courseId, title: course.title, description: course.description };
  });
}

/** Change only a topic title; its saved URL/source identity remains unchanged. */
export async function renameTopic({ courseId, topicId, title } = {}) {
  const label = String(title || '').trim();
  if (!label) throw new TypeError('Topic title is required');
  return mutateLibrary(async library => {
    const course = library.courses[String(courseId || '')];
    if (!course) throw new Error('Source course does not exist');
    const topic = (course.sources || []).flatMap(source => source.topics || [])
      .find(item => String(item.url || item.id) === String(topicId));
    if (!topic) throw new Error('Topic was not found in the source course');
    topic.title = label.slice(0, 200);
    course.updatedAt = Date.now();
    await persistLibrary(library, { courseId, topicId });
    return { courseId, topicId, title: topic.title };
  });
}

/**
 * Move a topic within one canonical library transaction. Keep its topic URL
 * and all media refs intact; no copied topic or orphaned attachments.
 */
export async function moveTopic({ topicId, fromCourseId, toCourseId } = {}) {
  const fromId = String(fromCourseId || '');
  const toId = String(toCourseId || '');
  const id = String(topicId || '');
  if (!fromId || !toId || !id) throw new TypeError('Both courses and a topic are required');
  return mutateLibrary(async library => {
    const from = library.courses[fromId];
    const to = library.courses[toId];
    if (!from || typeof from !== 'object') throw new Error('Source course does not exist');
    if (!to || typeof to !== 'object') throw new Error('Destination course does not exist');
    let origin = null;
    let index = -1;
    for (const section of from.sources || []) {
      const topics = section?.topics || [];
      index = topics.findIndex(topic => String(topic.url || topic.id) === id);
      if (index !== -1) { origin = topics; break; }
    }
    if (!origin) throw new Error('Topic was not found in the source course');
    if (fromId === toId) return { topicId: id, courseId: toId };
    const duplicate = (to.sources || []).some(section =>
      (section.topics || []).some(topic => String(topic.url || topic.id) === id));
    if (duplicate) throw new Error('Destination already contains this topic');

    const db = window.DB;
    const progress = typeof db?.getProgress === 'function'
      ? await db.getProgress(id) : null;
    if (progress && progress.courseId && progress.courseId !== fromId && progress.courseId !== toId) {
      throw new Error('Progress belongs to a different course; review this topic before moving');
    }
    if (progress?.courseId === fromId && typeof db?.saveProgress !== 'function') {
      throw new Error('Progress migration is unavailable; topic was not moved');
    }

    const before = cloneLibrary(library);
    const [record] = origin.splice(index, 1);
    courseTopics(to).push(record);
    from.updatedAt = Date.now();
    to.updatedAt = Date.now();
    await persistLibrary(library, { topicId: id, fromCourseId: fromId, courseId: toId });
    if (progress?.courseId === fromId) {
      try {
        const receipt = await db.saveProgress(id, toId, {
          ...progress, courseId: toId, updatedAt: Date.now(),
        });
        if (receipt === false) throw new Error('Progress migration was not acknowledged');
      } catch (error) {
        // The two stores cannot be committed in a single transaction. Restore
        // the original course mapping if the linked progress write rejects,
        // and report incomplete compensation rather than false success.
        try {
          await persistLibrary(before, { topicId: id, courseId: fromId, rollback: true });
        } catch (rollbackError) {
          throw new AggregateError([error, rollbackError],
            'Topic move failed and could not restore the original course mapping',
            { cause: error });
        }
        throw error;
      }
    }
    return { topicId: id, courseId: toId };
  });
}

export async function removeCourse(courseId) {
  return mutateLibrary(async (library) => {
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
  });
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
  return mutateLibrary(async (library) => {
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
  });
}

export async function addMediaFiles(files, { kind = 'video', courseId, courseTitle, title } = {}) {
  const list = [...(files || [])].filter(Boolean);
  if (!list.length) return [];
  const type = kind === 'pdf' ? 'pdf' : 'video';
  const staged = [];
  try {
    // File I/O happens before holding the shared library-metadata lock.
    for (const file of list) staged.push({ file, stored: await putLibraryFile(file, { kind: type }) });
    return await mutateLibrary(async (library) => {
      const resolved = resolveOrCreateCourse(library, { courseId, courseTitle });
      const topics = courseTopics(resolved.course);
      const sharedTitle = list.length === 1 ? String(title || '').trim() : '';
      const results = [];
      for (const { file, stored } of staged) {
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
    });
  } catch (error) {
    // Never leave orphaned blobs when the metadata commit fails.
    await Promise.allSettled(staged.map(({ stored }) => deleteLibraryFile(stored.id)));
    throw error;
  }
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
    updateCourse,
    migrateLegacyCourses,
    removeCourse,
    addTopic,
    renameTopic,
    moveTopic,
    addVideoFile,
    addPdfFile,
    addMediaFiles,
    addRemoteLink,
    putLibraryFile,
    listFileReferences: listLibraryFileReferences,
    listMissingFiles: listMissingLibraryFiles,
    relinkFile: relinkLibraryFile,
    clearLibraryFiles,
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
