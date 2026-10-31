import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('progress backup exports', () => {
  let downloadedBlob;
  let downloadedFilename;

  beforeEach(async () => {
    vi.resetModules();
    downloadedBlob = null;
    downloadedFilename = '';
    document.body.innerHTML = '';
    window.OpenCourseDeck = { Toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } };
    window.DB = {
      getAllProgress: vi.fn(async () => [{ topicId: 'topic-1', courseId: 'course-1', updatedAt: 20 }]),
      getProgress: vi.fn(async () => null),
      getAllNotes: vi.fn(async () => [{ id: 'note-1', topicId: 'topic-1', title: 'Current note', content: '<p>Current body</p>', updatedAt: 30 }]),
      getAllTimestamps: vi.fn(async () => [{ id: 'ts-1', topicId: 'topic-1' }]),
      getAllFolders: vi.fn(async () => [{ id: 'folder-1', name: 'Folder' }]),
      getAllAnnotations: vi.fn(async () => [{ id: 'ann-1', docId: 'doc-1', page: 2 }]),
      getAllWatchedSegments: vi.fn(async () => []),
      getAllPdfBookmarks: vi.fn(async () => []),
      getSetting: vi.fn(async (key) => {
        if (key === 'ocd_playlists') return [{ id: 'playlist-1', title: 'Saved queue', topicIds: ['topic-1'] }];
        if (key === 'ocd_studio_board') return { version: 1, layers: [{ id: 'layer-1', elements: [] }] };
        if (key === 'ocd_flashcards') return [{ id: 'fc_1', front: 'Q', back: 'A' }];
        if (key === 'ocd_user_library') return { version: 1, courses: { 'user-library': { title: 'My Library', sources: [] } } };
        if (key === 'ocd_notes_settings') return { view: 'list' };
        return null;
      }),
      saveProgress: vi.fn(async () => true),
      saveNote: vi.fn(async () => true),
      saveFolder: vi.fn(async () => true),
      saveSetting: vi.fn(async () => true),
      getAnnotations: vi.fn(async () => []),
      saveAnnotations: vi.fn(async () => true),
      saveTimestamp: vi.fn(async () => true),
      addWatchedSegment: vi.fn(async record => record),
      addPdfBookmark: vi.fn(async record => record),
    };
    window.DataStore = {
      init: vi.fn(async () => {}),
      allTopics: vi.fn(() => [{ topicId: 'topic-1', courseId: 'course-1', title: 'Topic One' }]),
      courses: vi.fn(() => []),
    };
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { estimate: vi.fn(async () => ({ usage: 100, quota: 1000 })) },
    });
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      downloadedBlob = blob;
      return 'blob:opencoursedeck-test';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function clickMock() {
      downloadedFilename = this.download;
    });

    await import('../progress.js');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never starts full reset when auxiliary media deletion is unavailable', async () => {
    window.OpenCourseDeck.UI = { confirm: vi.fn(async () => true) };
    window.DB.clearAll = vi.fn(async () => ({ committed: true }));
    document.body.innerHTML = '<section class="view-progress"><button id="btn-reset-all">Reset</button></section>';

    window.ProgressStats.bindButtons();
    document.getElementById('btn-reset-all').click();
    await vi.waitFor(() => expect(window.OpenCourseDeck.Toast.error).toHaveBeenCalled());
    expect(window.DB.clearAll).not.toHaveBeenCalled();
    expect(window.OpenCourseDeck.Toast.error).toHaveBeenCalledWith(expect.stringContaining('Reset not started'));
  });

  it('reports partial media-reset failures after application records were cleared', async () => {
    window.OpenCourseDeck.UI = { confirm: vi.fn(async () => true) };
    window.DB.clearAll = vi.fn(async () => ({ committed: true }));
    const clearLibraryFiles = vi.fn(async () => { throw new Error('Media deletion denied'); });
    window.OpenCourseDeck.UserLibrary = { clearLibraryFiles };
    document.body.innerHTML = '<section class="view-progress"><button id="btn-reset-all">Reset</button></section>';

    window.ProgressStats.bindButtons();
    document.getElementById('btn-reset-all').click();
    await vi.waitFor(() => expect(clearLibraryFiles).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(window.OpenCourseDeck.Toast.error)
      .toHaveBeenCalledWith(expect.stringContaining('Media deletion denied')));
    expect(window.DB.clearAll).toHaveBeenCalledTimes(1);
    expect(window.OpenCourseDeck.Toast.error).toHaveBeenCalledWith(expect.stringContaining('imported media files may remain'));
    expect(window.OpenCourseDeck.Toast.info).not.toHaveBeenCalledWith('All data has been cleared.');
  });

  it('exports JSON backups with all canonical user-data collections', async () => {
    await window.ProgressStats.exportJSON();

    const payload = JSON.parse(await downloadedBlob.text());

    expect(payload.version).toBe('1.6');
    expect(payload.progress).toHaveLength(1);
    expect(payload.notes).toHaveLength(1);
    expect(payload.folders).toHaveLength(1);
    expect(payload.annotations).toHaveLength(1);
    expect(payload.timestamps).toHaveLength(1);
    expect(payload.watchedSegments).toEqual([]);
    expect(payload.pdfBookmarks).toEqual([]);
    expect(payload.settings.notes).toEqual({ view: 'list' });
    expect(payload.settings.playlists).toEqual([{ id: 'playlist-1', title: 'Saved queue', topicIds: ['topic-1'] }]);
    expect(payload.settings.studio).toEqual({ version: 1, layers: [{ id: 'layer-1', elements: [] }] });
    expect(payload.settings.flashcards).toEqual([{ id: 'fc_1', front: 'Q', back: 'A' }]);
    expect(payload.settings.library).toEqual({ version: 1, courses: { 'user-library': { title: 'My Library', sources: [] } } });
    expect(payload.meta.storage.available).toBe(900);
    expect(payload.meta.sizeBytes).toBeGreaterThan(0);
  });

  it('includes watched segments and PDF bookmarks in version 1.6 JSON exports', async () => {
    window.DB.getAllWatchedSegments.mockResolvedValueOnce([
      { id: 'segment-1', topicId: 'topic-1', start: 0, end: 15 },
    ]);
    window.DB.getAllPdfBookmarks.mockResolvedValueOnce([
      { id: 'page-bookmark', docId: 'document.pdf', page: 4 },
    ]);
    await window.ProgressStats.exportJSON();
    const payload = JSON.parse(await downloadedBlob.text());
    expect(payload).toMatchObject({
      version: '1.6',
      watchedSegments: [{ id: 'segment-1', topicId: 'topic-1', start: 0, end: 15 }],
      pdfBookmarks: [{ id: 'page-bookmark', docId: 'document.pdf', page: 4 }],
    });
  });


  it('exports every authored course domain and declares a metadata-only attachment manifest', async () => {
    const original = window.DB.getSetting;
    window.DB.getSetting = vi.fn(async key => {
      if (key === 'ocd_my_courses') return [{ id: 'course-a', title: 'Study course' }];
      if (key === 'ocd_course_media_cues') return { 'topic-a': [{ at: 12, text: 'Recall' }] };
      return original(key);
    });
    window.OpenCourseDeck.UserLibrary = {
      listFileReferences: vi.fn(async () => [{ ref: 'library-file:stable-asset', courseId: 'course-a', kind: 'pdf' }]),
    };
    await window.ProgressStats.exportJSON();
    const payload = JSON.parse(await downloadedBlob.text());
    expect(payload.settings.myCourses).toEqual([{ id: 'course-a', title: 'Study course' }]);
    expect(payload.settings.mediaCues).toEqual({ 'topic-a': [{ at: 12, text: 'Recall' }] });
    expect(payload.meta.attachments).toEqual(expect.objectContaining({
      mode: 'metadata-only',
      binaryIncluded: false,
      references: expect.arrayContaining([expect.objectContaining({ ref: 'library-file:stable-asset' })]),
    }));
  });

  it('rejects a corrupted FSRS backup before touching any canonical study data', async () => {
    window.OpenCourseDeck.UI = { confirm: vi.fn(async () => true) };
    const file = new File([JSON.stringify({
      version: '1.6',
      progress: [{ topicId: 'fresh', courseId: 'course-new' }],
      settings: { flashcards: [{
        id: 'fsrs-bad', front: 'Q', back: 'A', scheduler: 'fsrs-v5',
        fsrsState: { version: 1, packageVersion: '5.4.2', model: 'fsrs-6',
          card: { due: 'not-a-date' }, reviewLog: [] },
      }] },
    })], 'broken-fsrs.json', { type: 'application/json' });
    await window.ProgressStats.importJSONFile(file);
    expect(window.DB.saveProgress).not.toHaveBeenCalled();
    expect(window.DB.saveSetting).not.toHaveBeenCalled();
    expect(window.OpenCourseDeck.UI.confirm).not.toHaveBeenCalled();
    expect(window.OpenCourseDeck.Toast.error)
      .toHaveBeenCalledWith(expect.stringMatching(/flashcard|FSRS/i));
  });

  it('rejects duplicate flashcard IDs before import and does not alter existing records', async () => {
    window.OpenCourseDeck.UI = { confirm: vi.fn(async () => true) };
    const original = { id: 'same', front: 'one', back: 'first', nextReviewDate: '2026-09-01' };
    const file = new File([JSON.stringify({
      version: '1.6', settings: { flashcards: [original, { ...original, front: 'different' }] },
    })], 'duplicate-cards.json', { type: 'application/json' });
    await window.ProgressStats.importJSONFile(file);
    expect(window.DB.saveSetting).not.toHaveBeenCalled();
    expect(window.DB.saveNote).not.toHaveBeenCalled();
    expect(window.OpenCourseDeck.UI.confirm).not.toHaveBeenCalled();
    expect(window.OpenCourseDeck.Toast.error)
      .toHaveBeenCalledWith(expect.stringMatching(/duplicate.*flashcard/i));
  });

  it('rejects an FSRS backup with a forged rollback archive or unknown future scheduler', async () => {
    window.OpenCourseDeck.UI = { confirm: vi.fn(async () => true) };
    const { createFsrsV5State } = await import('../src/features/flashcardsFsrsAdapter.js');
    for (const invalid of [
      {
        id: 'fsrs-card', front: 'Q', back: 'A', scheduler: 'fsrs-v5',
        fsrsState: createFsrsV5State(new Date('2026-01-02T00:00:00.000Z')),
        fsrsMigration: { version: 1, legacyCard: { id: 'other-card' } },
      },
      { id: 'future', front: 'Q', back: 'A', scheduler: 'fsrs-v6' },
    ]) {
      window.DB.saveSetting.mockClear();
      const file = new File([JSON.stringify({
        version: '1.6', settings: { flashcards: [invalid] },
      })], 'invalid-scheduler.json', { type: 'application/json' });
      await window.ProgressStats.importJSONFile(file);
      expect(window.DB.saveSetting).not.toHaveBeenCalled();
      expect(window.DB.saveProgress).not.toHaveBeenCalled();
    }
    expect(window.OpenCourseDeck.UI.confirm).not.toHaveBeenCalled();
  });

  it('round-trips valid legacy and FSRS-v5 backups without changing due dates or archives', async () => {
    const { createFsrsV5State } = await import('../src/features/flashcardsFsrsAdapter.js');
    window.OpenCourseDeck.UI = { confirm: vi.fn(async () => true) };
    const legacy = {
      id: 'old-1', front: 'Legacy', back: 'Answer', interval: 21,
      repetitions: 3, easeFactor: 2.6, nextReviewDate: '2027-02-01',
      metadata: { language: 'fa-IR' },
    };
    const fsrs = {
      id: 'new-1', front: 'FSRS', back: 'State', scheduler: 'fsrs-v5',
      fsrsState: createFsrsV5State(new Date('2026-10-01T10:30:00.000Z')),
      nextReviewDate: '2026-10-01',
      fsrsMigration: { version: 1, consentedAt: '2026-10-01T10:30:00.000Z', legacyCard: {
        ...legacy, id: 'new-1',
      } },
    };
    const cards = [legacy, fsrs];
    const file = new File([JSON.stringify({
      version: '1.6', settings: { flashcards: cards },
    })], 'valid-cards.json', { type: 'application/json' });
    await window.ProgressStats.importJSONFile(file);
    expect(window.DB.saveSetting).toHaveBeenCalledWith('ocd_flashcards', cards);
    expect(window.OpenCourseDeck.lastImportResult.settings).toBe(1);
    expect(window.OpenCourseDeck.lastImportResult.errors).toEqual([]);
  });

  it('treats a false flashcard writer receipt as failure, preserving the old mirror and restoring the atomic snapshot', async () => {
    window.OpenCourseDeck.UI = { confirm: vi.fn(async () => true) };
    window.DB.exportBackup = vi.fn(async () => ({
      _meta: { format: 'opencoursedeck-snapshot', version: 3 },
      progress: [], notes: [], settings: [], folders: [],
    }));
    window.DB.importBackup = vi.fn(async () => ({ committed: true }));
    window.DB.saveSetting.mockImplementation(async (key) => key === 'ocd_flashcards' ? false : true);
    const previous = JSON.stringify([{ id: 'old-fsrs', scheduler: 'sm2-v1', front: 'Old', back: 'Safe' }]);
    window.localStorage.setItem('ocd_flashcards', previous);
    const file = new File([JSON.stringify({
      version: '1.6', settings: { flashcards: [
        { id: 'new-card', scheduler: 'sm2-v1', front: 'New', back: 'A' },
      ] },
    })], 'receipt-rejected.json', { type: 'application/json' });

    await window.ProgressStats.importJSONFile(file);

    expect(window.DB.saveSetting).toHaveBeenCalledWith('ocd_flashcards', expect.any(Array));
    expect(window.OpenCourseDeck.lastImportResult).toMatchObject({
      settings: 0, rolledBack: true,
      errors: [expect.objectContaining({ store: 'settings', id: 'ocd_flashcards', message: expect.stringMatching(/refus|acknowledg|reject/i) })],
    });
    expect(window.DB.importBackup).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem('ocd_flashcards')).toBe(previous);
    expect(window.OpenCourseDeck.Toast.success).not.toHaveBeenCalledWith(expect.stringMatching(/import complete/i));
  });

  it('does not count a false note/progress receipt as a persisted import', async () => {
    window.OpenCourseDeck.UI = { confirm: vi.fn(async () => true) };
    window.DB.exportBackup = vi.fn(async () => ({
      _meta: { format: 'opencoursedeck-snapshot', version: 3 },
      progress: [], notes: [], settings: [], folders: [],
    }));
    window.DB.importBackup = vi.fn(async () => ({ committed: true }));
    window.DB.saveProgress.mockResolvedValue(false);
    window.DB.saveNote.mockResolvedValue(false);
    const file = new File([JSON.stringify({
      version: '1.6',
      progress: [{ topicId: 'new-progress', courseId: 'a', updatedAt: 100 }],
      notes: [{ id: 'new-note', title: 'New', content: '<p>Body</p>', updatedAt: 100 }],
    })], 'false-record-receipts.json', { type: 'application/json' });

    await window.ProgressStats.importJSONFile(file);

    expect(window.OpenCourseDeck.lastImportResult).toMatchObject({
      progress: 0, notes: 0, rolledBack: true,
      errors: expect.arrayContaining([
        expect.objectContaining({ store: 'progress', id: 'new-progress' }),
        expect.objectContaining({ store: 'notes', id: 'new-note' }),
      ]),
    });
    expect(window.DB.importBackup).toHaveBeenCalledOnce();
  });

  it('does not count annotations or timestamps when their canonical writers refuse storage', async () => {
    window.OpenCourseDeck.UI = { confirm: vi.fn(async () => true) };
    window.DB.exportBackup = vi.fn(async () => ({
      _meta: { format: 'opencoursedeck-snapshot', version: 3 },
      progress: [], notes: [], annotations: [], timestamps: [],
    }));
    window.DB.importBackup = vi.fn(async () => ({ committed: true }));
    window.DB.saveAnnotations.mockResolvedValue(false);
    window.DB.saveTimestamp.mockResolvedValue(false);
    const file = new File([JSON.stringify({
      version: '1.6',
      annotations: [{ id: 'annot-new', docId: 'doc-1', page: 2, updatedAt: 123 }],
      timestamps: [{ id: 'time-new', topicId: 'topic-1', position: 40 }],
    })], 'rejected-media-receipts.json', { type: 'application/json' });

    await window.ProgressStats.importJSONFile(file);

    expect(window.OpenCourseDeck.lastImportResult).toMatchObject({
      annotations: 0, timestamps: 0, rolledBack: true,
      errors: expect.arrayContaining([
        expect.objectContaining({ store: 'annotations', id: 'doc-1' }),
        expect.objectContaining({ store: 'timestamps', id: 'time-new' }),
      ]),
    });
  });

  it('does not claim a completed rollback if restoring a protected setting is explicitly refused', async () => {
    window.OpenCourseDeck.UI = { confirm: vi.fn(async () => true) };
    window.DB.clearUserData = vi.fn(async () => true);
    window.DB.saveSetting.mockImplementation(async key => key === 'ocd_playlists' ? false : true);
    const file = new File([JSON.stringify({
      version: '1.6', settings: { playlists: [{
        id: 'new-queue', title: 'New Queue', topicIds: ['topic-1'],
      }] },
    })], 'false-rollback-receipt.json', { type: 'application/json' });

    await window.ProgressStats.importJSONFile(file);

    expect(window.OpenCourseDeck.lastImportResult).toMatchObject({
      rolledBack: false,
      rollbackErrors: expect.arrayContaining([expect.stringMatching(/ocd_playlists|acknowledg|refus/i)]),
    });
    expect(window.OpenCourseDeck.Toast.error)
      .toHaveBeenCalledWith(expect.stringContaining('recovery was incomplete'));
  });

  it('restores course outlines and media cues from version 1.6 portable backups', async () => {
    window.OpenCourseDeck.UI = { confirm: vi.fn(async () => true) };
    const outlines = [{ id: 'course-a', title: 'Saved course' }];
    const cues = { 'topic-a': [{ at: 18, text: 'Start' }] };
    const file = new File([JSON.stringify({
      version: '1.6', settings: { myCourses: outlines, mediaCues: cues },
      progress: [], notes: [], annotations: [], timestamps: [],
    })], 'all-domains.json', { type: 'application/json' });
    await window.ProgressStats.importJSONFile(file);
    expect(window.DB.saveSetting).toHaveBeenCalledWith('ocd_my_courses', outlines);
    expect(window.DB.saveSetting).toHaveBeenCalledWith('ocd_course_media_cues', cues);
    expect(window.OpenCourseDeck.lastImportResult.settings).toBe(2);
  });

  it('never exports an incomplete backup when an auxiliary store read fails', async () => {
    window.DB.getAllPdfBookmarks.mockRejectedValueOnce(new Error('bookmark storage failed'));
    await expect(window.ProgressStats.exportJSON()).rejects.toThrow('bookmark storage failed');
    expect(downloadedBlob).toBeNull();
  });

  it('rejects an extended media import before any write without an atomic rollback snapshot', async () => {
    window.OpenCourseDeck.UI = { confirm: vi.fn(async () => true) };
    const file = new File([JSON.stringify({
      version: '1.5',
      watchedSegments: [{ id: 'segment', topicId: 'topic-1', start: 0, end: 10 }],
    })], 'media.json', { type: 'application/json' });
    await window.ProgressStats.importJSONFile(file);
    expect(window.OpenCourseDeck.Toast.error).toHaveBeenCalledWith(
      expect.stringContaining('atomic media recovery is unavailable'),
    );
    expect(window.DB.addWatchedSegment).not.toHaveBeenCalled();
    expect(window.DB.saveProgress).not.toHaveBeenCalled();
  });

  it('restores version 1.5 media records when a v3 rollback snapshot is available', async () => {
    window.OpenCourseDeck.UI = { confirm: vi.fn(async () => true) };
    window.DB.exportBackup = vi.fn(async () => ({
      _meta: { format: 'opencoursedeck-snapshot', version: 3 },
      progress: [], notes: [], folders: [], settings: [], annotations: [],
      timestamps: [], watchedSegments: [], pdfBookmarks: [],
    }));
    window.DB.importBackup = vi.fn(async () => ({ committed: true }));
    const file = new File([JSON.stringify({
      version: '1.5',
      watchedSegments: [{ id: 'segment-2', topicId: 'topic-1', start: 3, end: 14 }],
      pdfBookmarks: [{ id: 'pdf-2', docId: 'research.pdf', page: 6 }],
    })], 'portable-media.json', { type: 'application/json' });
    await window.ProgressStats.importJSONFile(file);
    expect(window.DB.addWatchedSegment).toHaveBeenCalledWith(expect.objectContaining({ id: 'segment-2' }));
    expect(window.DB.addPdfBookmark).toHaveBeenCalledWith(expect.objectContaining({ id: 'pdf-2' }));
    expect(window.OpenCourseDeck.lastImportResult).toMatchObject({
      watchedSegments: 1, pdfBookmarks: 1, errors: [],
    });
  });

  it('exports Markdown notes from current content before legacy fields', async () => {
    await window.ProgressStats.exportNotesMarkdown();

    const markdown = await downloadedBlob.text();

    expect(markdown).toContain('## Current note');
    expect(markdown).toContain('Current body');
  });

  it('retains nested Markdown structure from HTML when exporting existing notes', async () => {
    window.DB.getAllNotes.mockResolvedValueOnce([{
      id: 'nested-one', title: 'Nested note', topicId: 'topic-1',
      content: '<h3>فیزیولوژی قلب</h3><p><strong>Bold <em>nested</em></strong> &amp; safe.</p>'
        + '<ul><li>First</li><li>Second</li></ul>'
        + '<img src="https://tracker.example/pixel.png">'
        + '<script>window.__notesExportXss = true</script>',
    }]);
    await window.ProgressStats.exportNotesMarkdown();
    const markdown = await downloadedBlob.text();
    expect(markdown).toContain('### فیزیولوژی قلب');
    expect(markdown).toContain('**Bold *nested***');
    expect(markdown).toMatch(/-\s+First/);
    expect(markdown).not.toContain('tracker.example');
    expect(markdown).not.toContain('__notesExportXss');
    expect(window.__notesExportXss).toBeUndefined();
  });

  it('exports a vault-style Markdown manifest with note files and source metadata', async () => {
    window.DB.getAllNotes.mockResolvedValueOnce([
      {
        id: 'note-1',
        topicId: 'topic-1',
        title: 'Current note',
        content: '<p>Current body</p>',
        sourceType: 'pdf-selection',
        pdfDocId: 'doc-a.pdf',
        pdfPage: 7,
        tags: ['pdf', 'selection'],
        updatedAt: 30,
      },
    ]);

    await window.ProgressStats.exportVaultMarkdown();

    const markdown = await downloadedBlob.text();
    expect(downloadedFilename).toMatch(/^opencoursedeck-vault-.*\.md$/);
    expect(markdown).toContain('# OpenCourseDeck Vault Export');
    expect(markdown).toContain('- [notes/current-note.md](notes/current-note.md)');
    expect(markdown).toContain('<!-- notes/current-note.md -->');
    expect(markdown).toContain('sourceType: "pdf-selection"');
    expect(markdown).toContain('pdfDocId: "doc-a.pdf"');
    expect(markdown).toContain('pdfPage: "7"');
    expect(markdown).toContain('tags: ["pdf","selection"]');
    expect(markdown).toContain('Current body');
    expect(markdown).toContain('## Timestamp Index');
    expect(markdown).toContain('## PDF Annotation Index');
    expect(markdown).toContain('Flashcards: 1');
  });

  it('keeps vault note filenames unique and includes a machine-readable manifest', async () => {
    window.DB.getAllNotes.mockResolvedValueOnce([
      { id: 'note-a', topicId: 'topic-1', title: 'Duplicate', content: '<p>One</p>', sourceType: 'note' },
      { id: 'note-b', topicId: 'topic-1', title: 'Duplicate', content: '<p>Two</p>', sourceType: 'pdf' },
    ]);

    await window.ProgressStats.exportVaultMarkdown();

    const markdown = await downloadedBlob.text();
    expect(markdown).toContain('- [notes/duplicate.md](notes/duplicate.md)');
    expect(markdown).toContain('- [notes/duplicate-2.md](notes/duplicate-2.md)');
    expect(markdown).toContain('```json');
    expect(markdown).toContain('"path": "notes/duplicate-2.md"');
    expect(markdown).toContain('"id": "note-b"');
  });

  it('exports a portable vault archive with separate file entries', async () => {
    window.DB.getAllNotes.mockResolvedValueOnce([
      { id: 'note-a', topicId: 'topic-1', title: 'Archive note', content: '<p>Body</p>', sourceType: 'note' },
    ]);

    await window.ProgressStats.exportVaultArchive();

    const archive = JSON.parse(await downloadedBlob.text());
    expect(downloadedFilename).toMatch(/^opencoursedeck-vault-archive-.*\.json$/);
    expect(archive.version).toBe('opencoursedeck-vault-archive-1');
    expect(archive.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'manifest.json', type: 'application/json' }),
      expect.objectContaining({ path: 'notes/archive-note.md', type: 'text/markdown' }),
    ]));
    expect(archive.files.find(file => file.path === 'notes/archive-note.md').content).toContain('Body');
  });

  it('exports a standards-shaped vault ZIP without adding a ZIP dependency', async () => {
    window.DB.getAllNotes.mockResolvedValueOnce([
      { id: 'note-a', topicId: 'topic-1', title: 'Zip note', content: '<p>Zip body</p>', sourceType: 'note' },
    ]);

    await window.ProgressStats.exportVaultZip();

    const buffer = await downloadedBlob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const text = new TextDecoder().decode(bytes);
    const view = new DataView(buffer);
    expect(downloadedFilename).toMatch(/^opencoursedeck-vault-.*\.zip$/);
    expect(downloadedBlob.type).toBe('application/zip');
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(text).toContain('manifest.json');
    expect(text).toContain('notes/zip-note.md');
    expect(text).toContain('Zip body');
    expect(view.getUint32(buffer.byteLength - 22, true)).toBe(0x06054b50);
  });

  it('writes vault files to a selected folder through File System Access', async () => {
    const writes = {};
    const makeDir = (prefix = '') => ({
      getDirectoryHandle: vi.fn(async (name) => makeDir(`${prefix}${name}/`)),
      getFileHandle: vi.fn(async (name) => ({
        createWritable: vi.fn(async () => ({
          write: vi.fn(async (content) => { writes[`${prefix}${name}`] = content; }),
          close: vi.fn(async () => {}),
        })),
      })),
    });
    window.showDirectoryPicker = vi.fn(async () => makeDir());
    window.DB.getAllNotes.mockResolvedValueOnce([
      { id: 'note-a', topicId: 'topic-1', title: 'Folder note', content: '<p>Saved to disk</p>', sourceType: 'note' },
    ]);

    const result = await window.ProgressStats.exportVaultDirectory();

    expect(window.showDirectoryPicker).toHaveBeenCalledWith(expect.objectContaining({ mode: 'readwrite' }));
    expect(result).toEqual(expect.objectContaining({ saved: 2 }));
    expect(writes['manifest.json']).toContain('"path": "notes/folder-note.md"');
    expect(writes['notes/folder-note.md']).toContain('Saved to disk');
  });

  it('falls back to the portable archive when folder export is unavailable', async () => {
    delete window.showDirectoryPicker;

    await window.ProgressStats.exportVaultDirectory();

    const archive = JSON.parse(await downloadedBlob.text());
    expect(archive.version).toBe('opencoursedeck-vault-archive-1');
    expect(downloadedFilename).toMatch(/^opencoursedeck-vault-archive-.*\.json$/);
  });

  it('wires the route export buttons to current backup exporters', async () => {
    document.body.innerHTML = `
      <section class="view-progress">
        <button id="btn-export-json">Export JSON</button>
        <button id="btn-export-csv">Export CSV</button>
        <button id="btn-export-md">Export MD</button>
        <button id="btn-export-vault">Export Vault</button>
        <button id="btn-export-vault-archive">Export Vault Archive</button>
        <button id="btn-export-vault-zip">Export Vault ZIP</button>
        <button id="btn-export-vault-directory">Export Vault Folder</button>
      </section>
    `;

    window.ProgressStats.bindButtons(document);
    document.getElementById('btn-export-json').click();

    await vi.waitFor(() => expect(downloadedBlob).not.toBeNull());
    expect(JSON.parse(await downloadedBlob.text()).version).toBe('1.6');

    downloadedBlob = null;
    document.getElementById('btn-export-csv').click();

    await vi.waitFor(() => expect(downloadedBlob).not.toBeNull());
    const csv = await downloadedBlob.text();
    expect(csv).toContain('courseId,courseTitle,topicId,topicTitle,status,percent,position,duration,updatedAt');
    expect(csv).toContain('course-1');
    expect(csv).toContain('topic-1');

    downloadedBlob = null;
    document.getElementById('btn-export-md').click();

    await vi.waitFor(() => expect(downloadedBlob).not.toBeNull());
    expect(await downloadedBlob.text()).toContain('Current body');

    downloadedBlob = null;
    document.getElementById('btn-export-vault').click();

    await vi.waitFor(() => expect(downloadedBlob).not.toBeNull());
    expect(await downloadedBlob.text()).toContain('# OpenCourseDeck Vault Export');

    downloadedBlob = null;
    document.getElementById('btn-export-vault-archive').click();

    await vi.waitFor(() => expect(downloadedBlob).not.toBeNull());
    expect(JSON.parse(await downloadedBlob.text()).version).toBe('opencoursedeck-vault-archive-1');

    downloadedBlob = null;
    document.getElementById('btn-export-vault-zip').click();

    await vi.waitFor(() => expect(downloadedBlob).not.toBeNull());
    expect(downloadedBlob.type).toBe('application/zip');

    downloadedBlob = null;
    delete window.showDirectoryPicker;
    document.getElementById('btn-export-vault-directory').click();

    await vi.waitFor(() => expect(downloadedBlob).not.toBeNull());
    expect(JSON.parse(await downloadedBlob.text()).version).toBe('opencoursedeck-vault-archive-1');
  });

  it('keeps the latest note body in JSON and Markdown exports after edits', async () => {
    window.DB.getAllNotes
      .mockResolvedValueOnce([{ id: 'note-1', topicId: 'topic-1', title: 'Edited note', content: '<p>Edited body</p>', updatedAt: 40 }])
      .mockResolvedValueOnce([{ id: 'note-1', topicId: 'topic-1', title: 'Edited note', content: '<p>Edited body</p>', updatedAt: 40 }]);

    await window.ProgressStats.exportJSON();
    const payload = JSON.parse(await downloadedBlob.text());
    expect(payload.notes[0].content).toBe('<p>Edited body</p>');

    downloadedBlob = null;
    await window.ProgressStats.exportNotesMarkdown();
    expect(await downloadedBlob.text()).toContain('Edited body');
  });

  it('formats the Progress completion denominator with native locale grouping', async () => {
    const previousLanguage = document.documentElement.lang;
    document.documentElement.lang = 'en-US';
    try {
      document.body.innerHTML = `
        <strong id="stat-total-topics"></strong>
        <strong id="stat-done-topics"></strong>
        <strong id="stat-in-progress"></strong>
        <strong id="stat-completion-pct"></strong>
        <strong id="stat-watched-time"></strong>
        <strong id="stat-streak"></strong>
        <strong id="stat-active-days"></strong>
        <div id="stat-overall-bar"></div>
        <table><tbody id="stat-course-table-body"></tbody></table>
      `;
      window.DataStore.allCourses = vi.fn(() => [{ id: 'course-1', title: 'Study' }]);
      window.DataStore.allTopics = vi.fn(() => Array.from({ length: 6421 }, (_, i) => ({
        topicId: `topic-${i}`, courseId: 'course-1',
      })));
      window.DB.getAllProgress.mockResolvedValueOnce([]);

      await window.ProgressStats.renderStatsPage();
      expect(document.getElementById('stat-total-topics').textContent).toBe('6,421');
      expect(document.getElementById('stat-done-topics').textContent).toBe('0');
    } finally {
      document.documentElement.lang = previousLanguage;
    }
  });

  it('renders course stats titles as text instead of HTML', async () => {
    document.body.innerHTML = `
      <strong id="stat-total-topics"></strong>
      <strong id="stat-done-topics"></strong>
      <strong id="stat-in-progress"></strong>
      <strong id="stat-completion-pct"></strong>
      <strong id="stat-watched-time"></strong>
      <strong id="stat-streak"></strong>
      <strong id="stat-active-days"></strong>
      <div id="stat-overall-bar"></div>
      <table><tbody id="stat-course-table-body"></tbody></table>
    `;
    window.DataStore.allCourses = vi.fn(() => [{ id: 'course-1', title: '<img src=x onerror="window.__progressXss = true">' }]);
    window.DataStore.allTopics = vi.fn(() => [{ topicId: 'topic-1', courseId: 'course-1' }]);

    await window.ProgressStats.renderStatsPage();

    const tbody = document.getElementById('stat-course-table-body');
    expect(tbody.textContent).toContain('<img');
    expect(tbody.querySelector('img')).toBeNull();
    expect(window.__progressXss).toBeUndefined();
  });

  it('keeps Chart.js dataset options free of recursion-triggering properties', async () => {
    // Chart.js v4 Proxy traps recurse when a dataset is given non-standard
    // properties (e.g. pdPatternKey) or array-of-arrays borderDash. This test
    // pins the *safe* shape: scalar border options on the doughnut, distinct
    // backgroundColor shades for the bar instead of a borderDash array, and
    // no pdPatternKey anywhere. The original distinction intent is preserved
    // by the three backgroundColor shades per bar.
    const chartConfigs = [];
    window.Chart = vi.fn(function Chart(_ctx, config) {
      chartConfigs.push(config);
      this.destroy = vi.fn();
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({});
    document.body.innerHTML = `
      <strong id="stat-total-topics"></strong>
      <strong id="stat-done-topics"></strong>
      <strong id="stat-in-progress"></strong>
      <strong id="stat-completion-pct"></strong>
      <strong id="stat-watched-time"></strong>
      <strong id="stat-streak"></strong>
      <strong id="stat-active-days"></strong>
      <div id="stat-overall-bar"></div>
      <canvas id="chart-overall"></canvas>
      <canvas id="chart-courses"></canvas>
      <table><tbody id="stat-course-table-body"></tbody></table>
    `;
    window.DataStore.allCourses = vi.fn(() => [
      { id: 'course-1', title: 'One' },
      { id: 'course-2', title: 'Two' },
      { id: 'course-3', title: 'Three' },
    ]);
    window.DataStore.allTopics = vi.fn(() => [
      { topicId: 'topic-1', courseId: 'course-1' },
      { topicId: 'topic-2', courseId: 'course-2' },
      { topicId: 'topic-3', courseId: 'course-3' },
    ]);
    window.DB.getAllProgress.mockResolvedValue([
      { topicId: 'topic-1', courseId: 'course-1', status: 'done', percent: 100 },
      { topicId: 'topic-2', courseId: 'course-2', status: 'in-progress', percent: 50 },
    ]);

    await window.ProgressStats.renderStatsPage();

    expect(chartConfigs).toHaveLength(2);
    const doughnutDataset = chartConfigs[0].data.datasets[0];
    expect(doughnutDataset.pdPatternKey).toBeUndefined();
    expect(Array.isArray(doughnutDataset.borderColor)).toBe(false);
    expect(Array.isArray(doughnutDataset.borderWidth)).toBe(false);
    expect(typeof doughnutDataset.borderColor).toBe('string');
    expect(typeof doughnutDataset.borderWidth).toBe('number');

    const barDataset = chartConfigs[1].data.datasets[0];
    expect(barDataset.pdPatternKey).toBeUndefined();
    expect(barDataset.borderDash).toBeUndefined();
    // Three backgroundColor shades preserve the visual distinction that the
    // removed borderDash palette used to provide.
    expect(Array.isArray(barDataset.backgroundColor)).toBe(true);
    expect(barDataset.backgroundColor).toHaveLength(3);
    const unique = new Set(barDataset.backgroundColor);
    expect(unique.size).toBeGreaterThan(1);

    delete window.Chart;
  });

  it('renders step progress indicators without HTML injection', () => {
    document.body.innerHTML = '<div data-steps="3" data-step-current="2"></div>';

    window.OpenCourseDeck.ProgressUI.steps.init();

    const tracker = document.querySelector('[data-steps]');
    expect(tracker.querySelectorAll('.step-item')).toHaveLength(3);
    const doneDot = tracker.querySelector('.step-item.done .step-dot');
    expect(doneDot.textContent).toBe('');
    expect(doneDot.querySelector('svg.icon use')?.getAttribute('href')).toBe('#i-check');
    expect(tracker.querySelectorAll('script,img')).toHaveLength(0);
    // Only inert sprite references may appear (no inline SVG payloads).
    tracker.querySelectorAll('svg').forEach((svg) => {
      expect(svg.classList.contains('icon')).toBe(true);
      expect([...svg.children].map((c) => c.tagName.toLowerCase())).toEqual(['use']);
    });
  });

  it('records import preview counts and per-record errors', async () => {
    const payload = {
      version: '1.4',
      progress: [
        { topicId: 'ok-topic', courseId: 'course-1', updatedAt: 10 },
        { topicId: 'bad-topic', courseId: 'course-1', updatedAt: 11 },
      ],
      notes: [{ id: 'note-1', title: 'Imported', updatedAt: 12 }],
      folders: [],
      settings: {
        playlists: [{ id: 'playlist-1', title: 'Imported queue', topicIds: ['ok-topic'] }],
        studio: { version: 1, layers: [{ id: 'layer-1', elements: [] }] },
        flashcards: [{ id: 'fc_import', front: 'Imported Q', back: 'Imported A' }],
        library: { version: 1, courses: { 'user-library': { title: 'Imported Library', sources: [] } } },
      },
      annotations: [],
      timestamps: [],
    };
    window.DB.saveProgress.mockImplementation(async (topicId) => {
      if (topicId === 'bad-topic') throw new Error('write failed');
      return true;
    });
    window.OpenCourseDeck.UI = { confirm: vi.fn(async () => true) };
    const file = new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' });
    let input;
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
      const el = originalCreateElement(tagName, options);
      if (tagName === 'input') {
        input = el;
        Object.defineProperty(el, 'files', { configurable: true, value: [file] });
        el.click = vi.fn(() => el.onchange?.());
      }
      return el;
    });

    await window.ProgressStats.importJSON();
    await vi.waitFor(() => expect(window.OpenCourseDeck.lastImportResult).toBeTruthy());

    expect(input.accept).toContain('application/json');
    expect(window.OpenCourseDeck.lastImportResult.preview).toEqual(expect.objectContaining({
      version: '1.4',
      fileName: 'backup.json',
      progress: 2,
      notes: 1,
      settings: 4,
      invalid: 0,
      totalValid: 7,
    }));
    expect(window.OpenCourseDeck.lastImportPreview).toEqual(window.OpenCourseDeck.lastImportResult.preview);
    expect(window.OpenCourseDeck.UI.confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Import Backup',
      confirmLabel: 'Import',
      cancelLabel: 'Cancel',
      message: expect.stringContaining('Progress records: 2'),
    }));
    expect(window.OpenCourseDeck.UI.confirm).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('Invalid records that will be skipped: 0'),
    }));
    expect(window.OpenCourseDeck.lastImportResult.progress).toBe(1);
    expect(window.OpenCourseDeck.lastImportResult.settings).toBe(4);
    expect(window.DB.saveSetting).toHaveBeenCalledWith('ocd_playlists', [{ id: 'playlist-1', title: 'Imported queue', topicIds: ['ok-topic'] }]);
    expect(window.DB.saveSetting).toHaveBeenCalledWith('ocd_studio_board', { version: 1, layers: [{ id: 'layer-1', elements: [] }] });
    expect(window.DB.saveSetting).toHaveBeenCalledWith('ocd_flashcards', [{ id: 'fc_import', front: 'Imported Q', back: 'Imported A' }]);
    expect(window.DB.saveSetting).toHaveBeenCalledWith('ocd_user_library', { version: 1, courses: { 'user-library': { title: 'Imported Library', sources: [] } } });
    expect(window.OpenCourseDeck.lastImportResult.errors).toEqual([
      expect.objectContaining({ store: 'progress', id: 'bad-topic', message: 'write failed' }),
    ]);
  });

  it('reloads the live canvas after restoring a Studio board from a backup', async () => {
    // The mounted canvas holds the board in memory; without a reload it would
    // keep serving the pre-import board and its next autosave would write that
    // stale board back over the restored one.
    window.OpenCourseDeck.Canvas = { restoreBoard: vi.fn(async () => true) };
    const payload = {
      version: '1.4',
      progress: [],
      notes: [],
      folders: [],
      settings: { studio: { version: 1, layers: [{ id: 'imported-layer', elements: [] }] } },
      annotations: [],
      timestamps: [],
    };
    window.OpenCourseDeck.UI = { confirm: vi.fn(async () => true) };
    const file = new File([JSON.stringify(payload)], 'studio-backup.json', { type: 'application/json' });
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
      const el = originalCreateElement(tagName, options);
      if (tagName === 'input') {
        Object.defineProperty(el, 'files', { configurable: true, value: [file] });
        el.click = vi.fn(() => el.onchange?.());
      }
      return el;
    });

    await window.ProgressStats.importJSON();
    await vi.waitFor(() => expect(window.OpenCourseDeck.lastImportResult).toBeTruthy());

    expect(window.DB.saveSetting).toHaveBeenCalledWith('ocd_studio_board', payload.settings.studio);
    expect(window.OpenCourseDeck.Canvas.restoreBoard).toHaveBeenCalledTimes(1);
    delete window.OpenCourseDeck.Canvas;
  });

  it('aborts an import before its first write when an original collection cannot be snapshotted', async () => {
    const payload = { version: '1.4', progress: [{ topicId: 'new', courseId: 'a' }] };
    const file = new File([JSON.stringify(payload)], 'unsafe-import.json', { type: 'application/json' });
    window.DB.getAllNotes.mockRejectedValueOnce(new Error('Existing notes read failed'));
    window.OpenCourseDeck.UI = { confirm: vi.fn(async () => true) };

    await window.ProgressStats.importJSONFile(file);

    expect(window.DB.saveProgress).not.toHaveBeenCalled();
    expect(window.DB.saveNote).not.toHaveBeenCalled();
    expect(window.OpenCourseDeck.Toast.error).toHaveBeenCalledWith(expect.stringContaining('Existing notes read failed'));
    expect(window.OpenCourseDeck.lastImportResult).toBeUndefined();
  });

  it('reports a failed rollback honestly instead of claiming all old data was recovered', async () => {
    const payload = { version: '1.4', notes: [{ id: 'bad', title: 'Bad' }] };
    const file = new File([JSON.stringify(payload)], 'rollback-failure.json', { type: 'application/json' });
    window.OpenCourseDeck.UI = { confirm: vi.fn(async () => true) };
    window.DB.saveNote.mockRejectedValueOnce(new Error('Imported note failed'));
    window.DB.clearUserData = vi.fn(async () => { throw new Error('Rollback deletion failed'); });

    await window.ProgressStats.importJSONFile(file);

    expect(window.OpenCourseDeck.lastImportResult).toMatchObject({ rolledBack: false });
    expect(window.OpenCourseDeck.lastImportResult.rollbackErrors).toEqual([expect.stringContaining('Rollback deletion failed')]);
    expect(window.OpenCourseDeck.Toast.error).toHaveBeenCalledWith(expect.stringContaining('recovery was incomplete'));
  });

  it('prefers atomic full-primary-store rollback when the v3 backup engine is available', async () => {
    const payload = { version: '1.4', notes: [{ id: 'bad', title: 'Bad' }] };
    const file = new File([JSON.stringify(payload)], 'atomic-rollback.json', { type: 'application/json' });
    const original = {
      _meta: { format: 'opencoursedeck-snapshot', version: 3 },
      watchedSegments: [{ id: 'segment-that-must-survive' }],
      pdfBookmarks: [{ id: 'bookmark-that-must-survive' }],
      notes: [{ id: 'old-note' }],
    };
    window.OpenCourseDeck.UI = { confirm: vi.fn(async () => true) };
    window.DB.exportBackup = vi.fn(async () => original);
    window.DB.importBackup = vi.fn(async () => ({ committed: true }));
    window.DB.saveNote.mockRejectedValueOnce(new Error('Bad note'));
    window.DB.clearUserData = vi.fn(async () => true);

    await window.ProgressStats.importJSONFile(file);

    expect(window.DB.importBackup).toHaveBeenCalledWith(original, {
      mode: 'overwrite', restoreLocalAuthority: true,
    });
    expect(window.DB.clearUserData).not.toHaveBeenCalled();
    expect(window.OpenCourseDeck.lastImportResult).toMatchObject({ rolledBack: true, rollbackErrors: [] });
  });

  it('rolls back authored course outlines and media cues when a later import write fails', async () => {
    const originalCourses = [{ id: 'course-old', title: 'Original course' }];
    const originalCues = { 'topic-old': [{ at: 20, text: 'Original cue' }] };
    const state = new Map([
      ['ocd_my_courses', originalCourses],
      ['ocd_course_media_cues', originalCues],
    ]);
    window.DB.getSetting = vi.fn(async key => state.get(key) ?? null);
    window.DB.saveSetting = vi.fn(async (key, value) => {
      state.set(key, value);
      return value;
    });
    window.DB.clearUserData = vi.fn(async () => true);
    window.DB.deleteTimestamp = vi.fn(async () => true);
    window.DB.saveTimestamp.mockRejectedValueOnce(new Error('timestamp write failed'));
    window.OpenCourseDeck.UI = { confirm: vi.fn(async () => true) };
    const file = new File([JSON.stringify({
      version: '1.6',
      settings: {
        myCourses: [{ id: 'course-new', title: 'Imported course' }],
        mediaCues: { 'topic-new': [{ at: 30, text: 'Imported cue' }] },
      },
      timestamps: [{ id: 'ts-new', topicId: 'topic-new', position: 30 }],
      progress: [], notes: [], annotations: [],
    })], 'partial-restore.json', { type: 'application/json' });
    await window.ProgressStats.importJSONFile(file);
    expect(window.OpenCourseDeck.lastImportResult).toMatchObject({ rolledBack: true });
    expect(state.get('ocd_my_courses')).toEqual(originalCourses);
    expect(state.get('ocd_course_media_cues')).toEqual(originalCues);
    expect(window.DB.saveSetting).toHaveBeenCalledWith('ocd_my_courses', originalCourses);
    expect(window.DB.saveSetting).toHaveBeenCalledWith('ocd_course_media_cues', originalCues);
  });

  it('rolls back earlier progress writes when a later read fails unexpectedly', async () => {
    const saved = new Map([['original', { topicId: 'original', courseId: 'course-old', updatedAt: 20 }]]);
    window.DB.getAllProgress = vi.fn(async () => [...saved.values()]);
    window.DB.getProgress = vi.fn(async (topicId) => {
      if (topicId === 'read-fails') throw new Error('Reading progress failed');
      return saved.get(topicId) ?? null;
    });
    window.DB.saveProgress = vi.fn(async (topicId, _courseId, data) => {
      saved.set(topicId, data);
      return data;
    });
    window.DB.clearUserData = vi.fn(async (scope) => {
      if (scope === 'progress') saved.clear();
    });
    window.OpenCourseDeck.UI = { confirm: vi.fn(async () => true) };
    const payload = {
      version: '1.4',
      progress: [
        { topicId: 'imported', courseId: 'course-new', updatedAt: 100 },
        { topicId: 'read-fails', courseId: 'course-new', updatedAt: 100 },
      ],
    };
    const file = new File([JSON.stringify(payload)], 'read-failure.json', { type: 'application/json' });

    await window.ProgressStats.importJSONFile(file);

    expect(window.DB.saveProgress).toHaveBeenCalledWith('imported', 'course-new', expect.any(Object));
    expect(window.OpenCourseDeck.lastImportResult).toMatchObject({ rolledBack: true });
    expect(window.OpenCourseDeck.lastImportResult.errors).toEqual([
      expect.objectContaining({ store: 'import', message: 'Reading progress failed' }),
    ]);
    expect([...saved.values()]).toEqual([{ topicId: 'original', courseId: 'course-old', updatedAt: 20 }]);
    expect(window.OpenCourseDeck.Toast.error).toHaveBeenCalledWith(
      expect.stringContaining('Previously saved data was restored'),
    );
  });

  it('rolls back backup import writes when any store write fails', async () => {
    const payload = {
      version: '1.3',
      progress: [{ topicId: 'new-progress', courseId: 'course-2', updatedAt: 100 }],
      notes: [{ id: 'new-note', title: 'New note', updatedAt: 100 }],
    };
    const oldProgress = { topicId: 'old-progress', courseId: 'course-1', updatedAt: 20 };
    const oldNote = { id: 'old-note', title: 'Old note', updatedAt: 20 };
    window.DB.getAllProgress.mockResolvedValue([oldProgress]);
    window.DB.getAllNotes.mockResolvedValue([oldNote]);
    window.DB.getAllFolders.mockResolvedValue([]);
    window.DB.getAllTimestamps.mockResolvedValue([]);
    window.DB.getAllAnnotations.mockResolvedValue([]);
    window.DB.getSetting.mockResolvedValue(undefined);
    window.DB.clearUserData = vi.fn(async () => true);
    window.DB.saveNote.mockImplementation(async (note) => {
      if (note.id === 'new-note') throw new Error('note write failed');
      return true;
    });
    window.OpenCourseDeck.UI = { confirm: vi.fn(async () => true) };
    const file = new File([JSON.stringify(payload)], 'rollback-backup.json', { type: 'application/json' });
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
      const el = originalCreateElement(tagName, options);
      if (tagName === 'input') {
        Object.defineProperty(el, 'files', { configurable: true, value: [file] });
        el.click = vi.fn(() => el.onchange?.());
      }
      return el;
    });

    await window.ProgressStats.importJSON();
    await vi.waitFor(() => expect(window.OpenCourseDeck.lastImportResult?.rolledBack).toBe(true));

    expect(window.DB.clearUserData.mock.calls.map(([scope]) => scope)).toEqual([
      'progress',
      'notes',
      'playlists',
      'studio',
    ]);
    expect(window.DB.saveProgress).toHaveBeenCalledWith('new-progress', 'course-2', expect.objectContaining({ topicId: 'new-progress' }));
    expect(window.DB.saveProgress).toHaveBeenCalledWith('old-progress', 'course-1', oldProgress);
    expect(window.DB.saveNote).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-note' }));
    expect(window.DB.saveNote).toHaveBeenCalledWith(oldNote);
    expect(window.OpenCourseDeck.lastImportResult.errors).toEqual([
      expect.objectContaining({ store: 'notes', id: 'new-note', message: 'note write failed' }),
    ]);
    expect(window.OpenCourseDeck.lastImportResult.rollbackErrors).toEqual([]);
    expect(window.OpenCourseDeck.Toast.error).toHaveBeenCalledWith(expect.stringContaining('Import rolled back'));
  });

  it('shows import preview and does not write records when cancelled', async () => {
    const payload = {
      version: '1.3',
      progress: [{ topicId: 'topic-cancel', courseId: 'course-1', updatedAt: 10 }],
      notes: [{ id: 'note-cancel', title: 'Cancelled', updatedAt: 12 }],
      folders: [{ id: 'folder-cancel', name: 'Cancelled folder' }],
      settings: { notes: { view: 'grid' } },
      annotations: [{ id: 'ann-cancel', docId: 'doc-1', page: 1, updatedAt: 13 }],
      timestamps: [{ id: 'ts-cancel', topicId: 'topic-cancel' }],
    };
    window.OpenCourseDeck.UI = { confirm: vi.fn(async () => false) };
    const file = new File([JSON.stringify(payload)], 'cancelled-backup.json', { type: 'application/json' });
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
      const el = originalCreateElement(tagName, options);
      if (tagName === 'input') {
        Object.defineProperty(el, 'files', { configurable: true, value: [file] });
        el.click = vi.fn(() => el.onchange?.());
      }
      return el;
    });

    await window.ProgressStats.importJSON();
    await vi.waitFor(() => expect(window.OpenCourseDeck.lastImportPreview).toBeTruthy());

    expect(window.OpenCourseDeck.lastImportPreview).toEqual(expect.objectContaining({
      fileName: 'cancelled-backup.json',
      progress: 1,
      notes: 1,
      folders: 1,
      settings: 1,
      annotations: 1,
      timestamps: 1,
      totalValid: 6,
    }));
    expect(window.OpenCourseDeck.UI.confirm.mock.calls[0][0]).toEqual(expect.objectContaining({
      title: 'Import Backup',
      message: expect.stringContaining('Import backup "cancelled-backup.json"?'),
    }));
    expect(window.OpenCourseDeck.UI.confirm.mock.calls[0][0].message).toContain('PDF annotations: 1');
    expect(window.OpenCourseDeck.lastImportResult).toBeUndefined();
    expect(window.DB.saveProgress).not.toHaveBeenCalled();
    expect(window.DB.saveNote).not.toHaveBeenCalled();
    expect(window.DB.saveFolder).not.toHaveBeenCalled();
    expect(window.DB.saveSetting).not.toHaveBeenCalled();
    expect(window.DB.saveAnnotations).not.toHaveBeenCalled();
    expect(window.DB.saveTimestamp).not.toHaveBeenCalled();
  });

  it('imports notes-only backups without requiring a progress array', async () => {
    const payload = {
      version: '1.2',
      notes: [{ id: 'note-only', title: 'Notes only', content: '<p>Body</p>', updatedAt: 12 }],
    };
    window.OpenCourseDeck.UI = { confirm: vi.fn(async () => true) };
    const file = new File([JSON.stringify(payload)], 'notes-only.json', { type: 'application/json' });
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
      const el = originalCreateElement(tagName, options);
      if (tagName === 'input') {
        Object.defineProperty(el, 'files', { configurable: true, value: [file] });
        el.click = vi.fn(() => el.onchange?.());
      }
      return el;
    });

    await window.ProgressStats.importJSON();
    await vi.waitFor(() => expect(window.OpenCourseDeck.lastImportResult).toBeTruthy());

    expect(window.OpenCourseDeck.lastImportPreview).toEqual(expect.objectContaining({
      fileName: 'notes-only.json',
      progress: 0,
      notes: 1,
      totalValid: 1,
    }));
    expect(window.DB.saveProgress).not.toHaveBeenCalled();
    expect(window.DB.saveNote).toHaveBeenCalledWith(expect.objectContaining({
      id: 'note-only',
      title: 'Notes only',
      content: '<p>Body</p>',
    }));
    expect(window.OpenCourseDeck.lastImportResult.notes).toBe(1);
  });

  it('imports a File argument without opening another picker', async () => {
    const payload = {
      version: '1.4',
      notes: [{ id: 'note-file', title: 'From file', content: '<p>Body</p>', updatedAt: 12 }],
    };
    window.OpenCourseDeck.UI = { confirm: vi.fn(async () => true) };
    const file = new File([JSON.stringify(payload)], 'direct.json', { type: 'application/json' });
    const createSpy = vi.spyOn(document, 'createElement');

    await window.ProgressStats.importJSON(file);
    await vi.waitFor(() => expect(window.OpenCourseDeck.lastImportResult).toBeTruthy());

    expect(createSpy.mock.calls.some(([tag]) => tag === 'input')).toBe(false);
    expect(window.DB.saveNote).toHaveBeenCalledWith(expect.objectContaining({ id: 'note-file' }));
  });

  it('rejects unsupported backup versions before writing records', async () => {
    const payload = {
      version: '9.9',
      progress: [{ topicId: 'future-topic', courseId: 'course-1', updatedAt: 10 }],
      notes: [],
      folders: [],
      annotations: [],
      timestamps: [],
    };
    window.OpenCourseDeck.UI = { confirm: vi.fn(async () => true) };
    const file = new File([JSON.stringify(payload)], 'future-backup.json', { type: 'application/json' });
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
      const el = originalCreateElement(tagName, options);
      if (tagName === 'input') {
        Object.defineProperty(el, 'files', { configurable: true, value: [file] });
        el.click = vi.fn(() => el.onchange?.());
      }
      return el;
    });

    await window.ProgressStats.importJSON();
    await vi.waitFor(() => expect(window.OpenCourseDeck.Toast.error).toHaveBeenCalledWith(expect.stringContaining('Unsupported backup version: 9.9')));

    expect(window.OpenCourseDeck.UI.confirm).not.toHaveBeenCalled();
    expect(window.OpenCourseDeck.lastImportPreview).toBeUndefined();
    expect(window.OpenCourseDeck.lastImportResult).toBeUndefined();
    expect(window.DB.saveProgress).not.toHaveBeenCalled();
  });
});
