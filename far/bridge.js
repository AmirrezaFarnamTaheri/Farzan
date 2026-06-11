// ============================================================
// PlasmaDeck â€” bridge.js
// Shared globals: window.DataStore, window.DB (progress/stats/catalog).
// ============================================================

(() => {
  'use strict';

  // Ensure namespace
  window.PlasmaDeck = window.PlasmaDeck ?? {};

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // DataStore (course/topic catalog) â€” loads local JSON on demand
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        "title": "Welcome to PlasmaDeck (Demo)",
        "sources": [
          {
            "label": "Getting Started",
            "topics": [
              {
                "title": "PlasmaDeck Tour",
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
            const targetCatalog = pointer.currentCatalog || 'plasmato_full_2026-04-11.json';
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
          window.PlasmaDeck?.bus?.emit?.('data:loaded', { courses: STATE.courses.length, topics: STATE.topics.length });
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
  window.PlasmaDeck.DataStore = window.PlasmaDeck.DataStore ?? DataStore;

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // DB (progress + timestamps + notes mirror) â€” IndexedDB preferred, localStorage fallback.
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    async function deleteNote(id) {
      const idb = _getIdb();
      if (idb) {
        try { await idb.delete('notes', id); } catch {}
      }
      const list = _read('plasma-notes', []);
      const next = list.filter(n => n?.id !== id);
      _write('plasma-notes', next);
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
        try { await idb.put('folders', next); return next; } catch {}
      }
      const list = _read('plasma-folders', []);
      const idx = list.findIndex(f => f?.id === id);
      if (idx >= 0) list[idx] = next;
      else list.push(next);
      _write('plasma-folders', list);
      return next;
    }

    async function deleteFolder(id) {
      const idb = _getIdb();
      if (idb) {
        try { await idb.delete('folders', id); } catch {}
      }
      const list = _read('plasma-folders', []);
      const next = list.filter(f => f?.id !== id);
      _write('plasma-folders', next);
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
        try { await idb.put('settings', { key, value }); return value; } catch {}
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
      return Object.values(dict).flat();
    }

    async function getAnnotations(docId) {
      const idb = _getIdb();
      if (idb) {
        await _migrateOnce();
        try {
          const all = await idb.getAll('annotations') ?? [];
          return all.filter(a => a.docId === docId);
        } catch {}
      }
      const dict = _read('plasma-pdf-annotations', {});
      return Object.values(dict).flat().filter(a => a.docId === docId);
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
          return nextArr;
        } catch {}
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

    async function clearAll({ includeNotes = true, includeSettings = true, includeAnnotations = true, includePrefs = true } = {}) {  
      const idb = _getIdb();
      const stores = ['progress', 'timestamps'];
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
          'plasma-theme', 'plasma-sidebar-collapsed', 'plasma-accent', 'plasma-dir'
        ];
        prefKeys.forEach(k => localStorage.removeItem(k));
      }

      localStorage.removeItem(KEY_MIGRATED);
      window.__pdDebug?.({location:'bridge.js:clearAll',message:'Data wiped',data:{stores},timestamp:Date.now()});
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
      deleteNote,
      getAllFolders,
      saveFolder,
      deleteFolder,
      getSetting,
      saveSetting,
      getAllAnnotations,
      getAnnotations,
      saveAnnotations,
      clearAll,
      clearUserData: clearAll,
    };
  })();

  window.DB = window.DB ?? DB;
})();
