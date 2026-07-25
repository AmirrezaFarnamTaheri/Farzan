export async function mountCoursesView(deps = {}) {
  const {
    setView,
    createElement,
    $$,
    eventTargetEl,
    safeExternalUrl,
    safeMediaUrl,
    Router,
    Toast = window.OpenCourseDeck?.Toast,
    consumePendingCourseSession,
    formatMediaClock,
    escapeHtmlText,
  } = deps;

  setView(`
    <section class="view view-courses">
      <div class="page-header">
        <h1 class="page-title">Courses</h1>
        <p class="page-subtitle">Browse your catalog.</p>
      </div>

      <div class="courses-shell">
        <aside class="courses-sidebar">
          <input class="input" id="courses-search" type="search" placeholder="Search courses..." />
          <div class="filter-row" aria-label="Course filters" style="margin-top:12px">
            <button class="filter-chip active" type="button" data-course-filter="all" aria-pressed="true">All</button>
            <button class="filter-chip" type="button" data-course-filter="video" aria-pressed="false">Video</button>
            <button class="filter-chip" type="button" data-course-filter="pdf" aria-pressed="false">PDF</button>
            <button class="filter-chip" type="button" data-course-filter="mixed" aria-pressed="false">Mixed</button>
            <button class="filter-chip" type="button" data-course-filter="none" aria-pressed="false">No media</button>
          </div>
          <label class="stack-xs" style="margin-top:12px">
            <span class="text-sm text-muted">Source scope</span>
            <select class="select" id="courses-source-scope" aria-label="Filter courses by source count">
              <option value="all">All courses</option>
              <option value="single">Single source</option>
              <option value="multi">Multiple sources</option>
            </select>
          </label>
          <div id="courses-list" class="courses-list"></div>
        </aside>

        <main class="courses-main">
          <div id="course-detail" class="course-detail">
            <div class="card card-filled">
              <div class="card-body">
                Select a course on the left.
              </div>
            </div>
          </div>

          <div class="card card-filled" style="margin-top:12px">
            <div class="card-body">
              <div id="course-player" data-player data-player-options='{"type":"video","autoplay":false,"controls":true,"theme":"dark"}'></div>
            </div>
          </div>

          <div class="card card-filled timestamp-note-card" style="margin-top:12px">
            <div class="card-body">
              <div class="timestamp-note-grid">
                <div class="timestamp-note-copy">
                  <h3>Timestamp note</h3>
                  <p class="text-muted">Capture the current playback position as a bookmark or linked note.</p>
                  <div class="timestamp-note-status" data-timestamp-note-status aria-live="polite"></div>
                </div>
                <div class="timestamp-note-form">
                  <input class="input input-sm" data-timestamp-note-title placeholder="Title" />
                  <textarea class="input timestamp-note-textarea" data-timestamp-note-body rows="3" placeholder="Note"></textarea>
                  <div class="button-row">
                    <button class="btn btn-ghost btn-sm" type="button" data-save-timestamp>Save bookmark</button>
                    <button class="btn btn-primary btn-sm" type="button" data-save-timestamp-note>Save linked note</button>
                  </div>
                  <div class="learning-marker-form" style="margin-top:10px">
                    <input class="input input-sm" data-learning-marker-text placeholder="Chapter title or transcript line" />
                    <div class="button-row">
                      <button class="btn btn-ghost btn-sm" type="button" data-save-chapter-cue>Add chapter</button>
                      <button class="btn btn-ghost btn-sm" type="button" data-save-transcript-cue>Add transcript line</button>
                    </div>
                    <div class="button-row">
                      <button class="btn btn-ghost btn-sm" type="button" data-review-learning-cues>Review cues</button>
                      <button class="btn btn-ghost btn-sm" type="button" data-export-active-learning-cues>Edit active</button>
                      <button class="btn btn-ghost btn-sm" type="button" data-apply-active-learning-cues>Apply active</button>
                      <button class="btn btn-ghost btn-sm" type="button" data-export-learning-cues>Export JSON</button>
                      <button class="btn btn-ghost btn-sm" type="button" data-import-learning-cues>Import JSON</button>
                    </div>
                    <textarea class="input timestamp-note-textarea" data-learning-marker-json rows="3" placeholder="Chapter/transcript JSON"></textarea>
                    <div class="learning-marker-list" data-learning-marker-list></div>
                    <div class="timestamp-note-status" data-learning-marker-status aria-live="polite"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </section>
  `);

  // Ensure catalog loaded
  await window.DataStore?.init?.();
  const listEl = document.getElementById('courses-list');
  const searchEl = document.getElementById('courses-search');
  const sourceScopeEl = document.getElementById('courses-source-scope');
  const detailEl = document.getElementById('course-detail');
  let playerEl = document.getElementById('course-player');
  playerEl = window.OpenCourseDeck?.MiniPlayer?.restorePlayer?.(playerEl) || playerEl;
  const timestampStatusEl = document.querySelector('[data-timestamp-note-status]');
  const learningMarkerStatusEl = document.querySelector('[data-learning-marker-status]');
  const learningMarkerListEl = document.querySelector('[data-learning-marker-list]');
  const learningMarkerJsonEl = document.querySelector('[data-learning-marker-json]');
  const routeDisposers = [];
  let flushPlayerProgress = () => Promise.resolve();
  let detailRenderToken = 0;
  let detailRenderTimer = null;
  const cancelDetailRender = () => {
    detailRenderToken += 1;
    if (detailRenderTimer) {
      clearTimeout(detailRenderTimer);
      detailRenderTimer = null;
    }
  };
  const routeController = {
    beforeLeave() {
      try { return flushPlayerProgress(); } catch { return undefined; }
    },
    unmount() {
      cancelDetailRender();
      try { flushPlayerProgress(); } catch {}
      let adoptedPlayer = false;
      try {
        const snapshot = window.OpenCourseDeck?.Player?.getActiveSnapshot?.(document);
        if (snapshot && playerEl?._pdPlayer) {
          window.OpenCourseDeck?.MiniPlayer?.adoptPlayer?.(playerEl, snapshot, {
            dispose() {
              routeDisposers.splice(0).forEach(fn => {
                try { fn(); } catch {}
              });
            },
          });
          adoptedPlayer = true;
        } else if (snapshot) {
          window.OpenCourseDeck?.MiniPlayer?.show?.(snapshot);
        }
      } catch {}
      if (!adoptedPlayer) {
        routeDisposers.splice(0).forEach(fn => {
          try { fn(); } catch {}
        });
        try { window.OpenCourseDeck?.Player?.destroyAll?.(document); } catch {}
      }
    },
  };
  if (!listEl || !detailEl) return;

  // Ensure player auto-inits for the inserted element
  try { window.OpenCourseDeck?.Player?.init?.(); } catch { /* ignore */ }

  const MEDIA_CUES_KEY = 'plasma-course-media-cues';
  let authoredMediaCues = {};
  try {
    const savedCues = await window.DB?.getSetting?.(MEDIA_CUES_KEY);
    authoredMediaCues = savedCues && typeof savedCues === 'object' ? savedCues : {};
  } catch {
    authoredMediaCues = {};
  }
  const allCourses = window.DataStore?.allCourses?.() ?? [];
  const allTopics = window.DataStore?.allTopics?.() ?? [];
  const topicsByCourse = allTopics.reduce((acc, t) => {
    (acc[t.courseId] = acc[t.courseId] ?? []).push(t);
    return acc;
  }, {});
  const courseFacetState = {
    query: '',
    filter: 'all',
    sourceScope: 'all',
    selectedCourseId: '',
  };
  const sourceKey = (topic) => `${topic.sourceIndex ?? 0}|${topic.sourceLabel ?? 'Source'}`;
  const sourceLabelFromKey = (key) => String(key).split('|').slice(1).join('|') || 'Source';
  const mediaClass = (topic) => {
    const hasVideo = (topic.videos?.length ?? 0) > 0;
    const hasPdf = (topic.pdfs?.length ?? 0) > 0;
    if (hasVideo && hasPdf) return 'video-pdf';
    if (hasVideo) return 'video';
    if (hasPdf) return 'pdf';
    return 'none';
  };
  const passCourseFilter = (topic, status, filter) => {
    if (filter === 'all') return true;
    if (filter === 'done' || filter === 'in-progress' || filter === 'not-started') return status === filter;
    return mediaClass(topic) === filter || (filter === 'video' && (topic.videos?.length ?? 0) > 0) || (filter === 'pdf' && (topic.pdfs?.length ?? 0) > 0);
  };
  const statusInfo = (status) => {
    const labels = {
      done: 'Done',
      'in-progress': 'In progress',
      'not-started': 'Not started',
    };
    const key = labels[status] ? status : 'not-started';
    return { key, label: labels[key] };
  };
  const statusBadgeNode = (status) => {
    const { key, label } = statusInfo(status);
    return createElement('span', {
      class: `badge badge-status badge-status-${key}`,
      'aria-label': `Status: ${label}`,
      'data-status': key,
    }, label);
  };
  const badgeNode = (label) => createElement('span', { class: 'badge' }, label);
  const actionButton = (action, label) => createElement('button', {
    class: 'btn btn-ghost btn-sm',
    type: 'button',
    'data-action': action,
  }, label);
  const courseMetaById = new Map(allCourses.map((course) => {
    const topics = topicsByCourse[course.id] ?? [];
    const hasVideo = topics.some((topic) => (topic.videos?.length ?? 0) > 0);
    const hasPdf = topics.some((topic) => (topic.pdfs?.length ?? 0) > 0);
    const hasNoMedia = topics.some((topic) => (topic.videos?.length ?? 0) === 0 && (topic.pdfs?.length ?? 0) === 0);
    const sourceCount = new Set(topics.map(sourceKey)).size;
    return [course.id, {
      topicCount: topics.length,
      hasVideo,
      hasPdf,
      hasNoMedia,
      mediaClass: hasVideo && hasPdf ? 'mixed' : hasVideo ? 'video' : hasPdf ? 'pdf' : 'none',
      sourceCount,
    }];
  }));
  const seekPlayerToPendingPosition = (inst, position) => {
    const seconds = Number(position);
    if (!inst?.seekTo || !Number.isFinite(seconds) || seconds <= 0) return;
    const seek = () => {
      try { inst.seekTo(seconds); } catch {}
    };
    seek();
    try { inst._media?.addEventListener?.('loadedmetadata', seek, { once: true }); } catch {}
    setTimeout(seek, 80);
  };
  const setTimestampStatus = (message, tone = 'muted') => {
    if (!timestampStatusEl) return;
    timestampStatusEl.textContent = message;
    timestampStatusEl.dataset.tone = tone;
  };
  const setLearningMarkerStatus = (message, tone = 'muted') => {
    if (!learningMarkerStatusEl) return;
    learningMarkerStatusEl.textContent = message;
    learningMarkerStatusEl.dataset.tone = tone;
  };
  const currentPlayerContext = () => {
    const inst = playerEl?._pdPlayer;
    const snapshot = inst?.snapshot?.();
    const queueIndex = Number(snapshot?.queueIndex ?? inst?.trackIndex ?? 0);
    const activeTrack = inst?.queue?.[Number.isFinite(queueIndex) ? queueIndex : 0]
      || snapshot?.queue?.[Number.isFinite(queueIndex) ? queueIndex : 0]
      || snapshot?.track
      || null;
    const track = snapshot?.track || activeTrack;
    if (!track) return null;
    const currentTime = snapshot?.currentTime ?? inst?.currentTime ?? 0;
    const duration = snapshot?.duration ?? inst?.duration ?? 0;
    return {
      inst,
      track,
      activeTrack,
      topicId: track.topicId,
      courseId: track.courseId,
      currentTime: Math.max(0, Number(currentTime) || 0),
      duration: Math.max(0, Number(duration) || 0),
    };
  };
  const cueList = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
  const cueTime = (cue) => Math.max(0, Number(cue?.time ?? cue?.start ?? 0) || 0);
  const cueLabel = (cue) => String(cue?.title ?? cue?.text ?? '').trim();
  const cueIdentity = (cue) => [
    String(cue?.createdAt ?? ''),
    String(cueTime(cue)),
    cueLabel(cue),
  ].join('|');
  const mergedCues = (topic, key, fallbackKey) => [
    ...cueList(topic[key] ?? (fallbackKey ? topic[fallbackKey] : undefined)),
    ...cueList(authoredMediaCues?.[topic.topicId]?.[key]),
  ];
  const courseMediaTrack = (topic, url, courseId) => ({
    title: topic.title,
    src: url,
    artist: topic.courseTitle ?? courseId,
    topicId: topic.topicId,
    courseId,
    chapters: mergedCues(topic, 'chapters', 'chapterMarkers'),
    transcript: mergedCues(topic, 'transcript'),
    captions: topic.captions,
    captionTracks: topic.captionTracks ?? topic.subtitles,
  });
  const cueDedupeKey = (type, cue) => `${type}|${cueTime(cue).toFixed(3)}|${cueLabel(cue).toLowerCase()}`;
  const aiReady = async () => {
    try { return Boolean((await window.OpenCourseDeck?.AI?.status?.())?.available); } catch { return false; }
  };
  const courseSummaryInput = (course, topics) => [
    `Course: ${course.title || course.id}`,
    `Topics: ${topics.length}`,
    ...topics.slice(0, 120).map(topic => `- ${topic.sourceLabel || 'Source'}: ${topic.title || 'Untitled topic'}`),
  ].join('\n').slice(0, 16000);
  const normalizeCueTime = (cue, maxTime, stats) => {
    const raw = Number(cue?.time ?? cue?.start ?? 0);
    let time = Number.isFinite(raw) ? Math.max(0, raw) : 0;
    if (Number.isFinite(maxTime) && maxTime > 0 && time > maxTime) {
      time = maxTime;
      stats.clamped += 1;
    }
    return time;
  };
  const normalizeCueList = (items, type, maxTime, stats) => {
    const seen = new Set();
    return cueList(items)
      .map((cue) => {
        const time = normalizeCueTime(cue, maxTime, stats);
        const label = cueLabel(cue);
        if (!label) {
          stats.dropped += 1;
          return null;
        }
        const normalized = type === 'chapters'
          ? { ...cue, time, title: label, authored: cue.authored ?? true }
          : { ...cue, start: time, text: label, authored: cue.authored ?? true };
        const key = cueDedupeKey(type, normalized);
        if (seen.has(key)) {
          stats.deduped += 1;
          return null;
        }
        seen.add(key);
        stats.kept += 1;
        return normalized;
      })
      .filter(Boolean)
      .sort((a, b) => cueTime(a) - cueTime(b));
  };
  const normalizeImportedCues = (value, options = {}) => {
    const stats = options.stats || { kept: 0, dropped: 0, deduped: 0, clamped: 0 };
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const normalized = {};
    Object.entries(value).forEach(([topicId, cues]) => {
      if (!cues || typeof cues !== 'object' || Array.isArray(cues)) return;
      const chapters = normalizeCueList(cues.chapters, 'chapters', options.maxTime, stats);
      const transcript = normalizeCueList(cues.transcript, 'transcript', options.maxTime, stats);
      normalized[topicId] = {
        ...(chapters.length ? { chapters } : {}),
        ...(transcript.length ? { transcript } : {}),
      };
    });
    return normalized;
  };
  const cueImportSummary = (stats, prefix) => {
    const details = [];
    if (stats.kept) details.push(`${stats.kept} kept`);
    if (stats.deduped) details.push(`${stats.deduped} duplicate${stats.deduped === 1 ? '' : 's'} removed`);
    if (stats.clamped) details.push(`${stats.clamped} time${stats.clamped === 1 ? '' : 's'} clamped`);
    if (stats.dropped) details.push(`${stats.dropped} invalid cue${stats.dropped === 1 ? '' : 's'} skipped`);
    return `${prefix}${details.length ? ` (${details.join(', ')})` : ''}.`;
  };
  const syncActiveTrackCues = (context) => {
    if (!context?.topicId) return;
    const activeTrack = context.activeTrack || context.track;
    if (!activeTrack) return;
    const authored = authoredMediaCues[context.topicId] || {};
    ['chapters', 'transcript'].forEach((key) => {
      const authoredIds = new Set(cueList(authored[key]).map(cueIdentity));
      const existing = cueList(activeTrack[key]).filter(cue => !cue.authored || authoredIds.has(cueIdentity(cue)));
      const existingIds = new Set(existing.map(cueIdentity));
      cueList(authored[key]).forEach((cue) => {
        const id = cueIdentity(cue);
        if (!existingIds.has(id)) existing.push(cue);
      });
      activeTrack[key] = existing.sort((a, b) => cueTime(a) - cueTime(b));
    });
  };
  const renderLearningCueList = () => {
    if (!learningMarkerListEl) return;
    const context = currentPlayerContext();
    learningMarkerListEl.replaceChildren();
    if (!context?.topicId) {
      learningMarkerListEl.appendChild(createElement('div', { class: 'text-muted text-sm' }, 'Play a topic to review authored cues.'));
      return;
    }
    const authored = authoredMediaCues[context.topicId] || {};
    const rows = [
      ...cueList(authored.chapters).map((cue, index) => ({ type: 'chapters', index, cue, label: 'Chapter' })),
      ...cueList(authored.transcript).map((cue, index) => ({ type: 'transcript', index, cue, label: 'Transcript' })),
    ].sort((a, b) => cueTime(a.cue) - cueTime(b.cue));
    if (!rows.length) {
      learningMarkerListEl.appendChild(createElement('div', { class: 'text-muted text-sm' }, 'No authored cues for this topic yet.'));
      return;
    }
    rows.forEach(({ type, index, cue, label }) => {
      const row = createElement('div', { class: 'learning-marker-row' });
      row.append(
        createElement('span', { class: 'badge' }, label),
        createElement('span', { class: 'text-sm' }, `${formatMediaClock(cueTime(cue))} - ${cueLabel(cue)}`),
        createElement('button', {
          class: 'btn btn-ghost btn-sm',
          type: 'button',
          'data-delete-learning-cue': type,
          'data-cue-index': String(index),
        }, 'Delete')
      );
      learningMarkerListEl.appendChild(row);
    });
  };
  const persistAuthoredMediaCues = async () => {
    await window.DB?.saveSetting?.(MEDIA_CUES_KEY, authoredMediaCues);
  };
  const deleteLearningCue = async (type, index) => {
    const context = currentPlayerContext();
    if (!context?.topicId) {
      setLearningMarkerStatus('Play a course topic before editing learning markers.', 'warning');
      return;
    }
    const key = type === 'chapters' ? 'chapters' : 'transcript';
    const topicCues = authoredMediaCues[context.topicId] && typeof authoredMediaCues[context.topicId] === 'object'
      ? authoredMediaCues[context.topicId]
      : {};
    const nextList = cueList(topicCues[key]);
    const removed = nextList.splice(index, 1)[0];
    if (!removed) return;
    authoredMediaCues = {
      ...authoredMediaCues,
      [context.topicId]: {
        ...topicCues,
        [key]: nextList,
      },
    };
    await persistAuthoredMediaCues();
    syncActiveTrackCues(context);
    if (key === 'chapters') context.inst?.showChapters?.();
    else context.inst?.showTranscript?.();
    renderLearningCueList();
    setLearningMarkerStatus('Learning cue deleted.', 'success');
  };
  const exportLearningCues = () => {
    if (learningMarkerJsonEl) learningMarkerJsonEl.value = JSON.stringify(authoredMediaCues, null, 2);
    renderLearningCueList();
    setLearningMarkerStatus('Learning cue JSON exported.', 'success');
  };
  const exportActiveLearningCues = () => {
    const context = currentPlayerContext();
    if (!context?.topicId) {
      setLearningMarkerStatus('Play a course topic before editing active cues.', 'warning');
      return;
    }
    const cues = authoredMediaCues[context.topicId] || {};
    if (learningMarkerJsonEl) {
      learningMarkerJsonEl.value = JSON.stringify({
        topicId: context.topicId,
        chapters: cueList(cues.chapters),
        transcript: cueList(cues.transcript),
      }, null, 2);
    }
    renderLearningCueList();
    setLearningMarkerStatus('Active topic cues loaded for bulk editing.', 'success');
  };
  const applyActiveLearningCues = async () => {
    const context = currentPlayerContext();
    if (!context?.topicId) {
      setLearningMarkerStatus('Play a course topic before applying active cues.', 'warning');
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(String(learningMarkerJsonEl?.value || '{}'));
    } catch {
      setLearningMarkerStatus('Active cue JSON is not valid.', 'warning');
      return;
    }
    const topicId = String(parsed?.topicId || context.topicId);
    if (topicId !== context.topicId) {
      setLearningMarkerStatus('Active cue JSON belongs to a different topic.', 'warning');
      return;
    }
    const stats = { kept: 0, dropped: 0, deduped: 0, clamped: 0 };
    const normalized = normalizeImportedCues({ [context.topicId]: parsed }, { maxTime: context.duration, stats });
    const cues = normalized?.[context.topicId];
    if (!cues) {
      setLearningMarkerStatus('Active cue JSON needs chapters or transcript arrays.', 'warning');
      return;
    }
    authoredMediaCues = {
      ...authoredMediaCues,
      [context.topicId]: {
        chapters: cueList(cues.chapters),
        transcript: cueList(cues.transcript),
      },
    };
    await persistAuthoredMediaCues();
    syncActiveTrackCues(context);
    context.inst?.showChapters?.();
    context.inst?.showTranscript?.();
    renderLearningCueList();
    setLearningMarkerStatus(cueImportSummary(stats, 'Active topic cues applied'), 'success');
  };
  const importLearningCues = async () => {
    let parsed;
    try {
      parsed = JSON.parse(String(learningMarkerJsonEl?.value || '{}'));
    } catch {
      setLearningMarkerStatus('Cue JSON is not valid.', 'warning');
      return;
    }
    const stats = { kept: 0, dropped: 0, deduped: 0, clamped: 0 };
    const normalized = normalizeImportedCues(parsed, { stats });
    if (!normalized) {
      setLearningMarkerStatus('Cue JSON must be an object keyed by topic id.', 'warning');
      return;
    }
    authoredMediaCues = {
      ...authoredMediaCues,
      ...Object.fromEntries(Object.entries(normalized).map(([topicId, cues]) => {
        const existing = authoredMediaCues[topicId] || {};
        return [topicId, {
          chapters: normalizeCueList([...cueList(existing.chapters), ...cueList(cues.chapters)], 'chapters', undefined, stats),
          transcript: normalizeCueList([...cueList(existing.transcript), ...cueList(cues.transcript)], 'transcript', undefined, stats),
        }];
      })),
    };
    await persistAuthoredMediaCues();
    const context = currentPlayerContext();
    syncActiveTrackCues(context);
    context?.inst?.showChapters?.();
    context?.inst?.showTranscript?.();
    renderLearningCueList();
    setLearningMarkerStatus(cueImportSummary(stats, 'Learning cue JSON imported'), 'success');
  };
  const saveLearningCue = async (type) => {
    const context = currentPlayerContext();
    if (!context?.topicId || !context?.courseId) {
      setLearningMarkerStatus('Play a course topic before adding a learning marker.', 'warning');
      return null;
    }
    const textInput = document.querySelector('[data-learning-marker-text]');
    const text = String(textInput?.value || '').trim();
    if (!text) {
      setLearningMarkerStatus('Enter a chapter title or transcript line first.', 'warning');
      return null;
    }
    const key = type === 'chapter' ? 'chapters' : 'transcript';
    const now = Date.now();
    const time = Math.max(0, Number(context.currentTime) || 0);
    const cue = type === 'chapter'
      ? { time, title: text, authored: true, createdAt: now, updatedAt: now }
      : { start: time, text, authored: true, createdAt: now, updatedAt: now };
    const topicCues = authoredMediaCues[context.topicId] && typeof authoredMediaCues[context.topicId] === 'object'
      ? authoredMediaCues[context.topicId]
      : {};
    const nextTopicCues = {
      ...topicCues,
      [key]: [...cueList(topicCues[key]), cue].sort((a, b) => Number(a.time ?? a.start ?? 0) - Number(b.time ?? b.start ?? 0)),
    };
    authoredMediaCues = {
      ...authoredMediaCues,
      [context.topicId]: nextTopicCues,
    };
    await persistAuthoredMediaCues();
    const activeTrack = context.activeTrack || context.track;
    activeTrack[key] = [...cueList(activeTrack[key]), cue].sort((a, b) => Number(a.time ?? a.start ?? 0) - Number(b.time ?? b.start ?? 0));
    if (type === 'chapter') context.inst?.showChapters?.();
    else context.inst?.showTranscript?.();
    textInput && (textInput.value = '');
    renderLearningCueList();
    setLearningMarkerStatus(
      `${type === 'chapter' ? 'Chapter' : 'Transcript line'} added at ${formatMediaClock(time)}.`,
      'success'
    );
    Toast.success(type === 'chapter' ? 'Chapter marker added' : 'Transcript line added');
    return cue;
  };
  const onCourseSyncMessage = async (payload = {}) => {
    if (payload.kind === 'progress') {
      const record = payload.record || {};
      const activeCourseId = listEl.querySelector('.course-item.active')?.dataset.courseId;
      const courseTopics = activeCourseId ? (topicsByCourse[activeCourseId] || []) : [];
      const context = currentPlayerContext();
      const affectsDetail = record.courseId === activeCourseId || courseTopics.some(t => t.topicId === record.topicId);
      const affectsPlayer = record.topicId && record.topicId === context?.topicId;
      if (!affectsDetail && !affectsPlayer) return;
      if (activeCourseId) await renderCourseDetail(activeCourseId);
      if (affectsPlayer) setTimestampStatus('Progress refreshed from another tab.', 'success');
      window.OpenCourseDeck?.bus.emit?.('player:sync-refresh', {
        kind: 'progress',
        topicId: record.topicId || null,
        courseId: record.courseId || activeCourseId || null,
        playbackPreserved: true,
        queuePreserved: true,
      });
      return;
    }
    if (payload.kind !== 'setting' || payload.record?.key !== MEDIA_CUES_KEY) return;
    const nextCues = payload.record?.value && typeof payload.record.value === 'object'
      ? payload.record.value
      : await window.DB?.getSetting?.(MEDIA_CUES_KEY);
    authoredMediaCues = nextCues && typeof nextCues === 'object' ? nextCues : {};
    const context = currentPlayerContext();
    syncActiveTrackCues(context);
    renderLearningCueList();
    context?.inst?.showChapters?.();
    context?.inst?.showTranscript?.();
    setLearningMarkerStatus('Learning cues refreshed from another tab.', 'success');
    window.OpenCourseDeck?.bus.emit?.('courses:sync-refresh', { kind: 'media-cues', topicId: context?.topicId || null });
  };
  const saveTimestampCapture = async ({ createNote = false } = {}) => {
    const context = currentPlayerContext();
    if (!context?.topicId || !context?.courseId) {
      setTimestampStatus('Play a course topic before saving a timestamp.', 'warning');
      return null;
    }
    const now = Date.now();
    const titleInput = document.querySelector('[data-timestamp-note-title]');
    const bodyInput = document.querySelector('[data-timestamp-note-body]');
    const noteText = String(bodyInput?.value || '').trim();
    const title = String(titleInput?.value || context.track.title || 'Timestamp note').trim() || 'Timestamp note';
    let linkedNote = null;

    if (createNote) {
      const paragraphs = [
        noteText || `Captured at ${formatMediaClock(context.currentTime)}.`,
        `Source: ${context.track.title || context.topicId} at ${formatMediaClock(context.currentTime)}.`,
      ];
      linkedNote = await window.DB?.saveNote?.({
        title,
        content: paragraphs
          .map(line => `<p>${escapeHtmlText(line).replace(/\n/g, '<br>')}</p>`)
          .join(''),
        topicId: context.topicId,
        courseId: context.courseId,
        position: context.currentTime,
        tags: ['timestamp'],
        createdAt: now,
        updatedAt: now,
      });
    }

    const timestamp = {
      id: `ts-${now}-${Math.random().toString(36).slice(2, 7)}`,
      title,
      topicTitle: context.track.title || title,
      topicId: context.topicId,
      courseId: context.courseId,
      position: context.currentTime,
      duration: context.duration,
      note: noteText,
      noteId: linkedNote?.id,
      createdAt: now,
      updatedAt: now,
    };
    await window.DB?.saveTimestamp?.(timestamp);
    bodyInput && (bodyInput.value = '');
    titleInput && (titleInput.value = '');
    setTimestampStatus(
      createNote ? `Saved linked note at ${formatMediaClock(context.currentTime)}.` : `Saved bookmark at ${formatMediaClock(context.currentTime)}.`,
      'success'
    );
    Toast.success(createNote ? 'Timestamp note saved' : 'Timestamp bookmark saved');
    return { timestamp, note: linkedNote };
  };

  const buildCourseButton = (course) => {
    const meta = courseMetaById.get(course.id) || { topicCount: 0, mediaClass: 'none', sourceCount: 0 };
    const btn = createElement('button', { class: 'course-item', 'data-course-id': course.id });
    const mediaMeta = createElement('div', { class: 'topic-meta' });
    mediaMeta.append(badgeNode(meta.mediaClass === 'mixed' ? 'video + pdf' : meta.mediaClass === 'none' ? 'no media' : meta.mediaClass));
    btn.append(
      createElement('div', { class: 'course-item-title' }, course.title),
      createElement('div', { class: 'course-item-meta' }, `${meta.topicCount} topics - ${meta.sourceCount || 0} source(s)`),
      mediaMeta
    );
    return btn;
  };

  const buildTopicRow = (topic, status, { toggle = false } = {}) => {
    const hasVideo = (topic.videos?.length ?? 0) > 0;
    const hasPdf = (topic.pdfs?.length ?? 0) > 0;
    const row = createElement('div', {
      class: 'topic-row',
      'data-topic-id': topic.topicId,
      'data-course-id': topic.courseId,
      'data-media': mediaClass(topic),
    });
    const copy = createElement('div');
    copy.append(
      createElement('div', { class: 'topic-title' }, topic.title),
      createElement('div', { class: 'topic-submeta' }, topic.sourceLabel ?? '')
    );
    const meta = createElement('div', { class: 'topic-meta' });
    meta.appendChild(statusBadgeNode(status));
    if (hasVideo) meta.appendChild(badgeNode('video'));
    if (hasPdf) meta.appendChild(badgeNode('pdf'));
    if (!hasVideo && !hasPdf) meta.appendChild(badgeNode('no media'));

    const actions = createElement('div', { class: 'topic-actions' });
    if (hasVideo) actions.appendChild(actionButton('play-video', 'Play'));
    if (hasPdf) actions.appendChild(actionButton('open-pdf', 'PDF'));
    if (toggle) actions.appendChild(actionButton('toggle-done', status === 'done' ? 'Undone' : 'Done'));
    row.append(copy, meta, actions);
    return row;
  };

  const matchesCourseFacet = (course) => {
    const meta = courseMetaById.get(course.id) || { mediaClass: 'none', sourceCount: 0, hasVideo: false, hasPdf: false, hasNoMedia: false };
    if (courseFacetState.filter !== 'all') {
      if (courseFacetState.filter === 'video' && !meta.hasVideo) return false;
      else if (courseFacetState.filter === 'pdf' && !meta.hasPdf) return false;
      else if (courseFacetState.filter === 'mixed' && meta.mediaClass !== 'mixed') return false;
      else if (courseFacetState.filter === 'none' && !meta.hasNoMedia) return false;
    }
    if (courseFacetState.sourceScope === 'single' && meta.sourceCount !== 1) return false;
    if (courseFacetState.sourceScope === 'multi' && meta.sourceCount < 2) return false;
    return true;
  };

  const renderCourses = (query = courseFacetState.query) => {
    const q = String(query || '').trim().toLowerCase();
    courseFacetState.query = query;
    const filtered = allCourses.filter((course) => {
      const meta = courseMetaById.get(course.id) || { topicCount: 0 };
      const matchesQuery = !q
        || String(course.title ?? '').toLowerCase().includes(q)
        || String(meta.topicCount ?? '').includes(q)
        || (topicsByCourse[course.id] ?? []).some((topic) => String(topic.sourceLabel || '').toLowerCase().includes(q));
      return matchesQuery && matchesCourseFacet(course);
    });
    listEl.replaceChildren();
    if (!filtered.length) {
      cancelDetailRender();
      courseFacetState.selectedCourseId = '';
      const card = createElement('div', { class: 'card card-ghost' });
      card.appendChild(createElement('div', { class: 'card-body' }, 'No courses match this search or filter.'));
      listEl.appendChild(card);
      detailEl.replaceChildren(createElement('div', { class: 'card card-filled' }, createElement('div', { class: 'card-body' }, 'Pick a different search or course filter to continue.')));
      return;
    }
    filtered.forEach((course) => {
      const button = buildCourseButton(course);
      if (course.id === courseFacetState.selectedCourseId) button.classList.add('active');
      listEl.appendChild(button);
    });
    if (!filtered.some((course) => course.id === courseFacetState.selectedCourseId)) {
      cancelDetailRender();
      courseFacetState.selectedCourseId = '';
    }
  };

  const renderCourseDetail = async (courseId) => {
    cancelDetailRender();
    const renderToken = detailRenderToken;
    const course = allCourses.find(c => c.id === courseId);
    const topics = (topicsByCourse[courseId] ?? []);
    if (!course) return;
    const activeFilter = detailEl.dataset.topicFilter || 'all';

    // Load progress for this course topics
    const progList = await Promise.all(topics.map(t => window.DB?.getProgress?.(t.topicId)));
    if (renderToken !== detailRenderToken) return;
    const progById = new Map(progList.filter(Boolean).map(p => [p.topicId, p]));
    const filteredTopics = topics.filter((topic) => passCourseFilter(topic, progById.get(topic.topicId)?.status ?? 'not-started', activeFilter));
    const grouped = filteredTopics.reduce((acc, topic) => {
      const key = sourceKey(topic);
      (acc[key] = acc[key] ?? []).push(topic);
      return acc;
    }, {});
    const filterDefinitions = [
      ['all', 'All'],
      ['video', 'Video'],
      ['pdf', 'PDF'],
      ['none', 'No media'],
      ['done', 'Done'],
      ['in-progress', 'In progress'],
      ['not-started', 'Not started'],
    ];
    const productUrl = safeExternalUrl(course.productUrl);

    const summaryCard = createElement('div', { class: 'card card-filled' });
    const summaryBody = createElement('div', { class: 'card-body' });
    const title = createElement('h2', {}, course.title);
    title.style.margin = '0 0 6px 0';
    summaryBody.appendChild(title);
    if (productUrl) {
      summaryBody.appendChild(createElement('a', { href: productUrl, target: '_blank', rel: 'noopener' }, 'Product page'));
    }
    const sourceCount = Object.keys(topics.reduce((acc, t) => { acc[sourceKey(t)] = true; return acc; }, {})).length;
    summaryBody.appendChild(createElement('div', { class: 'course-detail-meta' }, `${topics.length} topics across ${sourceCount} source(s)`));
    aiReady().then((ready) => {
      if (!ready || renderToken !== detailRenderToken || !summaryBody.isConnected) return;
      summaryBody.appendChild(createElement('div', { class: 'button-row', style: 'margin-top:10px' }, [
        createElement('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-action': 'summarize-course', 'data-course-id': courseId }, 'Summarize course'),
        createElement('span', { class: 'text-sm', 'data-course-ai-status': '', 'aria-live': 'polite' }),
      ]));
    }).catch(() => {});
    summaryCard.appendChild(summaryBody);

    const topicsCard = createElement('div', { class: 'card card-filled' });
    topicsCard.style.marginTop = '12px';
    const topicsBody = createElement('div', { class: 'card-body' });
    const filterRow = createElement('div', { class: 'filter-row', 'aria-label': 'Topic filters' });
    filterDefinitions.forEach(([value, label]) => {
      filterRow.appendChild(createElement('button', {
        class: `filter-chip${activeFilter === value ? ' active' : ''}`,
        type: 'button',
        'data-topic-filter': value,
        'aria-pressed': activeFilter === value ? 'true' : 'false',
      }, label));
    });
    const topicsList = createElement('div', { class: 'topics-list' });
    const groups = Object.entries(grouped);
    let startDetailRender = () => {};
    if (!groups.length) {
      const empty = createElement('div', { class: 'empty-state' });
      empty.appendChild(createElement('p', {}, 'No topics match this filter.'));
      topicsList.appendChild(empty);
    } else {
      const rowTasks = [];
      groups.forEach(([groupKey, groupTopics]) => {
        const section = createElement('section', { class: 'source-group' });
        const header = createElement('div', { class: 'source-group-header' });
        header.append(
          createElement('div', { class: 'source-group-title' }, sourceLabelFromKey(groupKey)),
          createElement('div', { class: 'source-group-count' }, `${groupTopics.length} topic${groupTopics.length === 1 ? '' : 's'}`)
        );
        section.appendChild(header);
        topicsList.appendChild(section);
        groupTopics.forEach(topic => rowTasks.push({ section, topic }));
      });
      const batchSize = Math.max(1, Number(window.OpenCourseDeck?.courseDetailRenderBatchSize) || 50);
      const status = createElement('div', {
        class: 'course-detail-render-status text-sm',
        'aria-live': 'polite',
        'data-course-detail-render-status': '',
      });
      topicsList.appendChild(status);
      let index = 0;
      const renderBatch = () => {
        if (!topicsList.isConnected || renderToken !== detailRenderToken) return;
        const end = Math.min(rowTasks.length, index + batchSize);
        for (; index < end; index += 1) {
          const { section, topic } = rowTasks[index];
          const statusValue = progById.get(topic.topicId)?.status ?? 'not-started';
          section.appendChild(buildTopicRow(topic, statusValue, { toggle: true }));
        }
        if (index < rowTasks.length) {
          status.textContent = `Showing ${index} of ${rowTasks.length} topics`;
          detailRenderTimer = setTimeout(renderBatch, 0);
        } else {
          detailRenderTimer = null;
          status.remove();
        }
      };
      startDetailRender = renderBatch;
    }
    topicsBody.append(filterRow, topicsList);
    topicsCard.appendChild(topicsBody);
    detailEl.replaceChildren(summaryCard, topicsCard);
    startDetailRender();
  };

  // Initial render
  renderCourses('');
  if (sourceScopeEl) sourceScopeEl.value = courseFacetState.sourceScope;

  if (!listEl.dataset.pdBound) {
    listEl.dataset.pdBound = 'true';
    listEl.addEventListener('click', (e) => {
      const target = eventTargetEl(e);
      if (!target) return;
      const btn = target.closest('[data-course-id]');
      if (!btn) return;
      $$('.course-item', listEl).forEach(x => x.classList.toggle('active', x === btn));
      courseFacetState.selectedCourseId = btn.dataset.courseId || '';
      renderCourseDetail(btn.dataset.courseId);
    });
  }

  if (searchEl && !searchEl.dataset.pdBound) {
    searchEl.dataset.pdBound = 'true';
    searchEl.addEventListener('input', () => {
      renderCourses(searchEl.value);
      const current = courseFacetState.selectedCourseId && listEl.querySelector(`[data-course-id="${courseFacetState.selectedCourseId}"]`);
      if (current) {
        current.classList.add('active');
        return;
      }
      const firstVisible = listEl.querySelector('[data-course-id]');
      if (firstVisible) {
        firstVisible.classList.add('active');
        courseFacetState.selectedCourseId = firstVisible.dataset.courseId || '';
        renderCourseDetail(courseFacetState.selectedCourseId);
      }
    });
  }
  if (sourceScopeEl && !sourceScopeEl.dataset.pdBound) {
    sourceScopeEl.dataset.pdBound = 'true';
    sourceScopeEl.addEventListener('change', () => {
      courseFacetState.sourceScope = sourceScopeEl.value || 'all';
      renderCourses(courseFacetState.query);
      const firstVisible = listEl.querySelector('[data-course-id]');
      if (firstVisible) {
        firstVisible.classList.add('active');
        courseFacetState.selectedCourseId = firstVisible.dataset.courseId || '';
        renderCourseDetail(courseFacetState.selectedCourseId);
      }
    });
  }

  if (!detailEl.dataset.pdBound) {
    detailEl.dataset.pdBound = 'true';
    detailEl.addEventListener('click', async (e) => {
      const target = eventTargetEl(e);
      if (!target) return;
      const actionBtn = target.closest('[data-action]');
      const filterBtn = target.closest('[data-topic-filter]');
      if (filterBtn) {
        detailEl.dataset.topicFilter = filterBtn.dataset.topicFilter || 'all';
        const activeCourse = listEl.querySelector('.course-item.active')?.dataset.courseId;
        if (activeCourse) renderCourseDetail(activeCourse);
        return;
      }
      if (!actionBtn) return;
      const action = actionBtn.dataset.action;
      if (action === 'summarize-course') {
        const courseId = actionBtn.dataset.courseId;
        const course = allCourses.find(c => c.id === courseId);
        const topics = topicsByCourse[courseId] ?? [];
        const statusEl = detailEl.querySelector('[data-course-ai-status]');
        const ai = window.OpenCourseDeck?.AI;
        if (!course || !ai?.summarizeText) return;
        const previous = actionBtn.textContent;
        actionBtn.disabled = true;
        actionBtn.textContent = 'Summarizing...';
        try {
          const result = await ai.summarizeText(courseSummaryInput(course, topics), { bullets: 6 });
          if (!result?.ok || !result.text) throw new Error(result?.reason || 'summary-failed');
          await ai.saveSummaryNote?.({
            summary: result.text,
            title: `${course.title || courseId} AI summary`,
            sourceLabel: course.title || courseId,
            note: { id: `course-ai-summary-${courseId}-${Date.now()}`, sourceType: 'course', courseId, tags: ['course', 'ai-summary'] },
          });
          if (statusEl) statusEl.textContent = 'AI summary saved to Notes';
          Toast.success('Course AI summary saved');
        } catch {
          if (statusEl) statusEl.textContent = 'AI summary failed';
          Toast.error('Course AI summary failed');
        } finally {
          actionBtn.disabled = false;
          actionBtn.textContent = previous;
        }
        return;
      }
      const row = target.closest('[data-topic-id]');
      if (!row) return;
      const topicId = row.dataset.topicId;
      const courseId = row.dataset.courseId;
      const topic = (window.DataStore?.allTopics?.() ?? []).find(t => t.topicId === topicId);
      if (!topic) return;

      if (action === 'toggle-done') {
        const existing = await window.DB?.getProgress?.(topicId);
        const isDone = existing?.status === 'done';
        await window.DB?.saveProgress?.(topicId, courseId, {
          status: isDone ? 'not-started' : 'done',
          percent: isDone ? 0 : 100,
          updatedAt: Date.now(),
        });
        // Re-render current course
        renderCourseDetail(courseId);
        return;
      }

      if (action === 'open-pdf') {
        const url = safeMediaUrl(topic.pdfs?.[0]);
        if (!url) return;
        Router.navigate('#/pdf');
        // Wait a tick for the view to mount, then load
        setTimeout(() => {
          try { window.PlasmaPDFViewer?.load?.(url); } catch {}
        }, 50);
        return;
      }

      if (action === 'play-video') {
        const url = safeMediaUrl(topic.videos?.[0]);
        if (!url) return;
        // Ensure player exists and has an instance
        const el = playerEl;
        const inst = el?._pdPlayer;
        if (inst?.loadPlaylist) {
          bindCoursePlayerProgress();
          inst.loadPlaylist([courseMediaTrack(topic, url, courseId)], true);
        } else {
          // Fallback: try to init then load
          try { window.OpenCourseDeck?.Player?.init?.(); } catch {}
          setTimeout(() => {
            const i2 = el?._pdPlayer;
            bindCoursePlayerProgress();
            i2?.loadPlaylist?.([courseMediaTrack(topic, url, courseId)], true);
          }, 50);
        }
      }
    });
  }

  const bindCoursePlayerProgress = () => {
    // Persist watch progress into DB as the player runs (idempotent per player element)
    if (!playerEl || playerEl.dataset.pdProgressBound) return;
    const inst = playerEl._pdPlayer;
    if (!inst) return;
    playerEl.dataset.pdProgressBound = 'true';
    const throttleMs = 2500;
    let lastSave = 0;

    const save = async (track, { currentTime, duration, percent } = {}) => {
      const t = track ?? inst?.queue?.[inst?.trackIndex ?? 0] ?? null;
      const topicId = t?.topicId;
      const courseId = t?.courseId;
      if (!topicId || !courseId) return;

      const cur = currentTime ?? inst?.currentTime ?? 0;
      const dur = duration ?? inst?.duration ?? 0;
      const pct = percent ?? (dur > 0 ? Math.round((cur / dur) * 100) : 0);

      const status = pct >= 98 ? 'done' : (pct > 0 ? 'in-progress' : 'not-started');
      await window.DB?.saveProgress?.(topicId, courseId, {
        position: Math.max(0, cur),
        duration: Math.max(0, dur || 0),
        percent: Math.max(0, Math.min(100, pct || 0)),
        status,
        updatedAt: Date.now(),
      });
    };

    const saveCurrent = () => save(null);
    flushPlayerProgress = saveCurrent;
    const onTimeUpdate = async (payload) => {
      const now = Date.now();
      if (now - lastSave < throttleMs) return;
      lastSave = now;
      await save(null, payload);
    };
    const onPause = async (track) => {
      await save(track);
    };
    const onSeeked = async (payload) => {
      await save(payload?.track, payload);
    };
    const onEnded = async (track) => {
      await save(track, { currentTime: inst?.duration ?? 0, duration: inst?.duration ?? 0, percent: 100 });
    };
    const onBeforeTrackChange = async (track) => {
      await save(track);
    };
    const onTrackChange = async (track) => {
      // Record a "start" touch so it shows up in activity/streaks
      await save(track, { currentTime: 0, duration: inst?.duration ?? 0, percent: 0 });
    };
    const onBeforeUnload = () => { saveCurrent(); };

    inst?.on?.('timeupdate', onTimeUpdate);
    inst?.on?.('pause', onPause);
    inst?.on?.('seeked', onSeeked);
    inst?.on?.('ended', onEnded);
    inst?.on?.('beforeTrackChange', onBeforeTrackChange);
    inst?.on?.('trackChange', onTrackChange);
    window.addEventListener('beforeunload', onBeforeUnload);
    routeDisposers.push(() => {
      inst?.off?.('timeupdate', onTimeUpdate);
      inst?.off?.('pause', onPause);
      inst?.off?.('seeked', onSeeked);
      inst?.off?.('ended', onEnded);
      inst?.off?.('beforeTrackChange', onBeforeTrackChange);
      inst?.off?.('trackChange', onTrackChange);
      window.removeEventListener('beforeunload', onBeforeUnload);
    });
  };

  const setupCourseAutoPictureInPicture = () => {
    if (!playerEl || typeof window.IntersectionObserver !== 'function') return;
    if (playerEl.dataset.pdAutoPipBound) return;
    playerEl.dataset.pdAutoPipBound = 'true';
    let requestedForHiddenPass = false;
    const observer = new window.IntersectionObserver((entries) => {
      const entry = entries.find(item => item.target === playerEl);
      if (!entry) return;
      const visible = entry.isIntersecting && Number(entry.intersectionRatio ?? 0) >= 0.2;
      if (visible) {
        requestedForHiddenPass = false;
        return;
      }
      if (requestedForHiddenPass) return;
      const snapshot = playerEl._pdPlayer?.snapshot?.();
      if (!snapshot?.playing) return;
      requestedForHiddenPass = true;
      window.OpenCourseDeck?.Player?.requestActivePictureInPicture?.(document).catch?.(() => {});
    }, { threshold: [0, 0.2, 0.6, 1] });
    observer.observe(playerEl);
    routeDisposers.push(() => {
      observer.disconnect?.();
      delete playerEl?.dataset?.pdAutoPipBound;
    });
  };

  bindCoursePlayerProgress();
  setupCourseAutoPictureInPicture();

  document.querySelector('[data-save-timestamp]')?.addEventListener('click', () => {
    saveTimestampCapture({ createNote: false });
  });
  document.querySelector('[data-save-timestamp-note]')?.addEventListener('click', () => {
    saveTimestampCapture({ createNote: true });
  });
  document.querySelector('[data-save-chapter-cue]')?.addEventListener('click', () => {
    saveLearningCue('chapter');
  });
  document.querySelector('[data-save-transcript-cue]')?.addEventListener('click', () => {
    saveLearningCue('transcript');
  });
  document.querySelector('[data-review-learning-cues]')?.addEventListener('click', () => {
    renderLearningCueList();
  });
  document.querySelector('[data-export-active-learning-cues]')?.addEventListener('click', () => {
    exportActiveLearningCues();
  });
  document.querySelector('[data-apply-active-learning-cues]')?.addEventListener('click', () => {
    applyActiveLearningCues();
  });
  document.querySelector('[data-export-learning-cues]')?.addEventListener('click', () => {
    exportLearningCues();
  });
  document.querySelector('[data-import-learning-cues]')?.addEventListener('click', () => {
    importLearningCues();
  });
  learningMarkerListEl?.addEventListener('click', (event) => {
    const button = eventTargetEl(event)?.closest?.('[data-delete-learning-cue]');
    if (!button) return;
    deleteLearningCue(button.dataset.deleteLearningCue, Number(button.dataset.cueIndex));
  });
  window.OpenCourseDeck?.bus.on?.('sync:message', onCourseSyncMessage);
  routeDisposers.push(() => window.OpenCourseDeck?.bus.off?.('sync:message', onCourseSyncMessage));

  // Auto-select first course
  const pendingSession = consumePendingCourseSession();
  const pendingTopicId = sessionStorage.getItem('plasma_pending_topic');
  const pendingPosition = Number(sessionStorage.getItem('plasma_pending_position') || 0);
  if (pendingTopicId) sessionStorage.removeItem('plasma_pending_topic');
  if (pendingPosition) sessionStorage.removeItem('plasma_pending_position');

  const selectCourse = (courseId) => {
    const btn = listEl.querySelector(`[data-course-id="${courseId}"]`);
    if (!btn) return false;
    $$('.course-item', listEl).forEach(x => x.classList.toggle('active', x === btn));
    courseFacetState.selectedCourseId = courseId;
    renderCourseDetail(courseId);
    return true;
  };

  const courseFilterRoot = document.querySelector('.courses-sidebar');
  if (courseFilterRoot && !courseFilterRoot.dataset.pdCourseFacetBound) {
    courseFilterRoot.dataset.pdCourseFacetBound = 'true';
    courseFilterRoot.addEventListener('click', (event) => {
      const button = event.target?.closest?.('[data-course-filter]');
      if (!button) return;
      courseFacetState.filter = button.dataset.courseFilter || 'all';
      courseFilterRoot.querySelectorAll('[data-course-filter]').forEach((btn) => {
        const active = btn === button;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      renderCourses(courseFacetState.query);
      const firstVisible = listEl.querySelector('[data-course-id]');
      if (firstVisible) {
        firstVisible.classList.add('active');
        courseFacetState.selectedCourseId = firstVisible.dataset.courseId || '';
        renderCourseDetail(courseFacetState.selectedCourseId);
      }
    });
  }

  if (pendingSession) {
    const pendingTrack = pendingSession.track || pendingSession.queue[pendingSession.queueIndex] || pendingSession.queue[0];
    const fallbackCourseId = pendingTrack?.courseId || pendingSession.queue.find(item => item?.courseId)?.courseId;
    if (fallbackCourseId && selectCourse(fallbackCourseId)) {
      setTimeout(() => {
        const inst = playerEl?._pdPlayer;
        if (!inst) return;
        bindCoursePlayerProgress();
        if (inst.restoreSnapshot?.(pendingSession)) return;
        if (inst.loadPlaylist) {
          inst.loadPlaylist(pendingSession.queue, false);
          if (Number.isFinite(Number(pendingSession.queueIndex)) && Number(pendingSession.queueIndex) > 0) {
            try { inst.playAt?.(Number(pendingSession.queueIndex)); } catch {}
            if (!pendingSession.playing) {
              try { inst.pause?.(); } catch {}
            }
          } else if (pendingSession.playing) {
            try { inst.play?.(); } catch {}
          }
          seekPlayerToPendingPosition(inst, pendingSession.currentTime);
        }
      }, 120);
      return routeController;
    }
  }

  if (pendingTopicId) {
    const t = allTopics.find(x => x.topicId === pendingTopicId);
    if (t && selectCourse(t.courseId)) {
      // Autoplay after detail is rendered
      setTimeout(() => {
        const url = safeMediaUrl(t.videos?.[0]);
        if (!url) return;
        const el = playerEl;
        const inst = el?._pdPlayer;
        if (inst?.loadPlaylist) {
          bindCoursePlayerProgress();
          inst.loadPlaylist([courseMediaTrack(t, url, t.courseId)], true);
          seekPlayerToPendingPosition(inst, pendingPosition);
        }
      }, 120);
      return routeController;
    }
  }

  const first = listEl.querySelector('[data-course-id]');
  if (first) {
    first.classList.add('active');
    renderCourseDetail(first.dataset.courseId);
  }
  return routeController;
}



