// ============================================================
// progress.js  — PlasmaDeck bulk progress & export
// ============================================================
'use strict';

const ProgressStats = (() => {

  /* ── helpers ────────────────────────────────────────────── */
  const q  = s => document.querySelector(s);
  const fmtDate  = d => new Date(d).toLocaleDateString('fa-IR');
  /** Toast via app shell (avoid bridge App shim). */
  function pdToast(message, type = 'info') {
    const T = window.PlasmaDeck?.Toast;
    if (!T) return;
    const fn = T[type];
    if (typeof fn === 'function') return fn(String(message ?? ''));
    T.show?.({ message: String(message ?? ''), type });
  }
  async function pdConfirm(input) {
    const pd = window.PlasmaDeck;
    const fn = pd?.UI?.confirm ?? pd?.Modal?.confirmAsync;
    if (typeof fn === 'function') return fn(input);
    const message = input && typeof input === 'object' ? input.message : input;
    return window.confirm(String(message ?? 'Are you sure?'));
  }
  const fmtTime  = sec => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return h ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
             : `${m}:${String(s).padStart(2,'0')}`;
  };
  const _crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });

  /* ══════════════════════════════════════════════════════════
     AGGREGATE STATS
  ══════════════════════════════════════════════════════════ */
  async function getStats() {
    // Ensure catalog is loaded if available (bridge.js provides DataStore.init)
    try { await DataStore?.init?.(); } catch { /* ignore */ }
    const allProgress = await DB.getAllProgress();   // [{ topicId, courseId, position, duration, percent, status, updatedAt }]
    const allTopics   = DataStore.allTopics();

    const totalTopics  = allTopics.length;
    const doneTopics   = allProgress.filter(p => p.status === 'done').length;
    const inProgress   = allProgress.filter(p => p.status === 'in-progress').length;
    const notStarted   = totalTopics - doneTopics - inProgress;

    /* watch-time: sum of position × (position / duration) where duration > 0 */
    let watchedSec = 0;
    allProgress.forEach(p => {
      if (p.duration > 0) watchedSec += Math.min(p.position || 0, p.duration);
    });

    /* per-course breakdown */
    const courses = DataStore.allCourses();
    const byCourse = courses.map(c => {
      const topics   = allTopics.filter(t => t.courseId === c.id);
      const progs    = allProgress.filter(p => p.courseId === c.id);
      const done     = progs.filter(p => p.status === 'done').length;
      const total    = topics.length;
      const pct      = total ? Math.round((done / total) * 100) : 0;
      const watchSec = progs.reduce((a, p) => a + (p.duration > 0 ? Math.min(p.position || 0, p.duration) : 0), 0);
      return {
        courseId   : c.id,
        title      : c.title,
        total,
        done,
        inProgress : progs.filter(p => p.status === 'in-progress').length,
        pct,
        watchedSec : watchSec,
        watchedFmt : fmtTime(watchSec),
        lastUpdated: progs.reduce((a, p) => Math.max(a, p.updatedAt || 0), 0),
      };
    });

    /* streaks: days with at least one topic updated */
    const days = {};
    allProgress.forEach(p => {
      if (p.updatedAt) {
        const d = new Date(p.updatedAt).toDateString();
        days[d] = (days[d] || 0) + 1;
      }
    });
    const streak = _calcStreak(Object.keys(days));

    return {
      totalTopics,
      doneTopics,
      inProgress,
      notStarted,
      watchedSec,
      watchedFmt  : fmtTime(watchedSec),
      completionPct: totalTopics ? Math.round((doneTopics / totalTopics) * 100) : 0,
      byCourse,
      streak,
      activeDays  : Object.keys(days).length,
    };
  }

  function _calcStreak(dateStrings) {
    if (!dateStrings.length) return 0;
    const dates = dateStrings
      .map(d => new Date(d))
      .sort((a, b) => b - a);

    let streak = 0;
    let cursor = new Date();
    cursor.setHours(0, 0, 0, 0);

    for (const d of dates) {
      const day = new Date(d);
      day.setHours(0, 0, 0, 0);
      const diff = Math.round((cursor - day) / 86400000);
      if (diff === 0 || diff === 1) {
        streak++;
        cursor = day;
      } else {
        break;
      }
    }
    return streak;
  }

  /* ══════════════════════════════════════════════════════════
     RENDER STATS PAGE
  ══════════════════════════════════════════════════════════ */
  async function renderStatsPage() {
    const stats = await getStats();

    // summary cards
    _setText('#stat-total-topics',      stats.totalTopics);
    _setText('#stat-done-topics',       stats.doneTopics);
    _setText('#stat-in-progress',       stats.inProgress);
    _setText('#stat-completion-pct',    `${stats.completionPct}%`);
    _setText('#stat-watched-time',      stats.watchedFmt);
    _setText('#stat-streak',            `${stats.streak} روز`);
    _setText('#stat-active-days',       `${stats.activeDays} روز`);

    // overall progress bar
    const bar = q('#stat-overall-bar');
    if (bar) bar.style.width = `${stats.completionPct}%`;

    // per-course table
    const tbody = q('#stat-course-table-body');
    if (tbody) {
      tbody.replaceChildren(...stats.byCourse.map(_courseStatsRow));
    }

    // chart (if Chart.js available)
    _renderCharts(stats);
  }

  function _renderCharts(stats) {
    if (!window.Chart) return;

    // Destroy previous instances to avoid leaks on re-render
    if (window.__plasmaCharts) {
      try { window.__plasmaCharts.overall?.destroy?.(); } catch {}
      try { window.__plasmaCharts.courses?.destroy?.(); } catch {}
    }
    window.__plasmaCharts = window.__plasmaCharts ?? {};
    const chartPalette = {
      done: '#2e7d32',
      active: '#1565c0',
      idle: '#6b7280',
    };
    const statusBorderDash = [
      [],
      [6, 4],
      [2, 3],
    ];

    // doughnut — overall completion
    const dCtx = q('#chart-overall')?.getContext('2d');
    if (dCtx) {
      window.__plasmaCharts.overall = new Chart(dCtx, {
        type: 'doughnut',
        data: {
          labels: ['تمام‌شده', 'در حال یادگیری', 'شروع‌نشده'],
          datasets: [{
            data: [stats.doneTopics, stats.inProgress, stats.notStarted],
            backgroundColor: [chartPalette.done, chartPalette.active, chartPalette.idle],
            borderColor: ['#ffffff', '#111827', '#ffffff'],
            borderWidth: [2, 4, 2],
            hoverBorderWidth: [3, 5, 3],
            pdPatternKey: ['solid', 'dash', 'dot'],
          }],
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
      });
    }

    // bar — per-course completion %
    const bCtx = q('#chart-courses')?.getContext('2d');
    if (bCtx) {
      window.__plasmaCharts.courses = new Chart(bCtx, {
        type: 'bar',
        data: {
          labels  : stats.byCourse.map(c => c.title),
          datasets: [{
            label           : 'درصد تکمیل',
            data            : stats.byCourse.map(c => c.pct),
            backgroundColor : chartPalette.active,
            borderColor     : '#0f172a',
            borderWidth     : 2,
            borderDash      : stats.byCourse.map((_, index) => statusBorderDash[index % statusBorderDash.length]),
            pdPatternKey    : stats.byCourse.map((_, index) => ['solid', 'dash', 'dot'][index % 3]),
          }],
        },
        options: {
          responsive: true,
          scales: { y: { min: 0, max: 100 } },
          plugins: { legend: { display: false } },
        },
      });
    }
  }

  /* ══════════════════════════════════════════════════════════
     BULK OPERATIONS
  ══════════════════════════════════════════════════════════ */

  /** Mark all topics in a course as done */
  async function markCourseAllDone(courseId) {
    const topics = DataStore.allTopics().filter(t => t.courseId === courseId);
    await Promise.all(topics.map(t =>
      DB.saveProgress(t.topicId, courseId, {
        status    : 'done',
        percent   : 100,
        updatedAt : Date.now(),
      })
    ));
    pdToast(`تمام سرفصل‌های دوره «تمام‌شده» علامت زده شد ✓`, 'success');
  }

  /** Reset all progress for a course */
  async function resetCourseProgress(courseId) {
    const confirmed = await pdConfirm({
      title: 'پاک کردن پیشرفت دوره',
      message: 'تمام پیشرفت این دوره پاک شود؟',
      confirmLabel: 'پاک کردن',
      cancelLabel: 'انصراف',
    });
    if (!confirmed) return;
    const topics = DataStore.allTopics().filter(t => t.courseId === courseId);
    await Promise.all(topics.map(t =>
      DB.saveProgress(t.topicId, courseId, {
        status   : 'not-started',
        percent  : 0,
        position : 0,
        updatedAt: Date.now(),
      })
    ));
    pdToast('پیشرفت دوره ریست شد', 'info');
  }

  /** Toggle a single topic's done status */
  async function toggleTopicDone(topicId, courseId) {
    const existing = await DB.getProgress(topicId);
    const isDone   = existing?.status === 'done';
    await DB.saveProgress(topicId, courseId, {
      status   : isDone ? 'not-started' : 'done',
      percent  : isDone ? 0 : 100,
      position : isDone ? 0 : (existing?.position || 0),
      updatedAt: Date.now(),
    });
    return !isDone;
  }

  /* ══════════════════════════════════════════════════════════
     EXPORT
  ══════════════════════════════════════════════════════════ */

  /** Export all progress + notes as JSON backup */
  async function exportJSON() {
    const allProgress  = await DB.getAllProgress();
    const allNotes     = await DB.getAllNotes();
    const allTimestamps= await DB.getAllTimestamps();
    const allFolders   = await DB.getAllFolders?.() ?? [];
    const allAnnotations = await DB.getAllAnnotations?.() ?? [];
    const notesSettings= await DB.getSetting?.('plasma-notes-settings') ?? null;
    const playlistsSettings= await DB.getSetting?.('plasma-playlists') ?? null;
    const studioSettings= await DB.getSetting?.('plasma-studio-board') ?? null;

    const payload = {
      exportedAt  : new Date().toISOString(),
      version     : '1.3',
      meta        : {
        storage: await _storageEstimate(),
      },
      progress    : allProgress,
      notes       : allNotes,
      folders     : allFolders,
      settings    : {
        notes: notesSettings,
        playlists: playlistsSettings,
        studio: studioSettings,
      },
      annotations : allAnnotations,
      timestamps  : allTimestamps,
    };
    let json = JSON.stringify(payload, null, 2);
    payload.meta.sizeBytes = new Blob([json]).size;
    json = JSON.stringify(payload, null, 2);
    _downloadText(json, `plasmadeck-backup-${_isoDate()}.json`, 'application/json');
    pdToast('فایل JSON دانلود شد ✓', 'success');
  }

  /** Export progress as CSV */
  async function exportCSV() {
    const allProgress = await DB.getAllProgress();
    const allTopics   = DataStore.allTopics();
    const topicMap    = Object.fromEntries(allTopics.map(t => [t.topicId, t]));

    const rows = [
      ['courseId', 'courseTitle', 'topicId', 'topicTitle', 'status', 'percent', 'position', 'duration', 'updatedAt'],
    ];
    allProgress.forEach(p => {
      const t = topicMap[p.topicId] || {};
      rows.push([
        p.courseId,
        t.courseTitle || '',
        p.topicId,
        t.title || '',
        p.status || 'not-started',
        p.percent ?? 0,
        p.position ?? 0,
        p.duration  ?? 0,
        p.updatedAt ? new Date(p.updatedAt).toISOString() : '',
      ]);
    });

    const csv = rows.map(r => r.map(_csvCell).join(',')).join('\n');
    _downloadText(csv, `plasmadeck-progress-${_isoDate()}.csv`, 'text/csv');
    pdToast('فایل CSV دانلود شد ✓', 'success');
  }

  /** Export notes as Markdown */
  async function exportNotesMarkdown() {
    const allNotes  = await DB.getAllNotes();
    const allTopics = DataStore.allTopics();
    const topicMap  = Object.fromEntries(allTopics.map(t => [t.topicId, t]));

    const lines = [`# PlasmaDeck Notes Export\n_${new Date().toISOString()}_\n`];
    allNotes.forEach(n => {
      const t = topicMap[n.topicId] || {};
      lines.push(`\n## ${n.title || t.title || n.topicId || 'Untitled note'}`);
      lines.push(`> دوره: ${t.courseId || n.courseId || '—'}\n`);
      lines.push(_htmlToMarkdown(n.content ?? n.html ?? '') || n.text || '');
    });

    _downloadText(lines.join('\n'), `plasmadeck-notes-${_isoDate()}.md`, 'text/markdown');
    pdToast('یادداشت‌ها به Markdown دانلود شد ✓', 'success');
  }

  /** Export a vault-style Markdown manifest with portable note files */
  async function _vaultExportData() {
    const allNotes = await DB.getAllNotes();
    const allTimestamps = await DB.getAllTimestamps?.() ?? [];
    const allAnnotations = await DB.getAllAnnotations?.() ?? [];
    const allTopics = DataStore.allTopics();
    const topicMap = Object.fromEntries(allTopics.map(t => [t.topicId, t]));
    const usedNames = new Map();
    const noteFiles = allNotes.map((note, index) => {
      const topic = topicMap[note.topicId] || {};
      const slug = _vaultSlug(note.title || topic.title || note.id || `note-${index + 1}`);
      const count = (usedNames.get(slug) || 0) + 1;
      usedNames.set(slug, count);
      const filename = `notes/${slug}${count > 1 ? `-${count}` : ''}.md`;
      return { filename, note, topic };
    });
    return { allNotes, allTimestamps, allAnnotations, noteFiles };
  }

  async function exportVaultMarkdown() {
    const { allNotes, allTimestamps, allAnnotations, noteFiles } = await _vaultExportData();

    const lines = [
      '# PlasmaDeck Vault Export',
      '',
      `Exported: ${new Date().toISOString()}`,
      `Notes: ${allNotes.length}`,
      `Timestamps: ${allTimestamps.length}`,
      `PDF annotations: ${allAnnotations.length}`,
      '',
      '## Manifest',
      '',
      ...noteFiles.map(file => `- [${file.filename}](${file.filename})`),
      '',
      '```json',
      JSON.stringify(noteFiles.map(({ filename, note }) => ({ path: filename, id: note.id || '', topicId: note.topicId || '', sourceType: note.sourceType || '' })), null, 2),
      '```',
      '',
      '## Timestamp Index',
      '',
      ...allTimestamps.map(ts => `- ${ts.title || ts.topicId || ts.id || 'Timestamp'}${ts.position != null ? ` @ ${fmtTime(Number(ts.position) || 0)}` : ''}`),
      '',
      '## PDF Annotation Index',
      '',
      ...allAnnotations.map(annotation => `- ${annotation.id || 'annotation'}: ${annotation.docId || 'global'} page ${annotation.page || annotation.pdfPage || 1}`),
      '',
      '## Files',
    ];

    noteFiles.forEach(({ filename, note, topic }) => {
      lines.push('', `<!-- ${filename} -->`, _noteVaultMarkdown(note, topic));
    });

    _downloadText(lines.join('\n'), `plasmadeck-vault-${_isoDate()}.md`, 'text/markdown');
    pdToast('Vault Markdown export downloaded ✓', 'success');
  }

  async function exportVaultArchive() {
    const archive = await _vaultArchivePayload();
    _downloadText(JSON.stringify(archive, null, 2), `plasmadeck-vault-archive-${_isoDate()}.json`, 'application/json');
    pdToast('Vault archive export downloaded ✓', 'success');
  }

  async function exportVaultZip() {
    const archive = await _vaultArchivePayload();
    _downloadBlob(_zipFiles(archive.files), `plasmadeck-vault-${_isoDate()}.zip`);
    pdToast(`Vault ZIP export downloaded (${archive.files.length} files) ✓`, 'success');
  }

  async function exportVaultDirectory() {
    if (typeof window.showDirectoryPicker !== 'function') {
      pdToast('Folder export is not supported in this browser; downloading archive JSON instead.', 'info');
      return exportVaultArchive();
    }
    const archive = await _vaultArchivePayload();
    const root = await window.showDirectoryPicker({ id: 'plasmadeck-vault', mode: 'readwrite', startIn: 'documents' });
    for (const file of archive.files) {
      await _writeVaultFile(root, file.path, file.content);
    }
    pdToast(`Vault folder export complete (${archive.files.length} files) ✓`, 'success');
    return { saved: archive.files.length, files: archive.files.map(file => file.path) };
  }

  /** Import JSON backup */
  async function importJSON() {
    const input = document.createElement('input');
    input.type  = 'file';
    input.accept= '.json,application/json';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const text    = await file.text();
        const payload = JSON.parse(text);
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
          throw new Error('فرمت فایل نادرست');
        }
        const storage = await _storageEstimate();
        if (storage?.available != null && file.size > storage.available) {
          throw new Error('فضای ذخیره‌سازی کافی برای وارد کردن این فایل وجود ندارد');
        }
        const rawProgress = _asArray(payload.progress);
        const progressRecords = rawProgress.filter(_isProgressRecord);
        const noteRecords = _asArray(payload.notes).filter(_isObjectRecord);
        const folderRecords = _asArray(payload.folders).filter((folder) => _isObjectRecord(folder) && folder.id != null);
        const annotationRecords = _asArray(payload.annotations).filter(_isAnnotationRecord);
        const timestampRecords = _asArray(payload.timestamps).filter((timestamp) => _isObjectRecord(timestamp) && timestamp.id != null);
        const versionSupported = !payload.version || ['1.0', '1.1', '1.2', '1.3'].includes(String(payload.version));
        if (!versionSupported) throw new Error(`Unsupported backup version: ${payload.version}`);
        const invalidCount =
          rawProgress.length - progressRecords.length +
          _asArray(payload.notes).length - noteRecords.length +
          _asArray(payload.folders).length - folderRecords.length +
          _asArray(payload.annotations).length - annotationRecords.length +
          _asArray(payload.timestamps).length - timestampRecords.length;
        const settingsCount =
          (payload.settings?.notes ? 1 : 0) +
          (Array.isArray(payload.settings?.playlists) ? 1 : 0) +
          (payload.settings?.studio && typeof payload.settings.studio === 'object' && !Array.isArray(payload.settings.studio) ? 1 : 0);
        const preview = {
          version: payload.version ?? 'legacy',
          fileName: file.name ?? 'backup.json',
          sizeBytes: file.size ?? text.length,
          storageAvailable: storage?.available ?? null,
          progress: progressRecords.length,
          notes: noteRecords.length,
          folders: folderRecords.length,
          settings: settingsCount,
          annotations: annotationRecords.length,
          timestamps: timestampRecords.length,
          invalid: invalidCount,
          totalValid:
            progressRecords.length +
            noteRecords.length +
            folderRecords.length +
            settingsCount +
            annotationRecords.length +
            timestampRecords.length,
        };
        const result = {
          progress: 0,
          notes: 0,
          folders: 0,
          settings: 0,
          annotations: 0,
          timestamps: 0,
          skipped: 0,
          invalid: invalidCount,
          errors: [],
          preview,
        };

        window.PlasmaDeck = window.PlasmaDeck ?? {};
        window.PlasmaDeck.lastImportPreview = preview;
        const confirmed = await pdConfirm({
          title: 'وارد کردن پشتیبان',
          message: _formatImportPreview(preview) ||
            `${progressRecords.length} رکورد پیشرفت و ${noteRecords.length} یادداشت وارد شود؟`,
          confirmLabel: 'وارد کردن',
          cancelLabel: 'انصراف',
        });
        if (!confirmed) return;

        const rollbackSnapshot = await _createImportSnapshot();

        await _forEachChunk(progressRecords, async (p) => {
          const existing = await DB.getProgress(p.topicId);
          if (!_shouldImportRecord(existing, p)) {
            result.skipped += 1;
            return;
          }
            try {
              await DB.saveProgress(p.topicId, p.courseId, p);
              result.progress += 1;
            } catch (err) {
              _recordImportError(result, 'progress', p.topicId, err);
            }
          });
        // Notes are stored by notes.js in localStorage under "plasma-notes".
        // Older backups may have {topicId, courseId, html, text}; keep whatever fields exist.
        if (noteRecords.length) {
          const imported = noteRecords.map((n) => ({
            id: n.id ?? `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            title: n.title ?? (n.topicId ? `Topic ${n.topicId}` : 'Imported note'),
            content: n.content ?? n.html ?? '',
            folderId: n.folderId ?? 'default',
            tags: n.tags ?? [],
            pinned: !!n.pinned,
            color: n.color ?? '',
            createdAt: n.createdAt ?? Date.now(),
            updatedAt: n.updatedAt ?? Date.now(),
            wordCount: n.wordCount ?? 0,
            charCount: n.charCount ?? 0,
            // Preserve original linkage if present
            topicId: n.topicId,
            courseId: n.courseId,
            text: n.text,
            html: n.html,
          }));

          const existingNotes = Object.fromEntries((await DB.getAllNotes()).map((note) => [note.id, note]));
          await _forEachChunk(imported, async (note) => {
            if (!_shouldImportRecord(existingNotes[note.id], note)) {
              result.skipped += 1;
              return;
            }
              try {
                await DB.saveNote?.(note);
                result.notes += 1;
              } catch (err) {
                _recordImportError(result, 'notes', note.id, err);
              }
            });

          // Nudge Notes UI to refresh if open
          try { window.PlasmaNotesApp?.init?.(); } catch { /* ignore */ }
          try { window.PlasmaDeck?.Toast?.success?.(`Imported ${imported.length} notes.`); } catch { /* ignore */ }
        }
        if (folderRecords.length && DB.saveFolder) {
          await _forEachChunk(folderRecords, async (folder) => {
            try {
              await DB.saveFolder(folder);
              result.folders += 1;
            } catch (err) {
              _recordImportError(result, 'folders', folder.id, err);
            }
          });
        } else if (folderRecords.length) {
          result.skipped += folderRecords.length;
        }
        if (payload.settings?.notes && DB.saveSetting) {
            try {
              await DB.saveSetting('plasma-notes-settings', payload.settings.notes);
              result.settings += 1;
            } catch (err) {
              _recordImportError(result, 'settings', 'plasma-notes-settings', err);
            }
        } else if (payload.settings?.notes) {
          result.skipped += 1;
        }
        if (Array.isArray(payload.settings?.playlists) && DB.saveSetting) {
            try {
              await DB.saveSetting('plasma-playlists', payload.settings.playlists);
              result.settings += 1;
            } catch (err) {
              _recordImportError(result, 'settings', 'plasma-playlists', err);
            }
        } else if (payload.settings?.playlists) {
          result.skipped += 1;
        }
        if (payload.settings?.studio && typeof payload.settings.studio === 'object' && !Array.isArray(payload.settings.studio) && DB.saveSetting) {
            try {
              await DB.saveSetting('plasma-studio-board', payload.settings.studio);
              result.settings += 1;
            } catch (err) {
              _recordImportError(result, 'settings', 'plasma-studio-board', err);
            }
        } else if (payload.settings?.studio) {
          result.skipped += 1;
        }
        if (annotationRecords.length && DB.saveAnnotations) {
          const byDoc = annotationRecords.reduce((acc, annotation) => {
            const docId = String(annotation.docId ?? 'global');
            const page = String(annotation.page ?? 1);
            acc[docId] = acc[docId] ?? {};
            acc[docId][page] = acc[docId][page] ?? [];
            acc[docId][page].push(annotation);
            return acc;
          }, {});
          for (const [docId, annotationsByPage] of Object.entries(byDoc)) {
            const existing = await DB.getAnnotations?.(docId) ?? [];
            const existingById = Object.fromEntries(existing.map((annotation) => [annotation.id, annotation]));
            const mergedByPage = existing.reduce((acc, annotation) => {
              const page = String(annotation.page ?? 1);
              acc[page] = acc[page] ?? [];
              acc[page].push(annotation);
              return acc;
            }, {});
            for (const [page, annotations] of Object.entries(annotationsByPage)) {
              for (const annotation of annotations) {
                if (!_shouldImportRecord(existingById[annotation.id], annotation)) {
                  result.skipped += 1;
                  continue;
                }
                const pageKey = String(page);
                mergedByPage[pageKey] = (mergedByPage[pageKey] ?? []).filter((item) => item.id !== annotation.id);
                mergedByPage[pageKey].push(annotation);
                result.annotations += 1;
              }
            }
            try {
              await DB.saveAnnotations(docId, mergedByPage);
            } catch (err) {
              _recordImportError(result, 'annotations', docId, err);
            }
          }
        } else if (annotationRecords.length) {
          result.skipped += annotationRecords.length;
        }
        if (timestampRecords.length) {
          await _forEachChunk(timestampRecords, async (ts) => {
            try {
              await DB.saveTimestamp(ts);
              result.timestamps += 1;
            } catch (err) {
              _recordImportError(result, 'timestamps', ts.id, err);
            }
          });
        }
        if (result.errors.length) {
          await _rollbackImport(rollbackSnapshot, result);
        }
        window.PlasmaDeck = window.PlasmaDeck ?? {};
        window.PlasmaDeck.lastImportResult = result;
        if (result.rolledBack) {
          pdToast(`Import rolled back after ${result.errors.length} error(s). No partial backup changes were kept.`, 'error');
        } else {
          pdToast(`Import complete: ${result.progress} progress, ${result.notes} notes, ${result.folders} folders, ${result.annotations} annotations, ${result.timestamps} timestamps, ${result.invalid} invalid skipped.`, 'success');
        }
      } catch (err) {
        console.error('[Progress] import error', err);
        pdToast('خطا در وارد کردن: ' + err.message, 'error');
      }
    };
    input.click();
  }

  /* ══════════════════════════════════════════════════════════
     BIND BUTTONS ON STATS/SETTINGS PAGE
  ══════════════════════════════════════════════════════════ */
  function bindButtons(root = document) {
    const view = root?.querySelector?.('.view-progress') ?? document.querySelector('.view-progress');
    if (!view || view.dataset.progressBound === 'true') return false;
    view.dataset.progressBound = 'true';
    const on = (sel, ev, fn) => {
      const el = view.querySelector(sel);
      if (el) el.addEventListener(ev, fn);
    };
    on('#btn-export-json',  'click', exportJSON);
    on('#btn-export-csv',   'click', exportCSV);
    on('#btn-export-md',    'click', exportNotesMarkdown);
    on('#btn-export-vault', 'click', exportVaultMarkdown);
    on('#btn-export-vault-archive', 'click', exportVaultArchive);
    on('#btn-export-vault-zip', 'click', exportVaultZip);
    on('#btn-export-vault-directory', 'click', exportVaultDirectory);
    on('#btn-import-json',  'click', importJSON);
    on('#btn-reset-all',    'click', async () => {
      const ok = await pdConfirm({
        title: 'پاک کردن همه داده‌ها',
        message: 'تمام پیشرفت‌ها، یادداشت‌ها و تایم‌استمپ‌ها پاک شوند؟',
        confirmLabel: 'پاک کردن همه',
        cancelLabel: 'انصراف',
      });
      if (!ok) return;
      await DB.clearAll();
      pdToast('تمام داده‌ها پاک شد', 'info');
      renderStatsPage();
    });
    return true;
  }

  function destroy() {
    if (window.__plasmaCharts) {
      try { window.__plasmaCharts.overall?.destroy?.(); } catch {}
      try { window.__plasmaCharts.courses?.destroy?.(); } catch {}
      window.__plasmaCharts = {};
    }
  }

  /* ══════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════ */
  function _setText(sel, val) {
    const el = q(sel);
    if (el) el.textContent = val;
  }

  function _courseStatsRow(course) {
    const tr = document.createElement('tr');
    const cells = [
      course.title,
      course.total,
      course.done,
      course.inProgress,
    ];
    cells.forEach((value) => {
      const td = document.createElement('td');
      td.textContent = String(value ?? '');
      tr.appendChild(td);
    });

    const pctTd = document.createElement('td');
    const wrap = document.createElement('div');
    wrap.className = 'mini-bar-wrap';
    const bar = document.createElement('div');
    bar.className = 'mini-bar';
    bar.style.width = `${Math.max(0, Math.min(100, Number(course.pct) || 0))}%`;
    wrap.appendChild(bar);
    const label = document.createElement('span');
    label.className = 'mini-bar-label';
    label.textContent = `${course.pct}%`;
    pctTd.append(wrap, label);
    tr.appendChild(pctTd);

    const watchedTd = document.createElement('td');
    watchedTd.textContent = String(course.watchedFmt ?? '');
    tr.appendChild(watchedTd);

    const lastTd = document.createElement('td');
    lastTd.textContent = course.lastUpdated ? fmtDate(course.lastUpdated) : '—';
    tr.appendChild(lastTd);
    return tr;
  }

  function _isoDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function _csvCell(val) {
    const s = String(val ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  }

  function _asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function _isObjectRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function _isProgressRecord(value) {
    return _isObjectRecord(value) && value.topicId != null && value.courseId != null;
  }

  function _isAnnotationRecord(value) {
    return _isObjectRecord(value) && value.page != null && Number.isFinite(Number(value.page));
  }

  function _recordTime(value) {
    const raw = value?.updatedAt ?? value?.createdAt ?? 0;
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function _shouldImportRecord(existing, incoming) {
    return !existing || _recordTime(incoming) >= _recordTime(existing);
  }

  function _recordImportError(result, store, id, err) {
    result.skipped += 1;
    result.errors.push({
      store,
      id: id ?? null,
      message: err?.message ?? String(err),
    });
  }

  async function _createImportSnapshot() {
    const settingsKeys = ['plasma-notes-settings', 'plasma-playlists', 'plasma-studio-board'];
    const annotations = await Promise.resolve(DB.getAllAnnotations?.()).catch(() => []);
    return {
      progress: await Promise.resolve(DB.getAllProgress?.()).catch(() => []),
      notes: await Promise.resolve(DB.getAllNotes?.()).catch(() => []),
      folders: await Promise.resolve(DB.getAllFolders?.()).catch(() => []),
      settings: Object.fromEntries(await Promise.all(settingsKeys.map(async (key) => [
        key,
        await Promise.resolve(DB.getSetting?.(key)).catch(() => undefined),
      ]))),
      annotations: Array.isArray(annotations) ? annotations : [],
      timestamps: await Promise.resolve(DB.getAllTimestamps?.()).catch(() => []),
    };
  }

  async function _rollbackImport(snapshot, result) {
    result.rolledBack = true;
    result.rollbackErrors = [];
    try {
      if (DB.clearUserData) {
        await DB.clearUserData('progress');
        await DB.clearUserData('notes');
        await DB.clearUserData('media');
        await DB.clearUserData('playlists');
        await DB.clearUserData('studio');
      }
      await _forEachChunk(snapshot.progress ?? [], (record) => DB.saveProgress?.(record.topicId, record.courseId, record));
      await _forEachChunk(snapshot.notes ?? [], (record) => DB.saveNote?.(record));
      await _forEachChunk(snapshot.folders ?? [], (record) => DB.saveFolder?.(record));
      for (const [key, value] of Object.entries(snapshot.settings ?? {})) {
        if (value !== undefined) await DB.saveSetting?.(key, value);
      }
      const annotationsByDoc = (snapshot.annotations ?? []).reduce((acc, annotation) => {
        const docId = String(annotation.docId ?? 'global');
        const page = String(annotation.page ?? 1);
        acc[docId] = acc[docId] ?? {};
        acc[docId][page] = acc[docId][page] ?? [];
        acc[docId][page].push(annotation);
        return acc;
      }, {});
      for (const [docId, pages] of Object.entries(annotationsByDoc)) {
        await DB.saveAnnotations?.(docId, pages);
      }
      await _forEachChunk(snapshot.timestamps ?? [], (record) => DB.saveTimestamp?.(record));
    } catch (err) {
      result.rollbackErrors.push(err?.message ?? String(err));
    }
  }

  function _formatBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return 'unknown';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function _formatImportPreview(preview) {
    const lines = [
      `Import backup "${preview.fileName}"?`,
      '',
      `Backup version: ${preview.version}`,
      `File size: ${_formatBytes(preview.sizeBytes)}`,
      `Available storage: ${_formatBytes(preview.storageAvailable)}`,
      '',
      `Progress records: ${preview.progress}`,
      `Notes: ${preview.notes}`,
      `Folders: ${preview.folders}`,
      `Settings groups: ${preview.settings}`,
      `PDF annotations: ${preview.annotations}`,
      `Timestamps: ${preview.timestamps}`,
      `Invalid records that will be skipped: ${preview.invalid}`,
      '',
      'Existing records are updated only when the imported record is newer or has no comparable timestamp.',
    ];
    if (!preview.totalValid) {
      lines.push('This backup contains no valid importable records.');
    }
    return lines.join('\n');
  }

  async function _forEachChunk(records, handler, chunkSize = 250) {
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      for (const record of chunk) await handler(record);
      await Promise.resolve();
    }
  }

  function _downloadText(text, filename, mime = 'text/plain') {
    _downloadBlob(new Blob([text], { type: mime }), filename);
  }

  function _downloadBlob(blob, filename) {
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function _zipFiles(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    files.forEach((file) => {
      const name = encoder.encode(file.path);
      const body = encoder.encode(file.content ?? '');
      const crc = _crc32(body);
      const local = _zipHeader(30, 0x04034b50);
      local.setUint16(4, 20, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, body.length, true);
      local.setUint32(22, body.length, true);
      local.setUint16(26, name.length, true);
      localParts.push(local, name, body);
      const central = _zipHeader(46, 0x02014b50);
      central.setUint16(4, 20, true);
      central.setUint16(6, 20, true);
      central.setUint32(16, crc, true);
      central.setUint32(20, body.length, true);
      central.setUint32(24, body.length, true);
      central.setUint16(28, name.length, true);
      central.setUint32(42, offset, true);
      centralParts.push(central, name);
      offset += local.byteLength + name.length + body.length;
    });
    const centralSize = centralParts.reduce((sum, part) => sum + part.byteLength, 0);
    const end = _zipHeader(22, 0x06054b50);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
  }

  function _zipHeader(size, signature) {
    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);
    view.setUint32(0, signature, true);
    return view;
  }

  function _crc32(bytes) {
    let crc = -1;
    for (let i = 0; i < bytes.length; i += 1) {
      crc = (crc >>> 8) ^ _crcTable[(crc ^ bytes[i]) & 255];
    }
    return (crc ^ -1) >>> 0;
  }

  async function _vaultArchivePayload() {
    const { allTimestamps, allAnnotations, noteFiles } = await _vaultExportData();
    const files = [{
      path: 'manifest.json',
      type: 'application/json',
      content: JSON.stringify({
        exportedAt: new Date().toISOString(),
        notes: noteFiles.map(({ filename, note }) => ({ path: filename, id: note.id || '', topicId: note.topicId || '', sourceType: note.sourceType || '' })),
        timestamps: allTimestamps.length,
        pdfAnnotations: allAnnotations.length,
      }, null, 2),
    }];
    noteFiles.forEach(({ filename, note, topic }) => {
      files.push({ path: filename, type: 'text/markdown', content: _noteVaultMarkdown(note, topic) });
    });
    return { version: 'plasmadeck-vault-archive-1', files };
  }

  async function _writeVaultFile(root, path, content) {
    const parts = String(path).split('/').filter(Boolean);
    let dir = root;
    for (const part of parts.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(part, { create: true });
    }
    const file = await dir.getFileHandle(parts.at(-1), { create: true });
    const writable = await file.createWritable();
    await writable.write(content);
    await writable.close();
  }

  function _vaultSlug(value) {
    return String(value || 'untitled')
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/&[a-z0-9#]+;/gi, '-')
      .replace(/[^a-z0-9\u0600-\u06ff]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'untitled';
  }

  function _yamlScalar(value) {
    return JSON.stringify(String(value ?? ''));
  }

  function _noteVaultMarkdown(note, topic = {}) {
    const body = _htmlToMarkdown(note.content ?? note.html ?? '') || note.text || '';
    const metadata = [
      '---',
      `id: ${_yamlScalar(note.id || '')}`,
      `title: ${_yamlScalar(note.title || topic.title || 'Untitled note')}`,
      `topicId: ${_yamlScalar(note.topicId || '')}`,
      `courseId: ${_yamlScalar(note.courseId || topic.courseId || '')}`,
      `sourceType: ${_yamlScalar(note.sourceType || '')}`,
      `pdfDocId: ${_yamlScalar(note.pdfDocId || note.docId || '')}`,
      `pdfPage: ${_yamlScalar(note.pdfPage || note.page || '')}`,
      `updatedAt: ${_yamlScalar(note.updatedAt ? new Date(note.updatedAt).toISOString() : '')}`,
      `tags: ${JSON.stringify(Array.isArray(note.tags) ? note.tags : [])}`,
      '---',
      '',
      `# ${note.title || topic.title || 'Untitled note'}`,
      '',
    ];
    if (topic.title || note.topicId) {
      metadata.push(`Topic: ${topic.title || note.topicId}`, '');
    }
    if (topic.courseId || note.courseId) {
      metadata.push(`Course: ${topic.courseId || note.courseId}`, '');
    }
    if (note.pdfDocId || note.docId || note.pdfPage || note.page) {
      metadata.push(`PDF: ${note.pdfDocId || note.docId || 'unknown'} page ${note.pdfPage || note.page || 1}`, '');
    }
    metadata.push(body);
    return metadata.join('\n').trim();
  }

  async function _storageEstimate() {
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (!estimate) return null;
      return {
        usage: estimate.usage ?? null,
        quota: estimate.quota ?? null,
        available: Number.isFinite(estimate.quota) && Number.isFinite(estimate.usage)
          ? Math.max(0, estimate.quota - estimate.usage)
          : null,
      };
    } catch {
      return null;
    }
  }

  /* very naive HTML → Markdown — good enough for Quill output */
  function _htmlToMarkdown(html) {
    return html
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi,   '# $1\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi,   '## $1\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi,   '### $1\n')
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<b[^>]*>(.*?)<\/b>/gi,     '**$1**')
      .replace(/<em[^>]*>(.*?)<\/em>/gi,   '*$1*')
      .replace(/<i[^>]*>(.*?)<\/i>/gi,     '*$1*')
      .replace(/<code[^>]*>(.*?)<\/code>/gi,'`$1`')
      .replace(/<li[^>]*>(.*?)<\/li>/gi,   '- $1\n')
      .replace(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
      .replace(/<br\s*\/?>/gi,             '\n')
      .replace(/<p[^>]*>(.*?)<\/p>/gi,     '$1\n\n')
      .replace(/<[^>]+>/g,                 '')
      .replace(/&amp;/g,  '&')
      .replace(/&lt;/g,   '<')
      .replace(/&gt;/g,   '>')
      .replace(/&nbsp;/g, ' ')
      .trim();
  }

  /* ── public API ─────────────────────────────────────────── */
  return {
    getStats,
    renderStatsPage,
    bindButtons,
    destroy,
    markCourseAllDone,
    resetCourseProgress,
    toggleTopicDone,
    exportJSON,
    exportCSV,
    exportNotesMarkdown,
    exportVaultMarkdown,
    exportVaultArchive,
    exportVaultZip,
    exportVaultDirectory,
    importJSON,
  };
})();

document.addEventListener('DOMContentLoaded', () => ProgressStats.bindButtons());

// Public init helper for SPA route injection
window.PlasmaDeck = window.PlasmaDeck ?? {};
window.PlasmaDeck.ProgressStatsInit = async () => {
  try {
    ProgressStats.bindButtons();
    await ProgressStats.renderStatsPage();
  } catch (e) {
    console.error('[ProgressStatsInit] failed', e);
  }
};

// ============================================================
// progress.js
// Unified Progress, Loading & Animation System
// ============================================================

  const Progress = (() => {

    // ── Shared easing functions ──────────────────────────
    const Ease = {
      linear:      t => t,
      easeIn:      t => t * t,
      easeOut:     t => t * (2 - t),
      easeInOut:   t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
      easeInCubic: t => t * t * t,
      easeOutCubic:t => (--t) * t * t + 1,
      easeInOutCubic: t => t < 0.5 ? 4*t*t*t : (t-1)*(2*t-2)*(2*t-2)+1,
      spring:      t => 1 - Math.cos(t * Math.PI * 4.5) * Math.pow(2, -8 * t),
      bounce:      t => {
        if (t < 1/2.75) return 7.5625 * t * t;
        if (t < 2/2.75) { t -= 1.5/2.75;   return 7.5625*t*t + 0.75; }
        if (t < 2.5/2.75){ t -= 2.25/2.75; return 7.5625*t*t + 0.9375; }
        t -= 2.625/2.75; return 7.5625*t*t + 0.984375;
      },
    };


    // ── 1. Linear progress bars ──────────────────────────
    const LinearBar = {
      /**
       * Set progress bar value (0–100)
       * @param {string|HTMLElement} bar
       * @param {number} value
       */
      set(bar, value) {
        const el = this._resolve(bar);
        if (!el) return;
        const clamped = Math.min(100, Math.max(0, value));
        const fill    = el.querySelector('.progress-fill, [data-progress-fill]');
        const label   = el.querySelector('.progress-label, [data-progress-label]');

        if (fill)  fill.style.width = `${clamped}%`;
        else       el.style.setProperty('--progress', `${clamped}%`);

        if (label) label.textContent = `${Math.round(clamped)}%`;

        el.setAttribute('aria-valuenow', String(Math.round(clamped)));

        // Color thresholds
        el.classList.remove('progress-low', 'progress-mid', 'progress-high', 'progress-full');
        if      (clamped === 100) el.classList.add('progress-full');
        else if (clamped >= 70)   el.classList.add('progress-high');
        else if (clamped >= 35)   el.classList.add('progress-mid');
        else                      el.classList.add('progress-low');
      },

      /**
       * Animate bar from current → target
       * @param {string|HTMLElement} bar
       * @param {number} target         0–100
       * @param {number} duration       ms
       * @param {string} easing
       * @returns {Promise<void>}
       */
      animate(bar, target, duration = 700, easing = 'easeOut') {
        const el = this._resolve(bar);
        if (!el) return Promise.resolve();

        const easeFn  = Ease[easing] ?? Ease.easeOut;
        const fill    = el.querySelector('.progress-fill, [data-progress-fill]');
        const startW  = parseFloat((fill?.style.width) || el.style.getPropertyValue('--progress') || '0');
        const startTs = performance.now();

        return new Promise(resolve => {
          const step = ts => {
            const pct  = Math.min((ts - startTs) / duration, 1);
            const val  = startW + (target - startW) * easeFn(pct);
            this.set(el, val);
            if (pct < 1) requestAnimationFrame(step);
            else resolve();
          };
          requestAnimationFrame(step);
        });
      },

      /**
       * Step progress bar in increments (e.g. multi-step upload)
       */
      step(bar, total, current, duration = 400) {
        const pct = (current / total) * 100;
        return this.animate(bar, pct, duration);
      },

      /**
       * Set bar to indeterminate (shimmer) mode
       */
      indeterminate(bar, on = true) {
        const el = this._resolve(bar);
        if (!el) return;
        el.classList.toggle('progress-indeterminate', on);
        if (on) {
          el.removeAttribute('aria-valuenow');
        }
      },

      _resolve(bar) {
        return typeof bar === 'string' ? document.getElementById(bar) : bar;
      },

      /**
       * Auto-init all [data-progress] elements on page
       */
      init() {
        document.querySelectorAll('[data-progress]').forEach(el => {
          const val = parseFloat(el.dataset.progress ?? '0');
          const animated = el.hasAttribute('data-progress-animate');
          if (animated) this.animate(el, val, 900, 'easeOut');
          else          this.set(el, val);
        });
      },
    };


    // ── 2. Circular / Ring progress ──────────────────────
    const CircularProgress = {
      /**
       * Set SVG circle progress (stroke-dashoffset technique)
       * @param {string|HTMLElement} ring
       * @param {number} value  0–100
       */
      set(ring, value) {
        const el     = this._resolve(ring);
        if (!el) return;
        const circle = el.querySelector('circle.progress-ring-fill, [data-ring-fill]');
        if (!circle) return;

        const r          = parseFloat(circle.getAttribute('r') ?? '36');
        const circumference = 2 * Math.PI * r;
        const clamped    = Math.min(100, Math.max(0, value));
        const offset     = circumference - (clamped / 100) * circumference;

        circle.style.strokeDasharray  = `${circumference}`;
        circle.style.strokeDashoffset = `${offset}`;

        const label = el.querySelector('[data-ring-label]');
        if (label) label.textContent = `${Math.round(clamped)}%`;

        el.setAttribute('aria-valuenow', String(Math.round(clamped)));
      },

      animate(ring, target, duration = 700, easing = 'easeOut') {
        const el = this._resolve(ring);
        if (!el) return Promise.resolve();
        const circle  = el.querySelector('circle.progress-ring-fill, [data-ring-fill]');
        if (!circle) return Promise.resolve();

        const r            = parseFloat(circle.getAttribute('r') ?? '36');
        const circumference = 2 * Math.PI * r;
        const startOffset  = parseFloat(circle.style.strokeDashoffset ?? String(circumference));
        const startPct     = 100 * (1 - startOffset / circumference);
        const easeFn       = Ease[easing] ?? Ease.easeOut;
        const startTs      = performance.now();

        return new Promise(resolve => {
          const step = ts => {
            const pct  = Math.min((ts - startTs) / duration, 1);
            const val  = startPct + (target - startPct) * easeFn(pct);
            this.set(el, val);
            if (pct < 1) requestAnimationFrame(step);
            else resolve();
          };
          requestAnimationFrame(step);
        });
      },

      /**
       * Create a ring SVG element programmatically
       */
      create({ size = 80, strokeWidth = 8, color = '#6366f1',
               trackColor = 'rgba(255,255,255,0.08)', value = 0, label = true } = {}) {
        const r    = (size - strokeWidth) / 2;
        const cx   = size / 2;
        const circ = 2 * Math.PI * r;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', size);
        svg.setAttribute('height', size);
        svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
        svg.setAttribute('role', 'progressbar');
        svg.setAttribute('aria-valuemin', '0');
        svg.setAttribute('aria-valuemax', '100');
        svg.classList.add('progress-ring');

        const mkCircle = (cls, col, dashoffset) => {
          const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          c.setAttribute('cx', cx);
          c.setAttribute('cy', cx);
          c.setAttribute('r', r);
          c.setAttribute('fill', 'none');
          c.setAttribute('stroke', col);
          c.setAttribute('stroke-width', strokeWidth);
          c.style.strokeDasharray  = `${circ}`;
          c.style.strokeDashoffset = `${dashoffset}`;
          c.style.transform        = 'rotate(-90deg)';
          c.style.transformOrigin  = '50% 50%';
          c.classList.add(cls);
          return c;
        };

        svg.appendChild(mkCircle('progress-ring-track', trackColor, 0));
        const fillCircle = mkCircle('progress-ring-fill', color, circ);
        fillCircle.setAttribute('data-ring-fill', '');
        svg.appendChild(fillCircle);

        if (label) {
          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          text.setAttribute('x', '50%');
          text.setAttribute('y', '50%');
          text.setAttribute('dominant-baseline', 'middle');
          text.setAttribute('text-anchor', 'middle');
          text.setAttribute('fill', '#f1f5f9');
          text.setAttribute('font-size', `${Math.round(size * 0.18)}px`);
          text.setAttribute('font-family', 'Inter, sans-serif');
          text.setAttribute('data-ring-label', '');
          text.textContent = '0%';
          svg.appendChild(text);
        }

        this.set(svg, value);
        return svg;
      },

      _resolve(el) {
        return typeof el === 'string' ? document.getElementById(el) : el;
      },

      init() {
        document.querySelectorAll('[data-ring-progress]').forEach(el => {
          const val      = parseFloat(el.dataset.ringProgress ?? '0');
          const animated = el.hasAttribute('data-ring-animate');
          if (animated) this.animate(el, val, 900, 'easeOutCubic');
          else          this.set(el, val);
        });
      },
    };


    // ── 3. Page-level loading bar (thin top bar) ─────────
    const PageBar = {
      _el:    null,
      _timer: null,
      _value: 0,

      _ensure() {
        if (this._el) return;
        this._el = document.createElement('div');
        this._el.className = 'page-progress-bar';
        this._el.setAttribute('role', 'progressbar');
        this._el.setAttribute('aria-hidden', 'true');
        this._el.style.cssText = `
          position: fixed; top: 0; left: 0; z-index: 99999;
          height: 3px; width: 0%;
          background: linear-gradient(90deg, #6366f1, #06b6d4);
          border-radius: 0 2px 2px 0;
          transition: width 0.4s ease, opacity 0.3s ease;
          pointer-events: none; opacity: 0;
        `;
        document.body.appendChild(this._el);
      },

      start() {
        this._ensure();
        clearTimeout(this._timer);
        this._value = 0;
        this._el.style.opacity    = '1';
        this._el.style.transition = 'none';
        this._el.style.width      = '0%';

        requestAnimationFrame(() => {
          this._el.style.transition = 'width 8s cubic-bezier(0.05, 0.6, 0.4, 0.9)';
          this._el.style.width      = '82%';
        });
      },

      set(value) {
        this._ensure();
        this._el.style.transition = 'width 0.25s ease';
        this._el.style.width      = `${Math.min(99, value)}%`;
        this._value               = value;
      },

      finish() {
        this._ensure();
        clearTimeout(this._timer);
        this._el.style.transition = 'width 0.2s ease';
        this._el.style.width      = '100%';
        this._timer = setTimeout(() => {
          this._el.style.opacity = '0';
          setTimeout(() => { this._el.style.width = '0%'; }, 300);
        }, 250);
      },

      fail() {
        this._ensure();
        this._el.style.background = '#ef4444';
        this._el.style.width      = '100%';
        this._timer = setTimeout(() => {
          this._el.style.opacity = '0';
          setTimeout(() => {
            this._el.style.background = 'linear-gradient(90deg, #6366f1, #06b6d4)';
            this._el.style.width      = '0%';
          }, 300);
        }, 600);
      },
    };


    // ── 4. Step Wizard Progress ──────────────────────────
    const StepProgress = {
      init() {
        document.querySelectorAll('[data-steps]').forEach(el => {
          const total   = parseInt(el.dataset.steps, 10);
          const current = parseInt(el.dataset.stepCurrent ?? '1', 10);
          this._render(el, total, current);
        });

        document.addEventListener('click', e => {
          const btn = e.target.closest('[data-step-next]');
          if (btn) this._move(btn, 1);
          const back = e.target.closest('[data-step-prev]');
          if (back) this._move(back, -1);
        });
      },

      _move(btn, dir) {
        const wizard  = btn.closest('[data-step-wizard]');
        if (!wizard) return;
        const current = parseInt(wizard.dataset.stepCurrent ?? '1', 10);
        const total   = parseInt(wizard.dataset.steps ?? '1', 10);
        const next    = Math.min(total, Math.max(1, current + dir));

        if (dir > 0) {
          // Validate current step before proceeding
          const panel = wizard.querySelector(`[data-step-panel="${current}"]`);
          if (panel) {
            const inputs = panel.querySelectorAll('input[required], select[required]');
            const valid  = [...inputs].every(i => i.checkValidity());
            if (!valid) {
              inputs.forEach(i => { if (!i.checkValidity()) i.classList.add('is-error'); });
              return;
            }
          }
        }

        this.goTo(wizard, next);
      },

      goTo(wizard, step) {
        const total   = parseInt(wizard.dataset.steps ?? '1', 10);
        const clamped = Math.min(total, Math.max(1, step));
        wizard.dataset.stepCurrent = String(clamped);

        // Update panels
        wizard.querySelectorAll('[data-step-panel]').forEach(panel => {
          const pStep = parseInt(panel.dataset.stepPanel, 10);
          panel.hidden = pStep !== clamped;
          panel.classList.toggle('active', pStep === clamped);
        });

        // Update step indicators
        const tracker = wizard.querySelector('[data-steps]');
        if (tracker) this._render(tracker, total, clamped);

        // Update prev/next buttons
        const prevBtn = wizard.querySelector('[data-step-prev]');
        const nextBtn = wizard.querySelector('[data-step-next]');
        const doneBtn = wizard.querySelector('[data-step-done]');
        if (prevBtn) prevBtn.disabled = clamped === 1;
        if (nextBtn) nextBtn.hidden   = clamped === total;
        if (doneBtn) doneBtn.hidden   = clamped !== total;

        window.PlasmaDeck?.bus?.emit('steps:change', { step: clamped, total, wizard });
      },

      _render(el, total, current) {
        let list = el.querySelector('.step-list');
        if (!list) { list = document.createElement('div'); list.className = 'step-list'; el.appendChild(list); }
        list.replaceChildren();

        for (let i = 1; i <= total; i++) {
          const item = document.createElement('div');
          item.className = `step-item ${i < current ? 'done' : i === current ? 'active' : ''}`;
          const dot = document.createElement('div');
          dot.className = 'step-dot';
          dot.textContent = i < current ? '✓' : String(i);
          item.appendChild(dot);
          if (i < total) {
            const connector = document.createElement('div');
            connector.className = 'step-connector';
            item.appendChild(connector);
          }
          list.appendChild(item);
        }
      },
    };


    // ── 5. Skeleton loader ───────────────────────────────
    const Skeleton = {
      show(container) {
        const el = typeof container === 'string'
          ? document.getElementById(container)
          : container;
        if (!el) return;
        el.classList.add('skeleton-loading');
        el.querySelectorAll('[data-skeleton]').forEach(s => s.removeAttribute('hidden'));
        el.querySelectorAll('[data-content]').forEach(c => c.setAttribute('hidden', ''));
      },

      hide(container, delay = 0) {
        const el = typeof container === 'string'
          ? document.getElementById(container)
          : container;
        if (!el) return;
        const apply = () => {
          el.classList.remove('skeleton-loading');
          el.querySelectorAll('[data-skeleton]').forEach(s => s.setAttribute('hidden', ''));
          el.querySelectorAll('[data-content]').forEach(c => c.removeAttribute('hidden'));
        };
        delay ? setTimeout(apply, delay) : apply();
      },

      /**
       * Create skeleton placeholder HTML
       */
      create({ lines = 3, avatar = false, image = false, imageHeight = 160 } = {}) {
        let html = '';
        if (image)  html += `<div class="skeleton skeleton-image" style="height:${imageHeight}px"></div>`;
        if (avatar) html += `<div class="skeleton-header"><div class="skeleton skeleton-avatar"></div>
                              <div class="skeleton-lines"><div class="skeleton skeleton-line w-50"></div>
                              <div class="skeleton skeleton-line w-30"></div></div></div>`;
        for (let i = 0; i < lines; i++) {
          const w = [100, 90, 75, 85, 60][i % 5];
          html += `<div class="skeleton skeleton-line" style="width:${w}%"></div>`;
        }
        return html;
      },
    };


    // ── 6. General Tween / Animation helper ──────────────
    const Tween = {
      _active: new Set(),

      /**
       * Animate any numeric property
       * @param {Object} target    object to mutate
       * @param {Object} props     { propName: endValue }
       * @param {number} duration  ms
       * @param {string} easing
       * @param {Function} onUpdate  callback each frame
       * @param {Function} onComplete
       * @returns {{ cancel: Function }}
       */
      to(target, props, duration = 400, easing = 'easeOut', onUpdate = null, onComplete = null) {
        const easeFn  = Ease[easing] ?? Ease.easeOut;
        const start   = {};
        for (const k of Object.keys(props)) start[k] = target[k] ?? 0;
        const startTs = performance.now();
        let cancelled = false;

        const step = ts => {
          if (cancelled) return;
          const pct = Math.min((ts - startTs) / duration, 1);
          const t   = easeFn(pct);
          for (const [k, end] of Object.entries(props)) {
            target[k] = start[k] + (end - start[k]) * t;
          }
          onUpdate?.(target, pct);
          if (pct < 1) requestAnimationFrame(step);
          else {
            // Snap to exact end values
            for (const [k, end] of Object.entries(props)) target[k] = end;
            onComplete?.(target);
          }
        };
        requestAnimationFrame(step);

        const handle = { cancel: () => { cancelled = true; } };
        this._active.add(handle);
        return handle;
      },

      /**
       * Count-up animation on a DOM element
       */
      countUp(el, end, duration = 1500, { prefix = '', suffix = '', decimals = 0, easing = 'easeOut' } = {}) {
        const easeFn  = Ease[easing] ?? Ease.easeOut;
        const startTs = performance.now();
        const fmt     = v => prefix + v.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }) + suffix;

        const step = ts => {
          const pct = Math.min((ts - startTs) / duration, 1);
          const val = end * easeFn(pct);
          el.textContent = fmt(val);
          if (pct < 1) requestAnimationFrame(step);
          else el.textContent = fmt(end);
        };
        requestAnimationFrame(step);
      },

      /**
       * Fade an element in or out
       */
      fade(el, toOpacity, duration = 300, easing = 'easeOut') {
        const fromOpacity = parseFloat(getComputedStyle(el).opacity);
        const obj  = { v: fromOpacity };
        if (toOpacity > 0) { el.style.display = ''; el.style.opacity = fromOpacity; }
        return this.to(
          obj, { v: toOpacity }, duration, easing,
          () => { el.style.opacity = obj.v; },
          () => { if (toOpacity === 0) el.style.display = 'none'; }
        );
      },

      /**
       * Slide-in an element
       */
      slideIn(el, from = 'bottom', distance = 24, duration = 350, easing = 'easeOut') {
        const axis  = (from === 'left' || from === 'right') ? 'X' : 'Y';
        const sign  = (from === 'right' || from === 'bottom') ? 1 : -1;
        const obj   = { v: sign * distance, o: 0 };
        el.style.display  = '';
        el.style.opacity  = '0';
        el.style.transform = `translate${axis}(${obj.v}px)`;
        return this.to(
          obj, { v: 0, o: 1 }, duration, easing,
          () => {
            el.style.transform = `translate${axis}(${obj.v}px)`;
            el.style.opacity   = String(obj.o);
          },
          () => { el.style.transform = ''; el.style.opacity = ''; }
        );
      },
    };


    // ── 7. Observer-triggered animations ─────────────────
    const ScrollReveal = {
      _observer: null,

      init() {
        this._observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const el  = entry.target;
            const ani = el.dataset.reveal ?? 'fade';
            const del = parseInt(el.dataset.revealDelay ?? '0', 10);

            setTimeout(() => this._play(el, ani), del);
            this._observer.unobserve(el);
          });
        }, { threshold: 0.15 });

        document.querySelectorAll('[data-reveal]').forEach(el => {
          el.style.opacity   = '0';
          this._observer.observe(el);
        });

        // Also init linear bars, rings, counters
        LinearBar.init();
        CircularProgress.init();
        StepProgress.init();

        document.querySelectorAll('[data-counter]').forEach(el => {
          const countObs = new IntersectionObserver(entries => {
            if (!entries[0].isIntersecting) return;
            const end      = parseFloat(String(el.dataset.counter).replace(/,/g, ''));
            const dur      = parseInt(el.dataset.counterDuration ?? '1500', 10);
            const decimals = parseInt(el.dataset.counterDecimals ?? '0', 10);
            const prefix   = el.dataset.counterPrefix ?? '';
            const suffix   = el.dataset.counterSuffix ?? '';
            Tween.countUp(el, end, dur, { prefix, suffix, decimals });
            countObs.unobserve(el);
          }, { threshold: 0.3 });
          countObs.observe(el);
        });
      },

      _play(el, animation) {
        switch (animation) {
          case 'fade':
            el.style.opacity = '0';
            Tween.fade(el, 1, 500);
            break;
          case 'slide-up':
            Tween.slideIn(el, 'bottom', 28, 500);
            break;
          case 'slide-down':
            Tween.slideIn(el, 'top', 28, 500);
            break;
          case 'slide-left':
            Tween.slideIn(el, 'right', 28, 500);
            break;
          case 'slide-right':
            Tween.slideIn(el, 'left', 28, 500);
            break;
          case 'scale': {
            el.style.transform = 'scale(0.85)';
            el.style.opacity   = '0';
            const obj = { s: 0.85, o: 0 };
            Tween.to(obj, { s: 1, o: 1 }, 450, 'easeOutCubic',
              () => { el.style.transform = `scale(${obj.s})`; el.style.opacity = String(obj.o); },
              () => { el.style.transform = ''; el.style.opacity = ''; }
            );
            break;
          }
          default:
            el.style.opacity = '1';
        }
      },
    };


    // ── Public API ────────────────────────────────────────
    return {
      bar:      LinearBar,
      ring:     CircularProgress,
      page:     PageBar,
      steps:    StepProgress,
      skeleton: Skeleton,
      tween:    Tween,
      reveal:   ScrollReveal,
      ease:     Ease,

      /** Initialize all progress subsystems */
      init() {
        ScrollReveal.init();
      },
    };

  })(); // end Progress IIFE

  window.PlasmaDeck = window.PlasmaDeck ?? {};
  // NOTE: app.js also defines `PlasmaDeck.Progress` for lightweight page-level progress bars.
  // This module's animation/tween/reveal toolkit is exposed as `ProgressUI` to avoid collisions.
  window.PlasmaDeck.ProgressUI = Progress;
  window.Progress = window.Progress ?? Progress;

  // Export the bulk stats/export API too (ProgressStats lives in module scope otherwise)
  window.PlasmaDeck.ProgressStats = ProgressStats;
  window.ProgressStats = window.ProgressStats ?? ProgressStats;
