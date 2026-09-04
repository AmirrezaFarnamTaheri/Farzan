import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const now = Date.now();

function seedNotes() {
  localStorage.setItem('ocd_notes', JSON.stringify([
    {
      id: 'pinned-note',
      title: 'Pinned note',
      content: '<p>Important</p>',
      folderId: 'default',
      tags: [],
      pinned: true,
      createdAt: now - 1000,
      updatedAt: now - 1000,
      wordCount: 1,
      charCount: 9,
    },
    {
      id: 'regular-note',
      title: 'Regular note',
      content: '<p>Ordinary</p>',
      folderId: 'default',
      tags: [],
      pinned: false,
      createdAt: now,
      updatedAt: now,
      wordCount: 1,
      charCount: 8,
    },
    {
      id: 'malicious-note',
      title: '<img src=x onerror="window.__noteTitleXss = true">',
      content: '<p>Body</p>',
      folderId: 'xss-folder',
      tags: ['<svg onload="window.__noteTagXss = true"></svg>'],
      pinned: false,
      createdAt: now - 500,
      updatedAt: now - 500,
      wordCount: 1,
      charCount: 4,
    },
  ]));
  localStorage.setItem('ocd_folders', JSON.stringify([
    { id: 'default', name: 'Personal', icon: 'Folder', color: '' },
    { id: 'xss-folder', name: '<img src=x onerror="window.__folderNameXss = true">', icon: '<svg onload="window.__folderIconXss = true"></svg>', color: '' },
  ]));
}

describe('notes route filters', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    localStorage.clear();
    seedNotes();
    document.execCommand = vi.fn();
    document.queryCommandState = vi.fn(() => false);
    document.queryCommandValue = vi.fn(() => '');
    window.DB = {
      getAllNotes: vi.fn(() => Promise.resolve(JSON.parse(localStorage.getItem('ocd_notes') || '[]'))),
      getAllFolders: vi.fn(() => Promise.resolve(JSON.parse(localStorage.getItem('ocd_folders') || '[]'))),
      getSetting: vi.fn(() => Promise.resolve(null)),
      saveNote: vi.fn((note) => {
        const notes = JSON.parse(localStorage.getItem('ocd_notes') || '[]');
        const idx = notes.findIndex((item) => item.id === note.id);
        if (idx >= 0) notes[idx] = note;
        else notes.unshift(note);
        localStorage.setItem('ocd_notes', JSON.stringify(notes));
        return Promise.resolve(note);
      }),
      deleteNote: vi.fn((id) => {
        const notes = JSON.parse(localStorage.getItem('ocd_notes') || '[]').filter((note) => note.id !== id);
        localStorage.setItem('ocd_notes', JSON.stringify(notes));
        return Promise.resolve(true);
      }),
      saveFolder: vi.fn((folder) => {
        const folders = JSON.parse(localStorage.getItem('ocd_folders') || '[]');
        const idx = folders.findIndex((item) => item.id === folder.id);
        if (idx >= 0) folders[idx] = folder;
        else folders.push(folder);
        localStorage.setItem('ocd_folders', JSON.stringify(folders));
        return Promise.resolve(folder);
      }),
      deleteFolder: vi.fn((id) => {
        const folders = JSON.parse(localStorage.getItem('ocd_folders') || '[]').filter((folder) => folder.id !== id);
        localStorage.setItem('ocd_folders', JSON.stringify(folders));
        return Promise.resolve(true);
      }),
      saveSetting: vi.fn((key, value) => {
        localStorage.setItem(key, JSON.stringify(value));
        return Promise.resolve(value);
      }),
    };
    window.OpenCourseDeck = {
      bus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
      beforeUnload: { mark: vi.fn(), unmark: vi.fn() },
      Toast: { success: vi.fn(), error: vi.fn() },
      UI: { confirm: vi.fn(() => Promise.resolve(true)) },
    };
    document.body.innerHTML = `
      <aside data-folders-panel></aside>
      <div data-tags-cloud></div>
      <input data-notes-search />
      <div data-notes-list></div>
      <div data-notes-main-pane>
        <input data-note-title-input />
        <button data-notes-semantic-search hidden>Semantic search</button>
        <button data-notes-semantic-clear hidden>Clear semantic</button>
        <div data-notes-semantic-status></div>
        <div data-notes-toolbar><button data-ai-summarize hidden>Summarize note</button></div>
        <article data-notes-editor></article>
      </div>
    `;

    await import('../notes.js');
  });

  afterEach(() => {
    window.PlasmaNotesApp?.destroy?.();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('shows only pinned notes when the pinned folder is selected', () => {
    document.querySelector('[data-folder-id="__pinned__"]').click();

    const list = document.querySelector('[data-notes-list]');
    expect(list.textContent).toContain('Pinned note');
    expect(list.textContent).not.toContain('Regular note');
    expect(document.querySelector('[data-folder-id="__pinned__"]').classList.contains('active')).toBe(true);
  });

  it('filters notes by search query and clears the query with Escape', async () => {
    const input = document.querySelector('[data-notes-search]');

    input.value = 'regular';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(300);

    const list = document.querySelector('[data-notes-list]');
    expect(list.textContent).toContain('Regular note');
    expect(list.textContent).not.toContain('Pinned note');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(input.value).toBe('');
    expect(list.textContent).toContain('Regular note');
    expect(list.textContent).toContain('Pinned note');
  });

  it('ignores delayed editor selection refreshes after the notes route unmounts', async () => {
    const editor = document.querySelector('[data-notes-editor]');
    editor.focus();
    document.queryCommandState.mockImplementation(() => {
      throw new Error('stale toolbar refresh');
    });

    document.dispatchEvent(new Event('selectionchange'));
    window.PlasmaNotesApp.destroy();

    await vi.advanceTimersByTimeAsync(150);
    expect(document.queryCommandState).not.toHaveBeenCalled();
  });

  it('routes note create, update, and delete through the DB bridge when available', async () => {
    window.PlasmaNotesApp.newNote('default');
    const created = window.DB.saveNote.mock.calls.at(-1)[0];
    expect(created).toEqual(expect.objectContaining({ folderId: 'default' }));

    window.PlasmaNotesStore.updateNote(created.id, { title: 'Canonical title' });
    expect(window.DB.saveNote.mock.calls.at(-1)[0]).toEqual(expect.objectContaining({
      id: created.id,
      title: 'Canonical title',
    }));

    await window.PlasmaNotesApp.deleteNote(created.id);
    expect(window.DB.deleteNote).toHaveBeenCalledWith(created.id);
  });

  it('routes folder and settings writes through the DB bridge when available', () => {
    const folder = window.PlasmaNotesStore.createFolder('Canonical folder');
    window.PlasmaNotesStore.saveSettings({ view: 'grid' });
    window.PlasmaNotesStore.deleteFolder(folder.id);

    expect(window.DB.saveFolder).toHaveBeenCalledWith(expect.objectContaining({
      id: folder.id,
      name: 'Canonical folder',
    }));
    expect(window.DB.saveSetting).toHaveBeenCalledWith('ocd_notes_settings', { view: 'grid' });
    expect(window.DB.deleteFolder).toHaveBeenCalledWith(folder.id);
  });

  it('keeps notes, folders, and settings coherent in memory when DB bridge writes are canonical', () => {
    window.DB.saveNote.mockImplementation((note) => Promise.resolve(note));
    window.DB.deleteNote.mockImplementation(() => Promise.resolve(true));
    window.DB.saveFolder.mockImplementation((folder) => Promise.resolve(folder));
    window.DB.deleteFolder.mockImplementation(() => Promise.resolve(true));
    window.DB.saveSetting.mockImplementation((_key, value) => Promise.resolve(value));

    const note = window.PlasmaNotesStore.createNote({ title: 'Memory canonical note', folderId: 'default' });
    expect(window.PlasmaNotesStore.getNote(note.id)).toEqual(expect.objectContaining({
      title: 'Memory canonical note',
    }));
    expect(JSON.parse(localStorage.getItem('ocd_notes'))).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: note.id }),
    ]));

    window.PlasmaNotesStore.updateNote(note.id, { title: 'Memory updated note' });
    expect(window.PlasmaNotesStore.getNote(note.id).title).toBe('Memory updated note');

    window.PlasmaNotesStore.deleteNote(note.id);
    expect(window.PlasmaNotesStore.getNote(note.id)).toBeNull();

    const folder = window.PlasmaNotesStore.createFolder('Memory folder');
    expect(window.PlasmaNotesStore.getFolders()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: folder.id, name: 'Memory folder' }),
    ]));
    window.PlasmaNotesStore.deleteFolder(folder.id);
    expect(window.PlasmaNotesStore.getFolders()).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: folder.id }),
    ]));

    window.PlasmaNotesStore.saveSettings({ view: 'kanban' });
    expect(window.PlasmaNotesStore.getSettings()).toEqual({ view: 'kanban' });
  });

  it('moves notes from deleted folders back to the default folder through canonical note saves', () => {
    const folder = window.PlasmaNotesStore.createFolder('Temporary folder');
    window.PlasmaNotesStore.createNote({
      title: 'Foldered note',
      content: '<p>Inside temp</p>',
      folderId: folder.id,
    });
    window.DB.saveNote.mockClear();

    window.PlasmaNotesStore.deleteFolder(folder.id);

    const notes = JSON.parse(localStorage.getItem('ocd_notes'));
    expect(notes).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Foldered note', folderId: 'default' }),
    ]));
    expect(window.DB.saveNote).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Foldered note',
      folderId: 'default',
    }));
  });

  it('protects system folders and coerces pseudo-folder note writes to default', () => {
    const defaultDelete = document.querySelector('[data-delete-folder="default"]');
    expect(defaultDelete).toBeNull();

    window.DB.deleteFolder.mockClear();
    const result = window.PlasmaNotesStore.deleteFolder('default');
    expect(result).toEqual({ deleted: false, moved: 0 });
    expect(window.DB.deleteFolder).not.toHaveBeenCalled();
    expect(window.PlasmaNotesStore.getFolders()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'default' }),
    ]));

    const note = window.PlasmaNotesStore.createNote({ title: 'Pinned pseudo folder', folderId: '__pinned__' });
    expect(note.folderId).toBe('default');

    window.PlasmaNotesStore.updateNote('regular-note', { folderId: '__pinned__' });
    expect(window.PlasmaNotesStore.getNote('regular-note').folderId).toBe('default');
  });

  it('hydrates the notes UI from canonical DB reads without rewriting local mirrors', async () => {
    window.PlasmaNotesStore._hydrated = false;
    const localNotesBefore = localStorage.getItem('ocd_notes');
    const localFoldersBefore = localStorage.getItem('ocd_folders');
    window.DB.getAllNotes.mockResolvedValueOnce([
      {
        id: 'canonical-note',
        title: 'Canonical note',
        content: '<p>From IDB</p>',
        folderId: 'canonical-folder',
        tags: ['db'],
        pinned: false,
        createdAt: now + 10,
        updatedAt: now + 10,
      },
    ]);
    window.DB.getAllFolders.mockResolvedValueOnce([
      { id: 'canonical-folder', name: 'Canonical folder', icon: 'DB', color: '' },
    ]);
    window.DB.getSetting.mockResolvedValueOnce({ view: 'grid' });

    await window.PlasmaNotesStore.hydrateFromDB();
    window.PlasmaNotesApp.openNote('canonical-note');

    expect(localStorage.getItem('ocd_notes')).toBe(localNotesBefore);
    expect(localStorage.getItem('ocd_folders')).toBe(localFoldersBefore);
    expect(localStorage.getItem('ocd_notes_settings')).toBeNull();
    expect(window.PlasmaNotesStore.getNotes()).toEqual([
      expect.objectContaining({ id: 'canonical-note', title: 'Canonical note' }),
    ]);
    expect(window.PlasmaNotesStore.getFolders()).toEqual([
      expect.objectContaining({ id: 'canonical-folder', name: 'Canonical folder' }),
    ]);
    expect(window.PlasmaNotesStore.getSettings()).toEqual({ view: 'grid' });
    expect(document.querySelector('[data-note-title-input]').value).toBe('Canonical note');
    expect(document.querySelector('[data-notes-editor]').textContent).toContain('From IDB');
  });

  it('refreshes canonical note sync in place without overwriting a pending editor draft', async () => {
    const titleInput = document.querySelector('[data-note-title-input]');
    const editor = document.querySelector('[data-notes-editor]');

    titleInput.value = 'Local draft title';
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    editor.innerHTML = '<p>Local draft body</p>';
    editor.dispatchEvent(new Event('input', { bubbles: true }));

    window.DB.getAllNotes.mockResolvedValueOnce([
      {
        id: 'pinned-note',
        title: 'Synced canonical title',
        content: '<p>Synced canonical body</p>',
        folderId: 'default',
        tags: ['synced'],
        pinned: true,
        createdAt: now - 1000,
        updatedAt: now + 1000,
        wordCount: 3,
        charCount: 21,
      },
      {
        id: 'remote-note',
        title: 'Remote only note',
        content: '<p>Arrived from another window</p>',
        folderId: 'default',
        tags: ['remote'],
        pinned: false,
        createdAt: now + 10,
        updatedAt: now + 10,
        wordCount: 4,
        charCount: 27,
      },
    ]);

    const result = await window.PlasmaNotesApp.refreshFromSync({ kind: 'note', action: 'save' });

    expect(result).toEqual(expect.objectContaining({
      refreshed: true,
      kind: 'note',
      currentId: 'pinned-note',
      editorReloaded: false,
    }));
    expect(window.PlasmaNotesStore.getNote('pinned-note').title).toBe('Synced canonical title');
    expect(document.querySelector('[data-notes-list]').textContent).toContain('Remote only note');
    expect(titleInput.value).toBe('Local draft title');
    expect(editor.textContent).toContain('Local draft body');
    expect(window.OpenCourseDeck.bus.emit).toHaveBeenCalledWith('notes:sync-refresh', expect.objectContaining({
      refreshed: true,
      kind: 'note',
      editorReloaded: false,
    }));
  });

  it('repairs split notes storage by merging local and canonical DB records', async () => {
    window.PlasmaNotesStore._notes = null;
    window.PlasmaNotesStore._folders = null;
    window.PlasmaNotesStore._settings = null;
    localStorage.setItem('ocd_notes', JSON.stringify([
      { id: 'repair-same', title: 'Local older', folderId: '__pinned__', updatedAt: now - 10 },
      { id: 'repair-local', title: 'Local only', folderId: 'xss-folder', updatedAt: now + 1 },
    ]));
    localStorage.setItem('ocd_folders', JSON.stringify([
      { id: 'xss-folder', name: 'Local folder', icon: 'Folder', color: '' },
      { id: '__pinned__', name: 'Bad pinned folder', icon: 'Pin', color: '' },
    ]));
    localStorage.setItem('ocd_notes_settings', JSON.stringify({ view: 'list', density: 'compact' }));
    window.DB.getAllNotes.mockResolvedValueOnce([
      { id: 'repair-same', title: 'DB newer', folderId: 'default', updatedAt: now + 20 },
      { id: 'repair-db', title: 'DB only', folderId: 'default', updatedAt: now + 2 },
    ]);
    window.DB.getAllFolders.mockResolvedValueOnce([
      { id: 'db-folder', name: 'DB folder', icon: 'DB', color: '' },
    ]);
    window.DB.getSetting.mockResolvedValueOnce({ view: 'grid' });
    window.DB.saveNote.mockImplementation((note) => Promise.resolve(note));
    window.DB.saveFolder.mockImplementation((folder) => Promise.resolve(folder));
    window.DB.saveSetting.mockImplementation((_key, value) => Promise.resolve(value));

    const result = await window.PlasmaNotesStore.repairStorage();

    expect(result).toEqual({
      notes: { local: 2, db: 2, merged: 3 },
      folders: { local: 1, db: 1, merged: 2 },
      settings: { merged: 2 },
    });
    expect(window.PlasmaNotesStore.getNote('repair-same')).toEqual(expect.objectContaining({
      title: 'DB newer',
      folderId: 'default',
    }));
    expect(window.PlasmaNotesStore.getNote('repair-local')).toEqual(expect.objectContaining({
      title: 'Local only',
      folderId: 'xss-folder',
    }));
    expect(window.PlasmaNotesStore.getNote('repair-db')).toEqual(expect.objectContaining({
      title: 'DB only',
    }));
    expect(window.PlasmaNotesStore.getFolders()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'xss-folder' }),
      expect.objectContaining({ id: 'db-folder' }),
    ]));
    expect(window.PlasmaNotesStore.getFolders()).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: '__pinned__' }),
    ]));
    expect(window.PlasmaNotesStore.getSettings()).toEqual({ view: 'grid', density: 'compact' });
    expect(window.DB.saveNote).toHaveBeenCalledTimes(3);
    expect(window.DB.saveFolder).toHaveBeenCalledTimes(2);
    expect(window.DB.saveSetting).toHaveBeenCalledWith('ocd_notes_settings', { view: 'grid', density: 'compact' });
    expect(JSON.parse(localStorage.getItem('ocd_notes'))).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'repair-same', title: 'DB newer' }),
      expect.objectContaining({ id: 'repair-local' }),
      expect.objectContaining({ id: 'repair-db' }),
    ]));
    expect(window.OpenCourseDeck.lastNotesRepairResult).toEqual(result);
  });

  it('keeps localStorage as a bridge-less notes, folders, and settings fallback', () => {
    delete window.DB.saveNote;
    delete window.DB.saveFolder;
    delete window.DB.saveSetting;

    const note = window.PlasmaNotesStore.createNote({ title: 'Fallback note', folderId: 'default' });
    const folder = window.PlasmaNotesStore.createFolder('Fallback folder');
    window.PlasmaNotesStore.saveSettings({ view: 'list' });

    expect(JSON.parse(localStorage.getItem('ocd_notes'))).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: note.id, title: 'Fallback note' }),
    ]));
    expect(JSON.parse(localStorage.getItem('ocd_folders'))).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: folder.id, name: 'Fallback folder' }),
    ]));
    expect(JSON.parse(localStorage.getItem('ocd_notes_settings'))).toEqual({ view: 'list' });
  });

  it('reports bridge-less localStorage write failures through the storage issue channel', () => {
    delete window.DB.saveNote;
    const emit = vi.fn();
    const quotaError = Object.assign(new Error('notes storage full'), { name: 'QuotaExceededError' });
    const originalSetItem = Storage.prototype.setItem;
    window.OpenCourseDeck.bus.emit = emit;
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(key, value) {
      if (key === 'ocd_notes') throw quotaError;
      return originalSetItem.call(this, key, value);
    });

    const result = window.PlasmaNotesStore.saveNotes([{ id: 'fallback-fail', title: 'Cannot mirror' }]);
    setItemSpy.mockRestore();

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ quota: true, name: 'QuotaExceededError' }),
    }));
    expect(window.OpenCourseDeck.lastStorageIssue).toEqual(expect.objectContaining({
      kind: 'note-list',
      backend: 'localStorage',
      key: 'ocd_notes',
      error: expect.objectContaining({ quota: true }),
    }));
    expect(emit).toHaveBeenCalledWith('storage:save-error', expect.objectContaining({
      kind: 'note-list',
      backend: 'localStorage',
      key: 'ocd_notes',
    }));
  });

  it('renders note list and folder labels as text, not executable HTML', () => {
    const list = document.querySelector('[data-notes-list]');
    const folders = document.querySelector('[data-folders-panel]');

    expect(list.textContent).toContain('<img src=x');
    expect(list.textContent).toContain('<svg onload=');
    expect(folders.textContent).toContain('<img src=x');
    expect(folders.textContent).toContain('<svg onload=');
    expect(list.querySelector('img')).toBeNull();
    expect(folders.querySelector('img')).toBeNull();
    // The only SVG allowed in these panels is the inert sprite reference
    // (<svg class="icon"><use href="#i-…"/></svg>) the renderer emits itself.
    for (const svg of [...list.querySelectorAll('svg'), ...folders.querySelectorAll('svg')]) {
      expect(svg.getAttribute('onload')).toBeNull();
      expect(svg.classList.contains('icon')).toBe(true);
      expect([...svg.children].map((child) => child.tagName.toLowerCase())).toEqual(['use']);
      expect(svg.firstElementChild.getAttribute('href')).toMatch(/^#i-[a-z0-9-]+$/);
    }
    expect(window.__noteTitleXss).toBeUndefined();
    expect(window.__noteTagXss).toBeUndefined();
    expect(window.__folderNameXss).toBeUndefined();
    expect(window.__folderIconXss).toBeUndefined();
  });

  it('renders the empty notes state with DOM nodes', () => {
    const input = document.querySelector('[data-notes-search]');

    input.value = 'no matching notes at all';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(300);

    const empty = document.querySelector('.notes-empty');
    expect(empty?.textContent).toContain('No notes found');
    expect(empty?.querySelector('[data-action="new-note"]')?.textContent.trim()).toBe('New note');
  });

  it('renders large note lists incrementally and cancels queued batches on destroy', async () => {
    const notes = Array.from({ length: 125 }, (_, index) => ({
      id: `bulk-${index}`,
      title: `Bulk note ${index}`,
      content: '<p>Chunked note</p>',
      folderId: 'default',
      tags: [],
      pinned: false,
      createdAt: now - index,
      updatedAt: now - index,
      wordCount: 2,
      charCount: 12,
    }));
    window.PlasmaNotesStore._notes = notes;
    window.PlasmaNotesList._renderBatchSize = 50;

    window.PlasmaNotesList.render();
    const list = document.querySelector('[data-notes-list]');

    expect(list.querySelectorAll('[data-note-id]')).toHaveLength(50);
    expect(list.querySelector('[data-notes-render-status]').textContent).toBe('Showing 50 of 125 notes');

    await vi.advanceTimersByTimeAsync(0);
    expect(list.querySelectorAll('[data-note-id]')).toHaveLength(100);
    expect(list.querySelector('[data-notes-render-status]').textContent).toBe('Showing 100 of 125 notes');

    window.PlasmaNotesList.destroy();
    await vi.advanceTimersByTimeAsync(0);
    expect(list.querySelectorAll('[data-note-id]')).toHaveLength(100);
  });

  it('caches note plain text for repeated list renders and prunes deleted notes', () => {
    const list = document.querySelector('[data-notes-list]');
    const notes = [
      {
        id: 'cache-a',
        title: 'Cache A',
        content: '<p>Alpha <strong>cached</strong> body</p>',
        folderId: 'default',
        tags: [],
        pinned: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'cache-b',
        title: 'Cache B',
        content: '<p>Beta cached body</p>',
        folderId: 'default',
        tags: [],
        pinned: false,
        createdAt: now - 1,
        updatedAt: now - 1,
      },
    ];
    window.PlasmaNotesStore._notes = notes;
    window.PlasmaNotesList._textCache.clear();
    const strip = vi.spyOn(window.PlasmaNotesList, '_stripHTML');

    window.PlasmaNotesList.render();
    expect(strip).toHaveBeenCalledTimes(2);
    expect(list.textContent).toContain('Alpha cached body');

    window.PlasmaNotesList.render();
    expect(strip).toHaveBeenCalledTimes(2);

    notes[0].content = '<p>Alpha changed body</p>';
    window.PlasmaNotesList.render();
    expect(strip).toHaveBeenCalledTimes(3);
    expect(list.textContent).toContain('Alpha changed body');

    window.PlasmaNotesStore._notes = [notes[0]];
    window.PlasmaNotesList.render();
    expect([...window.PlasmaNotesList._textCache.keys()]).toEqual(['cache-a']);
  });

  it('supports roving keyboard navigation and activation in the note list', () => {
    const items = Array.from(document.querySelectorAll('[data-note-id]'));
    const first = items[0];
    const second = items[1];
    const last = items.at(-1);
    const open = vi.spyOn(window.PlasmaNotesApp, 'openNote');

    expect(first.tabIndex).toBe(0);
    expect(second.tabIndex).toBe(-1);

    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(second);
    expect(second.tabIndex).toBe(0);
    expect(first.tabIndex).toBe(-1);

    second.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(last);
    expect(last.tabIndex).toBe(0);

    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(first);

    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(open).toHaveBeenCalledWith(first.dataset.noteId);
  });

  it('sanitizes imported note content and records import counts', async () => {
    window.DB.saveNote.mockImplementation((note) => Promise.resolve(note));
    const localNotesBefore = localStorage.getItem('ocd_notes');
    const file = new File([JSON.stringify([
      {
        id: 'import-xss',
        title: '<img src=x onerror="window.__importTitleXss = true">',
        content: '<p>Imported</p><img src=x onerror="window.__importBodyXss = true"><script>window.__importScriptXss = true</script>',
        tags: ['imported'],
      },
      null,
    ])], 'notes.json', { type: 'application/json' });

    window.PlasmaNotesExport.importJSON(file);

    // jsdom's FileReader completes on a real macrotask that fake timers do
    // not control; give it headroom when the worker pool is under load.
    await vi.waitFor(() => expect(window.OpenCourseDeck.lastNotesImportResult).toEqual(expect.objectContaining({
      imported: 1,
      updated: 0,
      skipped: 0,
      invalid: 1,
      conflicts: 0,
    })), { timeout: 5000 });
    const imported = window.PlasmaNotesStore.getNote('import-xss');
    expect(imported.title).toContain('<img');
    expect(imported.content).toContain('Imported');
    expect(imported.content).not.toContain('<script>');
    expect(imported.content).not.toContain('onerror');
    expect(localStorage.getItem('ocd_notes')).toBe(localNotesBefore);
    expect(window.DB.saveNote).toHaveBeenCalledWith(expect.objectContaining({ id: 'import-xss' }));
    expect(window.OpenCourseDeck.lastNotesImportResult.errors).toEqual([
      expect.objectContaining({ message: 'Note record must be an object.' }),
    ]);
    expect(window.__importTitleXss).toBeUndefined();
    expect(window.__importBodyXss).toBeUndefined();
    expect(window.__importScriptXss).toBeUndefined();
  });

  it('updates imported note conflicts only when the incoming record is newer', async () => {
    window.DB.saveNote.mockImplementation((note) => Promise.resolve(note));
    window.PlasmaNotesStore.updateNote('regular-note', {
      title: 'Existing canonical note',
      updatedAt: now + 100,
    });
    window.DB.saveNote.mockClear();
    const file = new File([JSON.stringify([
      {
        id: 'regular-note',
        title: 'Older duplicate',
        content: '<p>Old</p>',
        updatedAt: now - 100,
      },
      {
        id: 'pinned-note',
        title: 'Newer duplicate',
        content: '<p>New</p>',
        updatedAt: now + 200,
        tags: ['newer', 42, null],
        wordCount: -5,
      },
    ])], 'notes.json', { type: 'application/json' });

    window.PlasmaNotesExport.importJSON(file);

    await vi.waitFor(() => expect(window.OpenCourseDeck.lastNotesImportResult).toEqual(expect.objectContaining({
      imported: 0,
      updated: 1,
      skipped: 1,
      invalid: 0,
      conflicts: 1,
    })));
    expect(window.PlasmaNotesStore.getNote('regular-note').title).toBe('Existing canonical note');
    expect(window.PlasmaNotesStore.getNote('pinned-note')).toEqual(expect.objectContaining({
      title: 'Newer duplicate',
      tags: ['newer', '42'],
      wordCount: 0,
    }));
    expect(window.DB.saveNote).toHaveBeenCalledTimes(1);
    expect(window.DB.saveNote).toHaveBeenCalledWith(expect.objectContaining({
      id: 'pinned-note',
      title: 'Newer duplicate',
    }));
  });

  it('reveals enabled AI note summaries and appends the generated summary to the current note', async () => {
    window.PlasmaNotesApp.destroy();
    window.OpenCourseDeck.AI = {
      status: vi.fn(async () => ({ available: true, mode: 'local-gemma' })),
      summarizeText: vi.fn(async () => ({
        ok: true,
        mode: 'local-gemma',
        provider: 'private-local-extractive',
        text: '- Important idea\n- Second preserved idea',
      })),
    };

    window.PlasmaNotesApp.init();
    const button = document.querySelector('[data-ai-summarize]');
    await vi.waitFor(() => expect(button.hidden).toBe(false));

    button.click();

    await vi.waitFor(() => expect(window.OpenCourseDeck.AI.summarizeText).toHaveBeenCalledWith(
      'Important',
      { bullets: 3 }
    ));
    expect(document.querySelector('[data-notes-editor]').textContent).toContain('AI summary');
    expect(document.querySelector('[data-notes-editor]').textContent).toContain('Important idea');
    expect(window.DB.saveNote.mock.calls.at(-1)[0]).toEqual(expect.objectContaining({
      id: 'pinned-note',
      content: expect.stringContaining('data-ai-summary-block'),
    }));
    expect(window.OpenCourseDeck.Toast.success).toHaveBeenCalledWith('Summary added');
  });

  it('keeps AI summaries hidden when AI is disabled', async () => {
    window.PlasmaNotesApp.destroy();
    window.OpenCourseDeck.AI = {
      status: vi.fn(async () => ({ available: false, reason: 'disabled' })),
      summarizeText: vi.fn(),
    };

    window.PlasmaNotesApp.init();

    const button = document.querySelector('[data-ai-summarize]');
    await vi.waitFor(() => expect(window.OpenCourseDeck.AI.status).toHaveBeenCalled());
    expect(button.hidden).toBe(true);
    expect(window.OpenCourseDeck.AI.summarizeText).not.toHaveBeenCalled();
  });

  it('indexes notes and renders semantic search results', async () => {
    window.PlasmaNotesApp.destroy();
    const embeddings = new Map();
    window.OpenCourseDeck.AI = {
      status: vi.fn(async () => ({ available: true })),
      upsertEmbedding: vi.fn(async ({ id, text, metadata }) => {
        embeddings.set(id, { id, text, metadata });
      }),
      searchEmbeddings: vi.fn(async () => [{ id: 'regular-note', score: 0.9 }]),
    };

    window.PlasmaNotesApp.init();
    const input = document.querySelector('[data-notes-search]');
    input.value = 'memory';
    document.querySelector('[data-notes-semantic-search]').click();

    await vi.waitFor(() => expect(window.OpenCourseDeck.AI.searchEmbeddings).toHaveBeenCalledWith('memory', { limit: 25 }));
    expect(window.OpenCourseDeck.AI.upsertEmbedding).toHaveBeenCalled();
    expect(embeddings.get('regular-note').text).toContain('Regular note');
    const list = document.querySelector('[data-notes-list]');
    expect(list.textContent).toContain('Regular note');
    expect(list.textContent).not.toContain('Pinned note');
    expect(document.querySelector('[data-notes-semantic-status]').textContent).toContain('Semantic results: 1');

    document.querySelector('[data-notes-semantic-clear]').click();
    expect(list.textContent).toContain('Regular note');
    expect(list.textContent).toContain('Pinned note');
  });
});
