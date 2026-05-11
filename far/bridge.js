// ============================================================
// PlasmaDeck — bridge.js
// Shared globals: window.DataStore, window.DB (progress/stats/catalog).
// ============================================================

(() => {
  'use strict';

  // Ensure namespace
  window.PlasmaDeck = window.PlasmaDeck ?? {};

  // ──────────────────────────────────────────────────────────
  // DataStore (course/topic catalog) — loads local JSON on demand
  // ──────────────────────────────────────────────────────────
  const DataStore = (() => {
    const STATE = {
      loaded: false,
      loading: null,
      courses: [],
      topics: [],
      raw: null,
    };

    const DEFAULT_JSON_PATH = './plasmato_full_2026-04-11.json';

    function _normalize(raw) {
      const courses = [];
      const topics = [];

      if (!raw || typeof raw !== 'object') return { courses, topics };

      for (const [courseId, course] of Object.entries(raw)) {
        const courseTitle = course?.title ?? courseId;
        courses.push({
          id: courseId,
          title: courseTitle,
          productUrl: course?.productUrl ?? '',
          sources: Array.isArray(course?.sources) ? course.sources : [],
        });

        const src0 = Array.isArray(course?.sources) ? course.sources[0] : null;
        const t = Array.isArray(src0?.topics) ? src0.topics : [];
        t.forEach((topic, idx) => {
          const url = topic?.url ?? '';
          topics.push({
            topicId: url || `${courseId}#${idx}`,
            courseId,
            courseTitle,
            url,
            title: topic?.title ?? url ?? `Topic ${idx + 1}`,
            videos: Array.isArray(topic?.videos) ? topic.videos : [],
            pdfs: Array.isArray(topic?.pdfs) ? topic.pdfs : [],
            iframes: Array.isArray(topic?.iframes) ? topic.iframes : [],
            raw: Array.isArray(topic?.raw) ? topic.raw : [],
          });
        });
      }

      return { courses, topics };
    }

    async function init({ path = DEFAULT_JSON_PATH } = {}) {
      if (STATE.loaded) return true;
      if (STATE.loading) return STATE.loading;

      STATE.loading = (async () => {
        try {
          const res = await fetch(path, { cache: 'no-store' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const raw = await res.json();
          const norm = _normalize(raw);
          STATE.raw = raw;
          STATE.courses = norm.courses;
          STATE.topics = norm.topics;
          STATE.loaded = true;
          window.PlasmaDeck?.bus?.emit?.('data:loaded', { courses: STATE.courses.length, topics: STATE.topics.length });
          return true;
        } catch (err) {
          console.warn('[DataStore] Failed to load catalog JSON:', err);
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

    return { init, isLoaded, allCourses, allTopics };
  })();

  window.DataStore = window.DataStore ?? DataStore;
  window.PlasmaDeck.DataStore = window.PlasmaDeck.DataStore ?? DataStore;

  // ──────────────────────────────────────────────────────────
  // DB (progress + timestamps + notes mirror) — IndexedDB preferred, localStorage fallback.
  // ──────────────────────────────────────────────────────────
  const DB = (() => {
    const KEY_PROGRESS = 'plasma_progress_v1';
    const KEY_TIMESTAMPS = 'plasma_timestamps_v1';
    const KEY_MIGRATED = 'plasma_migrated_v2';

    const IDB_NAME = 'plasmadeck';
    const IDB_VERSION = 2;

    let _idb = null;

    function _getIdb() {
      if (_idb) return _idb;
      const PlasmaDB = window.PlasmaDeck?.DB?.PlasmaDB;
      if (typeof PlasmaDB !== 'function') return null;
      _idb = new PlasmaDB(IDB_NAME, IDB_VERSION, [
        { name: 'progress', key: 'topicId', autoIncrement: false, indexes: [{ field: 'courseId' }, { field: 'updatedAt' }] },
        { name: 'timestamps', key: 'id', autoIncrement: false, indexes: [{ field: 'topicId' }, { field: 'courseId' }] },
        // Notes & settings (used by progress export/import and notes app)
        { name: 'notes', key: 'id', autoIncrement: false, indexes: [{ field: 'topicId' }, { field: 'courseId' }, { field: 'updatedAt' }] },
        { name: 'folders', key: 'id', autoIncrement: false, indexes: [{ field: 'parentId' }] },
        { name: 'settings', key: 'key', autoIncrement: false },
        // PDF annotations
        { name: 'annotations', key: 'id', autoIncrement: false, indexes: [{ field: 'docId' }, { field: 'page' }] },
      ]);
      return _idb;
    }

    function _read(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
      catch { return fallback; }
    }
    function _write(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    }

    async function _migrateOnce() {
      if (localStorage.getItem(KEY_MIGRATED) === 'true') return true;
      const idb = _getIdb();
      if (!idb) return false;
      try {
        window.__pdDebug?.({location:'bridge.js:migrate',message:'Migration starting',data:{hasLegacyProgress:!!localStorage.getItem(KEY_PROGRESS),hasLegacyTs:!!localStorage.getItem(KEY_TIMESTAMPS),hasLegacyNotes:!!localStorage.getItem('plasma-notes')},timestamp:Date.now()});
        // Progress map -> progress store
        const map = _read(KEY_PROGRESS, {});
        for (const v of Object.values(map)) {
          if (!v || !v.topicId) continue;
          await idb.put('progress', v);
        }

        // Timestamps list -> timestamps store
        const list = _read(KEY_TIMESTAMPS, []);
        for (const ts of list) {
          if (!ts) continue;
          const id = ts.id ?? `ts-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          await idb.put('timestamps', { ...ts, id });
        }

        // Notes
        try {
          const notes = _read('plasma-notes', []);
          for (const n of notes) {
            if (!n) continue;
            const id = n.id ?? `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            await idb.put('notes', { ...n, id });
          }
        } catch {}

        // Folders
        try {
          const folders = _read('plasma-folders', []);
          for (const f of folders) {
            if (!f) continue;
            const id = f.id ?? `folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            await idb.put('folders', { ...f, id });
          }
        } catch {}

        // Notes settings
        try {
          const ns = _read('plasma-notes-settings', null);
          if (ns && typeof ns === 'object') await idb.put('settings', { key: 'notes', value: ns });
        } catch {}

        // PDF annotations
        try {
          const anns = _read('plasma-pdf-annotations', []);
          for (const a of anns) {
            if (!a) continue;
            const id = a.id ?? `ann-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            await idb.put('annotations', { ...a, id });
          }
        } catch {}

        localStorage.setItem(KEY_MIGRATED, 'true');
        window.__pdDebug?.({location:'bridge.js:migrate',message:'Migration completed',data:{},timestamp:Date.now()});
        return true;
      } catch (e) {
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
          window.PlasmaDeck?.bus?.emit?.('progress:save', { topicId, courseId: next.courseId, progress: next });
          return next;
        } catch (e) {
          console.warn('[DB] saveProgress IDB failed, falling back to localStorage:', e);
        }
      }

      const map = _read(KEY_PROGRESS, {});
      map[topicId] = next;
      _write(KEY_PROGRESS, map);
      window.PlasmaDeck?.bus?.emit?.('progress:save', { topicId, courseId: next.courseId, progress: next });
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
        try { await idb.put('timestamps', next); return true; } catch (e) {
          console.warn('[DB] saveTimestamp IDB failed, falling back to localStorage:', e);
        }
      }

      const list = _read(KEY_TIMESTAMPS, []);
      list.push(next);
      _write(KEY_TIMESTAMPS, list);
      return true;
    }

    // Notes in this codebase live in localStorage via notes.js.
    async function getAllNotes() {
      const idb = _getIdb();
      if (idb) {
        await _migrateOnce();
        try { return (await idb.getAll('notes')) ?? []; } catch {}
      }
      try { return JSON.parse(localStorage.getItem('plasma-notes')) ?? []; } catch { return []; }
    }

    async function saveNote(note) {
      const id = note?.id ?? `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const next = { ...(note ?? {}), id, updatedAt: note?.updatedAt ?? Date.now() };

      const idb = _getIdb();
      if (idb) {
        await _migrateOnce();
        try { await idb.put('notes', next); return next; } catch {}
      }

      // IndexedDB unavailable: mirror notes in localStorage (see notes.js primary store).
      const list = _read('plasma-notes', []);
      const idx = list.findIndex(n => n?.id === id);
      if (idx >= 0) list[idx] = next;
      else list.push(next);
      _write('plasma-notes', list);
      return next;
    }

    async function clearAll() {
      // Clear IDB stores and mirrored localStorage keys used when IDB was unavailable.
      const idb = _getIdb();
      if (idb) {
        try {
          await idb.clear('progress');
          await idb.clear('timestamps');
        } catch {}
      }

      localStorage.removeItem(KEY_PROGRESS);
      localStorage.removeItem(KEY_TIMESTAMPS);
      localStorage.removeItem(KEY_MIGRATED);
      return true;
    }

    return {
      getProgress,
      getAllProgress,
      saveProgress,
      getAllTimestamps,
      saveTimestamp,
      getAllNotes,
      saveNote,
      clearAll,
    };
  })();

  window.DB = window.DB ?? DB;
})();

