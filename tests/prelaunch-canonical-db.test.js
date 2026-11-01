import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';

describe('prelaunch canonical IndexedDB baseline', () => {
  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    delete window.DB;
    delete window.DataStore;
    window.OpenCourseDeck = {};
    await indexedDB.deleteDatabase('opencoursedeck');
    await import('../db.js');
    await import('../bridge.js');
  });

  it('does not import historical localStorage records or emit migration checkpoints', async () => {
    localStorage.setItem('plasma_timestamps_v1', JSON.stringify([{ id: 'old-ts', topicId: 'past', time: 5 }]));
    localStorage.setItem('ocd_notes', JSON.stringify([{ id: 'old-note', title: 'Unreleased draft' }]));
    localStorage.setItem('ocd_folders', JSON.stringify([{ id: 'old-folder', name: 'Historical folder' }]));
    localStorage.setItem('plasma-playlists', JSON.stringify([{ id: 'old-list' }]));

    expect(await window.DB.getAllTimestamps()).toEqual([]);
    expect(await window.DB.getAllNotes()).toEqual([]);
    expect(await window.DB.getAllFolders()).toEqual([]);
    expect(await window.DB.getSetting('ocd_playlists')).toBeNull();
    expect(localStorage.getItem('plasma_migrated_v2')).toBeNull();
    expect(localStorage.getItem('plasma_migration_report_v3')).toBeNull();

    const record = { id: 'new-note', title: 'New canonical note' };
    await window.DB.saveNote(record);
    expect((await window.DB.getAllNotes()).map(note => note.id)).toEqual(['new-note']);
  });

  it('fails closed on an IndexedDB write error without any migration marker', async () => {
    const emit = vi.fn();
    window.OpenCourseDeck.bus = { emit };
    window.OpenCourseDeck.DB.PlasmaDB = class {
      async get() { return null; }
      async put() { throw new Error('canonical write failed'); }
    };
    await expect(window.DB.saveProgress('topic-new', 'course-new', { watched: 25 }))
      .rejects.toThrow('canonical write failed');
    expect(localStorage.getItem('plasma_progress_v1')).toBeNull();
    expect(emit).toHaveBeenCalledWith('storage:save-error', expect.objectContaining({
      kind: 'progress', backend: 'indexedDB', canonical: true,
    }));
  });
});
