import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';

let originalBroadcastChannel;

describe('bridge DB safety helpers', () => {
  beforeEach(async () => {
    vi.resetModules();
    originalBroadcastChannel = window.BroadcastChannel;
    localStorage.clear();
    delete window.DB;
    delete window.DataStore;
    window.OpenCourseDeck = {};
    await indexedDB.deleteDatabase('opencoursedeck');
    await import('../db.js');
    await import('../bridge.js');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalBroadcastChannel) window.BroadcastChannel = originalBroadcastChannel;
    else delete window.BroadcastChannel;
  });

  it('acknowledges a successful timestamp deletion after removing its canonical record', async () => {
    const saved = { id: 'ts-ack', topicId: 'topic-1', position: 30 };
    await expect(window.DB.saveTimestamp(saved)).resolves.toBe(true);
    expect(await window.DB.getAllTimestamps()).toEqual(
      expect.arrayContaining([expect.objectContaining(saved)])
    );

    await expect(window.DB.deleteTimestamp(saved.id)).resolves.toBe(true);
    expect(await window.DB.getAllTimestamps()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: saved.id })])
    );
  });

  it.each([
    ['getProgress', ['topic-stale']],
    ['getAllProgress', []],
    ['getAllTimestamps', []],
    ['getAllNotes', []],
    ['getAllFolders', []],
    ['getSetting', ['ocd_user_library']],
    ['getAllAnnotations', []],
    ['getAnnotations', ['pdf-a']],
    ['getWatchedSegments', ['topic-stale']],
    ['getAllWatchedSegments', []],
    ['getPdfBookmarks', ['pdf-a']],
    ['getAllPdfBookmarks', []],
  ])('rejects %s after IndexedDB read failure instead of returning a stale snapshot', async (method, args) => {
    localStorage.setItem('ocd_user_library', JSON.stringify({
      version: 1, courses: { stale: { title: 'Must not overwrite canonical library' } },
    }));
    localStorage.setItem('ocd_notes', JSON.stringify([{ id: 'old-note' }]));
    localStorage.setItem('plasma_progress_v1', JSON.stringify({ 'topic-stale': { topicId: 'topic-stale' } }));
    const emit = vi.fn();
    window.OpenCourseDeck.bus = { emit };
    window.OpenCourseDeck.DB.PlasmaDB = class {
      async get() { throw new Error('canonical storage read failed'); }
      async getAll() { throw new Error('canonical storage read failed'); }
      async getAllByIndex() { throw new Error('canonical storage read failed'); }
    };

    await expect(window.DB[method](...args)).rejects.toThrow('canonical storage read failed');
    expect(emit).toHaveBeenCalledWith('storage:read-error', expect.objectContaining({
      kind: method, backend: 'indexedDB', canonical: true,
      error: expect.objectContaining({ message: 'canonical storage read failed' }),
    }));
  });

  it('rejects incomplete backup sources when IndexedDB is unavailable', async () => {
    delete window.OpenCourseDeck.DB.PlasmaDB;
    await expect(window.DB.getAllWatchedSegments()).rejects.toThrow(/Canonical watched-segment/);
    await expect(window.DB.getAllPdfBookmarks()).rejects.toThrow(/Canonical PDF bookmark/);
  });

  it('never resurrects unpublished local Notes when canonical IndexedDB is available', async () => {
    localStorage.setItem('ocd_notes', JSON.stringify([
      { id: 'n1', title: 'Local older', updatedAt: 10 },
      { id: 'n2', title: 'Local only', updatedAt: 20 },
    ]));
    await window.DB.saveNote({ id: 'n1', title: 'IDB newer', updatedAt: 30 });
    expect(await window.DB.getAllNotes()).toEqual([
      expect.objectContaining({ id: 'n1', title: 'IDB newer' }),
    ]);
  });

  it('uses IndexedDB as canonical for notes from the first launch', async () => {
    await window.DB.saveNote({ id: 'n1', title: 'Canonical IDB', updatedAt: 30 });
    localStorage.setItem('ocd_notes', JSON.stringify([
      { id: 'n1', title: 'Stale local newer timestamp', updatedAt: 999 },
      { id: 'local-only-when-idb-ready', title: 'Should stay out', updatedAt: 1000 },
    ]));

    const notes = await window.DB.getAllNotes();

    expect(notes).toEqual([expect.objectContaining({ id: 'n1', title: 'Canonical IDB' })]);
    expect(notes).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'local-only-when-idb-ready' }),
    ]));
  });

  it('saves notes to canonical IndexedDB without refreshing localStorage from the first launch', async () => {

    const note = await window.DB.saveNote({ id: 'canonical-note-save', title: 'IDB only' });

    expect(note).toEqual(expect.objectContaining({ id: 'canonical-note-save', title: 'IDB only' }));
    expect(localStorage.getItem('ocd_notes')).toBeNull();
    expect(await window.DB.getAllNotes()).toEqual([
      expect.objectContaining({ id: 'canonical-note-save', title: 'IDB only' }),
    ]);
  });

  it('uses IndexedDB as canonical for folders and settings from the first launch', async () => {
    await window.DB.saveFolder({ id: 'f1', name: 'Canonical folder', updatedAt: 30 });
    await window.DB.saveSetting('plasma-playlists', [{ id: 'idb-playlist' }]);
    localStorage.setItem('ocd_folders', JSON.stringify([
      { id: 'f1', name: 'Stale folder', updatedAt: 999 },
      { id: 'local-folder', name: 'Local only' },
    ]));
    localStorage.setItem('plasma-playlists', JSON.stringify([{ id: 'local-playlist' }]));

    expect(await window.DB.getAllFolders()).toEqual([expect.objectContaining({ id: 'f1', name: 'Canonical folder' })]);
    expect(await window.DB.getSetting('plasma-playlists')).toEqual([{ id: 'idb-playlist' }]);
  });

  it('saves folders and settings to canonical IndexedDB without refreshing localStorage from the first launch', async () => {

    const folder = await window.DB.saveFolder({ id: 'canonical-folder-save', name: 'IDB folder' });
    const setting = await window.DB.saveSetting('ocd_notes_settings', { view: 'kanban' });

    expect(folder).toEqual(expect.objectContaining({ id: 'canonical-folder-save', name: 'IDB folder' }));
    expect(setting).toEqual({ view: 'kanban' });
    expect(localStorage.getItem('ocd_folders')).toBeNull();
    expect(localStorage.getItem('ocd_notes_settings')).toBeNull();
    expect(await window.DB.getAllFolders()).toEqual([
      expect.objectContaining({ id: 'canonical-folder-save', name: 'IDB folder' }),
    ]);
    expect(await window.DB.getSetting('ocd_notes_settings')).toEqual({ view: 'kanban' });
  });

  it('uses IndexedDB as canonical for annotations from the first launch', async () => {
    await window.DB.saveAnnotations('doc-a', {
      1: [{ id: 'idb-ann', type: 'highlight', updatedAt: 30 }],
    });
    localStorage.setItem('plasma-pdf-annotations', JSON.stringify({
      1: [
        { id: 'idb-ann', docId: 'doc-a', type: 'stale-local', updatedAt: 999 },
        { id: 'local-ann', docId: 'doc-a', type: 'local-only', updatedAt: 1000 },
      ],
    }));

    const annotations = await window.DB.getAnnotations('doc-a');
    const all = await window.DB.getAllAnnotations();

    expect(annotations).toEqual([expect.objectContaining({ id: 'idb-ann', type: 'highlight' })]);
    expect(all).toEqual([expect.objectContaining({ id: 'idb-ann', type: 'highlight' })]);
  });

  it('saves annotations to canonical IndexedDB without refreshing localStorage from the first launch', async () => {

    const records = await window.DB.saveAnnotations('doc-canonical-save', {
      3: [{ id: 'canonical-ann-save', type: 'highlight', updatedAt: 30 }],
    });

    expect(records).toEqual([
      expect.objectContaining({ id: 'canonical-ann-save', docId: 'doc-canonical-save', page: 3 }),
    ]);
    expect(localStorage.getItem('plasma-pdf-annotations')).toBeNull();
    expect(await window.DB.getAnnotations('doc-canonical-save')).toEqual([
      expect.objectContaining({ id: 'canonical-ann-save', type: 'highlight', page: 3 }),
    ]);
  });

  it('clearAll removes app-owned stores and localStorage mirrors', async () => {
    await window.DB.saveProgress('topic-1', 'course-1', { status: 'done' });
    await window.DB.saveTimestamp({ id: 'ts-1', topicId: 'topic-1' });
    await window.DB.saveNote({ id: 'note-1', title: 'Note' });
    await window.DB.saveFolder({ id: 'folder-1', name: 'Folder' });
    await window.DB.saveSetting('ocd_notes_settings', { view: 'list' });
    await window.DB.saveSetting('plasma-playlists', [{ id: 'playlist-1' }]);
    await window.DB.saveSetting('plasma-studio-board', { version: 1, layers: [] });
    await window.DB.saveSetting('ocd_user_library', { version: 1, courses: { 'user-library': { title: 'My Library' } } });
    localStorage.setItem('plasma-pdf-annotations', JSON.stringify([{ id: 'ann-1' }]));
    localStorage.setItem('ocd_user_library', JSON.stringify({ version: 1, courses: { leftover: true } }));

    await window.DB.clearAll();

    expect(await window.DB.getAllProgress()).toEqual([]);
    expect(await window.DB.getAllTimestamps()).toEqual([]);
    expect(await window.DB.getAllNotes()).toEqual([]);
    expect(await window.DB.getAllFolders()).toEqual([]);
    expect(localStorage.getItem('ocd_notes')).toBeNull();
    expect(localStorage.getItem('ocd_folders')).toBeNull();
    expect(localStorage.getItem('ocd_notes_settings')).toBeNull();
    expect(localStorage.getItem('plasma-playlists')).toBeNull();
    expect(localStorage.getItem('plasma-studio-board')).toBeNull();
    expect(localStorage.getItem('plasma-pdf-annotations')).toBeNull();
    expect(localStorage.getItem('ocd_user_library')).toBeNull();
    expect(await window.DB.getSetting('ocd_user_library')).toBeNull();
  });

  it('clearUserData removes only the requested data scope', async () => {
    await window.DB.saveProgress('topic-1', 'course-1', { status: 'done' });
    await window.DB.saveTimestamp({ id: 'ts-1', topicId: 'topic-1' });
    await window.DB.saveNote({ id: 'note-1', title: 'Note' });
    await window.DB.saveFolder({ id: 'folder-1', name: 'Folder' });
    await window.DB.saveSetting('ocd_notes_settings', { view: 'list' });
    await window.DB.saveSetting('plasma-playlists', [{ id: 'playlist-1' }]);
    await window.DB.saveSetting('plasma-studio-board', { version: 1, layers: [] });
    await window.DB.saveAnnotations('doc-a', { 1: [{ id: 'ann-1', type: 'highlight' }] });
    localStorage.setItem('plasma_theme', 'dark');

    const result = await window.DB.clearUserData('notes');

    expect(result.scope).toBe('notes');
    expect(await window.DB.getAllProgress()).toHaveLength(1);
    expect(await window.DB.getAllTimestamps()).toHaveLength(1);
    expect(await window.DB.getAllNotes()).toEqual([]);
    expect(await window.DB.getAllFolders()).toEqual([]);
    expect(await window.DB.getAnnotations('doc-a')).toHaveLength(1);
    expect(localStorage.getItem('plasma_theme')).toBe('dark');
    expect(localStorage.getItem('ocd_notes')).toBeNull();
    expect(localStorage.getItem('ocd_folders')).toBeNull();
    expect(localStorage.getItem('ocd_notes_settings')).toBeNull();
    expect(await window.DB.getSetting('plasma-playlists')).toEqual([{ id: 'playlist-1' }]);
    expect(await window.DB.getSetting('plasma-studio-board')).toEqual({ version: 1, layers: [] });
  });

  it('clearUserData can remove saved playlists and Studio boards independently', async () => {
    await window.DB.saveSetting('plasma-playlists', [{ id: 'playlist-1' }]);
    await window.DB.saveSetting('plasma-studio-board', { version: 1, layers: [] });

    const playlistResult = await window.DB.clearUserData('playlists');
    expect(playlistResult.scope).toBe('playlists');
    expect(await window.DB.getSetting('plasma-playlists')).toBeNull();
    expect(await window.DB.getSetting('plasma-studio-board')).toEqual({ version: 1, layers: [] });

    const studioResult = await window.DB.clearUserData('studio');
    expect(studioResult.scope).toBe('studio');
    expect(await window.DB.getSetting('plasma-studio-board')).toBeNull();
  });


  it('rejects a clear operation when any primary IndexedDB store fails', async () => {
    window.OpenCourseDeck.DB.PlasmaDB = class {
      async clear(store) {
        if (store === 'notes') throw new Error('notes clear failed');
        return true;
      }
      async count() { return 0; }
    };

    const error = await window.DB.clearUserData('notes').catch(value => value);

    expect(error).toMatchObject({ code: 'STORAGE_RESET_INCOMPLETE' });
    expect(error.receipt).toMatchObject({ committed: false, durable: false, status: 'failed' });
    expect(error.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({ backend: 'indexedDB', store: 'notes', message: 'notes clear failed' }),
    ]));
  });

  it('does not fall back to localStorage when progress save hits storage quota', async () => {
    const emit = vi.fn();
    const quotaError = Object.assign(new Error('Quota exceeded'), { name: 'QuotaExceededError' });
    window.OpenCourseDeck.bus = { emit };
    window.OpenCourseDeck.DB.PlasmaDB = class {
      async get() { return null; }
      async put() { throw quotaError; }
    };

    await expect(window.DB.saveProgress('topic-quota', 'course-a', { status: 'done' })).rejects.toThrow('Quota exceeded');

    expect(localStorage.getItem('plasma_progress_v1')).toBeNull();
    expect(emit).toHaveBeenCalledWith('storage:save-error', expect.objectContaining({
      kind: 'progress',
      backend: 'indexedDB',
      error: expect.objectContaining({ quota: true, name: 'QuotaExceededError' }),
    }));
    expect(emit).not.toHaveBeenCalledWith('storage:fallback', expect.anything());
  });

  it('rejects failed writes to canonical progress storage without a false fallback success', async () => {
    const emit = vi.fn();
    window.OpenCourseDeck.bus = { emit };
    window.OpenCourseDeck.DB.PlasmaDB = class {
      async get() { return { topicId: 'topic-canonical', courseId: 'course-a', watched: 100 }; }
      async put() { throw new Error('IDB transaction aborted'); }
    };

    await expect(window.DB.saveProgress('topic-canonical', 'course-a', { bookmarked: true }))
      .rejects.toThrow('IDB transaction aborted');
    expect(localStorage.getItem('plasma_progress_v1')).toBeNull();
    expect(emit).toHaveBeenCalledWith('storage:save-error', expect.objectContaining({
      kind: 'progress', canonical: true, backend: 'indexedDB',
    }));
    expect(emit).not.toHaveBeenCalledWith('progress:save', expect.anything());
  });

  it('rejects failed canonical timestamp writes and does not broadcast success', async () => {
    window.OpenCourseDeck.bus = { emit: vi.fn() };
    window.OpenCourseDeck.DB.PlasmaDB = class {
      async put() { throw new Error('timestamp transaction aborted'); }
    };

    await expect(window.DB.saveTimestamp({ id: 'ts-canonical', topicId: 'topic-a' }))
      .rejects.toThrow('timestamp transaction aborted');
    expect(localStorage.getItem('plasma_timestamps_v1')).toBeNull();
    expect(window.OpenCourseDeck.bus.emit).not.toHaveBeenCalledWith('sync:local-change', expect.anything());
  });

  it('uses only IndexedDB timestamps when it is available', async () => {
    localStorage.setItem('plasma_timestamps_v1', JSON.stringify([
      { id: 'old-only', topicId: 'a' }, { id: 'both', topicId: 'stale' },
    ]));
    window.OpenCourseDeck.DB.PlasmaDB = class {
      async getAll() { return [{ id: 'both', topicId: 'canonical' }]; }
    };
    expect(await window.DB.getAllTimestamps()).toEqual([{ id: 'both', topicId: 'canonical' }]);
  });

  it('never overlays stale local progress onto canonical IndexedDB reads', async () => {
    localStorage.setItem('plasma_progress_v1', JSON.stringify({
      fallback: { topicId: 'fallback', status: 'done' },
      both: { topicId: 'both', status: 'stale' },
    }));
    const rows = new Map([['both', { topicId: 'both', status: 'canonical' }]]);
    window.OpenCourseDeck.DB.PlasmaDB = class {
      async get(_store, key) { return rows.get(key) ?? null; }
      async getAll() { return [...rows.values()]; }
    };
    await expect(window.DB.getProgress('fallback')).resolves.toBeNull();
    await expect(window.DB.getProgress('both')).resolves.toMatchObject({ status: 'canonical' });
    expect(await window.DB.getAllProgress()).toHaveLength(1);
  });

  it('does not fall back to localStorage when timestamp save hits storage quota', async () => {
    const emit = vi.fn();
    const quotaError = Object.assign(new Error('Persistent storage full'), { name: 'QuotaExceededError' });
    window.OpenCourseDeck.bus = { emit };
    window.OpenCourseDeck.DB.PlasmaDB = class {
      async put() { throw quotaError; }
    };

    await expect(window.DB.saveTimestamp({ id: 'ts-quota', topicId: 'topic-a' })).rejects.toThrow('Persistent storage full');

    expect(localStorage.getItem('plasma_timestamps_v1')).toBeNull();
    expect(emit).toHaveBeenCalledWith('storage:save-error', expect.objectContaining({
      kind: 'timestamp',
      backend: 'indexedDB',
      error: expect.objectContaining({ quota: true }),
    }));
  });

  it('signals and rejects when note localStorage write fails', async () => {
    const emit = vi.fn();
    const quotaError = Object.assign(new Error('localStorage quota exceeded'), { name: 'QuotaExceededError' });
    const originalSetItem = Storage.prototype.setItem;
    window.OpenCourseDeck.bus = { emit };
    window.OpenCourseDeck.DB.PlasmaDB = null;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(key, value) {
      if (key === 'ocd_notes') throw quotaError;
      return originalSetItem.call(this, key, value);
    });

    await expect(window.DB.saveNote({ id: 'note-quota', title: 'Cannot save' })).rejects.toThrow('localStorage quota exceeded');

    expect(emit).toHaveBeenCalledWith('storage:save-error', expect.objectContaining({
      kind: 'note',
      backend: 'localStorage',
      key: 'ocd_notes',
      error: expect.objectContaining({ quota: true }),
    }));
  });

  it('signals and rejects canonical IndexedDB folder failures from the first launch', async () => {
    const emit = vi.fn();
    const quotaError = Object.assign(new Error('canonical quota exceeded'), { name: 'QuotaExceededError' });
    window.OpenCourseDeck.bus = { emit };
    window.OpenCourseDeck.DB.PlasmaDB = class {
      async put() { throw quotaError; }
    };

    await expect(window.DB.saveFolder({ id: 'folder-quota', name: 'Do not diverge' })).rejects.toThrow('canonical quota exceeded');

    expect(localStorage.getItem('ocd_folders')).toBeNull();
    expect(emit).toHaveBeenCalledWith('storage:save-error', expect.objectContaining({
      kind: 'folder',
      backend: 'indexedDB',
      canonical: true,
      error: expect.objectContaining({ quota: true }),
    }));
  });

  it('signals and rejects canonical IndexedDB setting failures from the first launch', async () => {
    const emit = vi.fn();
    window.OpenCourseDeck.bus = { emit };
    window.OpenCourseDeck.DB.PlasmaDB = class {
      async put() { throw new Error('settings canonical failed'); }
    };

    await expect(window.DB.saveSetting('ocd_notes_settings', { view: 'grid' })).rejects.toThrow('settings canonical failed');

    expect(localStorage.getItem('ocd_notes_settings')).toBeNull();
    expect(emit).toHaveBeenCalledWith('storage:save-error', expect.objectContaining({
      kind: 'setting',
      backend: 'indexedDB',
      canonical: true,
      error: expect.objectContaining({ quota: false }),
    }));
  });

  it('signals and rejects canonical IndexedDB annotation failures from the first launch', async () => {
    const emit = vi.fn();
    window.OpenCourseDeck.bus = { emit };
    window.OpenCourseDeck.DB.PlasmaDB = class {
      async getAllByIndex() { return []; }
      async put() { throw new Error('annotation canonical failed'); }
      async delete() {}
    };

    await expect(window.DB.saveAnnotations('doc-mirror', {
      2: [{ id: 'ann-mirror', type: 'highlight', updatedAt: 10 }],
    })).rejects.toThrow('annotation canonical failed');

    expect(localStorage.getItem('plasma-pdf-annotations')).toBeNull();
    expect(emit).toHaveBeenCalledWith('storage:save-error', expect.objectContaining({
      kind: 'annotation',
      backend: 'indexedDB',
      canonical: true,
      error: expect.objectContaining({ quota: false }),
    }));
  });

  it('broadcasts local DB changes and relays external tab sync messages', async () => {
    const channels = [];
    class BroadcastChannelMock {
      constructor(name) {
        this.name = name;
        this.postMessage = vi.fn();
        this.close = vi.fn();
        channels.push(this);
      }
    }
    window.BroadcastChannel = BroadcastChannelMock;
    window.OpenCourseDeck.bus = { emit: vi.fn() };

    const note = await window.DB.saveNote({ id: 'note-sync', title: 'Synced note' });

    expect(channels).toHaveLength(1);
    expect(channels[0].name).toBe('opencoursedeck_sync');
    expect(channels[0].postMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'note',
      action: 'save',
      record: expect.objectContaining({ id: 'note-sync', title: 'Synced note' }),
      source: expect.any(String),
    }));
    expect(window.OpenCourseDeck.bus.emit).toHaveBeenCalledWith('sync:local-change', expect.objectContaining({
      kind: 'note',
      action: 'save',
      record: note,
    }));

    channels[0].onmessage({
      data: {
        kind: 'progress',
        action: 'save',
        record: { topicId: 'topic-external', status: 'done' },
        source: 'external-tab',
      },
    });

    expect(window.OpenCourseDeck.bus.emit).toHaveBeenCalledWith('sync:message', expect.objectContaining({
      kind: 'progress',
      action: 'save',
      source: 'external-tab',
    }));
    expect(window.OpenCourseDeck.bus.emit).toHaveBeenCalledWith('progress:save', expect.objectContaining({
      kind: 'progress',
      action: 'save',
    }));
  });

  it('stores and reads PDF annotations by document id', async () => {
    await window.DB.saveAnnotations('doc-a', {
      1: [{ id: 'a-1', type: 'highlight', updatedAt: 10 }],
      2: [{ id: 'a-2', type: 'text', updatedAt: 20 }],
    });
    await window.DB.saveAnnotations('doc-b', {
      1: [{ id: 'b-1', type: 'draw', updatedAt: 30 }],
    });

    const docA = await window.DB.getAnnotations('doc-a');
    const docB = await window.DB.getAnnotations('doc-b');

    expect(docA.map((annotation) => annotation.id).sort()).toEqual(['a-1', 'a-2']);
    expect(docA.every((annotation) => annotation.docId === 'doc-a')).toBe(true);
    expect(docB.map((annotation) => annotation.id)).toEqual(['b-1']);
  });

  it('replaces a document annotation set and removes stale canonical records', async () => {
    await window.DB.saveAnnotations('doc-replace', {
      1: [
        { id: 'keep', type: 'highlight', updatedAt: 10 },
        { id: 'remove', type: 'text', updatedAt: 10 },
      ],
    });

    await window.DB.saveAnnotations('doc-replace', {
      2: [{ id: 'keep', type: 'draw', updatedAt: 20 }],
    });

    expect(await window.DB.getAnnotations('doc-replace')).toEqual([
      expect.objectContaining({ id: 'keep', type: 'draw', page: 2 }),
    ]);
  });

  it('returns all PDF annotations for backup export', async () => {
    await window.DB.saveAnnotations('doc-a', {
      1: [{ id: 'a-1', type: 'highlight', updatedAt: 10 }],
    });
    await window.DB.saveAnnotations('doc-b', {
      3: [{ id: 'b-1', type: 'text', updatedAt: 20 }],
    });

    const all = await window.DB.getAllAnnotations();

    expect(all.map((annotation) => annotation.id).sort()).toEqual(['a-1', 'b-1']);
    expect(all.map((annotation) => annotation.docId).sort()).toEqual(['doc-a', 'doc-b']);
  });

  it('never merges prelaunch local annotations into canonical backup exports', async () => {
    localStorage.setItem('plasma-pdf-annotations', JSON.stringify({
      4: [{ id: 'orphan', docId: 'global', page: 4 }],
    }));
    await expect(window.DB.getAllAnnotations()).resolves.toEqual([]);
  });

  it('clearAll removes saved PDF annotations from IndexedDB and localStorage', async () => {
    await window.DB.saveAnnotations('doc-a', {
      1: [{ id: 'a-1', type: 'highlight', updatedAt: 10 }],
    });

    await window.DB.clearAll();

    expect(await window.DB.getAnnotations('doc-a')).toEqual([]);
    expect(localStorage.getItem('plasma-pdf-annotations')).toBeNull();
  });

  it('deletes notes and folders from local mirrors and IndexedDB stores', async () => {
    await window.DB.saveNote({ id: 'delete-note', title: 'Remove me' });
    await window.DB.saveFolder({ id: 'delete-folder', name: 'Remove folder' });

    await window.DB.deleteNote('delete-note');
    await window.DB.deleteFolder('delete-folder');

    expect(await window.DB.getAllNotes()).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'delete-note' }),
    ]));
    expect(await window.DB.getAllFolders()).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'delete-folder' }),
    ]));
    expect(localStorage.getItem('ocd_notes')).toBeNull();
    expect(localStorage.getItem('ocd_folders')).toBeNull();
  });

  it.each([
    ['note', 'notes', 'deleteNote', 'note-delete'],
    ['folder', 'folders', 'deleteFolder', 'folder-delete'],
    ['timestamp', 'timestamps', 'deleteTimestamp', 'timestamp-delete'],
  ])('rejects an uncommitted %s deletion instead of broadcasting success', async (_kind, store, method, errorKind) => {
    const emit = vi.fn();
    window.OpenCourseDeck.bus = { emit };
    const persisted = new Map([['keep-me', { id: 'keep-me', title: 'Still stored' }]]);
    window.OpenCourseDeck.DB.PlasmaDB = class {
      async delete(_store, id) {
        expect(_store).toBe(store);
        expect(id).toBe('keep-me');
        throw new Error('IndexedDB deletion transaction aborted');
      }
      async getAll() { return [...persisted.values()]; }
    };

    await expect(window.DB[method]('keep-me')).rejects.toThrow(/transaction aborted/);
    expect(persisted.has('keep-me')).toBe(true);
    expect(emit).toHaveBeenCalledWith('storage:save-error', expect.objectContaining({
      kind: errorKind, backend: 'indexedDB',
    }));
    expect(emit).not.toHaveBeenCalledWith('sync:local-change', expect.objectContaining({ action: 'delete' }));
  });

  it('merges simultaneous progress updates to a topic instead of losing a field', async () => {
    const persisted = new Map([['topic-concurrent', {
      topicId: 'topic-concurrent', courseId: 'course-a', watched: 0, bookmarked: false,
    }]]);
    let activeReads = 0;
    window.OpenCourseDeck.DB.PlasmaDB = class {
      async get(_store, id) {
        activeReads++;
        // Let a second independent reader overtake this one if the caller
        // performs read-modify-write without holding the topic lock.
        await new Promise(resolve => setTimeout(resolve, 2));
        const value = persisted.get(id);
        return value ? { ...value } : null;
      }
      async put(_store, value) { persisted.set(value.topicId, { ...value }); }
    };
    const [first, second] = await Promise.all([
      window.DB.saveProgress('topic-concurrent', 'course-a', { watched: 42 }),
      window.DB.saveProgress('topic-concurrent', 'course-a', { bookmarked: true }),
    ]);
    expect(activeReads).toBe(2);
    expect(first.watched).toBe(42);
    expect(second).toMatchObject({ watched: 42, bookmarked: true });
    expect(persisted.get('topic-concurrent')).toMatchObject({ watched: 42, bookmarked: true });
  });

  it('does not claim PDF bookmarks were persisted when IndexedDB is unavailable', async () => {
    window.OpenCourseDeck.DB.PlasmaDB = undefined;
    await expect(window.DB.addPdfBookmark({ id: 'bm-unsaved', docId: 'doc-x' }))
      .rejects.toThrow(/IndexedDB unavailable/);
    await expect(window.DB.deletePdfBookmark('bm-unsaved')).resolves.toBe(false);
  });

  it('deletes timestamps from canonical IndexedDB without creating a stale local mirror', async () => {
    await window.DB.saveTimestamp({ id: 'delete-ts', topicId: 'topic-1', position: 42 });

    await window.DB.deleteTimestamp('delete-ts');

    expect(await window.DB.getAllTimestamps()).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'delete-ts' }),
    ]));
    expect(localStorage.getItem('plasma_timestamps_v1')).toBeNull();
  });

  it('updates existing timestamp records by id', async () => {
    await window.DB.saveTimestamp({ id: 'edit-ts', topicId: 'topic-1', title: 'Old title', position: 10 });
    await window.DB.saveTimestamp({ id: 'edit-ts', topicId: 'topic-1', title: 'New title', position: 25 });

    const timestamps = await window.DB.getAllTimestamps();
    expect(timestamps.filter(item => item.id === 'edit-ts')).toHaveLength(1);
    expect(timestamps).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'edit-ts', title: 'New title', position: 25 }),
    ]));
  });

  it('reads progress and timestamps through IndexedDB indexes from the first launch', async () => {
    const calls = [];
    const stores = {
      progress: [
        { topicId: 'topic-a', courseId: 'course-a', updatedAt: 10 },
        { topicId: 'topic-b', courseId: 'course-b', updatedAt: 20 },
      ],
      timestamps: [
        { id: 'ts-a', topicId: 'topic-a', courseId: 'course-a', position: 12 },
        { id: 'ts-b', topicId: 'topic-b', courseId: 'course-b', position: 30 },
      ],
    };
    window.OpenCourseDeck.DB.PlasmaDB = class {
      async getAllByIndex(store, indexName, value) {
        calls.push([store, indexName, value]);
        return stores[store].filter(record => record?.[indexName] === value);
      }
    };

    await expect(window.DB.getProgressByCourse('course-a')).resolves.toEqual([
      expect.objectContaining({ topicId: 'topic-a' }),
    ]);
    await expect(window.DB.getTimestampsByTopic('topic-a')).resolves.toEqual([
      expect.objectContaining({ id: 'ts-a' }),
    ]);
    await expect(window.DB.getTimestampsByCourse('course-b')).resolves.toEqual([
      expect.objectContaining({ id: 'ts-b' }),
    ]);
    expect(calls).toEqual([
      ['progress', 'courseId', 'course-a'],
      ['timestamps', 'topicId', 'topic-a'],
      ['timestamps', 'courseId', 'course-b'],
    ]);
  });

  it('reads notes and child folders through indexed helpers from the first launch', async () => {
    const calls = [];
    const stores = {
      notes: [
        { id: 'n1', topicId: 'topic-a', courseId: 'course-a', folderId: 'default', updatedAt: 10 },
        { id: 'n2', topicId: 'topic-b', courseId: 'course-a', folderId: 'folder-a', updatedAt: 30 },
        { id: 'n3', topicId: 'topic-c', courseId: 'course-c', folderId: 'folder-b', updatedAt: 20 },
      ],
      folders: [
        { id: 'folder-a', parentId: 'root', name: 'A' },
        { id: 'folder-b', parentId: 'root', name: 'B' },
        { id: 'folder-c', name: 'Top level' },
      ],
    };
    window.OpenCourseDeck.DB.PlasmaDB = class {
      async getAll(store) {
        calls.push([store, 'getAll']);
        return stores[store] ?? [];
      }
      async getAllByIndex(store, indexName, value) {
        calls.push([store, indexName, value]);
        return stores[store].filter(record => record?.[indexName] === value);
      }
      async queryIndex(store, indexName, range, { limit, direction = 'next' } = {}) {
        calls.push([store, indexName, range, limit, direction]);
        return [...stores[store]]
          .sort((a, b) => Number(b[indexName] ?? 0) - Number(a[indexName] ?? 0))
          .slice(0, limit);
      }
    };

    await expect(window.DB.getNotesByTopic('topic-b')).resolves.toEqual([
      expect.objectContaining({ id: 'n2' }),
    ]);
    await expect(window.DB.getNotesByCourse('course-a')).resolves.toEqual([
      expect.objectContaining({ id: 'n1' }),
      expect.objectContaining({ id: 'n2' }),
    ]);
    await expect(window.DB.getNotesByFolder('folder-b')).resolves.toEqual([
      expect.objectContaining({ id: 'n3' }),
    ]);
    await expect(window.DB.getFoldersByParent('root')).resolves.toEqual([
      expect.objectContaining({ id: 'folder-a' }),
      expect.objectContaining({ id: 'folder-b' }),
    ]);
    await expect(window.DB.getRecentNotes(2)).resolves.toEqual([
      expect.objectContaining({ id: 'n2' }),
      expect.objectContaining({ id: 'n3' }),
    ]);
    expect(calls).toEqual(expect.arrayContaining([
      ['notes', 'topicId', 'topic-b'],
      ['notes', 'courseId', 'course-a'],
      ['notes', 'folderId', 'folder-b'],
      ['folders', 'parentId', 'root'],
      ['notes', 'updatedAt', null, 2, 'prev'],
    ]));
  });

  it('falls back to localStorage for indexed helpers when IndexedDB is unavailable', async () => {
    window.OpenCourseDeck.DB.PlasmaDB = null;
    localStorage.setItem('plasma_progress_v1', JSON.stringify({
      'topic-a': { topicId: 'topic-a', courseId: 'course-a' },
      'topic-b': { topicId: 'topic-b', courseId: 'course-b' },
    }));
    localStorage.setItem('plasma_timestamps_v1', JSON.stringify([
      { id: 'ts-a', topicId: 'topic-a', courseId: 'course-a' },
      { id: 'ts-b', topicId: 'topic-b', courseId: 'course-b' },
    ]));
    localStorage.setItem('ocd_notes', JSON.stringify([
      { id: 'n1', topicId: 'topic-a', courseId: 'course-a', updatedAt: 10 },
      { id: 'n2', topicId: 'topic-b', courseId: 'course-a', folderId: 'folder-a', updatedAt: 30 },
      { id: 'n3', topicId: 'topic-c', courseId: 'course-c', folderId: 'folder-a', updatedAt: 20 },
    ]));
    localStorage.setItem('ocd_folders', JSON.stringify([
      { id: 'folder-a', parentId: 'root' },
      { id: 'folder-b' },
    ]));

    await expect(window.DB.getProgressByCourse('course-a')).resolves.toEqual([
      expect.objectContaining({ topicId: 'topic-a' }),
    ]);
    await expect(window.DB.getTimestampsByTopic('topic-b')).resolves.toEqual([
      expect.objectContaining({ id: 'ts-b' }),
    ]);
    await expect(window.DB.getNotesByCourse('course-a')).resolves.toEqual([
      expect.objectContaining({ id: 'n1' }),
      expect.objectContaining({ id: 'n2' }),
    ]);
    await expect(window.DB.getNotesByFolder('default')).resolves.toEqual([
      expect.objectContaining({ id: 'n1' }),
    ]);
    await expect(window.DB.getNotesByFolder('folder-a')).resolves.toEqual([
      expect.objectContaining({ id: 'n2' }),
      expect.objectContaining({ id: 'n3' }),
    ]);
    await expect(window.DB.getRecentNotes(2)).resolves.toEqual([
      expect.objectContaining({ id: 'n2' }),
      expect.objectContaining({ id: 'n3' }),
    ]);
    await expect(window.DB.getFoldersByParent(null)).resolves.toEqual([
      expect.objectContaining({ id: 'folder-b' }),
    ]);
  });
  it('keeps the localStorage note mirror intact when the IndexedDB delete cannot run', async () => {
    // LocalStorage mode must delete only the selected record, not the whole deck.
    localStorage.setItem('ocd_notes', JSON.stringify([
      { id: 'keep-me', title: 'Survivor' },
      { id: 'drop-me', title: 'Doomed' },
    ]));
    window.OpenCourseDeck.DB.PlasmaDB = undefined;

    await window.DB.deleteNote('drop-me');

    const remaining = JSON.parse(localStorage.getItem('ocd_notes'));
    expect(remaining).toEqual([expect.objectContaining({ id: 'keep-me' })]);
  });

  it('broadcasts localStorage-fallback writes so cross-tab sync works without IndexedDB', async () => {
    const channels = [];
    class BroadcastChannelMock {
      constructor(name) {
        this.name = name;
        this.postMessage = vi.fn();
        this.close = vi.fn();
        channels.push(this);
      }
    }
    window.BroadcastChannel = BroadcastChannelMock;
    window.OpenCourseDeck.DB.PlasmaDB = undefined;

    await window.DB.saveNote({ id: 'fallback-note', title: 'No IDB' });

    expect(channels.length).toBeGreaterThanOrEqual(1);
    const posted = channels.flatMap((ch) => ch.postMessage.mock.calls.map(([msg]) => msg));
    expect(posted).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'note', action: 'save' }),
    ]));
  });
  it('never resolves a canonical setting from an obsolete alias', async () => {
    localStorage.setItem('plasma-playlists', JSON.stringify([{ id: 'obsolete' }]));
    expect(await window.DB.getSetting('ocd_playlists')).toBeNull();
    await window.DB.saveSetting('ocd_playlists', [{ id: 'new-1' }]);
    expect(await window.DB.getSetting('ocd_playlists')).toEqual([{ id: 'new-1' }]);
  });

});
