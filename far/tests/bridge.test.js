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
    window.PlasmaDeck = {};
    await indexedDB.deleteDatabase('plasmadeck');
    await import('../db.js');
    await import('../bridge.js');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalBroadcastChannel) window.BroadcastChannel = originalBroadcastChannel;
    else delete window.BroadcastChannel;
  });

  it('merges localStorage and IndexedDB notes during compatibility migration', async () => {
    localStorage.setItem('plasma-notes', JSON.stringify([
      { id: 'n1', title: 'Local older', updatedAt: 10 },
      { id: 'n2', title: 'Local only', updatedAt: 20 },
    ]));

    await window.DB.saveNote({ id: 'n1', title: 'IDB newer', updatedAt: 30 });
    const notes = await window.DB.getAllNotes();
    const byId = Object.fromEntries(notes.map((note) => [note.id, note]));

    expect(byId.n1.title).toBe('IDB newer');
    expect(byId.n2.title).toBe('Local only');
  });

  it('uses IndexedDB as canonical for notes after migration completes', async () => {
    await window.DB.saveNote({ id: 'n1', title: 'Canonical IDB', updatedAt: 30 });
    localStorage.setItem('plasma-notes', JSON.stringify([
      { id: 'n1', title: 'Stale local newer timestamp', updatedAt: 999 },
      { id: 'local-only-after-migration', title: 'Should stay out', updatedAt: 1000 },
    ]));
    localStorage.setItem('plasma_migrated_v2', 'true');

    const notes = await window.DB.getAllNotes();

    expect(notes).toEqual([expect.objectContaining({ id: 'n1', title: 'Canonical IDB' })]);
    expect(notes).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'local-only-after-migration' }),
    ]));
  });

  it('saves notes to canonical IndexedDB without refreshing localStorage after migration completes', async () => {
    localStorage.setItem('plasma_migrated_v2', 'true');

    const note = await window.DB.saveNote({ id: 'canonical-note-save', title: 'IDB only' });

    expect(note).toEqual(expect.objectContaining({ id: 'canonical-note-save', title: 'IDB only' }));
    expect(localStorage.getItem('plasma-notes')).toBeNull();
    expect(await window.DB.getAllNotes()).toEqual([
      expect.objectContaining({ id: 'canonical-note-save', title: 'IDB only' }),
    ]);
  });

  it('uses IndexedDB as canonical for folders and settings after migration completes', async () => {
    await window.DB.saveFolder({ id: 'f1', name: 'Canonical folder', updatedAt: 30 });
    await window.DB.saveSetting('plasma-playlists', [{ id: 'idb-playlist' }]);
    localStorage.setItem('plasma-folders', JSON.stringify([
      { id: 'f1', name: 'Stale folder', updatedAt: 999 },
      { id: 'local-folder', name: 'Local only' },
    ]));
    localStorage.setItem('plasma-playlists', JSON.stringify([{ id: 'local-playlist' }]));
    localStorage.setItem('plasma_migrated_v2', 'true');

    expect(await window.DB.getAllFolders()).toEqual([expect.objectContaining({ id: 'f1', name: 'Canonical folder' })]);
    expect(await window.DB.getSetting('plasma-playlists')).toEqual([{ id: 'idb-playlist' }]);
  });

  it('saves folders and settings to canonical IndexedDB without refreshing localStorage after migration completes', async () => {
    localStorage.setItem('plasma_migrated_v2', 'true');

    const folder = await window.DB.saveFolder({ id: 'canonical-folder-save', name: 'IDB folder' });
    const setting = await window.DB.saveSetting('plasma-notes-settings', { view: 'kanban' });

    expect(folder).toEqual(expect.objectContaining({ id: 'canonical-folder-save', name: 'IDB folder' }));
    expect(setting).toEqual({ view: 'kanban' });
    expect(localStorage.getItem('plasma-folders')).toBeNull();
    expect(localStorage.getItem('plasma-notes-settings')).toBeNull();
    expect(await window.DB.getAllFolders()).toEqual([
      expect.objectContaining({ id: 'canonical-folder-save', name: 'IDB folder' }),
    ]);
    expect(await window.DB.getSetting('plasma-notes-settings')).toEqual({ view: 'kanban' });
  });

  it('uses IndexedDB as canonical for annotations after migration completes', async () => {
    await window.DB.saveAnnotations('doc-a', {
      1: [{ id: 'idb-ann', type: 'highlight', updatedAt: 30 }],
    });
    localStorage.setItem('plasma-pdf-annotations', JSON.stringify({
      1: [
        { id: 'idb-ann', docId: 'doc-a', type: 'stale-local', updatedAt: 999 },
        { id: 'local-ann', docId: 'doc-a', type: 'local-only', updatedAt: 1000 },
      ],
    }));
    localStorage.setItem('plasma_migrated_v2', 'true');

    const annotations = await window.DB.getAnnotations('doc-a');
    const all = await window.DB.getAllAnnotations();

    expect(annotations).toEqual([expect.objectContaining({ id: 'idb-ann', type: 'highlight' })]);
    expect(all).toEqual([expect.objectContaining({ id: 'idb-ann', type: 'highlight' })]);
  });

  it('saves annotations to canonical IndexedDB without refreshing localStorage after migration completes', async () => {
    localStorage.setItem('plasma_migrated_v2', 'true');

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
    await window.DB.saveSetting('plasma-notes-settings', { view: 'list' });
    await window.DB.saveSetting('plasma-playlists', [{ id: 'playlist-1' }]);
    await window.DB.saveSetting('plasma-studio-board', { version: 1, layers: [] });
    localStorage.setItem('plasma-pdf-annotations', JSON.stringify([{ id: 'ann-1' }]));

    await window.DB.clearAll();

    expect(await window.DB.getAllProgress()).toEqual([]);
    expect(await window.DB.getAllTimestamps()).toEqual([]);
    expect(await window.DB.getAllNotes()).toEqual([]);
    expect(await window.DB.getAllFolders()).toEqual([]);
    expect(localStorage.getItem('plasma-notes')).toBeNull();
    expect(localStorage.getItem('plasma-folders')).toBeNull();
    expect(localStorage.getItem('plasma-notes-settings')).toBeNull();
    expect(localStorage.getItem('plasma-playlists')).toBeNull();
    expect(localStorage.getItem('plasma-studio-board')).toBeNull();
    expect(localStorage.getItem('plasma-pdf-annotations')).toBeNull();
  });

  it('clearUserData removes only the requested data scope', async () => {
    await window.DB.saveProgress('topic-1', 'course-1', { status: 'done' });
    await window.DB.saveTimestamp({ id: 'ts-1', topicId: 'topic-1' });
    await window.DB.saveNote({ id: 'note-1', title: 'Note' });
    await window.DB.saveFolder({ id: 'folder-1', name: 'Folder' });
    await window.DB.saveSetting('plasma-notes-settings', { view: 'list' });
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
    expect(localStorage.getItem('plasma-notes')).toBeNull();
    expect(localStorage.getItem('plasma-folders')).toBeNull();
    expect(localStorage.getItem('plasma-notes-settings')).toBeNull();
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

  it('does not fall back to localStorage when progress save hits storage quota', async () => {
    localStorage.setItem('plasma_migrated_v2', 'true');
    const emit = vi.fn();
    const quotaError = Object.assign(new Error('Quota exceeded'), { name: 'QuotaExceededError' });
    window.PlasmaDeck.bus = { emit };
    window.PlasmaDeck.DB.PlasmaDB = class {
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

  it('signals transient progress write failures before using localStorage fallback', async () => {
    localStorage.setItem('plasma_migrated_v2', 'true');
    const emit = vi.fn();
    window.PlasmaDeck.bus = { emit };
    window.PlasmaDeck.DB.PlasmaDB = class {
      async get() { return null; }
      async put() { throw new Error('Temporary IDB failure'); }
    };

    const progress = await window.DB.saveProgress('topic-fallback', 'course-a', { status: 'done' });
    const saved = JSON.parse(localStorage.getItem('plasma_progress_v1'));

    expect(progress.status).toBe('done');
    expect(saved['topic-fallback']).toEqual(expect.objectContaining({ status: 'done' }));
    expect(emit).toHaveBeenCalledWith('storage:save-error', expect.objectContaining({
      kind: 'progress',
      backend: 'indexedDB',
      error: expect.objectContaining({ quota: false }),
    }));
    expect(emit).toHaveBeenCalledWith('storage:fallback', expect.objectContaining({
      kind: 'progress',
      fallbackBackend: 'localStorage',
    }));
  });

  it('does not mark migration complete when a compatibility section fails', async () => {
    localStorage.setItem('plasma-notes', JSON.stringify([
      { id: 'legacy-note', title: 'Legacy note', updatedAt: 10 },
    ]));
    const emit = vi.fn();
    window.PlasmaDeck.bus = { emit };
    window.PlasmaDeck.DB.PlasmaDB = class {
      async put(store) {
        if (store === 'notes') throw new Error('notes migration failed');
      }
      async getAll() { return []; }
    };

    const notes = await window.DB.getAllNotes();

    expect(notes).toEqual([expect.objectContaining({ id: 'legacy-note' })]);
    expect(localStorage.getItem('plasma_migrated_v2')).toBeNull();
    expect(emit).toHaveBeenCalledWith('storage:migration-error', expect.objectContaining({
      kind: 'migration',
      backend: 'indexedDB',
      failures: [expect.objectContaining({
        section: 'notes',
        error: expect.objectContaining({ message: 'notes migration failed' }),
      })],
    }));
  });

  it('marks migration complete only after every compatibility section succeeds', async () => {
    localStorage.setItem('plasma_progress_v1', JSON.stringify({
      'topic-1': { topicId: 'topic-1', courseId: 'course-1', updatedAt: 1 },
    }));
    localStorage.setItem('plasma_timestamps_v1', JSON.stringify([
      { id: 'ts-1', topicId: 'topic-1' },
    ]));
    localStorage.setItem('plasma-notes', JSON.stringify([
      { id: 'note-1', title: 'Note' },
    ]));
    localStorage.setItem('plasma-folders', JSON.stringify([
      { id: 'folder-1', name: 'Folder' },
    ]));
    localStorage.setItem('plasma-notes-settings', JSON.stringify({ view: 'list' }));
    localStorage.setItem('plasma-pdf-annotations', JSON.stringify([
      { id: 'ann-1', docId: 'doc-a', page: 1 },
    ]));

    await window.DB.getAllProgress();

    expect(localStorage.getItem('plasma_migrated_v2')).toBe('true');
  });

  it('does not fall back to localStorage when timestamp save hits storage quota', async () => {
    localStorage.setItem('plasma_migrated_v2', 'true');
    const emit = vi.fn();
    const quotaError = Object.assign(new Error('Persistent storage full'), { name: 'QuotaExceededError' });
    window.PlasmaDeck.bus = { emit };
    window.PlasmaDeck.DB.PlasmaDB = class {
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
    window.PlasmaDeck.bus = { emit };
    window.PlasmaDeck.DB.PlasmaDB = null;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(key, value) {
      if (key === 'plasma-notes') throw quotaError;
      return originalSetItem.call(this, key, value);
    });

    await expect(window.DB.saveNote({ id: 'note-quota', title: 'Cannot save' })).rejects.toThrow('localStorage quota exceeded');

    expect(emit).toHaveBeenCalledWith('storage:save-error', expect.objectContaining({
      kind: 'note',
      backend: 'localStorage',
      key: 'plasma-notes',
      error: expect.objectContaining({ quota: true }),
    }));
  });

  it('signals and rejects canonical IndexedDB folder failures after migration completes', async () => {
    localStorage.setItem('plasma_migrated_v2', 'true');
    const emit = vi.fn();
    const quotaError = Object.assign(new Error('canonical quota exceeded'), { name: 'QuotaExceededError' });
    window.PlasmaDeck.bus = { emit };
    window.PlasmaDeck.DB.PlasmaDB = class {
      async put() { throw quotaError; }
    };

    await expect(window.DB.saveFolder({ id: 'folder-quota', name: 'Do not diverge' })).rejects.toThrow('canonical quota exceeded');

    expect(localStorage.getItem('plasma-folders')).toBeNull();
    expect(emit).toHaveBeenCalledWith('storage:save-error', expect.objectContaining({
      kind: 'folder',
      backend: 'indexedDB',
      canonical: true,
      error: expect.objectContaining({ quota: true }),
    }));
  });

  it('signals and rejects canonical IndexedDB setting failures after migration completes', async () => {
    localStorage.setItem('plasma_migrated_v2', 'true');
    const emit = vi.fn();
    window.PlasmaDeck.bus = { emit };
    window.PlasmaDeck.DB.PlasmaDB = class {
      async put() { throw new Error('settings canonical failed'); }
    };

    await expect(window.DB.saveSetting('plasma-notes-settings', { view: 'grid' })).rejects.toThrow('settings canonical failed');

    expect(localStorage.getItem('plasma-notes-settings')).toBeNull();
    expect(emit).toHaveBeenCalledWith('storage:save-error', expect.objectContaining({
      kind: 'setting',
      backend: 'indexedDB',
      canonical: true,
      error: expect.objectContaining({ quota: false }),
    }));
  });

  it('signals and rejects canonical IndexedDB annotation failures after migration completes', async () => {
    localStorage.setItem('plasma_migrated_v2', 'true');
    const emit = vi.fn();
    window.PlasmaDeck.bus = { emit };
    window.PlasmaDeck.DB.PlasmaDB = class {
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
    window.PlasmaDeck.bus = { emit: vi.fn() };

    const note = await window.DB.saveNote({ id: 'note-sync', title: 'Synced note' });

    expect(channels).toHaveLength(1);
    expect(channels[0].name).toBe('plasmadeck_sync');
    expect(channels[0].postMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'note',
      action: 'save',
      record: expect.objectContaining({ id: 'note-sync', title: 'Synced note' }),
      source: expect.any(String),
    }));
    expect(window.PlasmaDeck.bus.emit).toHaveBeenCalledWith('sync:local-change', expect.objectContaining({
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

    expect(window.PlasmaDeck.bus.emit).toHaveBeenCalledWith('sync:message', expect.objectContaining({
      kind: 'progress',
      action: 'save',
      source: 'external-tab',
    }));
    expect(window.PlasmaDeck.bus.emit).toHaveBeenCalledWith('progress:save', expect.objectContaining({
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

  it('merges legacy localStorage annotations into backup export', async () => {
    localStorage.setItem('plasma-pdf-annotations', JSON.stringify({
      4: [{ id: 'legacy-1', type: 'highlight', updatedAt: 10 }],
    }));

    const all = await window.DB.getAllAnnotations();

    expect(all).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'legacy-1', docId: 'global', page: 4 }),
    ]));
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
    expect(localStorage.getItem('plasma-notes')).toBeNull();
    expect(localStorage.getItem('plasma-folders')).toBeNull();
  });

  it('deletes timestamps from local mirrors and IndexedDB stores', async () => {
    await window.DB.saveTimestamp({ id: 'delete-ts', topicId: 'topic-1', position: 42 });

    await window.DB.deleteTimestamp('delete-ts');

    expect(await window.DB.getAllTimestamps()).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'delete-ts' }),
    ]));
    expect(JSON.parse(localStorage.getItem('plasma_timestamps_v1'))).toEqual([]);
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

  it('reads progress and timestamps through IndexedDB indexes after migration completes', async () => {
    localStorage.setItem('plasma_migrated_v2', 'true');
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
    window.PlasmaDeck.DB.PlasmaDB = class {
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

  it('reads notes and child folders through indexed helpers after migration completes', async () => {
    localStorage.setItem('plasma_migrated_v2', 'true');
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
    window.PlasmaDeck.DB.PlasmaDB = class {
      async getAll(store) {
        calls.push([store, 'getAll']);
        return stores[store] ?? [];
      }
      async getAllByIndex(store, indexName, value) {
        calls.push([store, indexName, value]);
        return stores[store].filter(record => record?.[indexName] === value);
      }
      async queryIndex(store, indexName, range, limit, options = {}) {
        calls.push([store, indexName, range, limit, options.direction]);
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
    window.PlasmaDeck.DB.PlasmaDB = null;
    localStorage.setItem('plasma_progress_v1', JSON.stringify({
      'topic-a': { topicId: 'topic-a', courseId: 'course-a' },
      'topic-b': { topicId: 'topic-b', courseId: 'course-b' },
    }));
    localStorage.setItem('plasma_timestamps_v1', JSON.stringify([
      { id: 'ts-a', topicId: 'topic-a', courseId: 'course-a' },
      { id: 'ts-b', topicId: 'topic-b', courseId: 'course-b' },
    ]));
    localStorage.setItem('plasma-notes', JSON.stringify([
      { id: 'n1', topicId: 'topic-a', courseId: 'course-a', updatedAt: 10 },
      { id: 'n2', topicId: 'topic-b', courseId: 'course-a', folderId: 'folder-a', updatedAt: 30 },
      { id: 'n3', topicId: 'topic-c', courseId: 'course-c', folderId: 'folder-a', updatedAt: 20 },
    ]));
    localStorage.setItem('plasma-folders', JSON.stringify([
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
});
