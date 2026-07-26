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

    function catalogPath() {
      return _activeCatalogPath;
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

    async function init({ path = './data/catalog.json' } = {}) {
      if (STATE.loaded) return true;
      if (STATE.loading) return STATE.loading;

      STATE.loading = (async () => {
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
        };

        const updateStatus = (msg, isError = false) => {
          const el = document.getElementById('splash-status');
          if (el) {
            el.textContent = msg;
            if (isError) el.style.color = '#ef4444';
          }
        };

        try {
          let raw = null;
          try {
            updateStatus('Loading catalog pointer...');
            const pointer = await fetchWithRetry(path);
            const targetCatalog = pointer.currentCatalog || 'data/opencoursedeck-starter.json';
            _activeCatalogPath = targetCatalog.startsWith('./') ? targetCatalog : `./${targetCatalog}`;
            
            updateStatus('Loading catalog content...');
            raw = await fetchWithRetry(_activeCatalogPath);
          } catch (err) {
            console.warn('[DataStore] Failed to load catalog JSON, using demo fallback:', err);
            raw = DEMO_FALLBACK;
            _activeCatalogPath = 'demo-fallback';
            updateStatus('Catalog load failed. Using offline demo.');
          }

          const norm = _normalize(raw);
          STATE.raw = raw;
          STATE.courses = norm.courses;
          STATE.topics = norm.topics;
          STATE.loaded = true;
          window.OpenCourseDeck?.bus?.emit?.('data:loaded', { courses: STATE.courses.length, topics: STATE.topics.length });
          return true;
        } catch (err) {
          console.error('[DataStore] Critical failure in init:', err);
          updateStatus('Critical failure loading content.', true);
          return false;
        } finally {
          STATE.loading = null;
        }
      })();

      return STATE.loading;
    }

    function allCourses() { return STATE.courses.slice(); }
    function allTopics() { return STATE.topics.slice(); }
    function isLoaded() { return STATE.loaded; }

    return { init, isLoaded, allCourses, allTopics, catalogPath };
  })();

  window.DataStore = window.DataStore ?? DataStore;
  window.OpenCourseDeck.DataStore = window.OpenCourseDeck.DataStore ?? DataStore;

  // ───────────────────────────────────────────────────────────
  // DB (progress + timestamps + notes mirror) — IndexedDB preferred, localStorage fallback.
  // ───────────────────────────────────────────────────────────
  const DB = (() => {
    const KEY_PROGRESS = 'plasma_progress_v1';
    const KEY_TIMESTAMPS = 'plasma_timestamps_v1';
    const KEY_MIGRATED = 'plasma_migrated_v2';

    const IDB_NAME = 'opencoursedeck';
    const IDB_VERSION = 3;

    let _idb = null;
    let _idbCtor = null;
    let _sync = null;
    const _sourceId = `pd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    function _getIdb() {
      // Subscribe on ANY database access, not just writes: the channel used
      // to be created lazily inside _broadcast(), so a tab that had only
      // read data never attached an onmessage handler and silently showed
      // stale content (then clobbered the other tab's edits on its first
      // write). Every read path goes through here.
      _ensureSyncChannel();
      const PlasmaDB = window.OpenCourseDeck?.DB?.PlasmaDB;
      if (typeof PlasmaDB !== 'function') return null;
      if (_idb && _idbCtor === PlasmaDB) return _idb;
      _idbCtor = PlasmaDB;
      _idb = new PlasmaDB(IDB_NAME, IDB_VERSION, [
        { name: 'progress', key: 'topicId', autoIncrement: false, indexes: [{ field: 'courseId' }, { field: 'updatedAt' }] },
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

    function _isMigrated() {
      return localStorage.getItem(KEY_MIGRATED) === 'true';
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

    function _read(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
      catch { return fallback; }
    }
    // Issue: add error handling to _write
    function _write(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); }
      catch (e) { console.warn('[DB] localStorage write failed:', key, e); throw e; }
    }

    // Issue 4: per-record migration tracking
    const _migratedSections = new Set();
    const MIGRATED_IDS_KEY = 'plasma_migrated_ids';
    let _migratedIds = null;

    function _loadMigratedIds() {
      if (_migratedIds) return _migratedIds;
      try {
        const arr = JSON.parse(localStorage.getItem(MIGRATED_IDS_KEY));
        _migratedIds = new Set(Array.isArray(arr) ? arr : []);
      } catch { _migratedIds = new Set(); }
      return _migratedIds;
    }

    function _persistMigratedIds() {
      try { localStorage.setItem(MIGRATED_IDS_KEY, JSON.stringify([..._migratedIds])); } catch {}
    }

    let _migrating = null;
    let _lastMigrateFailureAt = 0;
    const MIGRATE_RETRY_BACKOFF_MS = 5000;

    async function _migrateOnce() {
      if (localStorage.getItem(KEY_MIGRATED) === 'true') return true;
      // Memoize the in-flight run: concurrent DB calls before the migrated
      // flag is set must share one migration, not start parallel runs that
      // race each other (and any concurrent deletes) with duplicate puts.
      if (_migrating) return _migrating;
      // Back off after a failure so a persistently failing section does not
      // turn every subsequent DB call into a full migration attempt.
      if (_lastMigrateFailureAt && Date.now() - _lastMigrateFailureAt < MIGRATE_RETRY_BACKOFF_MS) return false;
      _migrating = _runMigration().finally(() => { _migrating = null; });
      return _migrating;
    }

    // Migrate one section: read legacy records, batch-insert the not-yet
    // migrated ones in a single transaction, then persist the id ledger.
    // Records without an id get a DETERMINISTIC id derived from their array
    // index so a retried run (after another section failed) matches the
    // ledger instead of re-inserting duplicates under fresh random ids.
    async function _migrateSection(idb, ids, failures, section, store, buildRecords) {
      if (_migratedSections.has(section)) return;
      try {
        const pending = [];
        for (const [rid, record] of buildRecords()) {
          if (ids.has(rid)) continue;
          pending.push([rid, record]);
        }
        if (pending.length) {
          const records = pending.map(([, record]) => record);
          // One transaction for the whole section instead of one per record
          // (PlasmaDB.put opens a fresh readwrite transaction each call, so
          // a few thousand legacy records meant a multi-second stall on
          // first load). Fall back to sequential puts for DB adapters that
          // do not implement bulkPut.
          if (typeof idb.bulkPut === 'function') {
            await idb.bulkPut(store, records);
          } else {
            for (const record of records) await idb.put(store, record);
          }
          for (const [rid] of pending) ids.add(rid);
          _persistMigratedIds();
        }
        _migratedSections.add(section);
      } catch (error) { failures.push({ section, error: _errorInfo(error) }); }
    }

    async function _runMigration() {
      const idb = _getIdb();
      if (!idb) return false;
      const failures = [];
      const ids = _loadMigratedIds();
      try {
        window.__pdDebug?.({location:'bridge.js:migrate',message:'Migration starting',data:{hasLegacyProgress:!!localStorage.getItem(KEY_PROGRESS),hasLegacyTs:!!localStorage.getItem(KEY_TIMESTAMPS),hasLegacyNotes:!!localStorage.getItem('plasma-notes')},timestamp:Date.now()});

        await _migrateSection(idb, ids, failures, 'progress', 'progress', () => {
          const map = _read(KEY_PROGRESS, {});
          return Object.entries(map)
            .filter(([, v]) => v && v.topicId)
            .map(([key, v]) => [`progress:${key}`, v]);
        });

        await _migrateSection(idb, ids, failures, 'timestamps', 'timestamps', () => {
          const list = _read(KEY_TIMESTAMPS, []);
          return list
            .map((ts, i) => (ts ? [ts, ts.id ?? `ts-migrated-${i}`] : null))
            .filter(Boolean)
            .map(([ts, id]) => [`timestamps:${id}`, { ...ts, id }]);
        });

        await _migrateSection(idb, ids, failures, 'notes', 'notes', () => {
          const notes = _read('plasma-notes', []);
          return notes
            .map((n, i) => (n ? [n, n.id ?? `note-migrated-${i}`] : null))
            .filter(Boolean)
            .map(([n, id]) => [`notes:${id}`, { ...n, id }]);
        });

        await _migrateSection(idb, ids, failures, 'folders', 'folders', () => {
          const folders = _read('plasma-folders', []);
          return folders
            .map((f, i) => (f ? [f, f.id ?? `folder-migrated-${i}`] : null))
            .filter(Boolean)
            .map(([f, id]) => [`folders:${id}`, { ...f, id }]);
        });

        await _migrateSection(idb, ids, failures, 'settings', 'settings', () => {
          const ns = _read('plasma-notes-settings', null);
          return ns && typeof ns === 'object'
            ? [['settings:notes', { key: 'notes', value: ns }]]
            : [];
        });

        await _migrateSection(idb, ids, failures, 'annotations', 'annotations', () => {
          const annsRaw = _read('plasma-pdf-annotations', {});
          const anns = Array.isArray(annsRaw)
            ? annsRaw
            : Object.entries(annsRaw).flatMap(([page, list]) => (Array.isArray(list) ? list : []).map(a => ({ ...a, page: Number(a.page ?? page), docId: a.docId ?? 'global' })));
          return anns
            .map((a, i) => (a ? [a, a.id ?? `ann-migrated-${i}`] : null))
            .filter(Boolean)
            .map(([a, id]) => [`annotations:${id}`, { ...a, id }]);
        });

        if (failures.length) {
          _lastMigrateFailureAt = Date.now();
          _emit('storage:migration-error', { kind: 'migration', backend: 'indexedDB', failures });
          return false;
        }

        localStorage.setItem(KEY_MIGRATED, 'true');
        localStorage.removeItem(MIGRATED_IDS_KEY);
        _lastMigrateFailureAt = 0;
        window.__pdDebug?.({location:'bridge.js:migrate',message:'Migration completed',data:{},timestamp:Date.now()});
        return true;
      } catch (e) {
        _lastMigrateFailureAt = Date.now();
        console.warn('[DB] migration failed:', e);
        window.__pdDebug?.({location:'bridge.js:migrate',message:'Migration failed',data:{err:String(e&&e.message||e)},timestamp:Date.now()});
        return false;
      }
    }

    async function getProgress(topicId) {
      const idb = _getIdb();
      if (idb) {
        await _migrateOnce();
        try { return (await idb.get('progress', topicId)) ?? null; } catch {}
      }
      const map = _read(KEY_PROGRESS, {});
      return map[topicId] ?? null;
    }

    async function getAllProgress() {
      const idb = _getIdb();
      if (idb) {
        await _migrateOnce();
        try { return (await idb.getAll('progress')) ?? []; } catch {}
      }
      const map = _read(KEY_PROGRESS, {});
      return Object.values(map);
    }

    async function saveProgress(topicId, courseId, patch = {}) {
      const prev = (await getProgress(topicId)) ?? { topicId, courseId };
      const next = {
        ...prev,
        ...patch,
        topicId,
        courseId: courseId ?? prev.courseId,
        updatedAt: patch.updatedAt ?? Date.now(),
      };

      const idb = _getIdb();
      if (idb) {
        await _migrateOnce();
        try {
          await idb.put('progress', next);
          window.OpenCourseDeck?.bus?.emit?.('progress:save', { topicId, courseId: next.courseId, progress: next });
          _broadcast('progress', 'save', next);
          return next;
        } catch (e) {
          _signalSaveError('progress', 'indexedDB', e);
          if (_errorInfo(e).quota) throw e;
          console.warn('[DB] saveProgress IDB failed, falling back to localStorage:', e);
          _emit('storage:fallback', { kind: 'progress', fallbackBackend: 'localStorage' });
        }
      }

      const map = _read(KEY_PROGRESS, {});
      map[topicId] = next;
      _write(KEY_PROGRESS, map);
      window.OpenCourseDeck?.bus?.emit?.('progress:save', { topicId, courseId: next.courseId, progress: next });
      // BroadcastChannel works regardless of backend — fallback writes must
      // sync across tabs too.
      _broadcast('progress', 'save', next);
      return next;
    }

    async function getAllTimestamps() {
      const idb = _getIdb();
      if (idb) {
        await _migrateOnce();
        try { return (await idb.getAll('timestamps')) ?? []; } catch {}
      }
      return _read(KEY_TIMESTAMPS, []);
    }

    async function saveTimestamp(ts) {
      const next = { ...ts, id: ts?.id ?? `ts-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };       

      const idb = _getIdb();
      if (idb) {
        await _migrateOnce();
        try { await idb.put('timestamps', next); _broadcast('timestamp', 'save', next); return true; } catch (e) {
          _signalSaveError('timestamp', 'indexedDB', e);
          if (_errorInfo(e).quota) throw e;
          console.warn('[DB] saveTimestamp IDB failed, falling back to localStorage:', e);
        }
      }

      const list = _read(KEY_TIMESTAMPS, []);
      const idx = list.findIndex(item => item?.id === next.id);
      if (idx >= 0) list[idx] = next;
      else list.push(next);
      _write(KEY_TIMESTAMPS, list);
      _broadcast('timestamp', 'save', next);
      return true;
    }

    // Issue 7: add await _migrateOnce()
    async function deleteTimestamp(id) {
      const idb = _getIdb();
      if (idb) {
        await _migrateOnce();
        try { await idb.delete('timestamps', id); } catch {}
      }
      const list = _read(KEY_TIMESTAMPS, []);
      _write(KEY_TIMESTAMPS, list.filter(ts => ts?.id !== id));
      _broadcast('timestamp', 'delete', { id });
    }

    // Notes in this codebase live in localStorage via notes.js.
    async function getAllNotes() {
      const idb = _getIdb();
      if (idb) {
        const migrated = await _migrateOnce();
        if (migrated || _isMigrated()) {
          try { return (await idb.getAll('notes')) ?? []; } catch {}
        }
      }
      try { return JSON.parse(localStorage.getItem('plasma-notes')) ?? []; } catch { return []; }
    }

    async function saveNote(note) {
      const id = note?.id ?? `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const next = { ...(note ?? {}), id, updatedAt: note?.updatedAt ?? Date.now() };

      const idb = _getIdb();
      if (idb) {
        await _migrateOnce();
        try { await idb.put('notes', next); _broadcast('note', 'save', next); return next; } catch (e) {
          if (_isMigrated()) {
            _signalSaveError('note', 'indexedDB', e, { canonical: true });
            throw e;
          }
        }
      }

      // IndexedDB unavailable: mirror notes in localStorage (see notes.js primary store).
      const list = _read('plasma-notes', []);
      const idx = list.findIndex(n => n?.id === id);
      if (idx >= 0) list[idx] = next;
      else list.push(next);
      try { _write('plasma-notes', list); } catch (e) {
        _signalSaveError('note', 'localStorage', e, { key: 'plasma-notes' });
        throw e;
      }
      _broadcast('note', 'save', next);
      return next;
    }

    // Issue 7: add await _migrateOnce()
    async function deleteNote(id) {
      const idb = _getIdb();
      let idbDeleted = false;
      if (idb) {
        await _migrateOnce();
        try { await idb.delete('notes', id); idbDeleted = true; } catch {}
      }
      if (idbDeleted && _isMigrated()) {
        // Post-migration the localStorage mirror is stale; clear it only when
        // the canonical IndexedDB delete actually happened. If IDB is gone,
        // the mirror may be the only live store — wiping it would erase
        // EVERY note, so fall through to a targeted filter instead.
        localStorage.removeItem('plasma-notes');
      } else {
        const list = _read('plasma-notes', []);
        const next = list.filter(n => n?.id !== id);
        _write('plasma-notes', next);
      }
      _broadcast('note', 'delete', { id });
    }

    async function getAllFolders() {
      const idb = _getIdb();
      if (idb) {
        await _migrateOnce();
        try { return (await idb.getAll('folders')) ?? []; } catch {}
      }
      return _read('plasma-folders', []);
    }

    async function saveFolder(folder) {
      const id = folder?.id ?? `folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const next = { ...(folder ?? {}), id, updatedAt: folder?.updatedAt ?? Date.now() };
      const idb = _getIdb();
      if (idb) {
        await _migrateOnce();
        try { await idb.put('folders', next); _broadcast('folder', 'save', next); return next; } catch (e) {
          if (_isMigrated()) {
            _signalSaveError('folder', 'indexedDB', e, { canonical: true });
            throw e;
          }
        }
      }
      const list = _read('plasma-folders', []);
      const idx = list.findIndex(f => f?.id === id);
      if (idx >= 0) list[idx] = next;
      else list.push(next);
      _write('plasma-folders', list);
      _broadcast('folder', 'save', next);
      return next;
    }

    async function deleteFolder(id) {
      const idb = _getIdb();
      let idbDeleted = false;
      if (idb) {
        // Pre-migration, deleting from IDB alone is a no-op and a later
        // migration would resurrect the folder from localStorage.
        await _migrateOnce();
        try { await idb.delete('folders', id); idbDeleted = true; } catch {}
      }
      if (idbDeleted && _isMigrated()) {
        localStorage.removeItem('plasma-folders');
      } else {
        const list = _read('plasma-folders', []);
        const next = list.filter(f => f?.id !== id);
        _write('plasma-folders', next);
      }
      _broadcast('folder', 'delete', { id });
    }

    async function getSetting(key) {
      const idb = _getIdb();
      if (idb) {
        await _migrateOnce();
        try {
          const entry = await idb.get('settings', key);
          if (entry) return entry.value;
        } catch {}
      }
      return _read(key, null);
    }

    async function saveSetting(key, value) {
      const idb = _getIdb();
      if (idb) {
        await _migrateOnce();
        try { await idb.put('settings', { key, value }); _broadcast('setting', 'save', { key, value }); return value; } catch (e) {
          if (_isMigrated()) {
            _signalSaveError('setting', 'indexedDB', e, { canonical: true });
            throw e;
          }
        }
      }
      _write(key, value);
      return value;
    }

    async function getAllAnnotations() {
      const idb = _getIdb();
      if (idb) {
        await _migrateOnce();
        try { return (await idb.getAll('annotations')) ?? []; } catch {}
      }
      const dict = _read('plasma-pdf-annotations', {});
      if (Array.isArray(dict)) return dict;
      return Object.entries(dict).flatMap(([key, list]) => (Array.isArray(list) ? list : []).map(a => ({ ...a, page: Number(a.page ?? key), docId: a.docId ?? (Number.isFinite(Number(key)) ? 'global' : key) })));
    }

    async function getAnnotations(docId) {
      const idb = _getIdb();
      if (idb) {
        await _migrateOnce();
        try {
          if (typeof idb.getAllByIndex === 'function') return await idb.getAllByIndex('annotations', 'docId', docId) ?? [];
          const all = await idb.getAll('annotations') ?? [];
          return all.filter(a => a.docId === docId);
        } catch {}
      }
      return (await getAllAnnotations()).filter(a => a.docId === docId);
    }

    async function saveAnnotations(docId, pagesObj) {
      const idb = _getIdb();
      const nextArr = [];
      for (const [pageStr, anns] of Object.entries(pagesObj)) {
        for (const ann of anns) {
          const id = ann.id ?? `ann-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const next = { ...ann, id, docId, page: Number(pageStr), updatedAt: ann.updatedAt ?? Date.now() };    
          nextArr.push(next);
        }
      }

      if (idb) {
        await _migrateOnce();
        try {
          for (const next of nextArr) await idb.put('annotations', next);
          _broadcast('annotation', 'save', { docId, annotations: nextArr });
          return nextArr;
        } catch (e) {
          if (_isMigrated()) {
            _signalSaveError('annotation', 'indexedDB', e, { canonical: true });
            throw e;
          }
        }
      }

      const dict = _read('plasma-pdf-annotations', {});
      if (!dict[docId]) dict[docId] = [];
      const docList = dict[docId];
      for (const next of nextArr) {
        const idx = docList.findIndex(a => a.id === next.id);
        if (idx >= 0) docList[idx] = next;
        else docList.push(next);
      }
      _write('plasma-pdf-annotations', dict);
      return nextArr;
    }

    // Issue 2: add watchedSegments and pdfBookmarks
    async function clearAll({ includeNotes = true, includeSettings = true, includeAnnotations = true, includePrefs = true } = {}) {  
      const idb = _getIdb();
      const stores = ['progress', 'timestamps', 'watchedSegments', 'pdfBookmarks'];
      if (includeNotes) stores.push('notes', 'folders');
      if (includeSettings) stores.push('settings');
      if (includeAnnotations) stores.push('annotations');

      if (idb) {
        for (const s of stores) {
          try { await idb.clear(s); } catch (e) { console.warn(`[DB] clearAll failed for store ${s}:`, e); }    
        }
      }

      // Mirror localStorage cleanup
      localStorage.removeItem(KEY_PROGRESS);
      localStorage.removeItem(KEY_TIMESTAMPS);
      if (includeNotes) {
        localStorage.removeItem('plasma-notes');
        localStorage.removeItem('plasma-folders');
      }
      if (includeSettings) {
        localStorage.removeItem('plasma-notes-settings');
      }
      if (includeAnnotations) {
        localStorage.removeItem('plasma-pdf-annotations');
      }
      if (includePrefs) {
        const prefKeys = [
          'plasma_accent', 'plasma_density', 'plasma_font_scale', 'plasma_dir',
          'plasma_theme', 'plasma_sidebar_collapsed', 'plasma-intro-seen', 'plasma-session',
          'plasma-theme', 'plasma-sidebar-collapsed', 'plasma-accent', 'plasma-dir',
          'plasma_pending_topic', 'plasma_pending_position', 'plasma_pending_course_session',
          'plasma_pending_pdf_doc', 'plasma_pending_pdf_page', 'plasma-playlists',
          'plasma-studio-board', 'plasma_migrated_ids'
        ];
        prefKeys.forEach(k => localStorage.removeItem(k));
      }

      localStorage.removeItem(KEY_MIGRATED);
      window.__pdDebug?.({location:'bridge.js:clearAll',message:'Data wiped',data:{stores},timestamp:Date.now()});
      return true;
    }

    // Issue 2: add watchedSegments and pdfBookmarks to media scope
    async function clearUserData(scope) {
      const idb = _getIdb();
      const clearStores = async (stores) => {
        if (idb) {
          for (const store of stores) {
            try { await idb.clear(store); } catch {}
          }
        }
      };
      if (scope === 'notes') {
        await clearStores(['notes', 'folders']);
        localStorage.removeItem('plasma-notes');
        localStorage.removeItem('plasma-folders');
        localStorage.removeItem('plasma-notes-settings');
      } else if (scope === 'progress') {
        await clearStores(['progress']);
        localStorage.removeItem(KEY_PROGRESS);
      } else if (scope === 'media') {
        await clearStores(['timestamps', 'annotations', 'watchedSegments', 'pdfBookmarks']);
        localStorage.removeItem(KEY_TIMESTAMPS);
        localStorage.removeItem('plasma-pdf-annotations');
      } else if (scope === 'playlists') {
        if (idb) try { await idb.delete('settings', 'plasma-playlists'); } catch {}
        localStorage.removeItem('plasma-playlists');
      } else if (scope === 'studio') {
        if (idb) try { await idb.delete('settings', 'plasma-studio-board'); } catch {}
        localStorage.removeItem('plasma-studio-board');
      } else {
        await clearAll();
      }
      return { scope };
    }

    async function _byIndex(store, indexName, value, fallback) {
      const idb = _getIdb();
      if (idb) {
        await _migrateOnce();
        try {
          if (typeof idb.getAllByIndex === 'function') return await idb.getAllByIndex(store, indexName, value) ?? [];
          const all = await idb.getAll(store) ?? [];
          return all.filter(record => record?.[indexName] === value);
        } catch {}
      }
      return fallback().filter(record => record?.[indexName] === value);
    }

    const getProgressByCourse = (courseId) => _byIndex('progress', 'courseId', courseId, () => Object.values(_read(KEY_PROGRESS, {})));
    const getTimestampsByTopic = (topicId) => _byIndex('timestamps', 'topicId', topicId, () => _read(KEY_TIMESTAMPS, []));
    const getTimestampsByCourse = (courseId) => _byIndex('timestamps', 'courseId', courseId, () => _read(KEY_TIMESTAMPS, []));
    const getNotesByTopic = (topicId) => _byIndex('notes', 'topicId', topicId, () => _read('plasma-notes', []));
    const getNotesByCourse = (courseId) => _byIndex('notes', 'courseId', courseId, () => _read('plasma-notes', []));
    const getNotesByFolder = (folderId) => _byIndex('notes', 'folderId', folderId, () => _read('plasma-notes', []).map(n => ({ folderId: n.folderId ?? 'default', ...n })));
    const getFoldersByParent = (parentId) => _byIndex('folders', 'parentId', parentId, () => _read('plasma-folders', []).map(f => ({ parentId: f.parentId ?? null, ...f })));
    async function getRecentNotes(limit = 10) {
      const idb = _getIdb();
      if (idb) {
        await _migrateOnce();
        try {
          if (typeof idb.queryIndex === 'function') return await idb.queryIndex('notes', 'updatedAt', null, limit, { direction: 'prev' }) ?? [];
        } catch {}
      }
      return (await getAllNotes()).sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0)).slice(0, limit);
    }

    // Issue 5: use IDBKeyRange + cursor instead of getAll() + filter
    async function queryByRange(store, indexName, lower, upper, { lowerOpen = false, upperOpen = false, limit } = {}) {
      const idb = _getIdb();
      if (idb) {
        await _migrateOnce();
        try {
          const range = IDBKeyRange.bound(lower, upper, lowerOpen, upperOpen);
          if (typeof idb.queryIndex === 'function') return await idb.queryIndex(store, indexName, range, limit) ?? [];
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
        } catch {}
      }
      const all = store === 'progress'
        ? Object.values(_read(KEY_PROGRESS, {}))
        : _read(store === 'timestamps' ? KEY_TIMESTAMPS : 'plasma-notes', []);
      return all.filter(r => r && r[indexName] >= lower && r[indexName] <= upper).slice(0, limit);
    }

    // Issue 6: use index.count() instead of loading all records
    async function countByIndex(store, indexName, value) {
      const idb = _getIdb();
      if (idb) {
        await _migrateOnce();
        try {
          const db = await idb.open();
          const tx = db.transaction(store, 'readonly');
          const idx = tx.objectStore(store).index(indexName);
          return await new Promise((resolve, reject) => {
            const req = idx.count(value);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
        } catch {}
      }
      const all = store === 'progress'
        ? Object.values(_read(KEY_PROGRESS, {}))
        : _read(store === 'timestamps' ? KEY_TIMESTAMPS : 'plasma-notes', []);
      return all.filter(r => r?.[indexName] === value).length;
    }

    // Issue 8: throw on save failure, return null when IDB unavailable
    async function addWatchedSegment(segment) {
      const id = segment?.id ?? `ws-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const next = { ...(segment ?? {}), id, updatedAt: segment?.updatedAt ?? Date.now() };
      const idb = _getIdb();
      if (idb) {
        await _migrateOnce();
        try {
          await idb.put('watchedSegments', next);
          _broadcast('watchedSegment', 'save', next);
          return next;
        } catch (e) {
          _signalSaveError('watchedSegment', 'indexedDB', e);
          throw e;
        }
      }
      return null;
    }

    async function getWatchedSegments(topicId) {
      const idb = _getIdb();
      if (idb) {
        await _migrateOnce();
        try {
          if (typeof idb.getAllByIndex === 'function') return await idb.getAllByIndex('watchedSegments', 'topicId', topicId) ?? [];
          const all = await idb.getAll('watchedSegments') ?? [];
          return all.filter(s => s.topicId === topicId);
        } catch {}
      }
      return [];
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

    async function addPdfBookmark(bookmark) {
      const id = bookmark?.id ?? `bm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const next = { ...(bookmark ?? {}), id, updatedAt: bookmark?.updatedAt ?? Date.now() };
      const idb = _getIdb();
      if (idb) {
        await _migrateOnce();
        try {
          await idb.put('pdfBookmarks', next);
          _broadcast('pdfBookmark', 'save', next);
          return next;
        } catch (e) {
          _signalSaveError('pdfBookmark', 'indexedDB', e);
          throw e;
        }
      }
      return next;
    }

    async function getPdfBookmarks(docId) {
      const idb = _getIdb();
      if (idb) {
        await _migrateOnce();
        try {
          if (typeof idb.getAllByIndex === 'function') return await idb.getAllByIndex('pdfBookmarks', 'docId', docId) ?? [];
          const all = await idb.getAll('pdfBookmarks') ?? [];
          return all.filter(b => b.docId === docId);
        } catch {}
      }
      return [];
    }

    // Issue 9: only broadcast on success
    async function deletePdfBookmark(id) {
      const idb = _getIdb();
      if (idb) {
        await _migrateOnce();
        try {
          await idb.delete('pdfBookmarks', id);
          _broadcast('pdfBookmark', 'delete', { id });
          return true;
        } catch (e) {
          _signalSaveError('pdfBookmark-delete', 'indexedDB', e);
          return false;
        }
      }
      _broadcast('pdfBookmark', 'delete', { id });
      return true;
    }

    // Issue 1: include watchedSegments and pdfBookmarks
    async function exportBackup({ includeProgress = true, includeTimestamps = true, includeNotes = true, includeFolders = true, includeSettings = true, includeAnnotations = true, includeWatchedSegments = true, includePdfBookmarks = true } = {}) {
      const data = {};
      if (includeProgress) data.progress = await getAllProgress();
      if (includeTimestamps) data.timestamps = await getAllTimestamps();
      if (includeNotes) data.notes = await getAllNotes();
      if (includeFolders) data.folders = await getAllFolders();
      if (includeSettings) {
        const idb = _getIdb();
        if (idb) {
          await _migrateOnce();
          try { data.settings = await idb.getAll('settings') ?? []; } catch { data.settings = []; }
        } else {
          data.settings = [];
        }
      }
      if (includeAnnotations) data.annotations = await getAllAnnotations();
      if (includeWatchedSegments) {
        const idb = _getIdb();
        if (idb) {
          await _migrateOnce();
          try { data.watchedSegments = await idb.getAll('watchedSegments') ?? []; } catch { data.watchedSegments = []; }
        } else {
          data.watchedSegments = [];
        }
      }
      if (includePdfBookmarks) {
        const idb = _getIdb();
        if (idb) {
          await _migrateOnce();
          try { data.pdfBookmarks = await idb.getAll('pdfBookmarks') ?? []; } catch { data.pdfBookmarks = []; }
        } else {
          data.pdfBookmarks = [];
        }
      }
      data._meta = { exportedAt: Date.now(), version: 1 };
      return data;
    }

    // Issue 3: explicit overwrite path
    async function importBackup(data, { mode = 'merge' } = {}) {
      if (!data || typeof data !== 'object') throw new Error('Invalid backup data');
      const idb = _getIdb();
      if (!idb) throw new Error('IndexedDB unavailable');

      await _migrateOnce();

      const isOverwrite = mode === 'overwrite';
      const storeMap = {
        progress: 'progress',
        timestamps: 'timestamps',
        notes: 'notes',
        folders: 'folders',
        settings: 'settings',
        annotations: 'annotations',
        watchedSegments: 'watchedSegments',
        pdfBookmarks: 'pdfBookmarks',
      };

      for (const [key, store] of Object.entries(storeMap)) {
        const records = data[key];
        if (!Array.isArray(records) || !records.length) continue;
        if (isOverwrite) {
          try { await idb.clear(store); } catch {}
        }
        for (const record of records) {
          if (!record) continue;
          try { await idb.put(store, record); } catch (e) {
            console.warn(`[DB] importBackup failed for store ${store}:`, e);
          }
        }
      }

      _emit('storage:import-complete', { mode, timestamp: Date.now() });
      return true;
    }

    return {
      getProgress,
      getAllProgress,
      saveProgress,
      getAllTimestamps,
      saveTimestamp,
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
      getAllAnnotations,
      getAnnotations,
      saveAnnotations,
      queryByRange,
      countByIndex,
      addWatchedSegment,
      getWatchedSegments,
      getWatchedPercent,
      addPdfBookmark,
      getPdfBookmarks,
      deletePdfBookmark,
      exportBackup,
      importBackup,
      clearAll,
      clearUserData,
    };
  })();

  window.DB = window.DB ?? DB;
})();
