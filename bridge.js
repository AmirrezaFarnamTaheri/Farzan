// ============================================================
// OpenCourseDeck — bridge.js
// Shared globals: window.DataStore, window.DB (progress/stats/catalog).
// ============================================================

(() => {
  'use strict';

  // Ensure namespace
  window.OpenCourseDeck = window.OpenCourseDeck ?? {};

  // ───────────────────────────────────────────────────────────
  // DataStore (course/topic catalog) — loads local JSON on demand
  // ───────────────────────────────────────────────────────────
  const DataStore = (() => {
    const STATE = {
      loaded: false,
      loading: null,
      courses: [],
      topics: [],
      raw: null,
      status: 'idle',
      lastError: null,
      lastSuccessfulAt: null,
    };

    const DEMO_FALLBACK = {
      "demo-course": {
        "title": "Welcome to OpenCourseDeck (Demo)",
        "sources": [
          {
            "label": "Getting Started",
            "topics": [
              {
                "title": "OpenCourseDeck Tour",
                "url": "demo-tour",
                "videos": [{ "url": "./assets/welcome.mp4", "label": "Welcome Video" }]
              }
            ]
          }
        ]
      }
    };

    let _activeCatalogPath = null;
    let _catalogRaw = null;
    let _overlayRaw = {};

    function catalogPath() {
      return _activeCatalogPath;
    }

    function _recompose() {
      const catalog = (_catalogRaw && typeof _catalogRaw === 'object' && !Array.isArray(_catalogRaw))
        ? _catalogRaw
        : {};
      const overlay = (_overlayRaw && typeof _overlayRaw === 'object' && !Array.isArray(_overlayRaw))
        ? _overlayRaw
        : {};
      STATE.raw = { ...catalog, ...overlay };
      const norm = _normalize(STATE.raw);
      STATE.courses = norm.courses;
      STATE.topics = norm.topics;
    }

    function mergeRaw(coursesMap, { userOwned = false } = {}) {
      const incoming = (coursesMap && typeof coursesMap === 'object' && !Array.isArray(coursesMap))
        ? coursesMap
        : {};
      if (userOwned) {
        _overlayRaw = { ...incoming };
      } else {
        _catalogRaw = { ...(_catalogRaw && typeof _catalogRaw === 'object' ? _catalogRaw : {}), ...incoming };
      }
      _recompose();
      STATE.loaded = true;
      return {
        courses: STATE.courses.length,
        topics: STATE.topics.length,
        userOwned: Boolean(userOwned),
      };
    }

    function _normalize(raw) {
      const courses = [];
      const topics = [];

      if (!raw || typeof raw !== 'object') return { courses, topics };

      const processTopic = (topic, topicIdx, courseId, courseTitle, srcIdx, src) => {
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
          videos: Array.isArray(topic?.videos) ? topic.videos : [],
          pdfs: Array.isArray(topic?.pdfs) ? topic.pdfs : [],
          iframes: Array.isArray(topic?.iframes) ? topic.iframes : [],
          raw: Array.isArray(topic?.raw) ? topic.raw : [],
          error: topic?.error,
          catalogIssue,
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

        // 1. Process sources -> topics
        const sources = Array.isArray(course?.sources) ? course.sources : [];
        sources.forEach((src, srcIdx) => {
          const t = Array.isArray(src?.topics) ? src.topics : [];
          t.forEach((topic, tIdx) => processTopic(topic, tIdx, courseId, courseTitle, srcIdx, src));
        });

        // 2. Process direct topics (if any)
        if (Array.isArray(course?.topics)) {
          course.topics.forEach((topic, tIdx) => processTopic(topic, tIdx, courseId, courseTitle, -1, { label: 'Direct Topics' }));
        }
      }

      return { courses, topics };
    }


    // Optional edition catalogs are loaded through the same canonical DataStore
    // as ordinary courses. The compressed bytes remain static, offline-cacheable
    // content; no script evaluation, iframe or third-party network call is needed.
    async function _loadGzipCatalog(spec) {
      if (!spec || typeof spec !== 'object'
        || typeof spec.path !== 'string'
        || !/^data\/[A-Za-z0-9][A-Za-z0-9._-]*\.json\.gz$/.test(spec.path)
        || spec.compression !== 'gzip'
        || (spec.sha256 && !/^[a-f0-9]{64}$/i.test(spec.sha256))) {
        throw new Error('Invalid additional catalog manifest');
      }
      if (typeof DecompressionStream !== 'function') {
        throw new Error('This browser does not support gzip catalog decoding');
      }
      const url = `./${spec.path}`;
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`Catalog archive HTTP ${response.status}: ${url}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
        throw new Error('Catalog archive is not gzip data');
      }
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      const original = await new Response(stream).arrayBuffer();
      if (spec.sha256) {
        if (!window.crypto?.subtle?.digest) {
          throw new Error('Verified catalogs require browser SHA-256 support');
        }
        const digest = await window.crypto.subtle.digest('SHA-256', original);
        const actual = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
        if (actual.toLowerCase() !== spec.sha256.toLowerCase()) {
          throw new Error('Catalog archive integrity check failed');
        }
      }
      const decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(original));
      if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
        throw new Error('Catalog archive has an invalid root');
      }
      for (const [courseId, course] of Object.entries(decoded)) {
        if (!courseId || !course || typeof course !== 'object'
          || !Array.isArray(course.sources)) {
          throw new Error(`Catalog archive contains invalid course: ${courseId}`);
        }
      }
      return decoded;
    }

    async function _loadAdditionalCatalogs(pointer, base) {
      const editions = pointer?.additionalCatalogs;
      if (editions == null) return base;
      if (!Array.isArray(editions) || editions.length > 8) {
        throw new Error('Invalid additional catalog list');
      }
      const result = { ...base };
      const seenTopicIds = new Set();
      const indexTopics = (catalog) => {
        for (const course of Object.values(catalog)) {
          for (const source of course?.sources || []) {
            for (const topic of source?.topics || []) {
              if (!topic || typeof topic !== 'object') throw new Error('Invalid catalog topic');
              const id = String(topic.url || '');
              if (id) {
                if (seenTopicIds.has(id)) throw new Error(`Duplicate catalog topic URL: ${id}`);
                seenTopicIds.add(id);
              }
            }
          }
        }
      };
      indexTopics(result);
      for (const spec of editions) {
        const additional = await _loadGzipCatalog(spec);
        for (const [courseId, course] of Object.entries(additional)) {
          if (Object.prototype.hasOwnProperty.call(result, courseId)) {
            throw new Error(`Duplicate course ID across catalogs: ${courseId}`);
          }
          result[courseId] = course;
        }
        indexTopics(additional);
      }
      return result;
    }

    async function init({ path = './data/catalog.json', force = false } = {}) {
      if (STATE.loaded && !force) return true;
      if (STATE.loading) return STATE.loading;

      STATE.loading = (async () => {
        const previous = {
          raw: STATE.raw,
          courses: STATE.courses,
          topics: STATE.topics,
          path: _activeCatalogPath,
          catalogRaw: _catalogRaw,
          overlayRaw: _overlayRaw,
          authoritative: STATE.status === 'authoritative',
        };
        STATE.status = 'loading';
        const fetchWithRetry = async (url, retries = 2) => {
          for (let i = 0; i <= retries; i++) {
            try {
              const res = await fetch(url, { cache: 'no-cache' });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              return await res.json();
            } catch (err) {
              if (i === retries) throw err;
              console.warn(`[DataStore] Fetch failed for ${url}, retry ${i + 1}/${retries}...`);
              await new Promise(r => setTimeout(r, 1000 * (i + 1)));
            }
          }
          throw new Error(`Catalog fetch failed for ${url}`);
        };

        const updateStatus = (msg, isError = false) => {
          const el = document.getElementById('splash-status');
          if (el) {
            el.textContent = msg;
            if (isError) el.style.color = '#ef4444';
          }
        };

        try {
          updateStatus('Loading catalog pointer...');
          const pointer = await fetchWithRetry(path);
          const targetCatalog = pointer.currentCatalog || 'data/opencoursedeck-starter.json';
          const resolvedPath = targetCatalog.startsWith('./') ? targetCatalog : `./${targetCatalog}`;
          updateStatus('Loading catalog content...');
          const raw = await fetchWithRetry(resolvedPath);
          // An edition archive is an addition to the baseline catalog, not a
          // replacement. Failure must never discard the existing starter course
          // or claim the partial catalog is authoritative.
          let combined = raw;
          let archiveError = null;
          try {
            combined = await _loadAdditionalCatalogs(pointer, raw);
          } catch (error) {
            archiveError = error;
            console.warn('[DataStore] Additional catalog unavailable:', error);
            updateStatus('Additional course archive unavailable. Showing base courses.', true);
          }
          _catalogRaw = combined;
          _recompose();
          STATE.loaded = true;
          STATE.status = archiveError ? 'degraded' : 'authoritative';
          STATE.lastError = archiveError
            ? { name: archiveError?.name || 'Error', message: archiveError?.message || String(archiveError), at: Date.now() }
            : null;
          if (!archiveError) STATE.lastSuccessfulAt = Date.now();
          _activeCatalogPath = resolvedPath;
          window.OpenCourseDeck?.bus?.emit?.(archiveError ? 'data:degraded' : 'data:loaded', {
            courses: STATE.courses.length,
            topics: STATE.topics.length,
            status: STATE.status,
            source: _activeCatalogPath,
            ...(archiveError ? { recovery: 'retry', error: STATE.lastError } : {}),
          });
          return true;
        } catch (err) {
          console.warn('[DataStore] Failed to load catalog JSON:', err);
          STATE.lastError = { name: err?.name || 'Error', message: err?.message || String(err), at: Date.now() };
          const usingLastKnownGood = Boolean(previous.authoritative && previous.catalogRaw);
          _catalogRaw = usingLastKnownGood ? previous.catalogRaw : DEMO_FALLBACK;
          if (previous.overlayRaw && typeof previous.overlayRaw === 'object') {
            _overlayRaw = previous.overlayRaw;
          }
          _recompose();
          STATE.loaded = true;
          STATE.status = 'degraded';
          _activeCatalogPath = usingLastKnownGood ? previous.path : 'demo-fallback';
          updateStatus(usingLastKnownGood
            ? 'Catalog refresh failed. Using last known good catalog.'
            : 'Catalog load failed. Using offline demo.', true);
          window.OpenCourseDeck?.bus?.emit?.('data:degraded', {
            source: _activeCatalogPath,
            recovery: 'retry',
            usingLastKnownGood,
            error: STATE.lastError,
          });
          return true;
        } finally {
          STATE.loading = null;
        }
      })();

      return STATE.loading;
    }

    function retry(options = {}) {
      return init({ ...options, force: true });
    }

    function getState() {
      return Object.freeze({
        loaded: STATE.loaded,
        status: STATE.status,
        source: _activeCatalogPath,
        lastError: STATE.lastError ? { ...STATE.lastError } : null,
        lastSuccessfulAt: STATE.lastSuccessfulAt,
        courses: STATE.courses.length,
        topics: STATE.topics.length,
      });
    }

    function allCourses() { return STATE.courses.slice(); }
    function allTopics() { return STATE.topics.slice(); }
    function isLoaded() { return STATE.loaded; }

    return { init, retry, getState, isLoaded, allCourses, allTopics, catalogPath, mergeRaw };
  })();

  window.DataStore = window.DataStore ?? DataStore;
  window.OpenCourseDeck.DataStore = window.OpenCourseDeck.DataStore ?? DataStore;

  // ───────────────────────────────────────────────────────────
  // DB — IndexedDB is the sole source of canonical progress, notes and study records.
  // ───────────────────────────────────────────────────────────
  const DB = (() => {
    const IDB_NAME = 'opencoursedeck';
    const IDB_VERSION = 4;

    let _idb = null;
    let _idbCtor = null;
    // Serialize read-modify-write updates of the same topic in this runtime.
    // A lost race could overwrite a resume position with a bookmark update.
    const _pendingProgressWrites = new Map();
    let _sync = null;
    const _sourceId = `pd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    function _getIdb() {
      // Subscribe on ANY database access, not just writes: the channel used
      // to be created lazily inside _broadcast(), so a tab that had only
      // read data never attached an onmessage handler and silently showed
      // stale content (then clobbered the other tab's edits on its first
      // write). Every read path goes through here.
      _ensureSyncChannel();
      const OpenCourseDB = window.OpenCourseDeck?.DB?.OpenCourseDB;
      if (typeof OpenCourseDB !== 'function') return null;
      if (_idb && _idbCtor === OpenCourseDB) return _idb;
      _idbCtor = OpenCourseDB;
      _idb = new OpenCourseDB(IDB_NAME, IDB_VERSION, [
        { name: 'progress', key: 'id', autoIncrement: false, recreateOnUpgrade: true, indexes: [{ field: 'topicId' }, { field: 'courseId' }, { field: 'updatedAt' }] },
        { name: 'timestamps', key: 'id', autoIncrement: false, indexes: [{ field: 'topicId' }, { field: 'courseId' }] },
        { name: 'notes', key: 'id', autoIncrement: false, indexes: [{ field: 'topicId' }, { field: 'courseId' }, { field: 'updatedAt' }] },
        { name: 'folders', key: 'id', autoIncrement: false, indexes: [{ field: 'parentId' }] },
        { name: 'settings', key: 'key', autoIncrement: false },
        { name: 'annotations', key: 'id', autoIncrement: false, indexes: [{ field: 'docId' }, { field: 'page' }] },
        { name: 'watchedSegments', key: 'id', autoIncrement: false, indexes: [{ field: 'topicId' }, { field: 'courseId' }] },
        { name: 'pdfBookmarks', key: 'id', autoIncrement: false, indexes: [{ field: 'docId' }, { field: 'topicId' }] },
      ]);
      return _idb;
    }

    function _emit(name, payload) {
      window.OpenCourseDeck?.bus?.emit?.(name, payload);
    }

    function _errorInfo(error) {
      return {
        name: error?.name || 'Error',
        message: error?.message || String(error || ''),
        quota: error?.name === 'QuotaExceededError',
      };
    }

    function _signalSaveError(kind, backend, error, extra = {}) {
      _emit('storage:save-error', {
        kind,
        backend,
        error: _errorInfo(error),
        ...extra,
      });
    }

    // IndexedDB is the canonical store from first launch. An unreadable
    // canonical record is never equivalent to missing or empty data.
    function _canonicalReadFailed(kind, error) {
      try {
        _emit('storage:read-error', {
          kind, backend: 'indexedDB', canonical: true, error: _errorInfo(error),
        });
      } catch { /* observers must not mask a failed authoritative read */ }
      throw error;
    }

    // Never treat unavailable canonical storage as an empty record or quietly
    // create a second source of truth in localStorage.
    function _requireIdb(kind, writing = false) {
      const idb = _getIdb();
      if (idb) return idb;
      const error = new Error('Canonical IndexedDB storage unavailable');
      if (writing) {
        _signalSaveError(kind, 'indexedDB', error, { canonical: true });
        throw error;
      }
      return _canonicalReadFailed(kind, error);
    }

    // Issue 10: close BroadcastChannel on page unload
    function _ensureSyncChannel() {
      try {
        if (!_sync && typeof window.BroadcastChannel === 'function') {
          _sync = new window.BroadcastChannel('opencoursedeck_sync');
          _sync.onmessage = (event) => {
            const message = event?.data;
            if (!message || message.source === _sourceId) return;
            _emit('sync:message', message);
            _emit(`${message.kind}:${message.action}`, message);
          };
          if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', () => { try { _sync?.close?.(); } catch {} });
          }
        }
      } catch {
        // BroadcastChannel is optional.
      }
      return _sync;
    }
    function _broadcast(kind, action, record) {
      const payload = { kind, action, record, source: _sourceId, timestamp: Date.now() };
      try {
        _ensureSyncChannel()?.postMessage?.(payload);
      } catch {
        // BroadcastChannel is optional.
      }
      _emit('sync:local-change', payload);
    }



    function _progressRecordId(topicId, courseId) {
      const normalizedTopicId = String(topicId ?? '').trim();
      const normalizedCourseId = String(courseId ?? '').trim();
      if (!normalizedTopicId || !normalizedCourseId) {
        throw new TypeError('Course-scoped progress requires both topicId and courseId');
      }
      return JSON.stringify([normalizedCourseId, normalizedTopicId]);
    }

    function _publicProgress(record) {
      if (!record || typeof record !== 'object') return record ?? null;
      const { id: _storageId, ...progress } = record;
      return progress;
    }

    async function getProgress(topicId, courseId) {
      const id = _progressRecordId(topicId, courseId);
      const idb = _requireIdb('getProgress');
      try { return _publicProgress(await idb.get('progress', id)); }
      catch (error) { _canonicalReadFailed('getProgress', error); }
    }

    async function getAllProgress() {
      const idb = _requireIdb('getAllProgress');
      try {
        const records = await idb.getAll('progress');
        if (!Array.isArray(records)) throw new TypeError('Invalid canonical progress collection');
        return records.map(_publicProgress);
      } catch (error) { _canonicalReadFailed('getAllProgress', error); }
    }

    async function _saveProgressNow(topicId, courseId, patch = {}) {
      const id = _progressRecordId(topicId, courseId);
      const normalizedTopicId = String(topicId).trim();
      const normalizedCourseId = String(courseId).trim();
      const idb = _requireIdb('progress', true);
      const prev = (await getProgress(normalizedTopicId, normalizedCourseId))
        ?? { topicId: normalizedTopicId, courseId: normalizedCourseId };
      const next = {
        ...prev, ...patch,
        id,
        topicId: normalizedTopicId,
        courseId: normalizedCourseId,
        updatedAt: patch.updatedAt ?? Date.now(),
      };
      try {
        await idb.put('progress', next);
        const publicRecord = _publicProgress(next);
        window.OpenCourseDeck?.bus?.emit?.('progress:save', {
          topicId: normalizedTopicId, courseId: normalizedCourseId, progress: publicRecord,
        });
        _broadcast('progress', 'save', publicRecord);
        return publicRecord;
      } catch (error) {
        _signalSaveError('progress', 'indexedDB', error, { canonical: true });
        throw error;
      }
    }

    function saveProgress(topicId, courseId, patch = {}) {
      const id = _progressRecordId(topicId, courseId);
      const previous = _pendingProgressWrites.get(id) || Promise.resolve();
      const operation = previous.catch(() => {}).then(() => {
        // Web Locks serialize cooperating tabs by the full course/topic identity.
        const locks = window.navigator?.locks;
        if (typeof locks?.request === 'function') {
          return locks.request(`opencoursedeck:progress:${id}`, { mode: 'exclusive' },
            () => _saveProgressNow(topicId, courseId, patch));
        }
        return _saveProgressNow(topicId, courseId, patch);
      });
      _pendingProgressWrites.set(id, operation);
      operation.finally(() => {
        if (_pendingProgressWrites.get(id) === operation) _pendingProgressWrites.delete(id);
      }).catch(() => {});
      return operation;
    }

    function deleteProgress(topicId, courseId) {
      const id = _progressRecordId(topicId, courseId);
      const previous = _pendingProgressWrites.get(id) || Promise.resolve();
      const operation = previous.catch(() => {}).then(() => {
        const remove = async () => {
          const idb = _requireIdb('progress-delete', true);
          try {
            await idb.delete('progress', id);
            _broadcast('progress', 'delete', {
              topicId: String(topicId).trim(), courseId: String(courseId).trim(),
            });
            return true;
          } catch (error) {
            _signalSaveError('progress-delete', 'indexedDB', error, { canonical: true });
            throw error;
          }
        };
        const locks = window.navigator?.locks;
        return typeof locks?.request === 'function'
          ? locks.request(`opencoursedeck:progress:${id}`, { mode: 'exclusive' }, remove)
          : remove();
      });
      _pendingProgressWrites.set(id, operation);
      operation.finally(() => {
        if (_pendingProgressWrites.get(id) === operation) _pendingProgressWrites.delete(id);
      }).catch(() => {});
      return operation;
    }

    async function getAllTimestamps() {
      const idb = _requireIdb('getAllTimestamps');
      try { return (await idb.getAll('timestamps')) ?? []; }
      catch (error) { _canonicalReadFailed('getAllTimestamps', error); }
    }

    function _timestampIdentity(value) {
      const topicId = String(value?.topicId ?? '').trim();
      const courseId = String(value?.courseId ?? '').trim();
      if (!topicId || !courseId) {
        throw new TypeError('Saved timestamps require exact course and topic identity');
      }
      return { topicId, courseId };
    }

    async function saveTimestamp(ts) {
      const identity = _timestampIdentity(ts);
      const next = { ...ts, ...identity, id: ts?.id ?? `ts-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
      const idb = _requireIdb('timestamp', true);
      try {
        await idb.put('timestamps', next);
        _broadcast('timestamp', 'save', next);
        return true;
      } catch (error) {
        _signalSaveError('timestamp', 'indexedDB', error, { canonical: true });
        throw error;
      }
    }

    // Bookmarks edits/deletions may race another tab or restored backup.
    // Only broadcast a confirmed native atomic receipt; do not fall back
    // to the legacy unconditional timestamp writer or localStorage.
    async function compareAndSwapTimestamp(id, expected, next) {
      if (expected != null) {
        const identity = _timestampIdentity(expected);
        if (String(expected.id) !== String(id)) throw new TypeError('Timestamp identity changed during edit');
        if (next != null) {
          const nextIdentity = _timestampIdentity(next);
          if (String(next.id) !== String(id)
            || nextIdentity.courseId !== identity.courseId
            || nextIdentity.topicId !== identity.topicId) {
            throw new TypeError('Timestamp edits cannot change their course/topic source');
          }
        }
      } else if (next != null) {
        _timestampIdentity(next);
        if (String(next.id) !== String(id)) throw new TypeError('Timestamp ID does not match its compare-and-swap key');
      }
      const idb = _getIdb();
      if (!idb || typeof idb.compareAndSwapTimestamp !== 'function') {
        throw new Error('Atomic canonical timestamp storage unavailable');
      }
      try {
        const accepted = await idb.compareAndSwapTimestamp(id, expected, next);
        if (accepted === true) {
          _broadcast('timestamp', next === null ? 'delete' : 'save',
            next === null ? { id } : next);
        }
        return accepted === true;
      } catch (error) {
        _signalSaveError('timestamp-cas', 'indexedDB', error, { canonical: true });
        throw error;
      }
    }

    async function deleteTimestamp(id) {
      const idb = _requireIdb('timestamp-delete', true);
      try { await idb.delete('timestamps', id); }
      catch (error) {
        _signalSaveError('timestamp-delete', 'indexedDB', error, { canonical: true });
        throw error;
      }
      _broadcast('timestamp', 'delete', { id });
      return true;
    }

    async function getAllNotes() {
      const idb = _requireIdb('getAllNotes');
      try { return (await idb.getAll('notes')) ?? []; }
      catch (error) { _canonicalReadFailed('getAllNotes', error); }
    }

    async function saveNote(note) {
      const id = note?.id ?? `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const next = { ...(note ?? {}), id, updatedAt: note?.updatedAt ?? Date.now() };
      const idb = _requireIdb('note', true);
      try {
        await idb.put('notes', next);
        _broadcast('note', 'save', next);
        return next;
      } catch (error) {
        _signalSaveError('note', 'indexedDB', error, { canonical: true });
        throw error;
      }
    }

    async function deleteNote(id) {
      const idb = _requireIdb('note-delete', true);
      try { await idb.delete('notes', id); }
      catch (error) {
        _signalSaveError('note-delete', 'indexedDB', error, { canonical: true });
        throw error;
      }
      _broadcast('note', 'delete', { id });
    }

    async function getAllFolders() {
      const idb = _requireIdb('getAllFolders');
      try { return (await idb.getAll('folders')) ?? []; }
      catch (error) { _canonicalReadFailed('getAllFolders', error); }
    }

    async function saveFolder(folder) {
      const id = folder?.id ?? `folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const next = { ...(folder ?? {}), id, updatedAt: folder?.updatedAt ?? Date.now() };
      const idb = _requireIdb('folder', true);
      try {
        await idb.put('folders', next);
        _broadcast('folder', 'save', next);
        return next;
      } catch (error) {
        _signalSaveError('folder', 'indexedDB', error, { canonical: true });
        throw error;
      }
    }

    async function deleteFolder(id) {
      const idb = _requireIdb('folder-delete', true);
      try { await idb.delete('folders', id); }
      catch (error) {
        _signalSaveError('folder-delete', 'indexedDB', error, { canonical: true });
        throw error;
      }
      _broadcast('folder', 'delete', { id });
    }

    // Atomic settings writes must use the canonical native transaction; never
    // downgrade this operation to localStorage or an unlocked read/write pair.
    async function compareAndSwapSetting(key, expected, next) {
      const idb = _getIdb();
      if (!idb || typeof idb.compareAndSwapSetting !== 'function') {
        throw new Error('Atomic canonical settings storage unavailable');
      }
      try {
        const accepted = await idb.compareAndSwapSetting(key, expected, next);
        if (accepted) _broadcast('setting', 'save', { key, value: next });
        return accepted;
      } catch (error) {
        _signalSaveError('setting-cas', 'indexedDB', error, { canonical: true });
        throw error;
      }
    }

    async function getSetting(key) {
      const idb = _requireIdb('getSetting');
      try { return (await idb.get('settings', key))?.value ?? null; }
      catch (error) { _canonicalReadFailed('getSetting', error); }
    }

    async function saveSetting(key, value) {
      const idb = _requireIdb('setting', true);
      try {
        await idb.put('settings', { key, value });
        _broadcast('setting', 'save', { key, value });
        return value;
      } catch (error) {
        _signalSaveError('setting', 'indexedDB', error, { canonical: true });
        throw error;
      }
    }

    async function getAllAnnotations() {
      const idb = _requireIdb('getAllAnnotations');
      try { return (await idb.getAll('annotations')) ?? []; }
      catch (error) { _canonicalReadFailed('getAllAnnotations', error); }
    }

    async function getAnnotations(docId) {
      const idb = _requireIdb('getAnnotations');
      try {
        if (typeof idb.getAllByIndex === 'function') {
          return await idb.getAllByIndex('annotations', 'docId', docId) ?? [];
        }
        const all = await idb.getAll('annotations') ?? [];
        return all.filter(annotation => annotation.docId === docId);
      } catch (error) { _canonicalReadFailed('getAnnotations', error); }
    }

    async function saveAnnotations(docId, pagesObj) {
      const idb = _requireIdb('annotation', true);
      const records = [];
      for (const [pageStr, annotations] of Object.entries(pagesObj)) {
        for (const annotation of annotations) {
          const id = annotation.id ?? `ann-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          records.push({
            ...annotation, id, docId, page: Number(pageStr),
            updatedAt: annotation.updatedAt ?? Date.now(),
          });
        }
      }
      try {
        const { replaceDocumentAnnotations } = await import('./src/core/annotationPersistence.js');
        await replaceDocumentAnnotations(idb, docId, records);
        _broadcast('annotation', 'save', { docId, annotations: records });
        return records;
      } catch (error) {
        _signalSaveError('annotation', 'indexedDB', error, { canonical: true });
        throw error;
      }
    }

    function _storageRemoval(storage, keys, backend) {
      const cleared = [];
      const failures = [];
      for (const key of keys) {
        try {
          storage?.removeItem?.(key);
          if (storage?.getItem?.(key) != null) throw new Error(`Key ${key} remained after deletion`);
          cleared.push(key);
        } catch (error) {
          failures.push({ backend, key, message: error?.message || String(error) });
        }
      }
      return { cleared, failures };
    }

    async function _clearIdbStores(idb, stores) {
      const cleared = [];
      const failures = [];
      if (!idb) return { cleared, failures, available: false };
      for (const store of stores) {
        try {
          await idb.clear(store);
          if (typeof idb.count === 'function' && await idb.count(store) !== 0) {
            throw new Error(`Store ${store} remained non-empty after deletion`);
          }
          cleared.push(store);
        } catch (error) {
          failures.push({ backend: 'indexedDB', store, message: error?.message || String(error) });
        }
      }
      return { cleared, failures, available: true };
    }

    async function _deleteIdbSettings(idb, keys) {
      const cleared = [];
      const failures = [];
      if (!idb) return { cleared, failures, available: false };
      for (const key of keys) {
        try {
          await idb.delete('settings', key);
          if (typeof idb.get === 'function' && await idb.get('settings', key) != null) {
            throw new Error(`Setting ${key} remained after deletion`);
          }
          cleared.push(key);
        } catch (error) {
          failures.push({ backend: 'indexedDB', store: 'settings', key, message: error?.message || String(error) });
        }
      }
      return { cleared, failures, available: true };
    }

    function _deletionOutcome(operation, scope, parts) {
      const failures = parts.flatMap(part => part?.failures || []);
      const receipt = {
        operation,
        scope,
        committed: failures.length === 0,
        durable: failures.length === 0,
        status: failures.length === 0 ? 'committed' : 'failed',
        degraded: failures.length > 0,
        failures,
        parts,
        completedAt: new Date().toISOString(),
      };
      if (failures.length) {
        const error = new Error(`${operation} did not delete every requested record`);
        error.code = 'STORAGE_RESET_INCOMPLETE';
        error.receipt = receipt;
        error.failures = failures;
        throw error;
      }
      return receipt;
    }

    async function clearAll({ includeNotes = true, includeSettings = true, includeAnnotations = true, includePrefs = true } = {}) {
      const idb = _getIdb();
      const stores = ['progress', 'timestamps', 'watchedSegments', 'pdfBookmarks'];
      if (includeNotes) stores.push('notes', 'folders');
      if (includeSettings) stores.push('settings');
      if (includeAnnotations) stores.push('annotations');
      const localKeys = [];
      if (includeNotes) localKeys.push('ocd_notes', 'ocd_folders');
      if (includeSettings) localKeys.push('ocd_notes_settings', 'ocd_user_library', 'ocd_course_media_cues', 'ocd_ai_settings', 'ocd_tag_taxonomy', 'ocd_studio_board', 'ocd_studio_konva_draft');
      if (includeAnnotations) localKeys.push('ocd_pdf_annotations_by_document', 'ocd_pdf_annotations_by_page');
      if (includePrefs) localKeys.push(
        'ocd_theme', 'ocd_accent', 'ocd_density', 'ocd_font_scale',
        'ocd_dir', 'ocd_lang', 'ocd_sidebar_collapsed',
        'ocd_pending_topic', 'ocd_pending_position', 'ocd_pending_course_session',
        'ocd_pending_library_course', 'ocd_pending_pdf_doc', 'ocd_pending_pdf_page',
        'ocd_playlists', 'ocd_flashcards',
      );

      const idbResult = await _clearIdbStores(idb, stores);
      const localResult = _storageRemoval(localStorage, [...new Set(localKeys)], 'localStorage');
      const receipt = _deletionOutcome('clear-all', 'all', [idbResult, localResult]);
      window.__pdDebug?.({location:'bridge.js:clearAll',message:'Data wiped',data:{stores,receipt},timestamp:Date.now()});
      return receipt;
    }

    async function clearUserData(scope) {
      const idb = _getIdb();
      if (scope === 'notes') {
        return _deletionOutcome('clear-notes', scope, [
          await _clearIdbStores(idb, ['notes', 'folders']),
          _storageRemoval(localStorage, ['ocd_notes', 'ocd_folders', 'ocd_notes_settings'], 'localStorage'),
        ]);
      }
      if (scope === 'progress') {
        return _deletionOutcome('clear-progress', scope, [
          await _clearIdbStores(idb, ['progress']),
          _storageRemoval(localStorage, [], 'localStorage'),
        ]);
      }
      if (scope === 'media') {
        return _deletionOutcome('clear-media', scope, [
          await _clearIdbStores(idb, ['timestamps', 'annotations', 'watchedSegments', 'pdfBookmarks']),
          _storageRemoval(localStorage, ['ocd_pdf_annotations_by_document', 'ocd_pdf_annotations_by_page'], 'localStorage'),
        ]);
      }
      if (scope === 'playlists') {
        return _deletionOutcome('clear-playlists', scope, [
          await _deleteIdbSettings(idb, ['ocd_playlists']),
          _storageRemoval(localStorage, ['ocd_playlists'], 'localStorage'),
        ]);
      }
      if (scope === 'studio') {
        return _deletionOutcome('clear-studio', scope, [
          await _deleteIdbSettings(idb, ['ocd_studio_board', 'ocd_studio_konva_draft']),
          _storageRemoval(localStorage, ['ocd_studio_board', 'ocd_studio_konva_draft'], 'localStorage'),
        ]);
      }
      if (scope === 'all') return clearAll();
      throw new TypeError(`Unknown deletion scope: ${String(scope || '(empty)')}`);
    }

    async function _byIndex(store, indexName, value) {
      const idb = _requireIdb('getByIndex');
      try {
        if (typeof idb.getAllByIndex === 'function') {
          return await idb.getAllByIndex(store, indexName, value) ?? [];
        }
        const records = await idb.getAll(store) ?? [];
        return records.filter(record => record?.[indexName] === value);
      } catch (error) { _canonicalReadFailed('getByIndex', error); }
    }

    const getProgressByCourse = async courseId => (await _byIndex('progress', 'courseId', courseId)).map(_publicProgress);
    const getTimestampsByTopic = topicId => _byIndex('timestamps', 'topicId', topicId);
    const getTimestampsByCourse = courseId => _byIndex('timestamps', 'courseId', courseId);
    const getNotesByTopic = topicId => _byIndex('notes', 'topicId', topicId);
    const getNotesByCourse = courseId => _byIndex('notes', 'courseId', courseId);
    const getNotesByFolder = folderId => _byIndex('notes', 'folderId', folderId);
    const getFoldersByParent = parentId => _byIndex('folders', 'parentId', parentId);

    async function getRecentNotes(limit = 10) {
      const idb = _getIdb();
      if (idb) {
        try {
          if (typeof idb.queryIndex === 'function') return await idb.queryIndex('notes', 'updatedAt', null, { limit, direction: 'prev' }) ?? [];
        } catch (error) { _canonicalReadFailed('getRecentNotes', error); }
      }
      return (await getAllNotes()).sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0)).slice(0, limit);
    }

    // Issue 5: use IDBKeyRange + cursor instead of getAll() + filter
    async function queryByRange(store, indexName, lower, upper,
      { lowerOpen = false, upperOpen = false, limit } = {}) {
      const idb = _requireIdb('queryByRange');
      try {
        const range = IDBKeyRange.bound(lower, upper, lowerOpen, upperOpen);
        if (typeof idb.queryIndex === 'function') {
          return await idb.queryIndex(store, indexName, range, { limit }) ?? [];
        }
        const db = await idb.open();
        const tx = db.transaction(store, 'readonly');
        const idx = tx.objectStore(store).index(indexName);
        return await new Promise((resolve, reject) => {
          const out = [];
          const req = idx.openCursor(range);
          req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor || (limit && out.length >= limit)) { resolve(out); return; }
            out.push(cursor.value);
            cursor.continue();
          };
          req.onerror = () => reject(req.error);
        });
      } catch (error) { _canonicalReadFailed('queryByRange', error); }
    }

    // Issue 6: use index.count() instead of loading all records
    async function countByIndex(store, indexName, value) {
      const idb = _requireIdb('countByIndex');
      try {
        const db = await idb.open();
        const tx = db.transaction(store, 'readonly');
        const idx = tx.objectStore(store).index(indexName);
        return await new Promise((resolve, reject) => {
          const req = idx.count(value);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      } catch (error) { _canonicalReadFailed('countByIndex', error); }
    }

    // Issue 8: throw on save failure, return null when IDB unavailable
    async function getAllWatchedSegments() {
      const idb = _getIdb();
      if (!idb) {
        throw new Error('Canonical watched-segment storage is unavailable; backup cannot be complete');
      }
      try {
        const records = await idb.getAll('watchedSegments');
        if (!Array.isArray(records)) throw new Error('Invalid watched-segment records');
        return records;
      } catch (error) {
        _canonicalReadFailed('getAllWatchedSegments', error);
        throw error;
      }
    }

    async function addWatchedSegment(segment) {
      const id = segment?.id ?? `ws-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const next = { ...(segment ?? {}), id, updatedAt: segment?.updatedAt ?? Date.now() };
      const idb = _requireIdb('watchedSegment', true);
      try {
        await idb.put('watchedSegments', next);
        _broadcast('watchedSegment', 'save', next);
        return next;
      } catch (error) {
        _signalSaveError('watchedSegment', 'indexedDB', error, { canonical: true });
        throw error;
      }
    }

    async function getWatchedSegments(topicId) {
      const idb = _requireIdb('getWatchedSegments');
      try {
        if (typeof idb.getAllByIndex === 'function') {
          return await idb.getAllByIndex('watchedSegments', 'topicId', topicId) ?? [];
        }
        const all = await idb.getAll('watchedSegments') ?? [];
        return all.filter(segment => segment.topicId === topicId);
      } catch (error) { _canonicalReadFailed('getWatchedSegments', error); }
    }

    async function getWatchedPercent(topicId, duration) {
      const segments = await getWatchedSegments(topicId);
      if (!segments.length || !duration) return 0;
      const merged = [];
      const sorted = segments
        .filter(s => s.start != null && s.end != null)
        .sort((a, b) => a.start - b.start);
      for (const seg of sorted) {
        if (!merged.length || seg.start > merged[merged.length - 1].end) {
          merged.push({ start: seg.start, end: seg.end });
        } else {
          merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, seg.end);
        }
      }
      const totalWatched = merged.reduce((sum, s) => sum + (s.end - s.start), 0);
      return Math.min(100, Math.round((totalWatched / duration) * 100));
    }

    async function getAllPdfBookmarks() {
      const idb = _getIdb();
      if (!idb) {
        throw new Error('Canonical PDF bookmark storage is unavailable; backup cannot be complete');
      }
      try {
        const records = await idb.getAll('pdfBookmarks');
        if (!Array.isArray(records)) throw new Error('Invalid PDF bookmark records');
        return records;
      } catch (error) {
        _canonicalReadFailed('getAllPdfBookmarks', error);
        throw error;
      }
    }

    async function addPdfBookmark(bookmark) {
      const id = bookmark?.id ?? `bm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const next = { ...(bookmark ?? {}), id, updatedAt: bookmark?.updatedAt ?? Date.now() };
      const idb = _getIdb();
      if (idb) {
        try {
          await idb.put('pdfBookmarks', next);
          _broadcast('pdfBookmark', 'save', next);
          return next;
        } catch (e) {
          _signalSaveError('pdfBookmark', 'indexedDB', e);
          throw e;
        }
      }
      const error = new Error('Cannot save PDF bookmark: IndexedDB unavailable');
      _signalSaveError('pdfBookmark', 'indexedDB', error);
      throw error;
    }

    async function getPdfBookmarks(docId) {
      const idb = _requireIdb('getPdfBookmarks');
      try {
        if (typeof idb.getAllByIndex === 'function') {
          return await idb.getAllByIndex('pdfBookmarks', 'docId', docId) ?? [];
        }
        const all = await idb.getAll('pdfBookmarks') ?? [];
        return all.filter(bookmark => bookmark.docId === docId);
      } catch (error) { _canonicalReadFailed('getPdfBookmarks', error); }
    }

    // Issue 9: only broadcast on success
    async function deletePdfBookmark(id) {
      const idb = _getIdb();
      if (idb) {
        try {
          await idb.delete('pdfBookmarks', id);
          _broadcast('pdfBookmark', 'delete', { id });
          return true;
        } catch (e) {
          _signalSaveError('pdfBookmark-delete', 'indexedDB', e);
          return false;
        }
      }
      _signalSaveError('pdfBookmark-delete', 'indexedDB', new Error('IndexedDB unavailable'));
      return false;
    }

    return {
      getProgress,
      getAllProgress,
      saveProgress,
      deleteProgress,
      getAllTimestamps,
      saveTimestamp,
      compareAndSwapTimestamp,
      deleteTimestamp,
      getProgressByCourse,
      getTimestampsByTopic,
      getTimestampsByCourse,
      getAllNotes,
      saveNote,
      deleteNote,
      getNotesByTopic,
      getNotesByCourse,
      getNotesByFolder,
      getRecentNotes,
      getAllFolders,
      saveFolder,
      deleteFolder,
      getFoldersByParent,
      getSetting,
      saveSetting,
      compareAndSwapSetting,
      getAllAnnotations,
      getAnnotations,
      saveAnnotations,
      queryByRange,
      countByIndex,
      addWatchedSegment,
      getAllWatchedSegments,
      getWatchedSegments,
      getWatchedPercent,
      addPdfBookmark,
      getAllPdfBookmarks,
      getPdfBookmarks,
      deletePdfBookmark,
      clearAll,
      clearUserData,
    };
  })();

  window.DB = window.DB ?? DB;
})();
