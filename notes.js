// ============================================================
// OpenCourseDeck — notes.js
// Full Rich Notes System
// Features: Editor, Folders, Tags, Search, Autosave, Export
// ============================================================

import DOMPurify from 'dompurify';
import { sanitizeNoteStyles } from './src/features/safeNoteStyles.js';
import { noteHtmlToMarkdown } from './src/features/markdownExport.js';
import { countWords } from './src/core/textMetrics.js';

(() => {
  'use strict';

  // ──────────────────────────────────────────────────────────
  // 0. CONSTANTS & STATE
  // ──────────────────────────────────────────────────────────

  const STORAGE_KEY   = 'ocd_notes';
  const FOLDERS_KEY   = 'ocd_folders';
  const SETTINGS_KEY  = 'ocd_notes_settings';
  const SYSTEM_FOLDER_IDS = new Set(['', 'default', '__pinned__']);

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function uid(prefix = 'n') {
    return typeof crypto?.randomUUID === 'function'
      ? `${prefix}-${crypto.randomUUID().slice(0, 8)}`
      : `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function debounce(fn, ms = 300) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  async function pdConfirm(input) {
    const pd = window.OpenCourseDeck;
    const fn = pd?.UI?.confirm ?? pd?.Modal?.confirmAsync;
    if (typeof fn === 'function') return fn(input);
    const message = input && typeof input === 'object' ? input.message : input;
    return window.confirm(String(message ?? 'Are you sure?'));
  }

  const RouteListeners = {
    items: [],
    on(target, type, handler, options) {
      if (!target) return;
      target.addEventListener(type, handler, options);
      this.items.push({ target, type, handler, options });
    },
    clear() {
      for (const { target, type, handler, options } of this.items) {
        try { target.removeEventListener(type, handler, options); } catch {}
      }
      this.items = [];
    },
  };

  function escHtml(str) {
    return String(str).replace(
      /[&<>"']/g,
      m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])
    );
  }

  // Sprite-backed inline icon (see index.html icon sprite). Folder icons are
  // stored as free text for backwards compatibility; legacy emoji values map
  // onto sprite ids so old libraries render with the vector set.
  const FOLDER_ICON_ALIASES = {
    'Folder': 'folder', '📁': 'folder', '📂': 'folder-open',
    '💼': 'briefcase', '🗄️': 'archive', '🗄': 'archive', '📦': 'archive',
    '🗒️': 'notes', '🗒': 'notes', '📝': 'note', '📄': 'file-text',
    '📌': 'pin', '⭐': 'spark', '🔥': 'flame', '🏆': 'trophy', '💡': 'lightbulb',
  };
  function spriteIcon(id, className = 'icon') {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(svgNS, 'use');
    use.setAttribute('href', `#i-${id}`);
    svg.appendChild(use);
    return svg;
  }
  function folderIconNode(icon) {
    const raw = String(icon || '').trim();
    const id = FOLDER_ICON_ALIASES[raw] || (/^[a-z][a-z0-9-]*$/.test(raw) && document.getElementById(`i-${raw}`) ? raw : null);
    if (id) return spriteIcon(id);
    if (!raw) return spriteIcon('folder');
    // Legacy/custom icons (usually a single emoji) render as inert text;
    // .folder-icon clips anything longer than the glyph slot.
    const span = document.createElement('span');
    span.className = 'folder-icon-text';
    span.textContent = raw;
    return span;
  }

  // Parse into an inert DOMParser document: assigning innerHTML to an element
  // of the live document (even a detached one) starts image/media loads, so
  // listing or exporting a note would ping any remote URL it references.
  function inertTextContent(html) {
    const source = String(html ?? '');
    if (!source.includes('<') && !source.includes('&')) return source;
    try {
      return new DOMParser().parseFromString(source, 'text/html').body?.textContent ?? '';
    } catch {
      return source.replace(/<[^>]*>/g, ' ');
    }
  }

  function plainTextFromHtml(html) {
    return inertTextContent(html).replace(/\s+/g, ' ').trim();
  }

  function safeFilename(name, fallback = 'note') {
    return String(name || fallback)
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || fallback;
  }

  // ──────────────────────────────────────────────────────────
  // 1. DATA STORE
  // ──────────────────────────────────────────────────────────

  const Store = {
    _hydrated: false,
    _notes: null,
    _folders: null,
    _settings: null,

    _hasWriteBridge(method) {
      return typeof window.DB?.[method] === 'function';
    },

    _readArray(key, fallback = []) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key));
        return Array.isArray(parsed) ? parsed : fallback.slice();
      } catch {
        return fallback.slice();
      }
    },

    _readObject(key, fallback = {}) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? { ...parsed }
          : { ...fallback };
      } catch {
        return { ...fallback };
      }
    },

    _storageErrorInfo(err) {
      const name = err?.name || '';
      const message = err?.message || String(err || '');
      return {
        name,
        message,
        quota: /quota|storage|disk|full/i.test(`${name} ${message}`),
      };
    },

    _emitStorageIssue(type, detail) {
      const payload = { ...detail, at: Date.now() };
      window.OpenCourseDeck = window.OpenCourseDeck || {};
      window.OpenCourseDeck.lastStorageIssue = payload;
      try { window.OpenCourseDeck?.bus?.emit?.(type, payload); } catch {}
      try {
        if (typeof CustomEvent === 'function') {
          window.dispatchEvent?.(new CustomEvent(`ocd:${type}`, { detail: payload }));
        }
      } catch {}
      return payload;
    },

    _writeLocal(key, value, kind, record = null) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return { ok: true };
      } catch (err) {
        const error = this._storageErrorInfo(err);
        this._emitStorageIssue('storage:save-error', {
          kind,
          backend: 'localStorage',
          key,
          record,
          error,
        });
        return { ok: false, error };
      }
    },

    _newerRecord(a, b) {
      const at = Number(a?.updatedAt ?? a?.createdAt ?? 0);
      const bt = Number(b?.updatedAt ?? b?.createdAt ?? 0);
      if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at > bt ? a : b;
      return b ?? a;
    },

    _mergeById(localRecords = [], dbRecords = []) {
      const byId = new Map();
      [...localRecords, ...dbRecords].forEach(record => {
        if (!record || typeof record !== 'object') return;
        const id = String(record.id || '').trim();
        if (!id) return;
        byId.set(id, byId.has(id) ? this._newerRecord(byId.get(id), { ...record, id }) : { ...record, id });
      });
      return [...byId.values()];
    },

    _coerceFolderId(folderId) {
      const id = String(folderId || '').trim();
      return id && id !== '__pinned__' ? id : 'default';
    },

    isSystemFolder(id) {
      return SYSTEM_FOLDER_IDS.has(String(id || '').trim());
    },

    _normalizeFolder(folder) {
      if (!folder || typeof folder !== 'object') return null;
      const id = String(folder.id || '').trim();
      if (!id || id === '__pinned__') return null;
      return {
        ...folder,
        id,
        name: String(folder.name || 'Untitled Folder').trim().slice(0, 120) || 'Untitled Folder',
        icon: String(folder.icon || 'folder').trim().slice(0, 64) || 'folder',
        color: String(folder.color || '').trim().slice(0, 64),
      };
    },

    async repairStorage(options = {}) {
      const DB = window.DB;
      const mirror = options.mirror ?? true;
      const localNotes = this._readArray(STORAGE_KEY);
      const localFolders = this._readArray(FOLDERS_KEY).map(folder => this._normalizeFolder(folder)).filter(Boolean);
      const localSettings = this._readObject(SETTINGS_KEY);
      let dbNotes = [];
      let dbFolders = [];
      let dbSettings = null;

      if (typeof DB?.getAllNotes === 'function') {
        try { dbNotes = await DB.getAllNotes(); } catch {}
      }
      if (typeof DB?.getAllFolders === 'function') {
        try { dbFolders = await DB.getAllFolders(); } catch {}
      }
      if (typeof DB?.getSetting === 'function') {
        try { dbSettings = await DB.getSetting(SETTINGS_KEY); } catch {}
      }

      const mergedNotes = this._mergeById(localNotes, Array.isArray(dbNotes) ? dbNotes : [])
        .map(note => ({ ...note, folderId: this._coerceFolderId(note.folderId) }));
      const mergedFolders = this._mergeById(localFolders, Array.isArray(dbFolders) ? dbFolders : [])
        .map(folder => this._normalizeFolder(folder))
        .filter(Boolean);
      const mergedSettings = {
        ...(localSettings && typeof localSettings === 'object' ? localSettings : {}),
        ...(dbSettings && typeof dbSettings === 'object' ? dbSettings : {}),
      };

      this._notes = mergedNotes.slice();
      this._folders = mergedFolders.slice();
      this._settings = { ...mergedSettings };

      if (typeof DB?.saveNote === 'function') {
        await Promise.allSettled(mergedNotes.map(note => DB.saveNote(note)));
      }
      if (typeof DB?.saveFolder === 'function') {
        await Promise.allSettled(mergedFolders.map(folder => DB.saveFolder(folder)));
      }
      if (typeof DB?.saveSetting === 'function') {
        await DB.saveSetting(SETTINGS_KEY, mergedSettings).catch?.(() => {});
      }

      if (mirror) {
        this.saveNotes(mergedNotes, { mirror: true });
        this.saveFolders(mergedFolders, { mirror: true });
        this.saveSettings(mergedSettings, { mirror: true });
      }

      const result = {
        notes: { local: localNotes.length, db: Array.isArray(dbNotes) ? dbNotes.length : 0, merged: mergedNotes.length },
        folders: { local: localFolders.length, db: Array.isArray(dbFolders) ? dbFolders.length : 0, merged: mergedFolders.length },
        settings: { merged: Object.keys(mergedSettings).length },
      };
      window.OpenCourseDeck = window.OpenCourseDeck ?? {};
      window.OpenCourseDeck.lastNotesRepairResult = result;
      return result;
    },

    async hydrateFromDB(options = {}) {
      const DB = window.DB;
      if (!DB || (this._hydrated && !options.force)) return false;
      let changed = false;
      // Canonical reads are asynchronous. A note created/edited/deleted after
      // getAllNotes() starts must not be overwritten by its earlier snapshot.
      // Record only mutations during this read, rather than merging the
      // entire localStorage mirror (which could resurrect old deletions).
      const overlay = new Map();
      this._activeHydrationReads.add(overlay);
      try {
        if (typeof DB.getAllNotes === 'function') {
          const notes = await DB.getAllNotes();
          if (Array.isArray(notes)) {
            const latest = notes.slice();
            for (const [id, updated] of overlay) {
              const index = latest.findIndex(note => String(note?.id) === id);
              if (updated === null) {
                if (index >= 0) latest.splice(index, 1);
              } else if (index >= 0) {
                latest[index] = updated;
              } else {
                latest.unshift(updated);
              }
            }
            this._notes = latest;
            changed = true;
          }
        }
      } catch {
        // Keep the existing in-memory draft when canonical reads are offline.
      } finally {
        this._activeHydrationReads.delete(overlay);
      }
      try {
        if (typeof DB.getAllFolders === 'function') {
          const folders = await DB.getAllFolders();
          if (Array.isArray(folders)) {
            this._folders = folders.slice();
            changed = true;
          }
        }
      } catch {}
      try {
        if (typeof DB.getSetting === 'function') {
          const settings = await DB.getSetting(SETTINGS_KEY);
          if (settings && typeof settings === 'object') {
            this._settings = { ...settings };
            changed = true;
          }
        }
      } catch {}
      this._hydrated = true;
      return changed;
    },

    // ── Notes ─────────────────────────────────────────────
    getNotes() {
      if (Array.isArray(this._notes)) return this._notes.slice();
      // Hydrate from DB (bridge/IndexedDB) if not yet hydrated, then use cached data
      if (!this._hydrated) {
        // Defer to the async hydration path; return localStorage data as fallback
        this._notes = this._readArray(STORAGE_KEY);
        return this._notes.slice();
      }
      // After hydration, prefer IndexedDB data from this._notes
      if (Array.isArray(this._notes)) return this._notes.slice();
      this._notes = this._readArray(STORAGE_KEY);
      return this._notes.slice();
    },

    saveNotes(notes, options = {}) {
      this._notes = Array.isArray(notes) ? notes.slice() : [];
      const shouldMirror = options.mirror ?? !this._hasWriteBridge('saveNote');
      if (!shouldMirror) return { ok: true, skipped: true };
      return this._writeLocal(STORAGE_KEY, this._notes, 'note-list', { count: this._notes.length });
    },

    _cacheNote(note, fallbackNotes = null) {
      for (const read of this._activeHydrationReads) {
        read.set(String(note.id), { ...note });
      }
      if (Array.isArray(fallbackNotes)) {
        this._notes = fallbackNotes.slice();
        return;
      }
      const notes = this.getNotes();
      const idx = notes.findIndex(n => n.id === note.id);
      if (idx >= 0) notes[idx] = note;
      else notes.unshift(note);
      this._notes = notes;
    },

    // Serialize writes for the same note ID. A new-note creation and the
    // editor's first save can otherwise complete in reverse order, restoring
    // an older empty body after the user's latest edit. Queue deletes as well
    // so an in-flight save cannot resurrect a removed record.
    _activeHydrationReads: new Set(),
    _noteWriteQueue: new Map(),

    _enqueueNoteMutation(id, action, operation) {
      const key = String(id);
      const durableReason = `notes-durable-write:${key}`;
      // Even ordinary autosaves must remain flagged until IndexedDB confirms
      // completion. A later success may clear an earlier failure for this
      // note, but cannot clear a different note's unsaved-work warning.
      window.OpenCourseDeck?.beforeUnload?.mark?.(durableReason);
      const previous = this._noteWriteQueue.get(key);
      let started;
      if (previous) {
        started = previous.then(operation);
      } else {
        // Preserve the existing immediate-first-call contract (the bridge is
        // invoked synchronously), while tracking asynchronous completion.
        try { started = Promise.resolve(operation()); }
        catch (error) { started = Promise.reject(error); }
      }
      const tracked = started.catch(error => {
        console.warn(`[Notes] DB.${action} failed`, error);
        window.OpenCourseDeck?.Toast?.error?.(
          action === 'save'
            ? 'Could not save this note to the database. Retry before leaving.'
            : 'Could not delete this note from the database.',
        );
        return false;
      });
      this._noteWriteQueue.set(key, tracked);
      void tracked.then(result => {
        // Do not acknowledge an older write if a newer write for this ID is
        // still outstanding. A failed latest write remains protected.
        if (this._noteWriteQueue.get(key) !== tracked) return;
        this._noteWriteQueue.delete(key);
        if (result !== false) {
          window.OpenCourseDeck?.beforeUnload?.unmark?.(durableReason);
        }
      });
      return tracked;
    },

    persistNote(note, fallbackNotes = null) {
      if (!note) return;
      this._cacheNote(note, fallbackNotes);
      if (typeof window.DB?.saveNote === 'function') {
        // Capture immutable values now, not when the queued operation starts.
        const snapshot = { ...note };
        return this._enqueueNoteMutation(note.id, 'save', () => window.DB.saveNote(snapshot));
      }
      return this.saveNotes(Array.isArray(fallbackNotes) ? fallbackNotes : this._notes);
    },

    getNote(id) {
      return this.getNotes().find(n => n.id === id) ?? null;
    },

    createNote(data = {}) {
      const note = {
        id:        uid('note'),
        title:     data.title     ?? 'Untitled Note',
        content:   data.content   ?? '',
        folderId:  this._coerceFolderId(data.folderId),
        tags:      data.tags      ?? [],
        pinned:    data.pinned    ?? false,
        color:     data.color     ?? '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        wordCount: 0,
        charCount: 0,
      };
      const notes = this.getNotes();
      notes.unshift(note);
      this.persistNote(note, notes);
      return note;
    },

    updateNote(id, patch) {
      const notes = this.getNotes();
      const idx   = notes.findIndex(n => n.id === id);
      if (idx === -1) return null;
      const cleanPatch = { ...(patch || {}) };
      if ('folderId' in cleanPatch) cleanPatch.folderId = this._coerceFolderId(cleanPatch.folderId);
      notes[idx] = {
        ...notes[idx],
        ...cleanPatch,
        updatedAt: Date.now(),
      };
      this.persistNote(notes[idx], notes);
      return notes[idx];
    },

    deleteNote(id) {
      for (const read of this._activeHydrationReads) read.set(String(id), null);
      const notes = this.getNotes().filter(n => n.id !== id);
      this._notes = notes;
      if (typeof window.DB?.deleteNote === 'function') {
        return this._enqueueNoteMutation(id, 'delete', () => window.DB.deleteNote(id));
      }
      return this.saveNotes(notes);
    },

    // ── Folders ───────────────────────────────────────────
    getFolders() {
      if (Array.isArray(this._folders)) return this._folders.slice();
      this._folders = this._readArray(FOLDERS_KEY, [
        { id: 'default', name: 'Personal',  icon: 'folder', color: '' },
        { id: 'work',    name: 'Work',      icon: 'briefcase', color: '' },
        { id: 'archive', name: 'Archive',   icon: 'archive', color: '' },
      ]);
      return this._folders.slice();
    },

    saveFolders(folders, options = {}) {
      this._folders = Array.isArray(folders) ? folders.slice() : [];
      const shouldMirror = options.mirror ?? !this._hasWriteBridge('saveFolder');
      if (!shouldMirror) return { ok: true, skipped: true };
      return this._writeLocal(FOLDERS_KEY, this._folders, 'folder-list', { count: this._folders.length });
    },

    _cacheFolder(folder, fallbackFolders = null) {
      if (Array.isArray(fallbackFolders)) {
        this._folders = fallbackFolders.slice();
        return;
      }
      const folders = this.getFolders();
      const idx = folders.findIndex(f => f.id === folder.id);
      if (idx >= 0) folders[idx] = folder;
      else folders.push(folder);
      this._folders = folders;
    },

    persistFolder(folder, fallbackFolders = null) {
      if (!folder) return;
      if (this.isSystemFolder(folder.id) && folder.id !== 'default') return;
      this._cacheFolder(folder, fallbackFolders);
      if (window.DB?.saveFolder) {
        try { window.DB.saveFolder(folder).catch?.(() => {}); return; } catch { /* fallback below */ }
      }
      this.saveFolders(Array.isArray(fallbackFolders) ? fallbackFolders : this._folders);
    },

    createFolder(name, icon = 'folder', color = '') {
      const cleanName = String(name || '').trim();
      if (!cleanName) return null;
      const folders = this.getFolders();
      const folder  = { id: uid('folder'), name: cleanName, icon, color };
      folders.push(folder);
      this.persistFolder(folder, folders);
      return folder;
    },

    deleteFolder(id) {
      if (this.isSystemFolder(id)) return { deleted: false, moved: 0 };
      const folders = this.getFolders().filter(f => f.id !== id);
      this._folders = folders;
      if (window.DB?.deleteFolder) {
        try { window.DB.deleteFolder(id).catch?.(() => {}); } catch { this.saveFolders(folders); }
      } else {
        this.saveFolders(folders);
      }
      // Move notes to default
      const movedNotes = [];
      const notes = this.getNotes().map(n => {
        if (n.folderId !== id) return n;
        const moved = { ...n, folderId: 'default', updatedAt: Date.now() };
        movedNotes.push(moved);
        return moved;
      });
      this._notes = notes;
      movedNotes.forEach(note => this.persistNote(note, notes));
      if (!window.DB?.saveNote) this.saveNotes(notes);
      return { deleted: true, moved: movedNotes.length };
    },

    // ── Settings ──────────────────────────────────────────
    getSettings() {
      if (this._settings && typeof this._settings === 'object') return { ...this._settings };
      this._settings = this._readObject(SETTINGS_KEY);
      return { ...this._settings };
    },
    saveSettings(s, options = {}) {
      this._settings = { ...(s ?? {}) };
      if (window.DB?.saveSetting) {
        try {
          window.DB.saveSetting(SETTINGS_KEY, this._settings).catch?.(() => {});
          if (!options.mirror) return { ok: true, skipped: true };
        } catch { /* fallback below */ }
      }
      const shouldMirror = options.mirror ?? !this._hasWriteBridge('saveSetting');
      if (!shouldMirror) return { ok: true, skipped: true };
      return this._writeLocal(SETTINGS_KEY, this._settings, 'note-settings', this._settings);
    },
  };


  // DOMPurify 3.4.17 is bundled by esbuild as an explicit module import;
  // no script-global race and no second home-made HTML sanitizer.
  const noteSanitizer = typeof DOMPurify.sanitize === 'function'
    ? DOMPurify : DOMPurify(window);

  const REMOTE_IMAGE_PERMISSION = 'ocd_note_external_images_session';

  function remoteImagesAllowed() {
    try { return sessionStorage.getItem(REMOTE_IMAGE_PERMISSION) === 'true'; }
    catch { return false; }
  }

  // DOMPurify guards script/markup safety; remote image loading is a separate
  // privacy concern. Work in an inert template so the transformation itself
  // cannot request third-party resources.
  function controlRemoteNoteImages(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html ?? '');
    const allow = remoteImagesAllowed();
    for (const image of template.content.querySelectorAll('img')) {
      const reference = image.getAttribute('data-remote-src') || image.getAttribute('src');
      if (!reference) continue;
      let resolved;
      try { resolved = new URL(reference, document.baseURI); }
      catch { image.removeAttribute('src'); continue; }
      if (!['http:', 'https:'].includes(resolved.protocol) || resolved.origin === location.origin) continue;
      image.setAttribute('data-remote-src', resolved.href);
      if (allow) {
        image.setAttribute('src', resolved.href);
      } else {
        image.removeAttribute('src');
        if (!image.getAttribute('alt')) image.setAttribute('alt', 'External image blocked');
      }
    }
    return template.innerHTML;
  }

  // ──────────────────────────────────────────────────────────
  // 2. EDITOR (ContentEditable Rich Text)
  // ──────────────────────────────────────────────────────────

  const Editor = {
    _squire: null,
    _squireChanged: false,
    _squireOriginal: null,

    async enableModern() {
      if (this._squire) return { ok: true, alreadyEnabled: true };
      if (!this._el || !this._currentId) return { ok: false, reason: 'no-note' };
      // Never replace the native editing surface mid-IME. Composition DOM is
      // provisional, and Squire would discard the browser's active composition.
      if (this._compositionActive) return { ok: false, reason: 'composing' };
      if (this._syncReadInProgress) return { ok: false, reason: 'synchronizing' };
      // Check the *original* HTML before sanitization. A schema-based editor
      // would otherwise drop unsupported saved metadata and silently replace
      // it when a title-only save occurs.
      const originalNote = Store.getNote(this._currentId);
      const { assessNoteForSquire } = await import('./src/features/notesSquireCompatibility.js');
      const preflight = assessNoteForSquire(originalNote?.content ?? '');
      if (!preflight.compatible) return { ok: false, reason: 'incompatible', detail: preflight.reason };
      // A compatible persisted record does not imply the current, unsaved
      // draft is compatible. Reject tables/images/styles in the live editor
      // BEFORE flushing a debounced save or replacing the DOM with Squire.
      const draftCheck = assessNoteForSquire(this._el.innerHTML);
      if (!draftCheck.compatible) {
        return { ok: false, reason: 'incompatible', detail: draftCheck.reason };
      }
      if (this._saveTimer) this.save(true);
      const node = this._el;
      const noteId = this._currentId;
      // Keep this mount identity fixed even if a deleted note is recovered
      // under a new ID without replacing the active Squire editor.
      const mountEpoch = this._loadEpoch;
      const original = node.innerHTML;
      const safe = this._sanitize(original);
      const before = node.innerHTML;
      let adapterModule;
      try {
        adapterModule = await import('./src/features/notesSquireAdapter.js');
      } catch (error) {
        console.warn('[Notes] Squire preview unavailable', error);
        return { ok: false, reason: 'unavailable' };
      }
      // Route unmounts, note switches, and intervening keystrokes must never
      // cause an async editor import to replace a newer user draft.
      if (node !== this._el || noteId !== this._currentId
          || this._loadEpoch !== mountEpoch
          || node.innerHTML !== before || !node.isConnected) {
        return { ok: false, reason: 'stale-mount' };
      }
      // An IME or storage refresh might start while the editor module loads.
      if (this._compositionActive) return { ok: false, reason: 'composing' };
      if (this._syncReadInProgress) return { ok: false, reason: 'synchronizing' };
      try {
        node.setAttribute('contenteditable', 'false');
        node.replaceChildren();
        const instance = adapterModule.createSquireNoteEditor({
          element: node,
          html: safe,
          onUpdate: () => {
            // The current ID may be rebound to a recovered copy after remote
            // deletion; the mount epoch, not the old note ID, owns the editor.
            if (this._el !== node || this._loadEpoch !== mountEpoch || !this._currentId) return;
            this._squireChanged = true;
            this._onInput();
          },
        });
        this._squire = instance;
        this._squireOriginal = safe;
        this._squireChanged = false;
        // Squire owns the accessible textbox while mounted; avoid two nested
        // textbox roles announcing the same note content to screen readers.
        node.removeAttribute('role');
        node.removeAttribute('aria-multiline');
        node.removeAttribute('aria-label');
        return { ok: true };
      } catch (error) {
        node.replaceChildren();
        node.innerHTML = original;
        node.setAttribute('contenteditable', 'true');
        console.warn('[Notes] Squire preview rejected this note', error);
        return { ok: false, reason: 'incompatible' };
      }
    },

    disableModern({ preserveContent = true } = {}) {
      if (!this._squire) return false;
      // Squire batches DOM input notifications via MutationObserver. Capture
      // any unobserved final keystroke before asking getContent() whether the
      // document changed; otherwise an immediate fallback can restore the
      // previous HTML and silently discard the latest edit.
      if (preserveContent && this._squire.syncChanges() === false) return false;
      const preserved = preserveContent ? this.getContent() : '';
      try { this._squire.destroy(); } catch {}
      this._squire = null;
      this._squireOriginal = null;
      this._squireChanged = false;
      if (this._el) {
        this._el.replaceChildren();
        this._el.setAttribute('contenteditable', 'true');
        this._el.setAttribute('role', 'textbox');
        this._el.setAttribute('aria-multiline', 'true');
        this._el.setAttribute('aria-label', 'Note editor');
        if (preserveContent) this._el.innerHTML = preserved;
      }
      // The classic snapshot stack predates the Squire editing session.
      // Continuing to undo through it can silently restore obsolete content.
      // Start a clean classic history boundary at the preserved document.
      this._history = [];
      this._historyIdx = -1;
      if (preserveContent && this._el) this._snapshot();
      return true;
    },
    _el:         null,
    _currentId:  null,
    // Distinguishes a new editor session even when reopening the same note.
    _loadEpoch:  0,
    // An IME composition is an unsaved draft even when Squire deliberately
    // suppresses input/autosave notifications until compositionend.
    _compositionActive: false,
    // A remote hydration must settle before any local autosave can write
    // a note that may have been deleted in another window.
    _syncReadInProgress: 0,
    _saveTimer:  null,
    _history:    [],      // undo stack (snapshots)
    _historyIdx: -1,
    _maxHistory: 100,

    // ── Toolbar commands ───────────────────────────────────
    COMMANDS: {
      bold:          () => document.execCommand('bold'),
      italic:        () => document.execCommand('italic'),
      underline:     () => document.execCommand('underline'),
      strikethrough: () => document.execCommand('strikeThrough'),
      h1:            () => document.execCommand('formatBlock', false, 'h1'),
      h2:            () => document.execCommand('formatBlock', false, 'h2'),
      h3:            () => document.execCommand('formatBlock', false, 'h3'),
      paragraph:     () => document.execCommand('formatBlock', false, 'p'),
      ul:            () => document.execCommand('insertUnorderedList'),
      ol:            () => document.execCommand('insertOrderedList'),
      blockquote:    () => document.execCommand('formatBlock', false, 'blockquote'),
      code:          () => Editor._wrapSelection('code'),
      codeblock:     () => Editor._insertCodeBlock(),
      link:          () => Editor._promptLink(),
      image:         () => Editor._promptImage(),
      table:         () => Editor._insertTable(),
      hr:            () => document.execCommand('insertHorizontalRule'),
      alignLeft:     () => document.execCommand('justifyLeft'),
      alignCenter:   () => document.execCommand('justifyCenter'),
      alignRight:    () => document.execCommand('justifyRight'),
      alignJustify:  () => document.execCommand('justifyFull'),
      indent:        () => document.execCommand('indent'),
      outdent:       () => document.execCommand('outdent'),
      undo:          () => Editor.undo(),
      redo:          () => Editor.redo(),
      clearFormat:   () => document.execCommand('removeFormat'),
    },

    // ── Mount ─────────────────────────────────────────────
    mount(editorEl) {
      this._el = editorEl;
      this._el.setAttribute('contenteditable', 'true');
      this._el.setAttribute('role', 'textbox');
      this._el.setAttribute('aria-multiline', 'true');
      this._el.setAttribute('spellcheck', 'true');
      this._el.setAttribute('data-placeholder', 'Start writing your note...');

      // Input → autosave + snapshot
      RouteListeners.on(this._el, 'input', e => {
        // Squire owns its edit/IME notifications; a bubbled input must not
        // schedule a separate save with an unfinished composition string.
        if (this._squire || e.isComposing) return;
        this._onInput();
        this._scheduleSnapshot();
      });
      RouteListeners.on(this._el, 'compositionstart', () => {
        this._compositionActive = true;
      });
      RouteListeners.on(this._el, 'compositionend', () => {
        this._compositionActive = false;
        // Some browsers do not issue a second input after completing IME.
        // Squire owns the modern editor's final-composition notification.
        if (!this._squire) this._onInput();
      });

      // Keyboard shortcuts
      RouteListeners.on(this._el, 'keydown', e => this._onKeydown(e));

      // Paste — strip external formatting
      RouteListeners.on(this._el, 'paste', e => this._onPaste(e));

      // Update toolbar state on selection change
      // Guard against stale listener from destroyed/mounted editor instances
      const mountId = this._mountId = (this._mountId || 0) + 1;
      RouteListeners.on(document, 'selectionchange', debounce(() => {
        const editor = this._el;
        if (!editor || !editor.isConnected) return;
        // If this editor instance has been superseded by a newer mount, skip
        if (this._mountId !== mountId) return;
        if (document.activeElement === editor || editor.contains(document.activeElement)) {
          this._updateToolbar();
        }
      }, 100));
    },

    // ── Load note into editor ─────────────────────────────
    load(note, { preventScroll = false } = {}) {
      if (!note || !this._el) return;
      this._loadEpoch += 1;
      this._compositionActive = false;
      this.disableModern({ preserveContent: false });
      this._currentId  = note.id;
      this._setRichHTML(note.content || '');
      this._history    = [];
      this._historyIdx = -1;
      this._snapshot();
      this._el.focus({ preventScroll });

      // Update title field
      const titleEl = $('[data-note-title-input]');
      if (titleEl) titleEl.value = note.title;

      this._updateMeta(note);
      window.OpenCourseDeck?.beforeUnload?.unmark?.('notes-body');
      window.OpenCourseDeck?.beforeUnload?.unmark?.('notes-title');
    },

    // ── Get current HTML ──────────────────────────────────
    getContent() {
      const html = this._squire
        ? (this._squireChanged ? this._squire.getHTML() : this._squireOriginal)
        : this._el?.innerHTML;
      return this._sanitize(html ?? '');
    },

    // ── Save ──────────────────────────────────────────────
    save(immediate = false) {
      if (!this._currentId) return;
      clearTimeout(this._saveTimer);
      const sourceEpoch = this._loadEpoch;

      const doSave = () => {
        // Clear the handle before returning or re-arming; otherwise a stale
        // timer makes the dirty-draft check report false positives forever.
        this._saveTimer = null;
        // The editor may have been torn down while this callback was pending.
        if (!this._el) return;
        // A delayed save must not target a different note opened afterwards.
        // Recovery of a deleted note rebinds its ID without changing epoch.
        if (this._loadEpoch !== sourceEpoch) return;
        if (this._compositionActive) {
          // DOM content during an IME composition is provisional, not a
          // committed edit. Retry after compositionend without saving it.
          this._saveTimer = setTimeout(doSave, 150);
          return false;
        }
        if (this._syncReadInProgress) {
          // A canonical read must settle before any write may proceed.
          this._saveTimer = setTimeout(doSave, 150);
          return false;
        }
        if (this._squire) {
          // A final Squire mutation may predate its queued input event. Read
          // the live editor synchronously before saving or leaving the route.
          // syncChanges can schedule its own debounce through onUpdate, so
          // clear that redundant timer before performing the current write.
          if (this._squire.syncChanges() === false) {
            this._saveTimer = setTimeout(doSave, 150);
            return false;
          }
          clearTimeout(this._saveTimer);
          this._saveTimer = null;
        }
        const content  = this.getContent();
        const text     = this._squire ? this._squire.editor.getText() : (this._el.innerText ?? '');
        const words    = countWords(text);
        const chars    = text.length;
        // `?? ` does not catch the empty string, so clearing the title field
        // used to persist '' and render as a blank row in the notes list.
        const title    = $('[data-note-title-input]')?.value.trim() || 'Untitled';

        const updated = Store.updateNote(this._currentId, {
          content, title, wordCount: words, charCount: chars,
        });
        if (updated) {
          this._updateMeta(updated);
          this._showSaveIndicator();
          NotesList.refreshItem(updated);
          window.OpenCourseDeck?.beforeUnload?.unmark?.('notes-body');
          window.OpenCourseDeck?.bus?.emit('note:save', { note: updated });
        }
        return Boolean(updated);
      };

      if (immediate) {
        return doSave();
      } else {
        this._saveTimer = setTimeout(doSave, 800);
      }
    },

    // ── Undo / Redo ───────────────────────────────────────
    _snapshot() {
      if (this._squire) return;
      const html = this._el?.innerHTML ?? '';
      // Trim future history if we branched
      this._history = this._history.slice(0, this._historyIdx + 1);
      this._history.push(html);
      if (this._history.length > this._maxHistory) this._history.shift();
      this._historyIdx = this._history.length - 1;
    },

    _scheduleSnapshot: debounce(function() { Editor._snapshot(); }, 500),

    undo() {
      if (this._squire) { this._squire.run('undo'); return; }
      if (this._historyIdx <= 0) return;
      this._historyIdx--;
      this._setRichHTML(this._history[this._historyIdx]);
      this._placeCursorAtEnd();
    },

    redo() {
      if (this._squire) { this._squire.run('redo'); return; }
      if (this._historyIdx >= this._history.length - 1) return;
      this._historyIdx++;
      this._setRichHTML(this._history[this._historyIdx]);
      this._placeCursorAtEnd();
    },

    _setRichHTML(html) {
      if (!this._el) return;
      if (this._squire) this._squire.setContent(this._sanitize(html));
      else this._el.innerHTML = this._sanitize(html);
    },

    // ── Keyboard shortcuts ────────────────────────────────
    _onKeydown(e) {
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === 's') { e.preventDefault(); this.save(true); return; }
      // Slash commands are a Notes UX feature, not tied to a particular
      // editing engine. Let Squire keep its own formatting/history shortcuts.
      if (!e.isComposing && e.key === '/' && this._isEmptyBlock()) {
        this._showSlashMenu();
      }
      if (this._squire) return;
      if (ctrl && e.key === 'z') { e.preventDefault(); this.undo(); return; }
      if (ctrl && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); this.redo(); return; }
      if (ctrl && e.key === 'b') { e.preventDefault(); this.COMMANDS.bold(); return; }
      if (ctrl && e.key === 'i') { e.preventDefault(); this.COMMANDS.italic(); return; }
      if (ctrl && e.key === 'u') { e.preventDefault(); this.COMMANDS.underline(); return; }
      if (ctrl && e.key === 'k') { e.preventDefault(); this.COMMANDS.link(); return; }

      // Tab → indent
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) this.COMMANDS.outdent();
        else document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;');
      }

    },

    // ── Paste handler ─────────────────────────────────────
    _onPaste(e) {
      if (this._squire) return; // Squire owns paste parsing and history.
      e.preventDefault();
      const text = e.clipboardData.getData('text/html')
        || e.clipboardData.getData('text/plain');
      // Sanitize
      const clean = this._sanitize(text);
      document.execCommand('insertHTML', false, clean);
    },

    _sanitize(html) {
      return controlRemoteNoteImages(sanitizeNoteStyles(noteSanitizer.sanitize(String(html ?? ''), {
        // The note privacy gate handles HTML <img>, not SVG <image>/<use>/
        // <feImage>. HTML-only sanitization forbids network-loading foreign
        // content even if an imported note contains SVG resource references.
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['script', 'style', 'meta', 'link', 'iframe', 'object', 'embed', 'form'],
        FORBID_ATTR: ['srcset', 'sizes'],
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
      })));
    },

    // ── Toolbar state sync ────────────────────────────────
    _updateToolbar() {
      if (this._squire) {
        $$('[data-cmd]').forEach(btn => btn.classList.toggle('active', this._squire.isActive(btn.dataset.cmd)));
        return;
      }
      const commands = ['bold', 'italic', 'underline', 'strikeThrough',
                        'justifyLeft', 'justifyCenter', 'justifyRight'];
      commands.forEach(cmd => {
        const btn = $(`[data-cmd="${cmd.toLowerCase()}"]`);
        if (btn) btn.classList.toggle('active', document.queryCommandState(cmd));
      });

      // Block format
      const block = document.queryCommandValue('formatBlock');
      $$('[data-cmd-block]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.cmdBlock === block);
      });
    },

    // ── Insert helpers ────────────────────────────────────
    _wrapSelection(tag) {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      if (range.collapsed) return;
      try {
        const node = document.createElement(tag);
        range.surroundContents(node);
      } catch {
        const fragment = range.extractContents();
        const node = document.createElement(tag);
        node.appendChild(fragment);
        range.insertNode(node);
        sel.removeAllRanges();
        const newRange = document.createRange();
        newRange.selectNodeContents(node);
        sel.addRange(newRange);
      }
    },

    _insertCodeBlock() {
      const sel = window.getSelection();
      const pre  = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = sel?.toString() || 'code here';
      pre.appendChild(code);
      if (!sel || !sel.rangeCount) {
        this._el?.appendChild(pre);
        return;
      }
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(pre);
    },

    _promptLink() {
      const url = window.prompt('Enter URL:', 'https://');
      if (!url) return;
      if (/^\s*javascript:/i.test(url) || /^\s*data:text\/html/i.test(url)) return;
      document.execCommand('createLink', false, url);
    },

    _promptImage() {
      const url = window.prompt('Enter image URL:');
      if (!url) return;
      if (!/^(https?:|data:image\/)/i.test(url.trim())) return;
      document.execCommand('insertImage', false, url);
    },

    _insertTable(rows = 3, cols = 3) {
      let html = '<table class="note-table"><tbody>';
      for (let r = 0; r < rows; r++) {
        html += '<tr>';
        for (let c = 0; c < cols; c++) {
          html += r === 0
            ? `<th contenteditable="true">Header ${c + 1}</th>`
            : `<td contenteditable="true">Cell</td>`;
        }
        html += '</tr>';
      }
      html += '</tbody></table><p><br></p>';
      document.execCommand('insertHTML', false, html);
    },

    appendAISummary(summary) {
      // Never insert outside an active Squire root if an IME composition makes
      // it unsafe to switch editing engines yet.
      if (this._squire && !this.disableModern()) return false;
      if (!this._el || !this._currentId) return false;
      const lines = String(summary || '')
        .split(/\r?\n/)
        .map(line => line.replace(/^[-*]\s*/, '').trim())
        .filter(Boolean);
      if (!lines.length) return false;
      const html = [
        '<section data-ai-summary-block="true">',
        '<h2>AI summary</h2>',
        '<ul>',
        ...lines.map(line => `<li>${escHtml(line)}</li>`),
        '</ul>',
        '</section>',
      ].join('');
      this._el.insertAdjacentHTML('beforeend', this._sanitize(html));
      this._snapshot();
      this.save(true);
      this._placeCursorAtEnd();
      return true;
    },

    // ── Slash command menu ────────────────────────────────
    _slashMenu: null,

    _isEmptyBlock() {
      const sel   = window.getSelection();
      if (!sel.rangeCount) return false;
      const range = sel.getRangeAt(0);
      const block = range.startContainer?.parentElement?.closest(
        'p, h1, h2, h3, li, div'
      );
      return block ? block.textContent.trim() === '' : false;
    },

    _removeSlashPrefix() {
      const selection = window.getSelection();
      if (!selection?.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (!range.collapsed || !this._el?.contains(range.startContainer)) return;
      let textNode = range.startContainer;
      let offset = range.startOffset;
      if (textNode.nodeType === Node.ELEMENT_NODE && offset > 0) {
        const previous = textNode.childNodes[offset - 1];
        if (previous?.nodeType === Node.TEXT_NODE) {
          textNode = previous;
          offset = previous.textContent.length;
        }
      }
      if (textNode.nodeType !== Node.TEXT_NODE || offset < 1
          || textNode.textContent[offset - 1] !== '/') return;
      range.setStart(textNode, offset - 1);
      range.deleteContents();
      selection.removeAllRanges();
      selection.addRange(range);
    },

    _showSlashMenu() {
      this._hideSlashMenu();

      const items = [
        { label: 'Paragraph',        cmd: 'paragraph'  },
        { label: '# Heading 1',      cmd: 'h1'         },
        { label: '## Heading 2',     cmd: 'h2'         },
        { label: '### Heading 3',    cmd: 'h3'         },
        { label: '• Bullet list',    cmd: 'ul'         },
        { label: '1. Numbered list', cmd: 'ol'         },
        { label: '> Blockquote',     cmd: 'blockquote' },
        { label: '</> Code block',   cmd: 'codeblock'  },
        { label: '⊞ Table',          cmd: 'table'      },
        { label: '─ Divider',        cmd: 'hr'         },
      ];

      const sel  = window.getSelection();
      const selectionRange = sel?.rangeCount ? sel.getRangeAt(0) : null;
      const rect = selectionRange && typeof selectionRange.getBoundingClientRect === 'function'
        ? selectionRange.getBoundingClientRect() : { left: 0, bottom: 0 };

      const menu = document.createElement('div');
      menu.className = 'slash-menu';
      menu.style.cssText = `
        position: fixed;
        left: ${rect.left}px;
        top:  ${rect.bottom + 6}px;
        z-index: 9999;
      `;

      items.forEach(({ label, cmd }) => {
        const item = document.createElement('button');
        item.className = 'slash-menu-item';
        item.textContent = label;
        const apply = () => {
          // Focus restores Squire's saved selection after keyboard navigation.
          if (this._squire) this._squire.editor.commands.focus();
          else this._el?.focus();
          // Delete only the literal slash if one was actually typed, never an
          // arbitrary preceding character via document.execCommand('delete').
          this._removeSlashPrefix();
          if (this._squire?.supports(cmd)) {
            this._squire.run(cmd);
          } else {
            if (this._squire) {
              // Tables and other unsupported structures remain available in
              // the classic editor without losing a compatible existing note.
              this.disableModern();
              this._el?.focus();
              this._placeCursorAtEnd();
            }
            this.COMMANDS[cmd]?.();
          }
          this._hideSlashMenu();
        };
        RouteListeners.on(item, 'mousedown', ev => {
          ev.preventDefault();
          apply();
        });
        RouteListeners.on(item, 'click', ev => {
          // Keyboard activation triggers click(detail=0), not mousedown.
          if (ev.detail !== 0) return;
          ev.preventDefault();
          apply();
        });
        menu.appendChild(item);
      });

      // Keyboard nav
      let focused = -1;
      RouteListeners.on(menu, 'keydown', ev => {
        const btns = $$('.slash-menu-item', menu);
        if (ev.key === 'ArrowDown') { focused = (focused + 1) % btns.length; btns[focused]?.focus(); }
        if (ev.key === 'ArrowUp')   { focused = (focused - 1 + btns.length) % btns.length; btns[focused]?.focus(); }
        if (ev.key === 'Escape')    this._hideSlashMenu();
      });

      document.body.appendChild(menu);
      this._slashMenu = menu;

      // Close on outside click
      setTimeout(() => {
        RouteListeners.on(document, 'click', this._hideSlashMenu.bind(this), { once: true });
      }, 0);
    },

    _hideSlashMenu() {
      this._slashMenu?.remove();
      this._slashMenu = null;
    },

    // ── Helpers ───────────────────────────────────────────
    _onInput() {
      window.OpenCourseDeck?.beforeUnload?.mark?.('notes-body');
      this.save();
    },

    _updateMeta(note) {
      const wordEl  = $('[data-note-words]');
      const charEl  = $('[data-note-chars]');
      const dateEl  = $('[data-note-date]');
      if (wordEl) wordEl.textContent = `${note.wordCount ?? 0} words`;
      if (charEl) charEl.textContent = `${note.charCount ?? 0} chars`;
      if (dateEl) dateEl.textContent = `Edited ${this._relativeTime(note.updatedAt)}`;
    },

    _relativeTime(ts) {
      const diff = Date.now() - ts;
      if (diff < 60000)    return 'just now';
      if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
      return new Date(ts).toLocaleDateString();
    },

    _showSaveIndicator() {
      const el = $('[data-save-status]');
      if (!el) return;
      el.textContent = 'Saved';
      el.classList.add('visible');
      clearTimeout(el._timer);
      el._timer = setTimeout(() => { el.classList.remove('visible'); }, 2000);
    },

    _placeCursorAtEnd() {
      if (this._squire) { this._squire.editor.commands.focus('end'); return; }
      const range = document.createRange();
      const sel   = window.getSelection();
      range.selectNodeContents(this._el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    },
  };


  // ──────────────────────────────────────────────────────────
  // 3. NOTES LIST
  // ──────────────────────────────────────────────────────────

  const NotesList = {
    _container:    null,
    _activeId:     null,
    _filter:       { folderId: null, tag: null, query: '', _pinned: false },
    _semanticIds:  null,
    _sortBy:       'updatedAt',  // 'updatedAt' | 'createdAt' | 'title'
    _sortDir:      'desc',
    _renderBatchSize: 50,
    _renderTimer: null,
    _renderToken: 0,
    _textCache: new Map(),

    init(containerEl) {
      this._container = containerEl;
      this.render();
    },

    destroy() {
      this._clearRenderQueue();
      this._container = null;
      // The search input is recreated empty on each route mount. Reset its
      // singleton filters as well, otherwise a previous zero-result query
      // remains invisibly active and makes already-saved notes appear lost.
      this._filter.query = '';
      this._semanticIds = null;
    },

    _clearRenderQueue() {
      this._renderToken += 1;
      if (this._renderTimer) {
        clearTimeout(this._renderTimer);
        this._renderTimer = null;
      }
    },

    render() {
      if (!this._container) return;
      this._clearRenderQueue();
      let notes = Store.getNotes();
      this._pruneTextCache(notes);

      // Filter
      if (this._filter.folderId) notes = notes.filter(n => n.folderId === this._filter.folderId);
      if (this._filter.tag)      notes = notes.filter(n => n.tags.includes(this._filter.tag));
      if (this._filter._pinned)  notes = notes.filter(n => n.pinned);
      if (this._filter.query) {
        const q = this._filter.query.toLowerCase();
        notes = notes.filter(n =>
          n.title.toLowerCase().includes(q) ||
          (n.content ? this._plainText(n).toLowerCase().includes(q) : false)
        );
      }
      if (Array.isArray(this._semanticIds)) {
        const rank = new Map(this._semanticIds.map((id, index) => [id, index]));
        notes = notes.filter(n => rank.has(n.id));
        notes.sort((a, b) => rank.get(a.id) - rank.get(b.id));
      } else {

        // Sort
        notes.sort((a, b) => {
          let av = a[this._sortBy], bv = b[this._sortBy];
          if (this._sortBy === 'title') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
          if (av < bv) return this._sortDir === 'desc' ? 1 : -1;
          if (av > bv) return this._sortDir === 'desc' ? -1 : 1;
          return 0;
        });
      }

      // Pinned first
      const pinned   = notes.filter(n => n.pinned);
      const unpinned = notes.filter(n => !n.pinned);
      const sorted   = [...pinned, ...unpinned];

      this._container.replaceChildren();

      if (!sorted.length) {
        const empty = document.createElement('div');
        empty.className = 'notes-empty';
        const icon = document.createElement('div');
        icon.className = 'empty-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.appendChild(spriteIcon('file-text'));
        const text = document.createElement('div');
        text.className = 'empty-text';
        text.textContent = 'No notes found';
        const button = document.createElement('button');
        button.className = 'btn btn-primary btn-sm';
        button.dataset.action = 'new-note';
        button.type = 'button';
        button.append(spriteIcon('plus'), document.createTextNode(' New note'));
        empty.append(icon, text, button);
        this._container.appendChild(empty);
        return;
      }

      const total = sorted.length;
      const batchSize = Math.max(1, Number(this._renderBatchSize) || 50);
      const token = this._renderToken;
      let index = 0;
      const status = document.createElement('div');
      status.className = 'notes-render-status text-sm';
      status.setAttribute('aria-live', 'polite');
      status.dataset.notesRenderStatus = '';

      const renderBatch = () => {
        if (!this._container || token !== this._renderToken) return;
        const fragment = document.createDocumentFragment();
        const end = Math.min(total, index + batchSize);
        for (; index < end; index += 1) {
          fragment.appendChild(this._buildItem(sorted[index], index));
        }
        this._container.insertBefore(fragment, status.isConnected ? status : null);

        if (index < total) {
          status.textContent = `Showing ${index} of ${total} notes`;
          if (!status.isConnected) this._container.appendChild(status);
          this._renderTimer = setTimeout(renderBatch, 0);
        } else {
          this._renderTimer = null;
          status.remove();
        }
      };

      renderBatch();
    },

    _buildItem(note, index = 0) {
      const excerpt = this._plainText(note).slice(0, 100);
      const date    = this._relTime(note.updatedAt);
      const isActive = note.id === this._activeId;

      const item = document.createElement('div');
      item.className = `note-item ${isActive ? 'active' : ''} ${note.pinned ? 'pinned' : ''}`;
      item.dataset.noteId = note.id;
      item.role = 'button';
      item.tabIndex = isActive || (!this._activeId && index === 0) ? 0 : -1;
      if (isActive) item.setAttribute('aria-current', 'true');
      if (note.color) item.style.borderLeftColor = note.color;

      const header = document.createElement('div');
      header.className = 'note-item-header';

      const title = document.createElement('span');
      title.className = 'note-item-title';
      title.textContent = note.title;
      header.appendChild(title);

      if (note.pinned) {
        const pin = document.createElement('span');
        pin.className = 'note-pin';
        pin.title = 'Pinned';
        pin.setAttribute('aria-label', 'Pinned');
        pin.appendChild(spriteIcon('pin'));
        header.appendChild(pin);
      }

      const dateEl = document.createElement('span');
      dateEl.className = 'note-item-date';
      dateEl.textContent = date;
      header.appendChild(dateEl);
      item.appendChild(header);

      const excerptEl = document.createElement('div');
      excerptEl.className = 'note-item-excerpt';
      excerptEl.textContent = excerpt;
      item.appendChild(excerptEl);

      if (note.tags.length) {
        const tagsEl = document.createElement('div');
        tagsEl.className = 'note-item-tags';
        note.tags.forEach(tag => {
          const tagEl = document.createElement('span');
          tagEl.className = 'note-tag';
          tagEl.textContent = tag;
          tagsEl.appendChild(tagEl);
        });
        item.appendChild(tagsEl);
      }

      // Listeners are attached directly (not via RouteListeners): items are
      // rebuilt on every render/refresh, and registry entries would pin each
      // generation of detached nodes until route unmount. Direct listeners
      // are garbage-collected with their node.
      item.addEventListener('click', () => NotesApp.openNote(note.id));
      item.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          NotesApp.openNote(note.id);
          return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          this._focusByKeyboard(item, event.key);
        }
      });

      // Context menu
      item.addEventListener('contextmenu', e => {
        e.preventDefault();
        ContextMenu.show(e.clientX, e.clientY, [
          { label: note.pinned ? 'Unpin' : 'Pin',
            action: () => { Store.updateNote(note.id, { pinned: !note.pinned }); NotesList.render(); } },
          { label: 'Set color', action: () => NotesApp.promptColor(note.id) },
          { label: 'Edit tags', action: () => NotesApp.promptTags(note.id) },
          { label: 'Move to folder', action: () => NotesApp.promptMoveFolder(note.id) },
          { label: 'Duplicate', action: () => NotesApp.duplicateNote(note.id) },
          { label: 'Export as TXT', action: () => NotesApp.exportNote(note.id, 'txt') },
          { label: 'Export as HTML', action: () => NotesApp.exportNote(note.id, 'html') },
          { type: 'divider' },
          { label: 'Delete', danger: true, action: () => NotesApp.deleteNote(note.id) },
        ]);
      });

      return item;
    },

    _focusByKeyboard(current, key) {
      const items = Array.from(this._container?.querySelectorAll('[data-note-id]') ?? []);
      if (!items.length) return;
      const currentIndex = Math.max(0, items.indexOf(current));
      const nextIndex = key === 'Home'
        ? 0
        : key === 'End'
          ? items.length - 1
          : Math.min(items.length - 1, Math.max(0, currentIndex + (key === 'ArrowDown' ? 1 : -1)));
      items.forEach((item, index) => { item.tabIndex = index === nextIndex ? 0 : -1; });
      items[nextIndex]?.focus?.();
    },

    refreshItem(note) {
      const existing = this._container?.querySelector(`[data-note-id="${note.id}"]`);
      if (existing) {
        const fresh = this._buildItem(note);
        existing.replaceWith(fresh);
      }
    },

    setActive(id) {
      $$('.note-item', this._container).forEach(el =>
        {
          const active = el.dataset.noteId === id;
          el.classList.toggle('active', active);
          el.tabIndex = active ? 0 : -1;
          if (active) el.setAttribute('aria-current', 'true');
          else el.removeAttribute('aria-current');
        }
      );
      this._activeId = id;
    },

    setFilter(patch) {
      Object.assign(this._filter, patch);
      this.render();
    },

    setSemanticResults(ids = null) {
      this._semanticIds = Array.isArray(ids) ? ids : null;
      this.render();
    },

    _stripHTML(html) {
      return inertTextContent(html);
    },

    _plainText(note) {
      const raw = String(note?.content ?? '');
      const id = note?.id ?? raw;
      const cached = this._textCache.get(id);
      if (cached?.raw === raw) return cached.text;
      const text = this._stripHTML(raw);
      this._textCache.set(id, { raw, text });
      return text;
    },

    _pruneTextCache(notes) {
      const ids = new Set((notes || []).map(note => note?.id).filter(Boolean));
      for (const id of this._textCache.keys()) {
        if (!ids.has(id)) this._textCache.delete(id);
      }
    },

    _relTime(ts) {
      const d = Date.now() - ts;
      if (d < 60000)    return 'just now';
      if (d < 3600000)  return `${Math.floor(d / 60000)}m ago`;
      if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
      return new Date(ts).toLocaleDateString();
    },
  };


  // ──────────────────────────────────────────────────────────
  // 4. FOLDERS PANEL
  // ──────────────────────────────────────────────────────────

  const FoldersPanel = {
    _container: null,

    init(containerEl) {
      this._container = containerEl;
      this.render();

      // Add folder button
      RouteListeners.on(document, 'click', e => {
        if (e.target.closest('[data-action="add-folder"]')) this._promptNewFolder();
      });

      RouteListeners.on(this._container, 'click', e => this._handleClick(e), { capture: true });
    },

    render() {
      if (!this._container) return;
      const folders = Store.getFolders();
      const notes   = Store.getNotes();

      this._container.replaceChildren();
      this._container.appendChild(this._buildFolderItem({
        id: '',
        icon: 'notes',
        name: 'All Notes',
        count: notes.length,
        active: !NotesList._filter.folderId && !NotesList._filter._pinned,
        deletable: false,
      }));
      this._container.appendChild(this._buildFolderItem({
        id: '__pinned__',
        icon: 'pin',
        name: 'Pinned',
        count: notes.filter(n => n.pinned).length,
        active: NotesList._filter._pinned,
        deletable: false,
      }));

      folders.forEach(folder => {
        const count = notes.filter(n => n.folderId === folder.id).length;
        this._container.appendChild(this._buildFolderItem({
          id: folder.id,
          icon: folder.icon,
          name: folder.name,
          count,
          active: NotesList._filter.folderId === folder.id,
          deletable: !Store.isSystemFolder(folder.id),
        }));
      });

      // Footer: Add folder
      const addBtn = document.createElement('button');
      addBtn.className = 'btn btn-ghost btn-sm folder-add-btn';
      addBtn.setAttribute('data-action', 'add-folder');
      addBtn.textContent = '+ Add Folder';
      this._container.appendChild(addBtn);

    },

    _buildFolderItem({ id, icon, name, count, active, deletable }) {
      const item = document.createElement('div');
      item.className = `folder-item ${active ? 'active' : ''}`;
      item.dataset.folderId = id;

      const iconEl = document.createElement('span');
      iconEl.className = 'folder-icon';
      iconEl.setAttribute('aria-hidden', 'true');
      iconEl.appendChild(folderIconNode(icon));
      item.appendChild(iconEl);

      const nameEl = document.createElement('span');
      nameEl.className = 'folder-name';
      nameEl.textContent = name;
      item.appendChild(nameEl);

      const countEl = document.createElement('span');
      countEl.className = 'folder-count';
      countEl.textContent = String(count);
      item.appendChild(countEl);

      if (deletable) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'folder-delete-btn';
        deleteBtn.dataset.deleteFolder = id;
        deleteBtn.title = 'Delete folder';
        deleteBtn.textContent = '×';
        item.appendChild(deleteBtn);
      }

      return item;
    },

    async _handleClick(e) {
      const delBtn = e.target.closest('[data-delete-folder]');
      if (delBtn) {
        e.stopPropagation();
        if (Store.isSystemFolder(delBtn.dataset.deleteFolder)) return;
        if (await pdConfirm({
          title: 'Delete folder',
          message: 'Delete this folder? Notes in it will move to Personal.',
          confirmLabel: 'Delete folder',
          cancelLabel: 'Keep folder',
        })) {
          Store.deleteFolder(delBtn.dataset.deleteFolder);
          this.render();
          NotesList.render();
        }
        return;
      }
      const item = e.target.closest('[data-folder-id]');
      if (!item) return;
      const fid = item.dataset.folderId;
      if (fid === '__pinned__') {
        NotesList.setFilter({ folderId: null, tag: null, _pinned: true });
      } else {
        NotesList.setFilter({ folderId: fid || null, _pinned: false });
      }
      this.render();
    },

    _promptNewFolder() {
      const name = window.prompt('Folder name:');
      if (name?.trim()) {
        Store.createFolder(name.trim());
        this.render();
      }
    },
  };


  // ──────────────────────────────────────────────────────────
  // 5. TAGS CLOUD
  // ──────────────────────────────────────────────────────────

  const TagsCloud = {
    render(containerEl) {
      if (!containerEl) return;
      const notes   = Store.getNotes();
      const tagMap  = {};
      notes.forEach(n => n.tags.forEach(t => { tagMap[t] = (tagMap[t] ?? 0) + 1; }));

      containerEl.replaceChildren();
      if (!Object.keys(tagMap).length) {
        containerEl.textContent = 'No tags yet.';
        return;
      }

      Object.entries(tagMap).forEach(([tag, count]) => {
        const el = document.createElement('span');
        el.className = `note-tag ${NotesList._filter.tag === tag ? 'active' : ''}`;
        el.textContent = `${tag} (${count})`;
        RouteListeners.on(el, 'click', () => {
          NotesList.setFilter({ tag: NotesList._filter.tag === tag ? null : tag });
          TagsCloud.render(containerEl);
        });
        containerEl.appendChild(el);
      });
    },
  };


  // ──────────────────────────────────────────────────────────
  // 6. CONTEXT MENU
  // ──────────────────────────────────────────────────────────

  const ContextMenu = {
    _el: null,

    show(x, y, items) {
      this.hide();
      const menu = document.createElement('div');
      menu.className = 'context-menu';

      items.forEach(item => {
        if (item.type === 'divider') {
          menu.appendChild(document.createElement('hr'));
          return;
        }
        const btn = document.createElement('button');
        btn.className = `context-menu-item ${item.danger ? 'danger' : ''}`;
        btn.textContent = item.label;
        RouteListeners.on(btn, 'click', () => { item.action?.(); this.hide(); });
        menu.appendChild(btn);
      });

      // Viewport clamp
      document.body.appendChild(menu);
      const rect = menu.getBoundingClientRect();
      menu.style.left = `${Math.min(x, window.innerWidth  - rect.width  - 8)}px`;
      menu.style.top  = `${Math.min(y, window.innerHeight - rect.height - 8)}px`;

      this._el = menu;
      setTimeout(() => RouteListeners.on(document, 'click', this.hide.bind(this), { once: true }), 0);
    },

    hide() {
      this._el?.remove();
      this._el = null;
    },
  };


  // ──────────────────────────────────────────────────────────
  // 7. SEARCH
  // ──────────────────────────────────────────────────────────

  const NotesSearch = {
    init(inputEl) {
      if (!inputEl) return;
      // The singleton NotesList persists independently of route DOM. Always
      // reflect its current query in the new input (and the cleared value on
      // remount) so a hidden filter cannot make stored notes appear deleted.
      inputEl.value = NotesList._filter.query || '';
      RouteListeners.on(inputEl, 'input', debounce(e => {
        NotesList.setFilter({ query: e.target.value.trim() });
      }, 300));

      RouteListeners.on(inputEl, 'keydown', e => {
        if (e.key === 'Escape') { inputEl.value = ''; NotesList.setFilter({ query: '' }); }
      });
    },
  };


  // ──────────────────────────────────────────────────────────
  // 8. EXPORT / IMPORT
  // ──────────────────────────────────────────────────────────

  const NotesExport = {
    exportAll(format = 'json') {
      const notes = Store.getNotes();
      if (format === 'json') {
        this._download('notes.json', JSON.stringify(notes, null, 2), 'application/json');
      } else if (format === 'md') {
        const md = notes.map(n =>
          `# ${n.title}\n\n${noteHtmlToMarkdown(n.content)}\n\n---\n`
        ).join('\n');
        this._download('notes.md', md, 'text/markdown');
      }
    },

    exportNote(id, format = 'html') {
      const note = Store.getNote(id);
      if (!note) return;
      if (format === 'html') {
        const safeTitle = escHtml(note.title);
        const safeContent = Editor._sanitize(note.content);
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
          <title>${safeTitle}</title></head><body>
          <h1>${safeTitle}</h1>${safeContent}</body></html>`;
        this._download(`${safeFilename(note.title)}.html`, html, 'text/html');
      } else if (format === 'txt') {
        const safeContent = Editor._sanitize(note.content);
        this._download(`${safeFilename(note.title)}.txt`, `${note.title}\n\n${inertTextContent(safeContent)}`, 'text/plain');
      }
    },

    importJSON(file) {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const notes = JSON.parse(e.target.result);
          if (!Array.isArray(notes)) throw new Error('Invalid format');
          let imported = 0;
          let updated = 0;
          let skipped = 0;
          let invalid = 0;
          let conflicts = 0;
          const errors = [];
          notes.forEach(n => {
            const normalized = this._normalizeImportedNote(n);
            if (!normalized.ok) {
              invalid++;
              errors.push(normalized.error);
              return;
            }
            const note = normalized.note;
            const existing = Store.getNote(note.id);
            if (!existing) {
              const nextNotes = Store.getNotes();
              nextNotes.push(note);
              Store.persistNote(note, nextNotes);
              imported++;
            } else if (this._shouldReplaceNote(existing, note)) {
              const next = Store.getNotes().map(item => item.id === note.id ? note : item);
              Store.persistNote(note, next);
              updated++;
            } else {
              skipped++;
              conflicts++;
            }
          });
          window.OpenCourseDeck = window.OpenCourseDeck ?? {};
          window.OpenCourseDeck.lastNotesImportResult = { imported, updated, skipped, invalid, conflicts, errors };
          NotesList.render();
          window.OpenCourseDeck?.Toast?.success(`Imported ${imported} notes, updated ${updated}.`);
        } catch {
          window.OpenCourseDeck?.Toast?.error('Invalid JSON file.');
        }
      };
      reader.readAsText(file);
    },

    _normalizeImportedNote(raw) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { ok: false, error: { id: null, message: 'Note record must be an object.' } };
      }
      const now = Date.now();
      const id = String(raw.id || uid('note')).trim();
      if (!id) return { ok: false, error: { id: null, message: 'Note id is empty.' } };
      const createdAt = Number(raw.createdAt);
      const updatedAt = Number(raw.updatedAt);
      const content = typeof raw.content === 'string' ? raw.content : String(raw.content ?? '');
      const tags = Array.isArray(raw.tags)
        ? raw.tags
            .filter(tag => tag !== null && tag !== undefined)
            .map(tag => String(tag).trim())
            .filter(Boolean)
            .slice(0, 30)
        : [];
      return {
        ok: true,
        note: {
          id,
          title: String(raw.title || 'Imported Note').trim().slice(0, 200) || 'Imported Note',
          content: Editor._sanitize(content),
          folderId: Store._coerceFolderId(raw.folderId),
          tags,
          pinned: raw.pinned === true,
          color: String(raw.color || '').slice(0, 64),
          createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : now,
          updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : (Number.isFinite(createdAt) && createdAt > 0 ? createdAt : now),
          wordCount: Number.isFinite(Number(raw.wordCount)) ? Math.max(0, Number(raw.wordCount)) : 0,
          charCount: Number.isFinite(Number(raw.charCount)) ? Math.max(0, Number(raw.charCount)) : 0,
        },
      };
    },

    _shouldReplaceNote(existing, incoming) {
      const current = Number(existing?.updatedAt ?? existing?.createdAt ?? 0);
      const next = Number(incoming?.updatedAt ?? incoming?.createdAt ?? 0);
      return Number.isFinite(next) && next > current;
    },

    _download(filename, content, mime) {
      const blob = new Blob([content], { type: mime });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  };


  // ──────────────────────────────────────────────────────────
  // 9. TOOLBAR
  // ──────────────────────────────────────────────────────────

  const Toolbar = {
    init(toolbarEl) {
      if (!toolbarEl) return;
      const runCommand = btn => {
        const command = btn.dataset.cmdBlock || btn.dataset.cmd;
        if (Editor._squire) {
          if (Editor._squire.supports(command)) {
            Editor._squire.run(command);
            return;
          }
          // Unsupported advanced formatting requires the legacy schema.
          // Preserve the current HTML rather than silently strip styles.
          Editor.disableModern();
        }
        Editor.COMMANDS[command]?.();
      };

      // Pointer activation. mousedown (not click) with preventDefault is
      // deliberate: it stops the button from taking focus, which would collapse
      // the editor's selection before execCommand could act on it.
      RouteListeners.on(toolbarEl, 'mousedown', e => {
        const btn = e.target.closest('[data-cmd], [data-cmd-block]');
        if (!btn) return;
        e.preventDefault(); // prevent blur
        runCommand(btn);
      });

      // Keyboard activation. Enter and Space on a focused button dispatch
      // `click`, never `mousedown`, so with only the handler above every
      // formatting control -- bold, headings, lists, links, the lot -- was
      // completely unreachable without a mouse. A keyboard-synthesised click
      // reports detail 0, which distinguishes it from the pointer path above
      // and stops the command running twice.
      RouteListeners.on(toolbarEl, 'click', e => {
        if (e.detail !== 0) return;
        const btn = e.target.closest('[data-cmd], [data-cmd-block]');
        if (!btn) return;
        e.preventDefault();
        // Focus must go back to the editable before execCommand: it acts on
        // the focused editable, and focus is currently on the button. A
        // contenteditable restores its previous selection when refocused.
        if (Editor._squire) Editor._squire.editor.commands.focus();
        else Editor._el?.focus();
        runCommand(btn);
      });

      // Font size
      const sizeSelect = toolbarEl.querySelector('[data-font-size]');
      if (sizeSelect) {
        RouteListeners.on(sizeSelect, 'change', () => {
          if (Editor._squire?.supports('fontSize')) { Editor._squire.run('fontSize', sizeSelect.value); return; }
          if (Editor._squire) Editor.disableModern();
          document.execCommand('fontSize', false, sizeSelect.value);
        });
      }

      // Font family
      const fontSelect = toolbarEl.querySelector('[data-font-family]');
      if (fontSelect) {
        RouteListeners.on(fontSelect, 'change', () => {
          if (Editor._squire?.supports('fontFamily')) { Editor._squire.run('fontFamily', fontSelect.value); return; }
          if (Editor._squire) Editor.disableModern();
          document.execCommand('fontName', false, fontSelect.value);
        });
      }

      // Text color
      const colorInput = toolbarEl.querySelector('[data-text-color]');
      if (colorInput) {
        RouteListeners.on(colorInput, 'input', () => {
          if (Editor._squire?.supports('textColor')) { Editor._squire.run('textColor', colorInput.value); return; }
          if (Editor._squire) Editor.disableModern();
          document.execCommand('foreColor', false, colorInput.value);
        });
      }

      // Highlight color
      const hlInput = toolbarEl.querySelector('[data-highlight-color]');
      if (hlInput) {
        RouteListeners.on(hlInput, 'input', () => {
          if (Editor._squire?.supports('highlightColor')) { Editor._squire.run('highlightColor', hlInput.value); return; }
          if (Editor._squire) Editor.disableModern();
          document.execCommand('hiliteColor', false, hlInput.value);
        });
      }
    },
  };


  // ──────────────────────────────────────────────────────────
  // 10. MAIN APP CONTROLLER
  // ──────────────────────────────────────────────────────────

  const NotesApp = {
    _inited: false,
    _syncHandler: null,
    init() {
      if (this._inited) return;
      // Only initialize when the notes view DOM exists (supports SPA route injection).
      if (!document.querySelector('[data-notes-editor]')) return;
      this._inited = true;
      // Mount editor
      const editorEl = $('[data-notes-editor]');
      if (editorEl) Editor.mount(editorEl);

      // Init list
      NotesList.init($('[data-notes-list]'));

      // Init folders
      FoldersPanel.init($('[data-folders-panel]'));

      // Init tags
      TagsCloud.render($('[data-tags-cloud]'));

      // Init search
      NotesSearch.init($('[data-notes-search]'));
      this._initSemanticSearch();

      // Init toolbar
      Toolbar.init($('[data-notes-toolbar]'));
      this._initAIControls();
      const remoteToggle = $('[data-notes-remote-images]');
      if (remoteToggle) {
        remoteToggle.setAttribute('aria-pressed', remoteImagesAllowed() ? 'true' : 'false');
        remoteToggle.textContent = remoteImagesAllowed() ? 'Block external images' : 'Load external images';
        RouteListeners.on(remoteToggle, 'click', () => {
          // Changing image permissions remounts the editor. An active IME
          // composition or unresolved storage sync must stay in the original
          // live DOM; never overwrite it with the last saved HTML.
          // Commit the current draft *before* changing session-only consent:
          // a rejected save must neither lose the draft nor flip permission.
          if (!this._commitCurrentBeforeSwitch()) return;
          const next = !remoteImagesAllowed();
          try {
            if (next) sessionStorage.setItem(REMOTE_IMAGE_PERMISSION, 'true');
            else sessionStorage.removeItem(REMOTE_IMAGE_PERMISSION);
          } catch {
            window.OpenCourseDeck?.Toast?.error?.('Image permission could not be saved for this session');
            return;
          }
          remoteToggle.setAttribute('aria-pressed', next ? 'true' : 'false');
          remoteToggle.textContent = next ? 'Block external images' : 'Load external images';
          // Leave remote loading off again on restart; it is session-only.
          const note = Store.getNote(Editor._currentId);
          if (note) Editor.load(note, { preventScroll: true });
          const modernToggle = $('[data-notes-modern-toggle]');
          if (modernToggle && !Editor._squire) modernToggle.textContent = 'Try Squire editor';
        });
      }

      // Squire owns ordinary HTML-canonical Notes by default in this
      // prelaunch release. A visible classic toggle remains an explicit
      // fallback, and complex saved HTML is never converted automatically.
      const modernToggle = $('[data-notes-modern-toggle]');
      if (modernToggle) {
        modernToggle.hidden = false;
        RouteListeners.on(modernToggle, 'click', async () => {
          if (Editor._squire) {
            // Do not end an in-progress IME composition or discard an unsaved
            // last mutation merely to switch editing engines.
            if (!Editor.disableModern()) return;
          } else {
            const result = await this.enableModernEditor();
            if (!result.ok) {
              window.OpenCourseDeck?.Toast?.info?.(
                result.reason === 'incompatible'
                  ? 'This note needs the classic editor to preserve its formatting.'
                  : 'The Squire editor is unavailable; continue in classic mode.',
              );
            }
          }
          modernToggle.textContent = Editor._squire
            ? 'Use classic editor' : 'Try Squire editor';
        });
      }

      // Title input
      const titleInput = $('[data-note-title-input]');
      if (titleInput) {
        RouteListeners.on(titleInput, 'input', () => {
          window.OpenCourseDeck?.beforeUnload?.mark?.('notes-title');
          clearTimeout(titleInput._pdTitleT);
          titleInput._pdTitleT = setTimeout(() => {
            titleInput._pdTitleT = null;
            if (Editor._currentId) {
              Store.updateNote(Editor._currentId, { title: titleInput.value.trim() || 'Untitled' });
              NotesList.render();
            }
            window.OpenCourseDeck?.beforeUnload?.unmark?.('notes-title');
          }, 500);
        });
      }

      // New note button
      RouteListeners.on(document, 'click', e => {
        const t = e?.target;
        const target = t && t.nodeType === 1 ? t : t?.parentElement;
        if (!target) return;
        if (target.closest('[data-action="new-note"]')) this.newNote();
        if (target.closest('[data-action="export-all"]')) NotesExport.exportAll('json');
        if (target.closest('[data-action="export-md"]'))  NotesExport.exportAll('md');
        if (target.closest('[data-action="import-notes"]')) {
          const input = document.createElement('input');
          input.type = 'file'; input.accept = '.json';
          input.onchange = e => NotesExport.importJSON(e.target.files[0]);
          input.click();
        }
      });

      // Open the first locally known note immediately, but defer the
      // "create a starter note" decision until IndexedDB hydration: for
      // users whose notes live only in the DB the localStorage mirror is
      // empty, and creating here would persist a spurious "Untitled Note"
      // on every page load.
      const notes = Store.getNotes();
      if (notes.length) this.openNote(notes[0].id, { preventScroll: true });

      this._bindSyncRefresh();
      Store.hydrateFromDB().then((changed) => {
        if (!this._inited) return;
        if (changed) this._renderAfterCanonicalRefresh({ preserveDirtyEditor: true });
        const hydrated = Store.getNotes();
        if (!hydrated.length) this.newNote(undefined, { preventScroll: true });
        else if (!notes.length) this.openNote(hydrated[0].id, { preventScroll: true });
      }).catch(() => {
        if (this._inited && !Store.getNotes().length) this.newNote(undefined, { preventScroll: true });
      });
    },

    _bindSyncRefresh() {
      const bus = window.OpenCourseDeck?.bus;
      if (!bus?.on || this._syncHandler) return;
      this._syncHandler = payload => {
        this.refreshFromSync(payload).catch?.(() => {});
      };
      bus.on('sync:message', this._syncHandler);
    },

    _unbindSyncRefresh() {
      const bus = window.OpenCourseDeck?.bus;
      if (this._syncHandler) bus?.off?.('sync:message', this._syncHandler);
      this._syncHandler = null;
    },

    _hasPendingLocalEdit() {
      const titleInput = $('[data-note-title-input]');
      return Boolean(Editor._compositionActive || Editor._saveTimer || titleInput?._pdTitleT);
    },

    _renderAfterCanonicalRefresh(options = {}) {
      const pendingLocalEdit = options.preserveDirtyEditor
        && (options.forcePreserveEditor === true || this._hasPendingLocalEdit());
      const currentId = Editor._currentId;
      NotesList.render();
      FoldersPanel.render();
      TagsCloud.render($('[data-tags-cloud]'));

      const current = currentId && Store.getNote(currentId);
      if (current) {
        // Other notes/folders syncing must not destroy a Squire editor,
        // its selection, or its undo stack when the open note is unchanged.
        const contentMatches = Editor._el
          && Editor.getContent() === Editor._sanitize(current.content || '');
        const shouldReload = !pendingLocalEdit && !contentMatches;
        if (shouldReload) {
          Editor.load(current, { preventScroll: true });
        } else if (!pendingLocalEdit) {
          // Apply a remote title-only change without rebuilding the editor.
          const titleInput = $('[data-note-title-input]');
          if (titleInput) titleInput.value = current.title;
          Editor._updateMeta(current);
        }
        NotesList.setActive(current.id);
        return { currentId: current.id, editorReloaded: Boolean(shouldReload) };
      }

      const notes = Store.getNotes();
      if (notes.length) {
        // The previous ID might have been deleted by the canonical sync.
        // With no dirty local draft, activate the reconciled note directly
        // rather than trying to save the now-absent source record.
        const reloaded = !pendingLocalEdit
          && this._activateSavedNote(notes[0].id, { preventScroll: true });
        return { currentId: notes[0].id, editorReloaded: Boolean(reloaded) };
      }

      return { currentId: null, editorReloaded: false };
    },

    async refreshFromSync(payload = {}) {
      if (!this._inited) return { refreshed: false, reason: 'not-inited' };
      if (!document.querySelector('[data-notes-editor]')) return { refreshed: false, reason: 'missing-dom' };
      const kind = payload?.kind;
      if (!['note', 'folder', 'setting'].includes(kind)) {
        return { refreshed: false, reason: 'ignored-kind' };
      }

      const editedNoteId = Editor._currentId;
      const sourceElement = Editor._el;
      const sourceEpoch = Editor._loadEpoch;
      // Flush any pending Squire MutationObserver notification before the
      // canonical read. An unfinished IME composition stays in the live editor.
      if (Editor._squire && !Editor._compositionActive) Editor._squire.syncChanges();
      const previousNote = editedNoteId && Store.getNote(editedNoteId);
      const dirtyBeforeSync = this._hasPendingLocalEdit();
      Editor._syncReadInProgress += 1;
      let changed;
      try {
        changed = await Store.hydrateFromDB({ force: true });
      } finally {
        Editor._syncReadInProgress -= 1;
      }
      if (!changed || !this._inited) return { refreshed: false, reason: 'unchanged' };

      // A conflicting remote version must not silently vanish when the local
      // draft is eventually saved. Store a separate synced copy first.
      const incoming = editedNoteId && Store.getNote(editedNoteId);
      const stillEditingSource = Editor._el === sourceElement
        && Editor._loadEpoch === sourceEpoch && Editor._currentId === editedNoteId;
      const dirtyDuringSync = stillEditingSource
        && (dirtyBeforeSync || this._hasPendingLocalEdit());
      let conflictCopyId = null;
      let recoveredDraftId = null;
      if (dirtyDuringSync && previousNote && !incoming) {
        // Remote deletion must not discard a pending local draft, nor should
        // saving resurrect the deleted ID. Bind the live editor to a new note.
        const titleInput = $('[data-note-title-input]');
        const draftTitle = titleInput?.value.trim() || previousNote.title || 'Untitled Note';
        const recovered = Store.createNote({
          ...previousNote,
          title: `${draftTitle.slice(0, 170)} (Recovered draft)`,
          // Incomplete IME text is intentionally not persisted before commit.
          // The editor remains mounted, then compositionend saves final text.
          content: Editor._compositionActive ? previousNote.content : Editor.getContent(),
        });
        Editor._currentId = recovered.id;
        if (titleInput) titleInput.value = recovered.title;
        recoveredDraftId = recovered.id;
        window.OpenCourseDeck?.Toast?.info?.(
          'This note was deleted in another window. Your unsaved draft was recovered as a separate note.',
        );
      }
      if (dirtyDuringSync && previousNote && incoming
          && (previousNote.content !== incoming.content || previousNote.title !== incoming.title)) {
        this._syncConflictVersions ??= new Map();
        const alreadySaved = this._syncConflictVersions.get(editedNoteId);
        if (!alreadySaved || alreadySaved.content !== incoming.content || alreadySaved.title !== incoming.title) {
          const copy = Store.createNote({
            ...incoming,
            title: `${String(incoming.title || 'Untitled').slice(0, 170)} (synced copy)`,
          });
          conflictCopyId = copy.id;
          this._syncConflictVersions.set(editedNoteId, {
            content: incoming.content,
            title: incoming.title,
          });
          if (this._syncConflictVersions.size > 32) {
            this._syncConflictVersions.delete(this._syncConflictVersions.keys().next().value);
          }
          window.OpenCourseDeck?.Toast?.info?.('Another window updated this note. Its version was saved as a separate copy.');
        }
      }
      const render = this._renderAfterCanonicalRefresh({
        preserveDirtyEditor: true,
        forcePreserveEditor: Boolean(recoveredDraftId),
      });
      const result = { refreshed: true, kind, conflictCopyId, recoveredDraftId, ...render };
      window.OpenCourseDeck?.bus?.emit?.('notes:sync-refresh', result);
      return result;
    },

    _canLeaveCurrentEditor() {
      if (!Editor._currentId) return true;
      if (Editor._compositionActive) {
        window.OpenCourseDeck?.Toast?.info?.('Finish typing before switching notes.');
        return false;
      }
      if (Editor._syncReadInProgress) {
        window.OpenCourseDeck?.Toast?.info?.('Notes are synchronizing. Your draft is being preserved.');
        return false;
      }
      return true;
    },

    _commitCurrentBeforeSwitch() {
      if (!this._canLeaveCurrentEditor()) return false;
      // The first note has no previously bound record to persist.
      if (!Editor._currentId) return true;
      // Squire may still have a DOM mutation awaiting its observer. Resolve
      // that before deciding an editor has no pending local work.
      if (Editor._squire && Editor._squire.syncChanges() === false) return false;
      // A canonical refresh can delete the previous (clean) note. In that
      // case there is nothing to save: allow opening the newly loaded record.
      // An edited missing note must stay mounted for recovery instead.
      if (!Store.getNote(Editor._currentId) && !this._hasPendingLocalEdit()) return true;
      try {
        if (Editor.save(true) !== false) return true;
      } catch (error) {
        console.warn('[Notes] current note could not be saved before switching', error);
      }
      window.OpenCourseDeck?.Toast?.error?.(
        'Could not save your current note. The draft is still open; retry before switching.',
      );
      return false;
    },

    // Used only after a successful draft commit, or after a canonical refresh
    // has proven there is no unsaved local edit. Do not call from click handlers.
    _activateSavedNote(id, { preventScroll = false } = {}) {
      const note = Store.getNote(id);
      if (!note) return false;
      Editor.load(note, { preventScroll });
      NotesList.setActive(id);
      const pane = $('[data-notes-main-pane]');
      if (pane) pane.classList.add('has-note');

      const toggle = $('[data-notes-modern-toggle]');
      if (toggle) {
        toggle.hidden = false;
        toggle.disabled = false;
        toggle.removeAttribute('title');
        toggle.textContent = 'Try Squire editor';
        const sessionEpoch = Editor._loadEpoch;
        toggle.disabled = true;
        toggle.textContent = 'Opening Squire editor…';
        void this.enableModernEditor().then(result => {
          // Reopening another note while the chunk loads must not publish
          // stale mode labels or replace its authoritative editor.
          if (!this._inited || Editor._loadEpoch !== sessionEpoch
            || Editor._currentId !== id || !toggle.isConnected) return;
          toggle.disabled = result.reason === 'incompatible';
          toggle.textContent = result.ok
            ? 'Use classic editor'
            : result.reason === 'incompatible'
              ? 'Classic editor (advanced formatting)'
              : 'Try Squire editor';
          if (result.reason === 'incompatible') {
            toggle.title = 'This note keeps its original advanced formatting in the classic editor.';
          }
        }).catch(error => {
          if (!this._inited || Editor._loadEpoch !== sessionEpoch
            || Editor._currentId !== id || !toggle.isConnected) return;
          toggle.disabled = false;
          toggle.textContent = 'Try Squire editor';
          console.warn('[Notes] Squire failed to initialize; classic editor preserved', error);
        });
      }
      return true;
    },

    newNote(folderId = NotesList._filter.folderId ?? 'default', { preventScroll = false } = {}) {
      // Do not allocate an orphan note until the previous draft can be saved.
      if (!this._commitCurrentBeforeSwitch()) return false;
      const note = Store.createNote({ folderId });
      NotesList.render();
      FoldersPanel.render();
      if (!this._activateSavedNote(note.id, { preventScroll })) return false;
      window.OpenCourseDeck?.bus?.emit('note:create', { note });
      return note;
    },

    enableModernEditor() { return Editor.enableModern(); },
    disableModernEditor() { return Editor.disableModern(); },

    openNote(id, { preventScroll = false } = {}) {
      if (!Store.getNote(id)) return false;
      if (!this._commitCurrentBeforeSwitch()) return false;
      return this._activateSavedNote(id, { preventScroll });
    },

    async deleteNote(id) {
      if (Editor._currentId === id && !this._canLeaveCurrentEditor()) return false;
      if (!await pdConfirm({
        title: 'Delete note',
        message: 'Delete this note permanently?',
        confirmLabel: 'Delete note',
        cancelLabel: 'Keep note',
      })) return;
      // A composition or sync could have started while the dialog was open.
      if (Editor._currentId === id && !this._canLeaveCurrentEditor()) return false;
      Store.deleteNote(id);
      if (Editor._currentId === id) {
        Editor._currentId = null;
        if (Editor._el) Editor._el.innerHTML = '';
        const titleInput = $('[data-note-title-input]');
        if (titleInput) titleInput.value = '';
      }
      NotesList.render();
      FoldersPanel.render();
      window.OpenCourseDeck?.bus?.emit('note:delete', { id });
    },

    duplicateNote(id) {
      if (!Store.getNote(id)) return false;
      // Flush first so duplicating the current note includes its newest text.
      if (!this._commitCurrentBeforeSwitch()) return false;
      const note = Store.getNote(id);
      if (!note) return false;
      const copy = Store.createNote({
        ...note,
        id:    undefined,
        title: `${note.title} (Copy)`,
      });
      NotesList.render();
      FoldersPanel.render();
      if (!this._activateSavedNote(copy.id)) return false;
      return copy;
    },

    promptColor(id) {
      const color = window.prompt('Enter color (hex or name):', '#3b82f6');
      if (color) Store.updateNote(id, { color });
      NotesList.render();
    },

    promptTags(id) {
      const note = Store.getNote(id);
      const raw  = window.prompt('Enter tags (comma-separated):', note?.tags.join(', ') ?? '');
      if (raw !== null) {
        const tags = raw.split(',').map(t => t.trim()).filter(Boolean);
        Store.updateNote(id, { tags });
        NotesList.render();
        TagsCloud.render($('[data-tags-cloud]'));
      }
    },

    promptMoveFolder(id) {
      const folders = Store.getFolders();
      const list    = folders.map((f, i) => `${i + 1}. ${f.name}`).join('\n');
      const input   = window.prompt(`Move to folder:\n${list}`, '1');
      const idx     = parseInt(input, 10) - 1;
      if (!isNaN(idx) && folders[idx]) {
        Store.updateNote(id, { folderId: folders[idx].id });
        NotesList.render();
        FoldersPanel.render();
      }
    },

    exportNote: NotesExport.exportNote.bind(NotesExport),

    async summarizeCurrentNote() {
      const ai = window.OpenCourseDeck?.AI;
      if (!ai?.summarizeText) return { ok: false, reason: 'unavailable' };
      if (!Editor._currentId) return { ok: false, reason: 'no-note' };
      Editor.save(true);
      const sourceNoteId = Editor._currentId;
      const sourceEpoch = Editor._loadEpoch;
      const sourceElement = Editor._el;
      const sourceContent = Editor.getContent();
      const text = plainTextFromHtml(sourceContent);
      if (!text) {
        window.OpenCourseDeck?.Toast?.info?.('Nothing to summarize');
        return { ok: false, reason: 'empty-note' };
      }
      const button = $('[data-ai-summarize]');
      if (button) button.disabled = true;
      try {
        const result = await ai.summarizeText(text, { bullets: 3 });
        if (!result?.ok || !result.text) {
          window.OpenCourseDeck?.Toast?.error?.('AI summary unavailable');
          return { ok: false, reason: result?.reason || 'summary-failed' };
        }
        // AI work may finish after navigation, route unmount, cross-tab sync,
        // or intervening edits. Never append an old result to a newer draft.
        if (!this._inited || Editor._compositionActive
            || !sourceElement?.isConnected || Editor._el !== sourceElement
            || Editor._currentId !== sourceNoteId || Editor._loadEpoch !== sourceEpoch
            || Editor.getContent() !== sourceContent
            || Store.getNote(sourceNoteId)?.content !== sourceContent) {
          return { ok: false, reason: 'stale-note' };
        }
        const inserted = Editor.appendAISummary(result.text);
        if (inserted) {
          NotesList.render();
          window.OpenCourseDeck?.Toast?.success?.('Summary added');
        }
        return { ok: inserted, provider: result.provider, mode: result.mode };
      } catch {
        window.OpenCourseDeck?.Toast?.error?.('AI summary failed');
        return { ok: false, reason: 'summary-error' };
      } finally {
        if (button) button.disabled = false;
      }
    },

    async rebuildSemanticIndex() {
      const ai = window.OpenCourseDeck?.AI;
      if (!ai?.upsertEmbedding) return { indexed: 0, available: false };
      const notes = Store.getNotes();
      await Promise.all(notes.map(note => ai.upsertEmbedding({
        id: note.id,
        text: `${note.title}\n${plainTextFromHtml(note.content || '')}`,
        metadata: { type: 'note', title: note.title, updatedAt: note.updatedAt },
      })));
      return { indexed: notes.length, available: true };
    },

    async semanticSearchNotes() {
      const query = $('[data-notes-search]')?.value?.trim();
      const status = $('[data-notes-semantic-status]');
      if (!query) {
        if (status) status.textContent = 'Enter a note search first';
        return { ok: false, reason: 'empty-query' };
      }
      // Exact script-aware keyword overlap is predictable, private and
      // synchronous. A note query should not reindex an entire library.
      const terms = new Set(query.toLocaleLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) || []);
      const scores = Store.getNotes().map(note => {
        const haystack = `${note.title || ''} ${plainTextFromHtml(note.content || '')}`
          .toLocaleLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) || [];
        const words = new Set(haystack);
        return { id: note.id, matches: [...terms].filter(term => words.has(term)).length };
      });
      const ids = scores.filter(item => item.matches > 0)
        .sort((a, b) => b.matches - a.matches)
        .map(item => item.id);
      NotesList.setSemanticResults(ids);
      if (status) status.textContent = `Related notes: ${ids.length} (matching keywords)`;
      return { ok: true, results: ids.length };
    },

    clearSemanticSearch() {
      NotesList.setSemanticResults(null);
      const status = $('[data-notes-semantic-status]');
      if (status) status.textContent = '';
    },

    async _initAIControls() {
      const button = $('[data-ai-summarize]');
      if (!button) return;
      button.hidden = true;
      try {
        const status = await window.OpenCourseDeck?.AI?.status?.();
        button.hidden = !status?.available;
      } catch {
        button.hidden = true;
      }
      RouteListeners.on(button, 'click', () => this.summarizeCurrentNote());
    },

    async _initSemanticSearch() {
      const searchButton = $('[data-notes-semantic-search]');
      const clearButton = $('[data-notes-semantic-clear]');
      const searchInput = $('[data-notes-search]');
      if (!searchButton || !clearButton || !searchInput) return;
      // Related-keyword search requires no model, index or API credentials.
      searchButton.hidden = false;
      clearButton.hidden = false;
      const syncAvailability = () => {
        searchButton.disabled = !searchInput.value.trim();
      };
      searchButton.disabled = true;
      clearButton.disabled = true;
      syncAvailability();
      RouteListeners.on(searchInput, 'input', () => {
        // Editing the query invalidates the old related-keyword result set.
        if (!clearButton.disabled) this.clearSemanticSearch();
        clearButton.disabled = true;
        syncAvailability();
      });
      RouteListeners.on(searchButton, 'click', async () => {
        if (searchButton.disabled) return;
        const result = await this.semanticSearchNotes();
        clearButton.disabled = !result?.ok;
      });
      RouteListeners.on(clearButton, 'click', () => {
        if (clearButton.disabled) return;
        this.clearSemanticSearch();
        clearButton.disabled = true;
      });
    },

    destroy() {
      this._unbindSyncRefresh();
      this.flushPendingSave?.();
      Editor.disableModern({ preserveContent: false });
      RouteListeners.clear();
      ContextMenu.hide();
      Editor._hideSlashMenu?.();
      clearTimeout(Editor._saveTimer);
      Editor._saveTimer = null;
      const titleInput = $('[data-note-title-input]');
      if (titleInput?._pdTitleT) {
        clearTimeout(titleInput._pdTitleT);
        titleInput._pdTitleT = null;
      }
      Editor._el = null;
      Editor._compositionActive = false;
      // Drop the note binding along with the DOM it was bound to. Leaving it
      // set survives the route unmount, so a later remount that does not reach
      // a load() -- an IndexedDB-only account whose localStorage mirror is
      // empty, so init() finds no notes to open -- leaves the stale id pointing
      // at a real note behind a brand new, empty editor. The first keystroke or
      // title edit then writes that empty content over it.
      Editor._currentId = null;
      Editor._history = [];
      Editor._historyIdx = -1;
      NotesList.destroy();
      FoldersPanel._container = null;
      this._inited = false;
      window.OpenCourseDeck?.beforeUnload?.unmark?.('notes-body');
      window.OpenCourseDeck?.beforeUnload?.unmark?.('notes-title');
    },
  };

  /**
   * Flush pending note body (debounced) and title to storage — used before tab unload.
   */
  NotesApp.flushPendingSave = function flushPendingSave() {
    try {
      const bodyCommitted = Editor.save(true);
      const titleInput = $('[data-note-title-input]');
      if (titleInput && Editor._currentId) {
        const title = titleInput.value.trim() || 'Untitled';
        // Editor.save(true) already writes the current title. Avoid a second
        // duplicate DB write: it can obscure a failed first write and race
        // against an in-flight canonical hydration.
        if (Store.getNote(Editor._currentId)?.title !== title) {
          Store.updateNote(Editor._currentId, { title });
          NotesList.render();
        }
        window.OpenCourseDeck?.beforeUnload?.unmark?.('notes-title');
      }
      // A composing IME or unresolved sync deliberately defers the body write.
      // Do not clear unload protection until that body was actually committed.
      if (bodyCommitted === false) return false;
      window.OpenCourseDeck?.beforeUnload?.unmark?.('notes-body');
      return true;
    } catch {
      return false;
    }
  };


  /**
   * Use for route changes: an updated in-memory note is not a durable write.
   * Await the final per-note DB mutation before allowing the editor to unmount.
   * On failure, retain a before-unload reason until a successful retry.
   */
  NotesApp.flushPendingSaveDurably = async function flushPendingSaveDurably() {
    const id = Editor._currentId;
    const guard = window.OpenCourseDeck?.beforeUnload;
    const durableReason = `notes-durable-write:${String(id ?? 'new')}`;
    guard?.mark?.(durableReason);
    let durable = false;
    try {
      if (this.flushPendingSave() === false) return false;
      const pending = id == null ? null : Store._noteWriteQueue.get(String(id));
      if (pending && await pending === false) return false;
      // A different note may have opened while the asynchronous save settled.
      if (id !== Editor._currentId) return false;
      durable = true;
      return true;
    } catch (error) {
      console.warn('[Notes] durable write acknowledgment failed', error);
      return false;
    } finally {
      if (durable) guard?.unmark?.(durableReason);
    }
  };

  // ──────────────────────────────────────────────────────────
  // BOOT
  // ──────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => NotesApp.init());
  } else {
    NotesApp.init();
  }

  // Public API
  window.PlasmaNotesApp = NotesApp;
  window.PlasmaNotesStore = Store;
  window.PlasmaNotesExport = NotesExport;
  window.PlasmaNotesList = NotesList;

})();
