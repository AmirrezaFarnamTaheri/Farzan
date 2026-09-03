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

  it('exports JSON backups with all canonical user-data collections', async () => {
    await window.ProgressStats.exportJSON();

    const payload = JSON.parse(await downloadedBlob.text());

    expect(payload.version).toBe('1.4');
    expect(payload.progress).toHaveLength(1);
    expect(payload.notes).toHaveLength(1);
    expect(payload.folders).toHaveLength(1);
    expect(payload.annotations).toHaveLength(1);
    expect(payload.timestamps).toHaveLength(1);
    expect(payload.settings.notes).toEqual({ view: 'list' });
    expect(payload.settings.playlists).toEqual([{ id: 'playlist-1', title: 'Saved queue', topicIds: ['topic-1'] }]);
    expect(payload.settings.studio).toEqual({ version: 1, layers: [{ id: 'layer-1', elements: [] }] });
    expect(payload.settings.flashcards).toEqual([{ id: 'fc_1', front: 'Q', back: 'A' }]);
    expect(payload.settings.library).toEqual({ version: 1, courses: { 'user-library': { title: 'My Library', sources: [] } } });
    expect(payload.meta.storage.available).toBe(900);
    expect(payload.meta.sizeBytes).toBeGreaterThan(0);
  });

  it('exports Markdown notes from current content before legacy fields', async () => {
    await window.ProgressStats.exportNotesMarkdown();

    const markdown = await downloadedBlob.text();

    expect(markdown).toContain('## Current note');
    expect(markdown).toContain('Current body');
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
    expect(JSON.parse(await downloadedBlob.text()).version).toBe('1.4');

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
    expect(tracker.querySelector('.step-dot').textContent).toBe('✓');
    expect(tracker.querySelectorAll('script,img,svg')).toHaveLength(0);
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
      'media',
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
