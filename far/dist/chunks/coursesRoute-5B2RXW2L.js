// src/views/coursesRoute.js
async function mountCoursesView(deps = {}) {
  const {
    setView,
    createElement,
    $$,
    eventTargetEl,
    safeExternalUrl,
    safeMediaUrl,
    Router,
    Toast = window.PlasmaDeck?.Toast,
    consumePendingCourseSession,
    formatMediaClock,
    escapeHtmlText
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
  await window.DataStore?.init?.();
  const listEl = document.getElementById("courses-list");
  const searchEl = document.getElementById("courses-search");
  const sourceScopeEl = document.getElementById("courses-source-scope");
  const detailEl = document.getElementById("course-detail");
  let playerEl = document.getElementById("course-player");
  playerEl = window.PlasmaDeck?.MiniPlayer?.restorePlayer?.(playerEl) || playerEl;
  const timestampStatusEl = document.querySelector("[data-timestamp-note-status]");
  const learningMarkerStatusEl = document.querySelector("[data-learning-marker-status]");
  const learningMarkerListEl = document.querySelector("[data-learning-marker-list]");
  const learningMarkerJsonEl = document.querySelector("[data-learning-marker-json]");
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
      try {
        return flushPlayerProgress();
      } catch {
        return void 0;
      }
    },
    unmount() {
      cancelDetailRender();
      try {
        flushPlayerProgress();
      } catch {
      }
      let adoptedPlayer = false;
      try {
        const snapshot = window.PlasmaDeck?.Player?.getActiveSnapshot?.(document);
        if (snapshot && playerEl?._pdPlayer) {
          window.PlasmaDeck?.MiniPlayer?.adoptPlayer?.(playerEl, snapshot, {
            dispose() {
              routeDisposers.splice(0).forEach((fn) => {
                try {
                  fn();
                } catch {
                }
              });
            }
          });
          adoptedPlayer = true;
        } else if (snapshot) {
          window.PlasmaDeck?.MiniPlayer?.show?.(snapshot);
        }
      } catch {
      }
      if (!adoptedPlayer) {
        routeDisposers.splice(0).forEach((fn) => {
          try {
            fn();
          } catch {
          }
        });
        try {
          window.PlasmaDeck?.Player?.destroyAll?.(document);
        } catch {
        }
      }
    }
  };
  if (!listEl || !detailEl) return;
  try {
    window.PlasmaDeck?.Player?.init?.();
  } catch {
  }
  const MEDIA_CUES_KEY = "plasma-course-media-cues";
  let authoredMediaCues = {};
  try {
    const savedCues = await window.DB?.getSetting?.(MEDIA_CUES_KEY);
    authoredMediaCues = savedCues && typeof savedCues === "object" ? savedCues : {};
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
    query: "",
    filter: "all",
    sourceScope: "all",
    selectedCourseId: ""
  };
  const sourceKey = (topic) => `${topic.sourceIndex ?? 0}|${topic.sourceLabel ?? "Source"}`;
  const sourceLabelFromKey = (key) => String(key).split("|").slice(1).join("|") || "Source";
  const mediaClass = (topic) => {
    const hasVideo = (topic.videos?.length ?? 0) > 0;
    const hasPdf = (topic.pdfs?.length ?? 0) > 0;
    if (hasVideo && hasPdf) return "video-pdf";
    if (hasVideo) return "video";
    if (hasPdf) return "pdf";
    return "none";
  };
  const passCourseFilter = (topic, status, filter) => {
    if (filter === "all") return true;
    if (filter === "done" || filter === "in-progress" || filter === "not-started") return status === filter;
    return mediaClass(topic) === filter || filter === "video" && (topic.videos?.length ?? 0) > 0 || filter === "pdf" && (topic.pdfs?.length ?? 0) > 0;
  };
  const statusInfo = (status) => {
    const labels = {
      done: "Done",
      "in-progress": "In progress",
      "not-started": "Not started"
    };
    const key = labels[status] ? status : "not-started";
    return { key, label: labels[key] };
  };
  const statusBadgeNode = (status) => {
    const { key, label } = statusInfo(status);
    return createElement("span", {
      class: `badge badge-status badge-status-${key}`,
      "aria-label": `Status: ${label}`,
      "data-status": key
    }, label);
  };
  const badgeNode = (label) => createElement("span", { class: "badge" }, label);
  const actionButton = (action, label) => createElement("button", {
    class: "btn btn-ghost btn-sm",
    type: "button",
    "data-action": action
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
      mediaClass: hasVideo && hasPdf ? "mixed" : hasVideo ? "video" : hasPdf ? "pdf" : "none",
      sourceCount
    }];
  }));
  const seekPlayerToPendingPosition = (inst, position) => {
    const seconds = Number(position);
    if (!inst?.seekTo || !Number.isFinite(seconds) || seconds <= 0) return;
    const seek = () => {
      try {
        inst.seekTo(seconds);
      } catch {
      }
    };
    seek();
    try {
      inst._media?.addEventListener?.("loadedmetadata", seek, { once: true });
    } catch {
    }
    setTimeout(seek, 80);
  };
  const setTimestampStatus = (message, tone = "muted") => {
    if (!timestampStatusEl) return;
    timestampStatusEl.textContent = message;
    timestampStatusEl.dataset.tone = tone;
  };
  const setLearningMarkerStatus = (message, tone = "muted") => {
    if (!learningMarkerStatusEl) return;
    learningMarkerStatusEl.textContent = message;
    learningMarkerStatusEl.dataset.tone = tone;
  };
  const currentPlayerContext = () => {
    const inst = playerEl?._pdPlayer;
    const snapshot = inst?.snapshot?.();
    const queueIndex = Number(snapshot?.queueIndex ?? inst?.trackIndex ?? 0);
    const activeTrack = inst?.queue?.[Number.isFinite(queueIndex) ? queueIndex : 0] || snapshot?.queue?.[Number.isFinite(queueIndex) ? queueIndex : 0] || snapshot?.track || null;
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
      duration: Math.max(0, Number(duration) || 0)
    };
  };
  const cueList = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
  const cueTime = (cue) => Math.max(0, Number(cue?.time ?? cue?.start ?? 0) || 0);
  const cueLabel = (cue) => String(cue?.title ?? cue?.text ?? "").trim();
  const cueIdentity = (cue) => [
    String(cue?.createdAt ?? ""),
    String(cueTime(cue)),
    cueLabel(cue)
  ].join("|");
  const mergedCues = (topic, key, fallbackKey) => [
    ...cueList(topic[key] ?? (fallbackKey ? topic[fallbackKey] : void 0)),
    ...cueList(authoredMediaCues?.[topic.topicId]?.[key])
  ];
  const courseMediaTrack = (topic, url, courseId) => ({
    title: topic.title,
    src: url,
    artist: topic.courseTitle ?? courseId,
    topicId: topic.topicId,
    courseId,
    chapters: mergedCues(topic, "chapters", "chapterMarkers"),
    transcript: mergedCues(topic, "transcript"),
    captions: topic.captions,
    captionTracks: topic.captionTracks ?? topic.subtitles
  });
  const cueDedupeKey = (type, cue) => `${type}|${cueTime(cue).toFixed(3)}|${cueLabel(cue).toLowerCase()}`;
  const aiReady = async () => {
    try {
      return Boolean((await window.PlasmaDeck?.AI?.status?.())?.available);
    } catch {
      return false;
    }
  };
  const courseSummaryInput = (course, topics) => [
    `Course: ${course.title || course.id}`,
    `Topics: ${topics.length}`,
    ...topics.slice(0, 120).map((topic) => `- ${topic.sourceLabel || "Source"}: ${topic.title || "Untitled topic"}`)
  ].join("\n").slice(0, 16e3);
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
    const seen = /* @__PURE__ */ new Set();
    return cueList(items).map((cue) => {
      const time = normalizeCueTime(cue, maxTime, stats);
      const label = cueLabel(cue);
      if (!label) {
        stats.dropped += 1;
        return null;
      }
      const normalized = type === "chapters" ? { ...cue, time, title: label, authored: cue.authored ?? true } : { ...cue, start: time, text: label, authored: cue.authored ?? true };
      const key = cueDedupeKey(type, normalized);
      if (seen.has(key)) {
        stats.deduped += 1;
        return null;
      }
      seen.add(key);
      stats.kept += 1;
      return normalized;
    }).filter(Boolean).sort((a, b) => cueTime(a) - cueTime(b));
  };
  const normalizeImportedCues = (value, options = {}) => {
    const stats = options.stats || { kept: 0, dropped: 0, deduped: 0, clamped: 0 };
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const normalized = {};
    Object.entries(value).forEach(([topicId, cues]) => {
      if (!cues || typeof cues !== "object" || Array.isArray(cues)) return;
      const chapters = normalizeCueList(cues.chapters, "chapters", options.maxTime, stats);
      const transcript = normalizeCueList(cues.transcript, "transcript", options.maxTime, stats);
      normalized[topicId] = {
        ...chapters.length ? { chapters } : {},
        ...transcript.length ? { transcript } : {}
      };
    });
    return normalized;
  };
  const cueImportSummary = (stats, prefix) => {
    const details = [];
    if (stats.kept) details.push(`${stats.kept} kept`);
    if (stats.deduped) details.push(`${stats.deduped} duplicate${stats.deduped === 1 ? "" : "s"} removed`);
    if (stats.clamped) details.push(`${stats.clamped} time${stats.clamped === 1 ? "" : "s"} clamped`);
    if (stats.dropped) details.push(`${stats.dropped} invalid cue${stats.dropped === 1 ? "" : "s"} skipped`);
    return `${prefix}${details.length ? ` (${details.join(", ")})` : ""}.`;
  };
  const syncActiveTrackCues = (context) => {
    if (!context?.topicId) return;
    const activeTrack = context.activeTrack || context.track;
    if (!activeTrack) return;
    const authored = authoredMediaCues[context.topicId] || {};
    ["chapters", "transcript"].forEach((key) => {
      const authoredIds = new Set(cueList(authored[key]).map(cueIdentity));
      const existing = cueList(activeTrack[key]).filter((cue) => !cue.authored || authoredIds.has(cueIdentity(cue)));
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
      learningMarkerListEl.appendChild(createElement("div", { class: "text-muted text-sm" }, "Play a topic to review authored cues."));
      return;
    }
    const authored = authoredMediaCues[context.topicId] || {};
    const rows = [
      ...cueList(authored.chapters).map((cue, index) => ({ type: "chapters", index, cue, label: "Chapter" })),
      ...cueList(authored.transcript).map((cue, index) => ({ type: "transcript", index, cue, label: "Transcript" }))
    ].sort((a, b) => cueTime(a.cue) - cueTime(b.cue));
    if (!rows.length) {
      learningMarkerListEl.appendChild(createElement("div", { class: "text-muted text-sm" }, "No authored cues for this topic yet."));
      return;
    }
    rows.forEach(({ type, index, cue, label }) => {
      const row = createElement("div", { class: "learning-marker-row" });
      row.append(
        createElement("span", { class: "badge" }, label),
        createElement("span", { class: "text-sm" }, `${formatMediaClock(cueTime(cue))} - ${cueLabel(cue)}`),
        createElement("button", {
          class: "btn btn-ghost btn-sm",
          type: "button",
          "data-delete-learning-cue": type,
          "data-cue-index": String(index)
        }, "Delete")
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
      setLearningMarkerStatus("Play a course topic before editing learning markers.", "warning");
      return;
    }
    const key = type === "chapters" ? "chapters" : "transcript";
    const topicCues = authoredMediaCues[context.topicId] && typeof authoredMediaCues[context.topicId] === "object" ? authoredMediaCues[context.topicId] : {};
    const nextList = cueList(topicCues[key]);
    const removed = nextList.splice(index, 1)[0];
    if (!removed) return;
    authoredMediaCues = {
      ...authoredMediaCues,
      [context.topicId]: {
        ...topicCues,
        [key]: nextList
      }
    };
    await persistAuthoredMediaCues();
    syncActiveTrackCues(context);
    if (key === "chapters") context.inst?.showChapters?.();
    else context.inst?.showTranscript?.();
    renderLearningCueList();
    setLearningMarkerStatus("Learning cue deleted.", "success");
  };
  const exportLearningCues = () => {
    if (learningMarkerJsonEl) learningMarkerJsonEl.value = JSON.stringify(authoredMediaCues, null, 2);
    renderLearningCueList();
    setLearningMarkerStatus("Learning cue JSON exported.", "success");
  };
  const exportActiveLearningCues = () => {
    const context = currentPlayerContext();
    if (!context?.topicId) {
      setLearningMarkerStatus("Play a course topic before editing active cues.", "warning");
      return;
    }
    const cues = authoredMediaCues[context.topicId] || {};
    if (learningMarkerJsonEl) {
      learningMarkerJsonEl.value = JSON.stringify({
        topicId: context.topicId,
        chapters: cueList(cues.chapters),
        transcript: cueList(cues.transcript)
      }, null, 2);
    }
    renderLearningCueList();
    setLearningMarkerStatus("Active topic cues loaded for bulk editing.", "success");
  };
  const applyActiveLearningCues = async () => {
    const context = currentPlayerContext();
    if (!context?.topicId) {
      setLearningMarkerStatus("Play a course topic before applying active cues.", "warning");
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(String(learningMarkerJsonEl?.value || "{}"));
    } catch {
      setLearningMarkerStatus("Active cue JSON is not valid.", "warning");
      return;
    }
    const topicId = String(parsed?.topicId || context.topicId);
    if (topicId !== context.topicId) {
      setLearningMarkerStatus("Active cue JSON belongs to a different topic.", "warning");
      return;
    }
    const stats = { kept: 0, dropped: 0, deduped: 0, clamped: 0 };
    const normalized = normalizeImportedCues({ [context.topicId]: parsed }, { maxTime: context.duration, stats });
    const cues = normalized?.[context.topicId];
    if (!cues) {
      setLearningMarkerStatus("Active cue JSON needs chapters or transcript arrays.", "warning");
      return;
    }
    authoredMediaCues = {
      ...authoredMediaCues,
      [context.topicId]: {
        chapters: cueList(cues.chapters),
        transcript: cueList(cues.transcript)
      }
    };
    await persistAuthoredMediaCues();
    syncActiveTrackCues(context);
    context.inst?.showChapters?.();
    context.inst?.showTranscript?.();
    renderLearningCueList();
    setLearningMarkerStatus(cueImportSummary(stats, "Active topic cues applied"), "success");
  };
  const importLearningCues = async () => {
    let parsed;
    try {
      parsed = JSON.parse(String(learningMarkerJsonEl?.value || "{}"));
    } catch {
      setLearningMarkerStatus("Cue JSON is not valid.", "warning");
      return;
    }
    const stats = { kept: 0, dropped: 0, deduped: 0, clamped: 0 };
    const normalized = normalizeImportedCues(parsed, { stats });
    if (!normalized) {
      setLearningMarkerStatus("Cue JSON must be an object keyed by topic id.", "warning");
      return;
    }
    authoredMediaCues = {
      ...authoredMediaCues,
      ...Object.fromEntries(Object.entries(normalized).map(([topicId, cues]) => {
        const existing = authoredMediaCues[topicId] || {};
        return [topicId, {
          chapters: normalizeCueList([...cueList(existing.chapters), ...cueList(cues.chapters)], "chapters", void 0, stats),
          transcript: normalizeCueList([...cueList(existing.transcript), ...cueList(cues.transcript)], "transcript", void 0, stats)
        }];
      }))
    };
    await persistAuthoredMediaCues();
    const context = currentPlayerContext();
    syncActiveTrackCues(context);
    context?.inst?.showChapters?.();
    context?.inst?.showTranscript?.();
    renderLearningCueList();
    setLearningMarkerStatus(cueImportSummary(stats, "Learning cue JSON imported"), "success");
  };
  const saveLearningCue = async (type) => {
    const context = currentPlayerContext();
    if (!context?.topicId || !context?.courseId) {
      setLearningMarkerStatus("Play a course topic before adding a learning marker.", "warning");
      return null;
    }
    const textInput = document.querySelector("[data-learning-marker-text]");
    const text = String(textInput?.value || "").trim();
    if (!text) {
      setLearningMarkerStatus("Enter a chapter title or transcript line first.", "warning");
      return null;
    }
    const key = type === "chapter" ? "chapters" : "transcript";
    const now = Date.now();
    const time = Math.max(0, Number(context.currentTime) || 0);
    const cue = type === "chapter" ? { time, title: text, authored: true, createdAt: now, updatedAt: now } : { start: time, text, authored: true, createdAt: now, updatedAt: now };
    const topicCues = authoredMediaCues[context.topicId] && typeof authoredMediaCues[context.topicId] === "object" ? authoredMediaCues[context.topicId] : {};
    const nextTopicCues = {
      ...topicCues,
      [key]: [...cueList(topicCues[key]), cue].sort((a, b) => Number(a.time ?? a.start ?? 0) - Number(b.time ?? b.start ?? 0))
    };
    authoredMediaCues = {
      ...authoredMediaCues,
      [context.topicId]: nextTopicCues
    };
    await persistAuthoredMediaCues();
    const activeTrack = context.activeTrack || context.track;
    activeTrack[key] = [...cueList(activeTrack[key]), cue].sort((a, b) => Number(a.time ?? a.start ?? 0) - Number(b.time ?? b.start ?? 0));
    if (type === "chapter") context.inst?.showChapters?.();
    else context.inst?.showTranscript?.();
    textInput && (textInput.value = "");
    renderLearningCueList();
    setLearningMarkerStatus(
      `${type === "chapter" ? "Chapter" : "Transcript line"} added at ${formatMediaClock(time)}.`,
      "success"
    );
    Toast.success(type === "chapter" ? "Chapter marker added" : "Transcript line added");
    return cue;
  };
  const onCourseSyncMessage = async (payload = {}) => {
    if (payload.kind === "progress") {
      const record = payload.record || {};
      const activeCourseId = listEl.querySelector(".course-item.active")?.dataset.courseId;
      const courseTopics = activeCourseId ? topicsByCourse[activeCourseId] || [] : [];
      const context2 = currentPlayerContext();
      const affectsDetail = record.courseId === activeCourseId || courseTopics.some((t) => t.topicId === record.topicId);
      const affectsPlayer = record.topicId && record.topicId === context2?.topicId;
      if (!affectsDetail && !affectsPlayer) return;
      if (activeCourseId) await renderCourseDetail(activeCourseId);
      if (affectsPlayer) setTimestampStatus("Progress refreshed from another tab.", "success");
      window.PlasmaDeck?.bus.emit?.("player:sync-refresh", {
        kind: "progress",
        topicId: record.topicId || null,
        courseId: record.courseId || activeCourseId || null,
        playbackPreserved: true,
        queuePreserved: true
      });
      return;
    }
    if (payload.kind !== "setting" || payload.record?.key !== MEDIA_CUES_KEY) return;
    const nextCues = payload.record?.value && typeof payload.record.value === "object" ? payload.record.value : await window.DB?.getSetting?.(MEDIA_CUES_KEY);
    authoredMediaCues = nextCues && typeof nextCues === "object" ? nextCues : {};
    const context = currentPlayerContext();
    syncActiveTrackCues(context);
    renderLearningCueList();
    context?.inst?.showChapters?.();
    context?.inst?.showTranscript?.();
    setLearningMarkerStatus("Learning cues refreshed from another tab.", "success");
    window.PlasmaDeck?.bus.emit?.("courses:sync-refresh", { kind: "media-cues", topicId: context?.topicId || null });
  };
  const saveTimestampCapture = async ({ createNote = false } = {}) => {
    const context = currentPlayerContext();
    if (!context?.topicId || !context?.courseId) {
      setTimestampStatus("Play a course topic before saving a timestamp.", "warning");
      return null;
    }
    const now = Date.now();
    const titleInput = document.querySelector("[data-timestamp-note-title]");
    const bodyInput = document.querySelector("[data-timestamp-note-body]");
    const noteText = String(bodyInput?.value || "").trim();
    const title = String(titleInput?.value || context.track.title || "Timestamp note").trim() || "Timestamp note";
    let linkedNote = null;
    if (createNote) {
      const paragraphs = [
        noteText || `Captured at ${formatMediaClock(context.currentTime)}.`,
        `Source: ${context.track.title || context.topicId} at ${formatMediaClock(context.currentTime)}.`
      ];
      linkedNote = await window.DB?.saveNote?.({
        title,
        content: paragraphs.map((line) => `<p>${escapeHtmlText(line).replace(/\n/g, "<br>")}</p>`).join(""),
        topicId: context.topicId,
        courseId: context.courseId,
        position: context.currentTime,
        tags: ["timestamp"],
        createdAt: now,
        updatedAt: now
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
      updatedAt: now
    };
    await window.DB?.saveTimestamp?.(timestamp);
    bodyInput && (bodyInput.value = "");
    titleInput && (titleInput.value = "");
    setTimestampStatus(
      createNote ? `Saved linked note at ${formatMediaClock(context.currentTime)}.` : `Saved bookmark at ${formatMediaClock(context.currentTime)}.`,
      "success"
    );
    Toast.success(createNote ? "Timestamp note saved" : "Timestamp bookmark saved");
    return { timestamp, note: linkedNote };
  };
  const buildCourseButton = (course) => {
    const meta = courseMetaById.get(course.id) || { topicCount: 0, mediaClass: "none", sourceCount: 0 };
    const btn = createElement("button", { class: "course-item", "data-course-id": course.id });
    const mediaMeta = createElement("div", { class: "topic-meta" });
    mediaMeta.append(badgeNode(meta.mediaClass === "mixed" ? "video + pdf" : meta.mediaClass === "none" ? "no media" : meta.mediaClass));
    btn.append(
      createElement("div", { class: "course-item-title" }, course.title),
      createElement("div", { class: "course-item-meta" }, `${meta.topicCount} topics - ${meta.sourceCount || 0} source(s)`),
      mediaMeta
    );
    return btn;
  };
  const buildTopicRow = (topic, status, { toggle = false } = {}) => {
    const hasVideo = (topic.videos?.length ?? 0) > 0;
    const hasPdf = (topic.pdfs?.length ?? 0) > 0;
    const row = createElement("div", {
      class: "topic-row",
      "data-topic-id": topic.topicId,
      "data-course-id": topic.courseId,
      "data-media": mediaClass(topic)
    });
    const copy = createElement("div");
    copy.append(
      createElement("div", { class: "topic-title" }, topic.title),
      createElement("div", { class: "topic-submeta" }, topic.sourceLabel ?? "")
    );
    const meta = createElement("div", { class: "topic-meta" });
    meta.appendChild(statusBadgeNode(status));
    if (hasVideo) meta.appendChild(badgeNode("video"));
    if (hasPdf) meta.appendChild(badgeNode("pdf"));
    if (!hasVideo && !hasPdf) meta.appendChild(badgeNode("no media"));
    const actions = createElement("div", { class: "topic-actions" });
    if (hasVideo) actions.appendChild(actionButton("play-video", "Play"));
    if (hasPdf) actions.appendChild(actionButton("open-pdf", "PDF"));
    if (toggle) actions.appendChild(actionButton("toggle-done", status === "done" ? "Undone" : "Done"));
    row.append(copy, meta, actions);
    return row;
  };
  const matchesCourseFacet = (course) => {
    const meta = courseMetaById.get(course.id) || { mediaClass: "none", sourceCount: 0, hasVideo: false, hasPdf: false, hasNoMedia: false };
    if (courseFacetState.filter !== "all") {
      if (courseFacetState.filter === "video" && !meta.hasVideo) return false;
      else if (courseFacetState.filter === "pdf" && !meta.hasPdf) return false;
      else if (courseFacetState.filter === "mixed" && meta.mediaClass !== "mixed") return false;
      else if (courseFacetState.filter === "none" && !meta.hasNoMedia) return false;
    }
    if (courseFacetState.sourceScope === "single" && meta.sourceCount !== 1) return false;
    if (courseFacetState.sourceScope === "multi" && meta.sourceCount < 2) return false;
    return true;
  };
  const renderCourses = (query = courseFacetState.query) => {
    const q = String(query || "").trim().toLowerCase();
    courseFacetState.query = query;
    const filtered = allCourses.filter((course) => {
      const meta = courseMetaById.get(course.id) || { topicCount: 0 };
      const matchesQuery = !q || String(course.title ?? "").toLowerCase().includes(q) || String(meta.topicCount ?? "").includes(q) || (topicsByCourse[course.id] ?? []).some((topic) => String(topic.sourceLabel || "").toLowerCase().includes(q));
      return matchesQuery && matchesCourseFacet(course);
    });
    listEl.replaceChildren();
    if (!filtered.length) {
      cancelDetailRender();
      courseFacetState.selectedCourseId = "";
      const card = createElement("div", { class: "card card-ghost" });
      card.appendChild(createElement("div", { class: "card-body" }, "No courses match this search or filter."));
      listEl.appendChild(card);
      detailEl.replaceChildren(createElement("div", { class: "card card-filled" }, createElement("div", { class: "card-body" }, "Pick a different search or course filter to continue.")));
      return;
    }
    filtered.forEach((course) => {
      const button = buildCourseButton(course);
      if (course.id === courseFacetState.selectedCourseId) button.classList.add("active");
      listEl.appendChild(button);
    });
    if (!filtered.some((course) => course.id === courseFacetState.selectedCourseId)) {
      cancelDetailRender();
      courseFacetState.selectedCourseId = "";
    }
  };
  const renderCourseDetail = async (courseId) => {
    cancelDetailRender();
    const renderToken = detailRenderToken;
    const course = allCourses.find((c) => c.id === courseId);
    const topics = topicsByCourse[courseId] ?? [];
    if (!course) return;
    const activeFilter = detailEl.dataset.topicFilter || "all";
    const progList = await Promise.all(topics.map((t) => window.DB?.getProgress?.(t.topicId)));
    if (renderToken !== detailRenderToken) return;
    const progById = new Map(progList.filter(Boolean).map((p) => [p.topicId, p]));
    const filteredTopics = topics.filter((topic) => passCourseFilter(topic, progById.get(topic.topicId)?.status ?? "not-started", activeFilter));
    const grouped = filteredTopics.reduce((acc, topic) => {
      const key = sourceKey(topic);
      (acc[key] = acc[key] ?? []).push(topic);
      return acc;
    }, {});
    const filterDefinitions = [
      ["all", "All"],
      ["video", "Video"],
      ["pdf", "PDF"],
      ["none", "No media"],
      ["done", "Done"],
      ["in-progress", "In progress"],
      ["not-started", "Not started"]
    ];
    const productUrl = safeExternalUrl(course.productUrl);
    const summaryCard = createElement("div", { class: "card card-filled" });
    const summaryBody = createElement("div", { class: "card-body" });
    const title = createElement("h2", {}, course.title);
    title.style.margin = "0 0 6px 0";
    summaryBody.appendChild(title);
    if (productUrl) {
      summaryBody.appendChild(createElement("a", { href: productUrl, target: "_blank", rel: "noopener" }, "Product page"));
    }
    const sourceCount = Object.keys(topics.reduce((acc, t) => {
      acc[sourceKey(t)] = true;
      return acc;
    }, {})).length;
    summaryBody.appendChild(createElement("div", { class: "course-detail-meta" }, `${topics.length} topics across ${sourceCount} source(s)`));
    aiReady().then((ready) => {
      if (!ready || renderToken !== detailRenderToken || !summaryBody.isConnected) return;
      summaryBody.appendChild(createElement("div", { class: "button-row", style: "margin-top:10px" }, [
        createElement("button", { class: "btn btn-ghost btn-sm", type: "button", "data-action": "summarize-course", "data-course-id": courseId }, "Summarize course"),
        createElement("span", { class: "text-sm", "data-course-ai-status": "", "aria-live": "polite" })
      ]));
    }).catch(() => {
    });
    summaryCard.appendChild(summaryBody);
    const topicsCard = createElement("div", { class: "card card-filled" });
    topicsCard.style.marginTop = "12px";
    const topicsBody = createElement("div", { class: "card-body" });
    const filterRow = createElement("div", { class: "filter-row", "aria-label": "Topic filters" });
    filterDefinitions.forEach(([value, label]) => {
      filterRow.appendChild(createElement("button", {
        class: `filter-chip${activeFilter === value ? " active" : ""}`,
        type: "button",
        "data-topic-filter": value,
        "aria-pressed": activeFilter === value ? "true" : "false"
      }, label));
    });
    const topicsList = createElement("div", { class: "topics-list" });
    const groups = Object.entries(grouped);
    let startDetailRender = () => {
    };
    if (!groups.length) {
      const empty = createElement("div", { class: "empty-state" });
      empty.appendChild(createElement("p", {}, "No topics match this filter."));
      topicsList.appendChild(empty);
    } else {
      const rowTasks = [];
      groups.forEach(([groupKey, groupTopics]) => {
        const section = createElement("section", { class: "source-group" });
        const header = createElement("div", { class: "source-group-header" });
        header.append(
          createElement("div", { class: "source-group-title" }, sourceLabelFromKey(groupKey)),
          createElement("div", { class: "source-group-count" }, `${groupTopics.length} topic${groupTopics.length === 1 ? "" : "s"}`)
        );
        section.appendChild(header);
        topicsList.appendChild(section);
        groupTopics.forEach((topic) => rowTasks.push({ section, topic }));
      });
      const batchSize = Math.max(1, Number(window.PlasmaDeck?.courseDetailRenderBatchSize) || 50);
      const status = createElement("div", {
        class: "course-detail-render-status text-sm",
        "aria-live": "polite",
        "data-course-detail-render-status": ""
      });
      topicsList.appendChild(status);
      let index = 0;
      const renderBatch = () => {
        if (!topicsList.isConnected || renderToken !== detailRenderToken) return;
        const end = Math.min(rowTasks.length, index + batchSize);
        for (; index < end; index += 1) {
          const { section, topic } = rowTasks[index];
          const statusValue = progById.get(topic.topicId)?.status ?? "not-started";
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
  renderCourses("");
  if (sourceScopeEl) sourceScopeEl.value = courseFacetState.sourceScope;
  if (!listEl.dataset.pdBound) {
    listEl.dataset.pdBound = "true";
    listEl.addEventListener("click", (e) => {
      const target = eventTargetEl(e);
      if (!target) return;
      const btn = target.closest("[data-course-id]");
      if (!btn) return;
      $$(".course-item", listEl).forEach((x) => x.classList.toggle("active", x === btn));
      courseFacetState.selectedCourseId = btn.dataset.courseId || "";
      renderCourseDetail(btn.dataset.courseId);
    });
  }
  if (searchEl && !searchEl.dataset.pdBound) {
    searchEl.dataset.pdBound = "true";
    searchEl.addEventListener("input", () => {
      renderCourses(searchEl.value);
      const current = courseFacetState.selectedCourseId && listEl.querySelector(`[data-course-id="${courseFacetState.selectedCourseId}"]`);
      if (current) {
        current.classList.add("active");
        return;
      }
      const firstVisible = listEl.querySelector("[data-course-id]");
      if (firstVisible) {
        firstVisible.classList.add("active");
        courseFacetState.selectedCourseId = firstVisible.dataset.courseId || "";
        renderCourseDetail(courseFacetState.selectedCourseId);
      }
    });
  }
  if (sourceScopeEl && !sourceScopeEl.dataset.pdBound) {
    sourceScopeEl.dataset.pdBound = "true";
    sourceScopeEl.addEventListener("change", () => {
      courseFacetState.sourceScope = sourceScopeEl.value || "all";
      renderCourses(courseFacetState.query);
      const firstVisible = listEl.querySelector("[data-course-id]");
      if (firstVisible) {
        firstVisible.classList.add("active");
        courseFacetState.selectedCourseId = firstVisible.dataset.courseId || "";
        renderCourseDetail(courseFacetState.selectedCourseId);
      }
    });
  }
  if (!detailEl.dataset.pdBound) {
    detailEl.dataset.pdBound = "true";
    detailEl.addEventListener("click", async (e) => {
      const target = eventTargetEl(e);
      if (!target) return;
      const actionBtn = target.closest("[data-action]");
      const filterBtn = target.closest("[data-topic-filter]");
      if (filterBtn) {
        detailEl.dataset.topicFilter = filterBtn.dataset.topicFilter || "all";
        const activeCourse = listEl.querySelector(".course-item.active")?.dataset.courseId;
        if (activeCourse) renderCourseDetail(activeCourse);
        return;
      }
      if (!actionBtn) return;
      const action = actionBtn.dataset.action;
      if (action === "summarize-course") {
        const courseId2 = actionBtn.dataset.courseId;
        const course = allCourses.find((c) => c.id === courseId2);
        const topics = topicsByCourse[courseId2] ?? [];
        const statusEl = detailEl.querySelector("[data-course-ai-status]");
        const ai = window.PlasmaDeck?.AI;
        if (!course || !ai?.summarizeText) return;
        const previous = actionBtn.textContent;
        actionBtn.disabled = true;
        actionBtn.textContent = "Summarizing...";
        try {
          const result = await ai.summarizeText(courseSummaryInput(course, topics), { bullets: 6 });
          if (!result?.ok || !result.text) throw new Error(result?.reason || "summary-failed");
          await ai.saveSummaryNote?.({
            summary: result.text,
            title: `${course.title || courseId2} AI summary`,
            sourceLabel: course.title || courseId2,
            note: { id: `course-ai-summary-${courseId2}-${Date.now()}`, sourceType: "course", courseId: courseId2, tags: ["course", "ai-summary"] }
          });
          if (statusEl) statusEl.textContent = "AI summary saved to Notes";
          Toast.success("Course AI summary saved");
        } catch {
          if (statusEl) statusEl.textContent = "AI summary failed";
          Toast.error("Course AI summary failed");
        } finally {
          actionBtn.disabled = false;
          actionBtn.textContent = previous;
        }
        return;
      }
      const row = target.closest("[data-topic-id]");
      if (!row) return;
      const topicId = row.dataset.topicId;
      const courseId = row.dataset.courseId;
      const topic = (window.DataStore?.allTopics?.() ?? []).find((t) => t.topicId === topicId);
      if (!topic) return;
      if (action === "toggle-done") {
        const existing = await window.DB?.getProgress?.(topicId);
        const isDone = existing?.status === "done";
        await window.DB?.saveProgress?.(topicId, courseId, {
          status: isDone ? "not-started" : "done",
          percent: isDone ? 0 : 100,
          updatedAt: Date.now()
        });
        renderCourseDetail(courseId);
        return;
      }
      if (action === "open-pdf") {
        const url = safeMediaUrl(topic.pdfs?.[0]);
        if (!url) return;
        Router.navigate("#/pdf");
        setTimeout(() => {
          try {
            window.PlasmaPDFViewer?.load?.(url);
          } catch {
          }
        }, 50);
        return;
      }
      if (action === "play-video") {
        const url = safeMediaUrl(topic.videos?.[0]);
        if (!url) return;
        const el = playerEl;
        const inst = el?._pdPlayer;
        if (inst?.loadPlaylist) {
          bindCoursePlayerProgress();
          inst.loadPlaylist([courseMediaTrack(topic, url, courseId)], true);
        } else {
          try {
            window.PlasmaDeck?.Player?.init?.();
          } catch {
          }
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
    if (!playerEl || playerEl.dataset.pdProgressBound) return;
    const inst = playerEl._pdPlayer;
    if (!inst) return;
    playerEl.dataset.pdProgressBound = "true";
    const throttleMs = 2500;
    let lastSave = 0;
    const save = async (track, { currentTime, duration, percent } = {}) => {
      const t = track ?? inst?.queue?.[inst?.trackIndex ?? 0] ?? null;
      const topicId = t?.topicId;
      const courseId = t?.courseId;
      if (!topicId || !courseId) return;
      const cur = currentTime ?? inst?.currentTime ?? 0;
      const dur = duration ?? inst?.duration ?? 0;
      const pct = percent ?? (dur > 0 ? Math.round(cur / dur * 100) : 0);
      const status = pct >= 98 ? "done" : pct > 0 ? "in-progress" : "not-started";
      await window.DB?.saveProgress?.(topicId, courseId, {
        position: Math.max(0, cur),
        duration: Math.max(0, dur || 0),
        percent: Math.max(0, Math.min(100, pct || 0)),
        status,
        updatedAt: Date.now()
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
      await save(track, { currentTime: 0, duration: inst?.duration ?? 0, percent: 0 });
    };
    const onBeforeUnload = () => {
      saveCurrent();
    };
    inst?.on?.("timeupdate", onTimeUpdate);
    inst?.on?.("pause", onPause);
    inst?.on?.("seeked", onSeeked);
    inst?.on?.("ended", onEnded);
    inst?.on?.("beforeTrackChange", onBeforeTrackChange);
    inst?.on?.("trackChange", onTrackChange);
    window.addEventListener("beforeunload", onBeforeUnload);
    routeDisposers.push(() => {
      inst?.off?.("timeupdate", onTimeUpdate);
      inst?.off?.("pause", onPause);
      inst?.off?.("seeked", onSeeked);
      inst?.off?.("ended", onEnded);
      inst?.off?.("beforeTrackChange", onBeforeTrackChange);
      inst?.off?.("trackChange", onTrackChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
    });
  };
  const setupCourseAutoPictureInPicture = () => {
    if (!playerEl || typeof window.IntersectionObserver !== "function") return;
    if (playerEl.dataset.pdAutoPipBound) return;
    playerEl.dataset.pdAutoPipBound = "true";
    let requestedForHiddenPass = false;
    const observer = new window.IntersectionObserver((entries) => {
      const entry = entries.find((item) => item.target === playerEl);
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
      window.PlasmaDeck?.Player?.requestActivePictureInPicture?.(document).catch?.(() => {
      });
    }, { threshold: [0, 0.2, 0.6, 1] });
    observer.observe(playerEl);
    routeDisposers.push(() => {
      observer.disconnect?.();
      delete playerEl?.dataset?.pdAutoPipBound;
    });
  };
  bindCoursePlayerProgress();
  setupCourseAutoPictureInPicture();
  document.querySelector("[data-save-timestamp]")?.addEventListener("click", () => {
    saveTimestampCapture({ createNote: false });
  });
  document.querySelector("[data-save-timestamp-note]")?.addEventListener("click", () => {
    saveTimestampCapture({ createNote: true });
  });
  document.querySelector("[data-save-chapter-cue]")?.addEventListener("click", () => {
    saveLearningCue("chapter");
  });
  document.querySelector("[data-save-transcript-cue]")?.addEventListener("click", () => {
    saveLearningCue("transcript");
  });
  document.querySelector("[data-review-learning-cues]")?.addEventListener("click", () => {
    renderLearningCueList();
  });
  document.querySelector("[data-export-active-learning-cues]")?.addEventListener("click", () => {
    exportActiveLearningCues();
  });
  document.querySelector("[data-apply-active-learning-cues]")?.addEventListener("click", () => {
    applyActiveLearningCues();
  });
  document.querySelector("[data-export-learning-cues]")?.addEventListener("click", () => {
    exportLearningCues();
  });
  document.querySelector("[data-import-learning-cues]")?.addEventListener("click", () => {
    importLearningCues();
  });
  learningMarkerListEl?.addEventListener("click", (event) => {
    const button = eventTargetEl(event)?.closest?.("[data-delete-learning-cue]");
    if (!button) return;
    deleteLearningCue(button.dataset.deleteLearningCue, Number(button.dataset.cueIndex));
  });
  window.PlasmaDeck?.bus.on?.("sync:message", onCourseSyncMessage);
  routeDisposers.push(() => window.PlasmaDeck?.bus.off?.("sync:message", onCourseSyncMessage));
  const pendingSession = consumePendingCourseSession();
  const pendingTopicId = sessionStorage.getItem("plasma_pending_topic");
  const pendingPosition = Number(sessionStorage.getItem("plasma_pending_position") || 0);
  if (pendingTopicId) sessionStorage.removeItem("plasma_pending_topic");
  if (pendingPosition) sessionStorage.removeItem("plasma_pending_position");
  const selectCourse = (courseId) => {
    const btn = listEl.querySelector(`[data-course-id="${courseId}"]`);
    if (!btn) return false;
    $$(".course-item", listEl).forEach((x) => x.classList.toggle("active", x === btn));
    courseFacetState.selectedCourseId = courseId;
    renderCourseDetail(courseId);
    return true;
  };
  const courseFilterRoot = document.querySelector(".courses-sidebar");
  if (courseFilterRoot && !courseFilterRoot.dataset.pdCourseFacetBound) {
    courseFilterRoot.dataset.pdCourseFacetBound = "true";
    courseFilterRoot.addEventListener("click", (event) => {
      const button = event.target?.closest?.("[data-course-filter]");
      if (!button) return;
      courseFacetState.filter = button.dataset.courseFilter || "all";
      courseFilterRoot.querySelectorAll("[data-course-filter]").forEach((btn) => {
        const active = btn === button;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
      });
      renderCourses(courseFacetState.query);
      const firstVisible = listEl.querySelector("[data-course-id]");
      if (firstVisible) {
        firstVisible.classList.add("active");
        courseFacetState.selectedCourseId = firstVisible.dataset.courseId || "";
        renderCourseDetail(courseFacetState.selectedCourseId);
      }
    });
  }
  if (pendingSession) {
    const pendingTrack = pendingSession.track || pendingSession.queue[pendingSession.queueIndex] || pendingSession.queue[0];
    const fallbackCourseId = pendingTrack?.courseId || pendingSession.queue.find((item) => item?.courseId)?.courseId;
    if (fallbackCourseId && selectCourse(fallbackCourseId)) {
      setTimeout(() => {
        const inst = playerEl?._pdPlayer;
        if (!inst) return;
        bindCoursePlayerProgress();
        if (inst.restoreSnapshot?.(pendingSession)) return;
        if (inst.loadPlaylist) {
          inst.loadPlaylist(pendingSession.queue, false);
          if (Number.isFinite(Number(pendingSession.queueIndex)) && Number(pendingSession.queueIndex) > 0) {
            try {
              inst.playAt?.(Number(pendingSession.queueIndex));
            } catch {
            }
            if (!pendingSession.playing) {
              try {
                inst.pause?.();
              } catch {
              }
            }
          } else if (pendingSession.playing) {
            try {
              inst.play?.();
            } catch {
            }
          }
          seekPlayerToPendingPosition(inst, pendingSession.currentTime);
        }
      }, 120);
      return routeController;
    }
  }
  if (pendingTopicId) {
    const t = allTopics.find((x) => x.topicId === pendingTopicId);
    if (t && selectCourse(t.courseId)) {
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
  const first = listEl.querySelector("[data-course-id]");
  if (first) {
    first.classList.add("active");
    renderCourseDetail(first.dataset.courseId);
  }
  return routeController;
}
export {
  mountCoursesView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3ZpZXdzL2NvdXJzZXNSb3V0ZS5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG1vdW50Q291cnNlc1ZpZXcoZGVwcyA9IHt9KSB7XG4gIGNvbnN0IHtcbiAgICBzZXRWaWV3LFxuICAgIGNyZWF0ZUVsZW1lbnQsXG4gICAgJCQsXG4gICAgZXZlbnRUYXJnZXRFbCxcbiAgICBzYWZlRXh0ZXJuYWxVcmwsXG4gICAgc2FmZU1lZGlhVXJsLFxuICAgIFJvdXRlcixcbiAgICBUb2FzdCA9IHdpbmRvdy5QbGFzbWFEZWNrPy5Ub2FzdCxcbiAgICBjb25zdW1lUGVuZGluZ0NvdXJzZVNlc3Npb24sXG4gICAgZm9ybWF0TWVkaWFDbG9jayxcbiAgICBlc2NhcGVIdG1sVGV4dCxcbiAgfSA9IGRlcHM7XG5cbiAgc2V0VmlldyhgXG4gICAgPHNlY3Rpb24gY2xhc3M9XCJ2aWV3IHZpZXctY291cnNlc1wiPlxuICAgICAgPGRpdiBjbGFzcz1cInBhZ2UtaGVhZGVyXCI+XG4gICAgICAgIDxoMSBjbGFzcz1cInBhZ2UtdGl0bGVcIj5Db3Vyc2VzPC9oMT5cbiAgICAgICAgPHAgY2xhc3M9XCJwYWdlLXN1YnRpdGxlXCI+QnJvd3NlIHlvdXIgY2F0YWxvZy48L3A+XG4gICAgICA8L2Rpdj5cblxuICAgICAgPGRpdiBjbGFzcz1cImNvdXJzZXMtc2hlbGxcIj5cbiAgICAgICAgPGFzaWRlIGNsYXNzPVwiY291cnNlcy1zaWRlYmFyXCI+XG4gICAgICAgICAgPGlucHV0IGNsYXNzPVwiaW5wdXRcIiBpZD1cImNvdXJzZXMtc2VhcmNoXCIgdHlwZT1cInNlYXJjaFwiIHBsYWNlaG9sZGVyPVwiU2VhcmNoIGNvdXJzZXMuLi5cIiAvPlxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJmaWx0ZXItcm93XCIgYXJpYS1sYWJlbD1cIkNvdXJzZSBmaWx0ZXJzXCIgc3R5bGU9XCJtYXJnaW4tdG9wOjEycHhcIj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJmaWx0ZXItY2hpcCBhY3RpdmVcIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1jb3Vyc2UtZmlsdGVyPVwiYWxsXCIgYXJpYS1wcmVzc2VkPVwidHJ1ZVwiPkFsbDwvYnV0dG9uPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImZpbHRlci1jaGlwXCIgdHlwZT1cImJ1dHRvblwiIGRhdGEtY291cnNlLWZpbHRlcj1cInZpZGVvXCIgYXJpYS1wcmVzc2VkPVwiZmFsc2VcIj5WaWRlbzwvYnV0dG9uPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImZpbHRlci1jaGlwXCIgdHlwZT1cImJ1dHRvblwiIGRhdGEtY291cnNlLWZpbHRlcj1cInBkZlwiIGFyaWEtcHJlc3NlZD1cImZhbHNlXCI+UERGPC9idXR0b24+XG4gICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiZmlsdGVyLWNoaXBcIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1jb3Vyc2UtZmlsdGVyPVwibWl4ZWRcIiBhcmlhLXByZXNzZWQ9XCJmYWxzZVwiPk1peGVkPC9idXR0b24+XG4gICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiZmlsdGVyLWNoaXBcIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1jb3Vyc2UtZmlsdGVyPVwibm9uZVwiIGFyaWEtcHJlc3NlZD1cImZhbHNlXCI+Tm8gbWVkaWE8L2J1dHRvbj5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJzdGFjay14c1wiIHN0eWxlPVwibWFyZ2luLXRvcDoxMnB4XCI+XG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cInRleHQtc20gdGV4dC1tdXRlZFwiPlNvdXJjZSBzY29wZTwvc3Bhbj5cbiAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJzZWxlY3RcIiBpZD1cImNvdXJzZXMtc291cmNlLXNjb3BlXCIgYXJpYS1sYWJlbD1cIkZpbHRlciBjb3Vyc2VzIGJ5IHNvdXJjZSBjb3VudFwiPlxuICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiYWxsXCI+QWxsIGNvdXJzZXM8L29wdGlvbj5cbiAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInNpbmdsZVwiPlNpbmdsZSBzb3VyY2U8L29wdGlvbj5cbiAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIm11bHRpXCI+TXVsdGlwbGUgc291cmNlczwvb3B0aW9uPlxuICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgICA8ZGl2IGlkPVwiY291cnNlcy1saXN0XCIgY2xhc3M9XCJjb3Vyc2VzLWxpc3RcIj48L2Rpdj5cbiAgICAgICAgPC9hc2lkZT5cblxuICAgICAgICA8bWFpbiBjbGFzcz1cImNvdXJzZXMtbWFpblwiPlxuICAgICAgICAgIDxkaXYgaWQ9XCJjb3Vyc2UtZGV0YWlsXCIgY2xhc3M9XCJjb3Vyc2UtZGV0YWlsXCI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY2FyZCBjYXJkLWZpbGxlZFwiPlxuICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY2FyZC1ib2R5XCI+XG4gICAgICAgICAgICAgICAgU2VsZWN0IGEgY291cnNlIG9uIHRoZSBsZWZ0LlxuICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgPGRpdiBjbGFzcz1cImNhcmQgY2FyZC1maWxsZWRcIiBzdHlsZT1cIm1hcmdpbi10b3A6MTJweFwiPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNhcmQtYm9keVwiPlxuICAgICAgICAgICAgICA8ZGl2IGlkPVwiY291cnNlLXBsYXllclwiIGRhdGEtcGxheWVyIGRhdGEtcGxheWVyLW9wdGlvbnM9J3tcInR5cGVcIjpcInZpZGVvXCIsXCJhdXRvcGxheVwiOmZhbHNlLFwiY29udHJvbHNcIjp0cnVlLFwidGhlbWVcIjpcImRhcmtcIn0nPjwvZGl2PlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICA8ZGl2IGNsYXNzPVwiY2FyZCBjYXJkLWZpbGxlZCB0aW1lc3RhbXAtbm90ZS1jYXJkXCIgc3R5bGU9XCJtYXJnaW4tdG9wOjEycHhcIj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjYXJkLWJvZHlcIj5cbiAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInRpbWVzdGFtcC1ub3RlLWdyaWRcIj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwidGltZXN0YW1wLW5vdGUtY29weVwiPlxuICAgICAgICAgICAgICAgICAgPGgzPlRpbWVzdGFtcCBub3RlPC9oMz5cbiAgICAgICAgICAgICAgICAgIDxwIGNsYXNzPVwidGV4dC1tdXRlZFwiPkNhcHR1cmUgdGhlIGN1cnJlbnQgcGxheWJhY2sgcG9zaXRpb24gYXMgYSBib29rbWFyayBvciBsaW5rZWQgbm90ZS48L3A+XG4gICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwidGltZXN0YW1wLW5vdGUtc3RhdHVzXCIgZGF0YS10aW1lc3RhbXAtbm90ZS1zdGF0dXMgYXJpYS1saXZlPVwicG9saXRlXCI+PC9kaXY+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInRpbWVzdGFtcC1ub3RlLWZvcm1cIj5cbiAgICAgICAgICAgICAgICAgIDxpbnB1dCBjbGFzcz1cImlucHV0IGlucHV0LXNtXCIgZGF0YS10aW1lc3RhbXAtbm90ZS10aXRsZSBwbGFjZWhvbGRlcj1cIlRpdGxlXCIgLz5cbiAgICAgICAgICAgICAgICAgIDx0ZXh0YXJlYSBjbGFzcz1cImlucHV0IHRpbWVzdGFtcC1ub3RlLXRleHRhcmVhXCIgZGF0YS10aW1lc3RhbXAtbm90ZS1ib2R5IHJvd3M9XCIzXCIgcGxhY2Vob2xkZXI9XCJOb3RlXCI+PC90ZXh0YXJlYT5cbiAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJidXR0b24tcm93XCI+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWdob3N0IGJ0bi1zbVwiIHR5cGU9XCJidXR0b25cIiBkYXRhLXNhdmUtdGltZXN0YW1wPlNhdmUgYm9va21hcms8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tcHJpbWFyeSBidG4tc21cIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1zYXZlLXRpbWVzdGFtcC1ub3RlPlNhdmUgbGlua2VkIG5vdGU8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImxlYXJuaW5nLW1hcmtlci1mb3JtXCIgc3R5bGU9XCJtYXJnaW4tdG9wOjEwcHhcIj5cbiAgICAgICAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiaW5wdXQgaW5wdXQtc21cIiBkYXRhLWxlYXJuaW5nLW1hcmtlci10ZXh0IHBsYWNlaG9sZGVyPVwiQ2hhcHRlciB0aXRsZSBvciB0cmFuc2NyaXB0IGxpbmVcIiAvPlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYnV0dG9uLXJvd1wiPlxuICAgICAgICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWdob3N0IGJ0bi1zbVwiIHR5cGU9XCJidXR0b25cIiBkYXRhLXNhdmUtY2hhcHRlci1jdWU+QWRkIGNoYXB0ZXI8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1naG9zdCBidG4tc21cIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1zYXZlLXRyYW5zY3JpcHQtY3VlPkFkZCB0cmFuc2NyaXB0IGxpbmU8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJidXR0b24tcm93XCI+XG4gICAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZ2hvc3QgYnRuLXNtXCIgdHlwZT1cImJ1dHRvblwiIGRhdGEtcmV2aWV3LWxlYXJuaW5nLWN1ZXM+UmV2aWV3IGN1ZXM8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1naG9zdCBidG4tc21cIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1leHBvcnQtYWN0aXZlLWxlYXJuaW5nLWN1ZXM+RWRpdCBhY3RpdmU8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1naG9zdCBidG4tc21cIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1hcHBseS1hY3RpdmUtbGVhcm5pbmctY3Vlcz5BcHBseSBhY3RpdmU8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1naG9zdCBidG4tc21cIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1leHBvcnQtbGVhcm5pbmctY3Vlcz5FeHBvcnQgSlNPTjwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWdob3N0IGJ0bi1zbVwiIHR5cGU9XCJidXR0b25cIiBkYXRhLWltcG9ydC1sZWFybmluZy1jdWVzPkltcG9ydCBKU09OPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8dGV4dGFyZWEgY2xhc3M9XCJpbnB1dCB0aW1lc3RhbXAtbm90ZS10ZXh0YXJlYVwiIGRhdGEtbGVhcm5pbmctbWFya2VyLWpzb24gcm93cz1cIjNcIiBwbGFjZWhvbGRlcj1cIkNoYXB0ZXIvdHJhbnNjcmlwdCBKU09OXCI+PC90ZXh0YXJlYT5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImxlYXJuaW5nLW1hcmtlci1saXN0XCIgZGF0YS1sZWFybmluZy1tYXJrZXItbGlzdD48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInRpbWVzdGFtcC1ub3RlLXN0YXR1c1wiIGRhdGEtbGVhcm5pbmctbWFya2VyLXN0YXR1cyBhcmlhLWxpdmU9XCJwb2xpdGVcIj48L2Rpdj5cbiAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L21haW4+XG4gICAgICA8L2Rpdj5cbiAgICA8L3NlY3Rpb24+XG4gIGApO1xuXG4gIC8vIEVuc3VyZSBjYXRhbG9nIGxvYWRlZFxuICBhd2FpdCB3aW5kb3cuRGF0YVN0b3JlPy5pbml0Py4oKTtcbiAgY29uc3QgbGlzdEVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvdXJzZXMtbGlzdCcpO1xuICBjb25zdCBzZWFyY2hFbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjb3Vyc2VzLXNlYXJjaCcpO1xuICBjb25zdCBzb3VyY2VTY29wZUVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvdXJzZXMtc291cmNlLXNjb3BlJyk7XG4gIGNvbnN0IGRldGFpbEVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvdXJzZS1kZXRhaWwnKTtcbiAgbGV0IHBsYXllckVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvdXJzZS1wbGF5ZXInKTtcbiAgcGxheWVyRWwgPSB3aW5kb3cuUGxhc21hRGVjaz8uTWluaVBsYXllcj8ucmVzdG9yZVBsYXllcj8uKHBsYXllckVsKSB8fCBwbGF5ZXJFbDtcbiAgY29uc3QgdGltZXN0YW1wU3RhdHVzRWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS10aW1lc3RhbXAtbm90ZS1zdGF0dXNdJyk7XG4gIGNvbnN0IGxlYXJuaW5nTWFya2VyU3RhdHVzRWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1sZWFybmluZy1tYXJrZXItc3RhdHVzXScpO1xuICBjb25zdCBsZWFybmluZ01hcmtlckxpc3RFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWxlYXJuaW5nLW1hcmtlci1saXN0XScpO1xuICBjb25zdCBsZWFybmluZ01hcmtlckpzb25FbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWxlYXJuaW5nLW1hcmtlci1qc29uXScpO1xuICBjb25zdCByb3V0ZURpc3Bvc2VycyA9IFtdO1xuICBsZXQgZmx1c2hQbGF5ZXJQcm9ncmVzcyA9ICgpID0+IFByb21pc2UucmVzb2x2ZSgpO1xuICBsZXQgZGV0YWlsUmVuZGVyVG9rZW4gPSAwO1xuICBsZXQgZGV0YWlsUmVuZGVyVGltZXIgPSBudWxsO1xuICBjb25zdCBjYW5jZWxEZXRhaWxSZW5kZXIgPSAoKSA9PiB7XG4gICAgZGV0YWlsUmVuZGVyVG9rZW4gKz0gMTtcbiAgICBpZiAoZGV0YWlsUmVuZGVyVGltZXIpIHtcbiAgICAgIGNsZWFyVGltZW91dChkZXRhaWxSZW5kZXJUaW1lcik7XG4gICAgICBkZXRhaWxSZW5kZXJUaW1lciA9IG51bGw7XG4gICAgfVxuICB9O1xuICBjb25zdCByb3V0ZUNvbnRyb2xsZXIgPSB7XG4gICAgYmVmb3JlTGVhdmUoKSB7XG4gICAgICB0cnkgeyByZXR1cm4gZmx1c2hQbGF5ZXJQcm9ncmVzcygpOyB9IGNhdGNoIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuICAgIH0sXG4gICAgdW5tb3VudCgpIHtcbiAgICAgIGNhbmNlbERldGFpbFJlbmRlcigpO1xuICAgICAgdHJ5IHsgZmx1c2hQbGF5ZXJQcm9ncmVzcygpOyB9IGNhdGNoIHt9XG4gICAgICBsZXQgYWRvcHRlZFBsYXllciA9IGZhbHNlO1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgc25hcHNob3QgPSB3aW5kb3cuUGxhc21hRGVjaz8uUGxheWVyPy5nZXRBY3RpdmVTbmFwc2hvdD8uKGRvY3VtZW50KTtcbiAgICAgICAgaWYgKHNuYXBzaG90ICYmIHBsYXllckVsPy5fcGRQbGF5ZXIpIHtcbiAgICAgICAgICB3aW5kb3cuUGxhc21hRGVjaz8uTWluaVBsYXllcj8uYWRvcHRQbGF5ZXI/LihwbGF5ZXJFbCwgc25hcHNob3QsIHtcbiAgICAgICAgICAgIGRpc3Bvc2UoKSB7XG4gICAgICAgICAgICAgIHJvdXRlRGlzcG9zZXJzLnNwbGljZSgwKS5mb3JFYWNoKGZuID0+IHtcbiAgICAgICAgICAgICAgICB0cnkgeyBmbigpOyB9IGNhdGNoIHt9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBhZG9wdGVkUGxheWVyID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIGlmIChzbmFwc2hvdCkge1xuICAgICAgICAgIHdpbmRvdy5QbGFzbWFEZWNrPy5NaW5pUGxheWVyPy5zaG93Py4oc25hcHNob3QpO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIHt9XG4gICAgICBpZiAoIWFkb3B0ZWRQbGF5ZXIpIHtcbiAgICAgICAgcm91dGVEaXNwb3NlcnMuc3BsaWNlKDApLmZvckVhY2goZm4gPT4ge1xuICAgICAgICAgIHRyeSB7IGZuKCk7IH0gY2F0Y2gge31cbiAgICAgICAgfSk7XG4gICAgICAgIHRyeSB7IHdpbmRvdy5QbGFzbWFEZWNrPy5QbGF5ZXI/LmRlc3Ryb3lBbGw/Lihkb2N1bWVudCk7IH0gY2F0Y2gge31cbiAgICAgIH1cbiAgICB9LFxuICB9O1xuICBpZiAoIWxpc3RFbCB8fCAhZGV0YWlsRWwpIHJldHVybjtcblxuICAvLyBFbnN1cmUgcGxheWVyIGF1dG8taW5pdHMgZm9yIHRoZSBpbnNlcnRlZCBlbGVtZW50XG4gIHRyeSB7IHdpbmRvdy5QbGFzbWFEZWNrPy5QbGF5ZXI/LmluaXQ/LigpOyB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblxuICBjb25zdCBNRURJQV9DVUVTX0tFWSA9ICdwbGFzbWEtY291cnNlLW1lZGlhLWN1ZXMnO1xuICBsZXQgYXV0aG9yZWRNZWRpYUN1ZXMgPSB7fTtcbiAgdHJ5IHtcbiAgICBjb25zdCBzYXZlZEN1ZXMgPSBhd2FpdCB3aW5kb3cuREI/LmdldFNldHRpbmc/LihNRURJQV9DVUVTX0tFWSk7XG4gICAgYXV0aG9yZWRNZWRpYUN1ZXMgPSBzYXZlZEN1ZXMgJiYgdHlwZW9mIHNhdmVkQ3VlcyA9PT0gJ29iamVjdCcgPyBzYXZlZEN1ZXMgOiB7fTtcbiAgfSBjYXRjaCB7XG4gICAgYXV0aG9yZWRNZWRpYUN1ZXMgPSB7fTtcbiAgfVxuICBjb25zdCBhbGxDb3Vyc2VzID0gd2luZG93LkRhdGFTdG9yZT8uYWxsQ291cnNlcz8uKCkgPz8gW107XG4gIGNvbnN0IGFsbFRvcGljcyA9IHdpbmRvdy5EYXRhU3RvcmU/LmFsbFRvcGljcz8uKCkgPz8gW107XG4gIGNvbnN0IHRvcGljc0J5Q291cnNlID0gYWxsVG9waWNzLnJlZHVjZSgoYWNjLCB0KSA9PiB7XG4gICAgKGFjY1t0LmNvdXJzZUlkXSA9IGFjY1t0LmNvdXJzZUlkXSA/PyBbXSkucHVzaCh0KTtcbiAgICByZXR1cm4gYWNjO1xuICB9LCB7fSk7XG4gIGNvbnN0IGNvdXJzZUZhY2V0U3RhdGUgPSB7XG4gICAgcXVlcnk6ICcnLFxuICAgIGZpbHRlcjogJ2FsbCcsXG4gICAgc291cmNlU2NvcGU6ICdhbGwnLFxuICAgIHNlbGVjdGVkQ291cnNlSWQ6ICcnLFxuICB9O1xuICBjb25zdCBzb3VyY2VLZXkgPSAodG9waWMpID0+IGAke3RvcGljLnNvdXJjZUluZGV4ID8/IDB9fCR7dG9waWMuc291cmNlTGFiZWwgPz8gJ1NvdXJjZSd9YDtcbiAgY29uc3Qgc291cmNlTGFiZWxGcm9tS2V5ID0gKGtleSkgPT4gU3RyaW5nKGtleSkuc3BsaXQoJ3wnKS5zbGljZSgxKS5qb2luKCd8JykgfHwgJ1NvdXJjZSc7XG4gIGNvbnN0IG1lZGlhQ2xhc3MgPSAodG9waWMpID0+IHtcbiAgICBjb25zdCBoYXNWaWRlbyA9ICh0b3BpYy52aWRlb3M/Lmxlbmd0aCA/PyAwKSA+IDA7XG4gICAgY29uc3QgaGFzUGRmID0gKHRvcGljLnBkZnM/Lmxlbmd0aCA/PyAwKSA+IDA7XG4gICAgaWYgKGhhc1ZpZGVvICYmIGhhc1BkZikgcmV0dXJuICd2aWRlby1wZGYnO1xuICAgIGlmIChoYXNWaWRlbykgcmV0dXJuICd2aWRlbyc7XG4gICAgaWYgKGhhc1BkZikgcmV0dXJuICdwZGYnO1xuICAgIHJldHVybiAnbm9uZSc7XG4gIH07XG4gIGNvbnN0IHBhc3NDb3Vyc2VGaWx0ZXIgPSAodG9waWMsIHN0YXR1cywgZmlsdGVyKSA9PiB7XG4gICAgaWYgKGZpbHRlciA9PT0gJ2FsbCcpIHJldHVybiB0cnVlO1xuICAgIGlmIChmaWx0ZXIgPT09ICdkb25lJyB8fCBmaWx0ZXIgPT09ICdpbi1wcm9ncmVzcycgfHwgZmlsdGVyID09PSAnbm90LXN0YXJ0ZWQnKSByZXR1cm4gc3RhdHVzID09PSBmaWx0ZXI7XG4gICAgcmV0dXJuIG1lZGlhQ2xhc3ModG9waWMpID09PSBmaWx0ZXIgfHwgKGZpbHRlciA9PT0gJ3ZpZGVvJyAmJiAodG9waWMudmlkZW9zPy5sZW5ndGggPz8gMCkgPiAwKSB8fCAoZmlsdGVyID09PSAncGRmJyAmJiAodG9waWMucGRmcz8ubGVuZ3RoID8/IDApID4gMCk7XG4gIH07XG4gIGNvbnN0IHN0YXR1c0luZm8gPSAoc3RhdHVzKSA9PiB7XG4gICAgY29uc3QgbGFiZWxzID0ge1xuICAgICAgZG9uZTogJ0RvbmUnLFxuICAgICAgJ2luLXByb2dyZXNzJzogJ0luIHByb2dyZXNzJyxcbiAgICAgICdub3Qtc3RhcnRlZCc6ICdOb3Qgc3RhcnRlZCcsXG4gICAgfTtcbiAgICBjb25zdCBrZXkgPSBsYWJlbHNbc3RhdHVzXSA/IHN0YXR1cyA6ICdub3Qtc3RhcnRlZCc7XG4gICAgcmV0dXJuIHsga2V5LCBsYWJlbDogbGFiZWxzW2tleV0gfTtcbiAgfTtcbiAgY29uc3Qgc3RhdHVzQmFkZ2VOb2RlID0gKHN0YXR1cykgPT4ge1xuICAgIGNvbnN0IHsga2V5LCBsYWJlbCB9ID0gc3RhdHVzSW5mbyhzdGF0dXMpO1xuICAgIHJldHVybiBjcmVhdGVFbGVtZW50KCdzcGFuJywge1xuICAgICAgY2xhc3M6IGBiYWRnZSBiYWRnZS1zdGF0dXMgYmFkZ2Utc3RhdHVzLSR7a2V5fWAsXG4gICAgICAnYXJpYS1sYWJlbCc6IGBTdGF0dXM6ICR7bGFiZWx9YCxcbiAgICAgICdkYXRhLXN0YXR1cyc6IGtleSxcbiAgICB9LCBsYWJlbCk7XG4gIH07XG4gIGNvbnN0IGJhZGdlTm9kZSA9IChsYWJlbCkgPT4gY3JlYXRlRWxlbWVudCgnc3BhbicsIHsgY2xhc3M6ICdiYWRnZScgfSwgbGFiZWwpO1xuICBjb25zdCBhY3Rpb25CdXR0b24gPSAoYWN0aW9uLCBsYWJlbCkgPT4gY3JlYXRlRWxlbWVudCgnYnV0dG9uJywge1xuICAgIGNsYXNzOiAnYnRuIGJ0bi1naG9zdCBidG4tc20nLFxuICAgIHR5cGU6ICdidXR0b24nLFxuICAgICdkYXRhLWFjdGlvbic6IGFjdGlvbixcbiAgfSwgbGFiZWwpO1xuICBjb25zdCBjb3Vyc2VNZXRhQnlJZCA9IG5ldyBNYXAoYWxsQ291cnNlcy5tYXAoKGNvdXJzZSkgPT4ge1xuICAgIGNvbnN0IHRvcGljcyA9IHRvcGljc0J5Q291cnNlW2NvdXJzZS5pZF0gPz8gW107XG4gICAgY29uc3QgaGFzVmlkZW8gPSB0b3BpY3Muc29tZSgodG9waWMpID0+ICh0b3BpYy52aWRlb3M/Lmxlbmd0aCA/PyAwKSA+IDApO1xuICAgIGNvbnN0IGhhc1BkZiA9IHRvcGljcy5zb21lKCh0b3BpYykgPT4gKHRvcGljLnBkZnM/Lmxlbmd0aCA/PyAwKSA+IDApO1xuICAgIGNvbnN0IGhhc05vTWVkaWEgPSB0b3BpY3Muc29tZSgodG9waWMpID0+ICh0b3BpYy52aWRlb3M/Lmxlbmd0aCA/PyAwKSA9PT0gMCAmJiAodG9waWMucGRmcz8ubGVuZ3RoID8/IDApID09PSAwKTtcbiAgICBjb25zdCBzb3VyY2VDb3VudCA9IG5ldyBTZXQodG9waWNzLm1hcChzb3VyY2VLZXkpKS5zaXplO1xuICAgIHJldHVybiBbY291cnNlLmlkLCB7XG4gICAgICB0b3BpY0NvdW50OiB0b3BpY3MubGVuZ3RoLFxuICAgICAgaGFzVmlkZW8sXG4gICAgICBoYXNQZGYsXG4gICAgICBoYXNOb01lZGlhLFxuICAgICAgbWVkaWFDbGFzczogaGFzVmlkZW8gJiYgaGFzUGRmID8gJ21peGVkJyA6IGhhc1ZpZGVvID8gJ3ZpZGVvJyA6IGhhc1BkZiA/ICdwZGYnIDogJ25vbmUnLFxuICAgICAgc291cmNlQ291bnQsXG4gICAgfV07XG4gIH0pKTtcbiAgY29uc3Qgc2Vla1BsYXllclRvUGVuZGluZ1Bvc2l0aW9uID0gKGluc3QsIHBvc2l0aW9uKSA9PiB7XG4gICAgY29uc3Qgc2Vjb25kcyA9IE51bWJlcihwb3NpdGlvbik7XG4gICAgaWYgKCFpbnN0Py5zZWVrVG8gfHwgIU51bWJlci5pc0Zpbml0ZShzZWNvbmRzKSB8fCBzZWNvbmRzIDw9IDApIHJldHVybjtcbiAgICBjb25zdCBzZWVrID0gKCkgPT4ge1xuICAgICAgdHJ5IHsgaW5zdC5zZWVrVG8oc2Vjb25kcyk7IH0gY2F0Y2gge31cbiAgICB9O1xuICAgIHNlZWsoKTtcbiAgICB0cnkgeyBpbnN0Ll9tZWRpYT8uYWRkRXZlbnRMaXN0ZW5lcj8uKCdsb2FkZWRtZXRhZGF0YScsIHNlZWssIHsgb25jZTogdHJ1ZSB9KTsgfSBjYXRjaCB7fVxuICAgIHNldFRpbWVvdXQoc2VlaywgODApO1xuICB9O1xuICBjb25zdCBzZXRUaW1lc3RhbXBTdGF0dXMgPSAobWVzc2FnZSwgdG9uZSA9ICdtdXRlZCcpID0+IHtcbiAgICBpZiAoIXRpbWVzdGFtcFN0YXR1c0VsKSByZXR1cm47XG4gICAgdGltZXN0YW1wU3RhdHVzRWwudGV4dENvbnRlbnQgPSBtZXNzYWdlO1xuICAgIHRpbWVzdGFtcFN0YXR1c0VsLmRhdGFzZXQudG9uZSA9IHRvbmU7XG4gIH07XG4gIGNvbnN0IHNldExlYXJuaW5nTWFya2VyU3RhdHVzID0gKG1lc3NhZ2UsIHRvbmUgPSAnbXV0ZWQnKSA9PiB7XG4gICAgaWYgKCFsZWFybmluZ01hcmtlclN0YXR1c0VsKSByZXR1cm47XG4gICAgbGVhcm5pbmdNYXJrZXJTdGF0dXNFbC50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG4gICAgbGVhcm5pbmdNYXJrZXJTdGF0dXNFbC5kYXRhc2V0LnRvbmUgPSB0b25lO1xuICB9O1xuICBjb25zdCBjdXJyZW50UGxheWVyQ29udGV4dCA9ICgpID0+IHtcbiAgICBjb25zdCBpbnN0ID0gcGxheWVyRWw/Ll9wZFBsYXllcjtcbiAgICBjb25zdCBzbmFwc2hvdCA9IGluc3Q/LnNuYXBzaG90Py4oKTtcbiAgICBjb25zdCBxdWV1ZUluZGV4ID0gTnVtYmVyKHNuYXBzaG90Py5xdWV1ZUluZGV4ID8/IGluc3Q/LnRyYWNrSW5kZXggPz8gMCk7XG4gICAgY29uc3QgYWN0aXZlVHJhY2sgPSBpbnN0Py5xdWV1ZT8uW051bWJlci5pc0Zpbml0ZShxdWV1ZUluZGV4KSA/IHF1ZXVlSW5kZXggOiAwXVxuICAgICAgfHwgc25hcHNob3Q/LnF1ZXVlPy5bTnVtYmVyLmlzRmluaXRlKHF1ZXVlSW5kZXgpID8gcXVldWVJbmRleCA6IDBdXG4gICAgICB8fCBzbmFwc2hvdD8udHJhY2tcbiAgICAgIHx8IG51bGw7XG4gICAgY29uc3QgdHJhY2sgPSBzbmFwc2hvdD8udHJhY2sgfHwgYWN0aXZlVHJhY2s7XG4gICAgaWYgKCF0cmFjaykgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgY3VycmVudFRpbWUgPSBzbmFwc2hvdD8uY3VycmVudFRpbWUgPz8gaW5zdD8uY3VycmVudFRpbWUgPz8gMDtcbiAgICBjb25zdCBkdXJhdGlvbiA9IHNuYXBzaG90Py5kdXJhdGlvbiA/PyBpbnN0Py5kdXJhdGlvbiA/PyAwO1xuICAgIHJldHVybiB7XG4gICAgICBpbnN0LFxuICAgICAgdHJhY2ssXG4gICAgICBhY3RpdmVUcmFjayxcbiAgICAgIHRvcGljSWQ6IHRyYWNrLnRvcGljSWQsXG4gICAgICBjb3Vyc2VJZDogdHJhY2suY291cnNlSWQsXG4gICAgICBjdXJyZW50VGltZTogTWF0aC5tYXgoMCwgTnVtYmVyKGN1cnJlbnRUaW1lKSB8fCAwKSxcbiAgICAgIGR1cmF0aW9uOiBNYXRoLm1heCgwLCBOdW1iZXIoZHVyYXRpb24pIHx8IDApLFxuICAgIH07XG4gIH07XG4gIGNvbnN0IGN1ZUxpc3QgPSAodmFsdWUpID0+IEFycmF5LmlzQXJyYXkodmFsdWUpID8gdmFsdWUuZmlsdGVyKEJvb2xlYW4pIDogW107XG4gIGNvbnN0IGN1ZVRpbWUgPSAoY3VlKSA9PiBNYXRoLm1heCgwLCBOdW1iZXIoY3VlPy50aW1lID8/IGN1ZT8uc3RhcnQgPz8gMCkgfHwgMCk7XG4gIGNvbnN0IGN1ZUxhYmVsID0gKGN1ZSkgPT4gU3RyaW5nKGN1ZT8udGl0bGUgPz8gY3VlPy50ZXh0ID8/ICcnKS50cmltKCk7XG4gIGNvbnN0IGN1ZUlkZW50aXR5ID0gKGN1ZSkgPT4gW1xuICAgIFN0cmluZyhjdWU/LmNyZWF0ZWRBdCA/PyAnJyksXG4gICAgU3RyaW5nKGN1ZVRpbWUoY3VlKSksXG4gICAgY3VlTGFiZWwoY3VlKSxcbiAgXS5qb2luKCd8Jyk7XG4gIGNvbnN0IG1lcmdlZEN1ZXMgPSAodG9waWMsIGtleSwgZmFsbGJhY2tLZXkpID0+IFtcbiAgICAuLi5jdWVMaXN0KHRvcGljW2tleV0gPz8gKGZhbGxiYWNrS2V5ID8gdG9waWNbZmFsbGJhY2tLZXldIDogdW5kZWZpbmVkKSksXG4gICAgLi4uY3VlTGlzdChhdXRob3JlZE1lZGlhQ3Vlcz8uW3RvcGljLnRvcGljSWRdPy5ba2V5XSksXG4gIF07XG4gIGNvbnN0IGNvdXJzZU1lZGlhVHJhY2sgPSAodG9waWMsIHVybCwgY291cnNlSWQpID0+ICh7XG4gICAgdGl0bGU6IHRvcGljLnRpdGxlLFxuICAgIHNyYzogdXJsLFxuICAgIGFydGlzdDogdG9waWMuY291cnNlVGl0bGUgPz8gY291cnNlSWQsXG4gICAgdG9waWNJZDogdG9waWMudG9waWNJZCxcbiAgICBjb3Vyc2VJZCxcbiAgICBjaGFwdGVyczogbWVyZ2VkQ3Vlcyh0b3BpYywgJ2NoYXB0ZXJzJywgJ2NoYXB0ZXJNYXJrZXJzJyksXG4gICAgdHJhbnNjcmlwdDogbWVyZ2VkQ3Vlcyh0b3BpYywgJ3RyYW5zY3JpcHQnKSxcbiAgICBjYXB0aW9uczogdG9waWMuY2FwdGlvbnMsXG4gICAgY2FwdGlvblRyYWNrczogdG9waWMuY2FwdGlvblRyYWNrcyA/PyB0b3BpYy5zdWJ0aXRsZXMsXG4gIH0pO1xuICBjb25zdCBjdWVEZWR1cGVLZXkgPSAodHlwZSwgY3VlKSA9PiBgJHt0eXBlfXwke2N1ZVRpbWUoY3VlKS50b0ZpeGVkKDMpfXwke2N1ZUxhYmVsKGN1ZSkudG9Mb3dlckNhc2UoKX1gO1xuICBjb25zdCBhaVJlYWR5ID0gYXN5bmMgKCkgPT4ge1xuICAgIHRyeSB7IHJldHVybiBCb29sZWFuKChhd2FpdCB3aW5kb3cuUGxhc21hRGVjaz8uQUk/LnN0YXR1cz8uKCkpPy5hdmFpbGFibGUpOyB9IGNhdGNoIHsgcmV0dXJuIGZhbHNlOyB9XG4gIH07XG4gIGNvbnN0IGNvdXJzZVN1bW1hcnlJbnB1dCA9IChjb3Vyc2UsIHRvcGljcykgPT4gW1xuICAgIGBDb3Vyc2U6ICR7Y291cnNlLnRpdGxlIHx8IGNvdXJzZS5pZH1gLFxuICAgIGBUb3BpY3M6ICR7dG9waWNzLmxlbmd0aH1gLFxuICAgIC4uLnRvcGljcy5zbGljZSgwLCAxMjApLm1hcCh0b3BpYyA9PiBgLSAke3RvcGljLnNvdXJjZUxhYmVsIHx8ICdTb3VyY2UnfTogJHt0b3BpYy50aXRsZSB8fCAnVW50aXRsZWQgdG9waWMnfWApLFxuICBdLmpvaW4oJ1xcbicpLnNsaWNlKDAsIDE2MDAwKTtcbiAgY29uc3Qgbm9ybWFsaXplQ3VlVGltZSA9IChjdWUsIG1heFRpbWUsIHN0YXRzKSA9PiB7XG4gICAgY29uc3QgcmF3ID0gTnVtYmVyKGN1ZT8udGltZSA/PyBjdWU/LnN0YXJ0ID8/IDApO1xuICAgIGxldCB0aW1lID0gTnVtYmVyLmlzRmluaXRlKHJhdykgPyBNYXRoLm1heCgwLCByYXcpIDogMDtcbiAgICBpZiAoTnVtYmVyLmlzRmluaXRlKG1heFRpbWUpICYmIG1heFRpbWUgPiAwICYmIHRpbWUgPiBtYXhUaW1lKSB7XG4gICAgICB0aW1lID0gbWF4VGltZTtcbiAgICAgIHN0YXRzLmNsYW1wZWQgKz0gMTtcbiAgICB9XG4gICAgcmV0dXJuIHRpbWU7XG4gIH07XG4gIGNvbnN0IG5vcm1hbGl6ZUN1ZUxpc3QgPSAoaXRlbXMsIHR5cGUsIG1heFRpbWUsIHN0YXRzKSA9PiB7XG4gICAgY29uc3Qgc2VlbiA9IG5ldyBTZXQoKTtcbiAgICByZXR1cm4gY3VlTGlzdChpdGVtcylcbiAgICAgIC5tYXAoKGN1ZSkgPT4ge1xuICAgICAgICBjb25zdCB0aW1lID0gbm9ybWFsaXplQ3VlVGltZShjdWUsIG1heFRpbWUsIHN0YXRzKTtcbiAgICAgICAgY29uc3QgbGFiZWwgPSBjdWVMYWJlbChjdWUpO1xuICAgICAgICBpZiAoIWxhYmVsKSB7XG4gICAgICAgICAgc3RhdHMuZHJvcHBlZCArPSAxO1xuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSB0eXBlID09PSAnY2hhcHRlcnMnXG4gICAgICAgICAgPyB7IC4uLmN1ZSwgdGltZSwgdGl0bGU6IGxhYmVsLCBhdXRob3JlZDogY3VlLmF1dGhvcmVkID8/IHRydWUgfVxuICAgICAgICAgIDogeyAuLi5jdWUsIHN0YXJ0OiB0aW1lLCB0ZXh0OiBsYWJlbCwgYXV0aG9yZWQ6IGN1ZS5hdXRob3JlZCA/PyB0cnVlIH07XG4gICAgICAgIGNvbnN0IGtleSA9IGN1ZURlZHVwZUtleSh0eXBlLCBub3JtYWxpemVkKTtcbiAgICAgICAgaWYgKHNlZW4uaGFzKGtleSkpIHtcbiAgICAgICAgICBzdGF0cy5kZWR1cGVkICs9IDE7XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgc2Vlbi5hZGQoa2V5KTtcbiAgICAgICAgc3RhdHMua2VwdCArPSAxO1xuICAgICAgICByZXR1cm4gbm9ybWFsaXplZDtcbiAgICAgIH0pXG4gICAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgICAuc29ydCgoYSwgYikgPT4gY3VlVGltZShhKSAtIGN1ZVRpbWUoYikpO1xuICB9O1xuICBjb25zdCBub3JtYWxpemVJbXBvcnRlZEN1ZXMgPSAodmFsdWUsIG9wdGlvbnMgPSB7fSkgPT4ge1xuICAgIGNvbnN0IHN0YXRzID0gb3B0aW9ucy5zdGF0cyB8fCB7IGtlcHQ6IDAsIGRyb3BwZWQ6IDAsIGRlZHVwZWQ6IDAsIGNsYW1wZWQ6IDAgfTtcbiAgICBpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSB7fTtcbiAgICBPYmplY3QuZW50cmllcyh2YWx1ZSkuZm9yRWFjaCgoW3RvcGljSWQsIGN1ZXNdKSA9PiB7XG4gICAgICBpZiAoIWN1ZXMgfHwgdHlwZW9mIGN1ZXMgIT09ICdvYmplY3QnIHx8IEFycmF5LmlzQXJyYXkoY3VlcykpIHJldHVybjtcbiAgICAgIGNvbnN0IGNoYXB0ZXJzID0gbm9ybWFsaXplQ3VlTGlzdChjdWVzLmNoYXB0ZXJzLCAnY2hhcHRlcnMnLCBvcHRpb25zLm1heFRpbWUsIHN0YXRzKTtcbiAgICAgIGNvbnN0IHRyYW5zY3JpcHQgPSBub3JtYWxpemVDdWVMaXN0KGN1ZXMudHJhbnNjcmlwdCwgJ3RyYW5zY3JpcHQnLCBvcHRpb25zLm1heFRpbWUsIHN0YXRzKTtcbiAgICAgIG5vcm1hbGl6ZWRbdG9waWNJZF0gPSB7XG4gICAgICAgIC4uLihjaGFwdGVycy5sZW5ndGggPyB7IGNoYXB0ZXJzIH0gOiB7fSksXG4gICAgICAgIC4uLih0cmFuc2NyaXB0Lmxlbmd0aCA/IHsgdHJhbnNjcmlwdCB9IDoge30pLFxuICAgICAgfTtcbiAgICB9KTtcbiAgICByZXR1cm4gbm9ybWFsaXplZDtcbiAgfTtcbiAgY29uc3QgY3VlSW1wb3J0U3VtbWFyeSA9IChzdGF0cywgcHJlZml4KSA9PiB7XG4gICAgY29uc3QgZGV0YWlscyA9IFtdO1xuICAgIGlmIChzdGF0cy5rZXB0KSBkZXRhaWxzLnB1c2goYCR7c3RhdHMua2VwdH0ga2VwdGApO1xuICAgIGlmIChzdGF0cy5kZWR1cGVkKSBkZXRhaWxzLnB1c2goYCR7c3RhdHMuZGVkdXBlZH0gZHVwbGljYXRlJHtzdGF0cy5kZWR1cGVkID09PSAxID8gJycgOiAncyd9IHJlbW92ZWRgKTtcbiAgICBpZiAoc3RhdHMuY2xhbXBlZCkgZGV0YWlscy5wdXNoKGAke3N0YXRzLmNsYW1wZWR9IHRpbWUke3N0YXRzLmNsYW1wZWQgPT09IDEgPyAnJyA6ICdzJ30gY2xhbXBlZGApO1xuICAgIGlmIChzdGF0cy5kcm9wcGVkKSBkZXRhaWxzLnB1c2goYCR7c3RhdHMuZHJvcHBlZH0gaW52YWxpZCBjdWUke3N0YXRzLmRyb3BwZWQgPT09IDEgPyAnJyA6ICdzJ30gc2tpcHBlZGApO1xuICAgIHJldHVybiBgJHtwcmVmaXh9JHtkZXRhaWxzLmxlbmd0aCA/IGAgKCR7ZGV0YWlscy5qb2luKCcsICcpfSlgIDogJyd9LmA7XG4gIH07XG4gIGNvbnN0IHN5bmNBY3RpdmVUcmFja0N1ZXMgPSAoY29udGV4dCkgPT4ge1xuICAgIGlmICghY29udGV4dD8udG9waWNJZCkgcmV0dXJuO1xuICAgIGNvbnN0IGFjdGl2ZVRyYWNrID0gY29udGV4dC5hY3RpdmVUcmFjayB8fCBjb250ZXh0LnRyYWNrO1xuICAgIGlmICghYWN0aXZlVHJhY2spIHJldHVybjtcbiAgICBjb25zdCBhdXRob3JlZCA9IGF1dGhvcmVkTWVkaWFDdWVzW2NvbnRleHQudG9waWNJZF0gfHwge307XG4gICAgWydjaGFwdGVycycsICd0cmFuc2NyaXB0J10uZm9yRWFjaCgoa2V5KSA9PiB7XG4gICAgICBjb25zdCBhdXRob3JlZElkcyA9IG5ldyBTZXQoY3VlTGlzdChhdXRob3JlZFtrZXldKS5tYXAoY3VlSWRlbnRpdHkpKTtcbiAgICAgIGNvbnN0IGV4aXN0aW5nID0gY3VlTGlzdChhY3RpdmVUcmFja1trZXldKS5maWx0ZXIoY3VlID0+ICFjdWUuYXV0aG9yZWQgfHwgYXV0aG9yZWRJZHMuaGFzKGN1ZUlkZW50aXR5KGN1ZSkpKTtcbiAgICAgIGNvbnN0IGV4aXN0aW5nSWRzID0gbmV3IFNldChleGlzdGluZy5tYXAoY3VlSWRlbnRpdHkpKTtcbiAgICAgIGN1ZUxpc3QoYXV0aG9yZWRba2V5XSkuZm9yRWFjaCgoY3VlKSA9PiB7XG4gICAgICAgIGNvbnN0IGlkID0gY3VlSWRlbnRpdHkoY3VlKTtcbiAgICAgICAgaWYgKCFleGlzdGluZ0lkcy5oYXMoaWQpKSBleGlzdGluZy5wdXNoKGN1ZSk7XG4gICAgICB9KTtcbiAgICAgIGFjdGl2ZVRyYWNrW2tleV0gPSBleGlzdGluZy5zb3J0KChhLCBiKSA9PiBjdWVUaW1lKGEpIC0gY3VlVGltZShiKSk7XG4gICAgfSk7XG4gIH07XG4gIGNvbnN0IHJlbmRlckxlYXJuaW5nQ3VlTGlzdCA9ICgpID0+IHtcbiAgICBpZiAoIWxlYXJuaW5nTWFya2VyTGlzdEVsKSByZXR1cm47XG4gICAgY29uc3QgY29udGV4dCA9IGN1cnJlbnRQbGF5ZXJDb250ZXh0KCk7XG4gICAgbGVhcm5pbmdNYXJrZXJMaXN0RWwucmVwbGFjZUNoaWxkcmVuKCk7XG4gICAgaWYgKCFjb250ZXh0Py50b3BpY0lkKSB7XG4gICAgICBsZWFybmluZ01hcmtlckxpc3RFbC5hcHBlbmRDaGlsZChjcmVhdGVFbGVtZW50KCdkaXYnLCB7IGNsYXNzOiAndGV4dC1tdXRlZCB0ZXh0LXNtJyB9LCAnUGxheSBhIHRvcGljIHRvIHJldmlldyBhdXRob3JlZCBjdWVzLicpKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgYXV0aG9yZWQgPSBhdXRob3JlZE1lZGlhQ3Vlc1tjb250ZXh0LnRvcGljSWRdIHx8IHt9O1xuICAgIGNvbnN0IHJvd3MgPSBbXG4gICAgICAuLi5jdWVMaXN0KGF1dGhvcmVkLmNoYXB0ZXJzKS5tYXAoKGN1ZSwgaW5kZXgpID0+ICh7IHR5cGU6ICdjaGFwdGVycycsIGluZGV4LCBjdWUsIGxhYmVsOiAnQ2hhcHRlcicgfSkpLFxuICAgICAgLi4uY3VlTGlzdChhdXRob3JlZC50cmFuc2NyaXB0KS5tYXAoKGN1ZSwgaW5kZXgpID0+ICh7IHR5cGU6ICd0cmFuc2NyaXB0JywgaW5kZXgsIGN1ZSwgbGFiZWw6ICdUcmFuc2NyaXB0JyB9KSksXG4gICAgXS5zb3J0KChhLCBiKSA9PiBjdWVUaW1lKGEuY3VlKSAtIGN1ZVRpbWUoYi5jdWUpKTtcbiAgICBpZiAoIXJvd3MubGVuZ3RoKSB7XG4gICAgICBsZWFybmluZ01hcmtlckxpc3RFbC5hcHBlbmRDaGlsZChjcmVhdGVFbGVtZW50KCdkaXYnLCB7IGNsYXNzOiAndGV4dC1tdXRlZCB0ZXh0LXNtJyB9LCAnTm8gYXV0aG9yZWQgY3VlcyBmb3IgdGhpcyB0b3BpYyB5ZXQuJykpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICByb3dzLmZvckVhY2goKHsgdHlwZSwgaW5kZXgsIGN1ZSwgbGFiZWwgfSkgPT4ge1xuICAgICAgY29uc3Qgcm93ID0gY3JlYXRlRWxlbWVudCgnZGl2JywgeyBjbGFzczogJ2xlYXJuaW5nLW1hcmtlci1yb3cnIH0pO1xuICAgICAgcm93LmFwcGVuZChcbiAgICAgICAgY3JlYXRlRWxlbWVudCgnc3BhbicsIHsgY2xhc3M6ICdiYWRnZScgfSwgbGFiZWwpLFxuICAgICAgICBjcmVhdGVFbGVtZW50KCdzcGFuJywgeyBjbGFzczogJ3RleHQtc20nIH0sIGAke2Zvcm1hdE1lZGlhQ2xvY2soY3VlVGltZShjdWUpKX0gLSAke2N1ZUxhYmVsKGN1ZSl9YCksXG4gICAgICAgIGNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicsIHtcbiAgICAgICAgICBjbGFzczogJ2J0biBidG4tZ2hvc3QgYnRuLXNtJyxcbiAgICAgICAgICB0eXBlOiAnYnV0dG9uJyxcbiAgICAgICAgICAnZGF0YS1kZWxldGUtbGVhcm5pbmctY3VlJzogdHlwZSxcbiAgICAgICAgICAnZGF0YS1jdWUtaW5kZXgnOiBTdHJpbmcoaW5kZXgpLFxuICAgICAgICB9LCAnRGVsZXRlJylcbiAgICAgICk7XG4gICAgICBsZWFybmluZ01hcmtlckxpc3RFbC5hcHBlbmRDaGlsZChyb3cpO1xuICAgIH0pO1xuICB9O1xuICBjb25zdCBwZXJzaXN0QXV0aG9yZWRNZWRpYUN1ZXMgPSBhc3luYyAoKSA9PiB7XG4gICAgYXdhaXQgd2luZG93LkRCPy5zYXZlU2V0dGluZz8uKE1FRElBX0NVRVNfS0VZLCBhdXRob3JlZE1lZGlhQ3Vlcyk7XG4gIH07XG4gIGNvbnN0IGRlbGV0ZUxlYXJuaW5nQ3VlID0gYXN5bmMgKHR5cGUsIGluZGV4KSA9PiB7XG4gICAgY29uc3QgY29udGV4dCA9IGN1cnJlbnRQbGF5ZXJDb250ZXh0KCk7XG4gICAgaWYgKCFjb250ZXh0Py50b3BpY0lkKSB7XG4gICAgICBzZXRMZWFybmluZ01hcmtlclN0YXR1cygnUGxheSBhIGNvdXJzZSB0b3BpYyBiZWZvcmUgZWRpdGluZyBsZWFybmluZyBtYXJrZXJzLicsICd3YXJuaW5nJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGtleSA9IHR5cGUgPT09ICdjaGFwdGVycycgPyAnY2hhcHRlcnMnIDogJ3RyYW5zY3JpcHQnO1xuICAgIGNvbnN0IHRvcGljQ3VlcyA9IGF1dGhvcmVkTWVkaWFDdWVzW2NvbnRleHQudG9waWNJZF0gJiYgdHlwZW9mIGF1dGhvcmVkTWVkaWFDdWVzW2NvbnRleHQudG9waWNJZF0gPT09ICdvYmplY3QnXG4gICAgICA/IGF1dGhvcmVkTWVkaWFDdWVzW2NvbnRleHQudG9waWNJZF1cbiAgICAgIDoge307XG4gICAgY29uc3QgbmV4dExpc3QgPSBjdWVMaXN0KHRvcGljQ3Vlc1trZXldKTtcbiAgICBjb25zdCByZW1vdmVkID0gbmV4dExpc3Quc3BsaWNlKGluZGV4LCAxKVswXTtcbiAgICBpZiAoIXJlbW92ZWQpIHJldHVybjtcbiAgICBhdXRob3JlZE1lZGlhQ3VlcyA9IHtcbiAgICAgIC4uLmF1dGhvcmVkTWVkaWFDdWVzLFxuICAgICAgW2NvbnRleHQudG9waWNJZF06IHtcbiAgICAgICAgLi4udG9waWNDdWVzLFxuICAgICAgICBba2V5XTogbmV4dExpc3QsXG4gICAgICB9LFxuICAgIH07XG4gICAgYXdhaXQgcGVyc2lzdEF1dGhvcmVkTWVkaWFDdWVzKCk7XG4gICAgc3luY0FjdGl2ZVRyYWNrQ3Vlcyhjb250ZXh0KTtcbiAgICBpZiAoa2V5ID09PSAnY2hhcHRlcnMnKSBjb250ZXh0Lmluc3Q/LnNob3dDaGFwdGVycz8uKCk7XG4gICAgZWxzZSBjb250ZXh0Lmluc3Q/LnNob3dUcmFuc2NyaXB0Py4oKTtcbiAgICByZW5kZXJMZWFybmluZ0N1ZUxpc3QoKTtcbiAgICBzZXRMZWFybmluZ01hcmtlclN0YXR1cygnTGVhcm5pbmcgY3VlIGRlbGV0ZWQuJywgJ3N1Y2Nlc3MnKTtcbiAgfTtcbiAgY29uc3QgZXhwb3J0TGVhcm5pbmdDdWVzID0gKCkgPT4ge1xuICAgIGlmIChsZWFybmluZ01hcmtlckpzb25FbCkgbGVhcm5pbmdNYXJrZXJKc29uRWwudmFsdWUgPSBKU09OLnN0cmluZ2lmeShhdXRob3JlZE1lZGlhQ3VlcywgbnVsbCwgMik7XG4gICAgcmVuZGVyTGVhcm5pbmdDdWVMaXN0KCk7XG4gICAgc2V0TGVhcm5pbmdNYXJrZXJTdGF0dXMoJ0xlYXJuaW5nIGN1ZSBKU09OIGV4cG9ydGVkLicsICdzdWNjZXNzJyk7XG4gIH07XG4gIGNvbnN0IGV4cG9ydEFjdGl2ZUxlYXJuaW5nQ3VlcyA9ICgpID0+IHtcbiAgICBjb25zdCBjb250ZXh0ID0gY3VycmVudFBsYXllckNvbnRleHQoKTtcbiAgICBpZiAoIWNvbnRleHQ/LnRvcGljSWQpIHtcbiAgICAgIHNldExlYXJuaW5nTWFya2VyU3RhdHVzKCdQbGF5IGEgY291cnNlIHRvcGljIGJlZm9yZSBlZGl0aW5nIGFjdGl2ZSBjdWVzLicsICd3YXJuaW5nJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGN1ZXMgPSBhdXRob3JlZE1lZGlhQ3Vlc1tjb250ZXh0LnRvcGljSWRdIHx8IHt9O1xuICAgIGlmIChsZWFybmluZ01hcmtlckpzb25FbCkge1xuICAgICAgbGVhcm5pbmdNYXJrZXJKc29uRWwudmFsdWUgPSBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIHRvcGljSWQ6IGNvbnRleHQudG9waWNJZCxcbiAgICAgICAgY2hhcHRlcnM6IGN1ZUxpc3QoY3Vlcy5jaGFwdGVycyksXG4gICAgICAgIHRyYW5zY3JpcHQ6IGN1ZUxpc3QoY3Vlcy50cmFuc2NyaXB0KSxcbiAgICAgIH0sIG51bGwsIDIpO1xuICAgIH1cbiAgICByZW5kZXJMZWFybmluZ0N1ZUxpc3QoKTtcbiAgICBzZXRMZWFybmluZ01hcmtlclN0YXR1cygnQWN0aXZlIHRvcGljIGN1ZXMgbG9hZGVkIGZvciBidWxrIGVkaXRpbmcuJywgJ3N1Y2Nlc3MnKTtcbiAgfTtcbiAgY29uc3QgYXBwbHlBY3RpdmVMZWFybmluZ0N1ZXMgPSBhc3luYyAoKSA9PiB7XG4gICAgY29uc3QgY29udGV4dCA9IGN1cnJlbnRQbGF5ZXJDb250ZXh0KCk7XG4gICAgaWYgKCFjb250ZXh0Py50b3BpY0lkKSB7XG4gICAgICBzZXRMZWFybmluZ01hcmtlclN0YXR1cygnUGxheSBhIGNvdXJzZSB0b3BpYyBiZWZvcmUgYXBwbHlpbmcgYWN0aXZlIGN1ZXMuJywgJ3dhcm5pbmcnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbGV0IHBhcnNlZDtcbiAgICB0cnkge1xuICAgICAgcGFyc2VkID0gSlNPTi5wYXJzZShTdHJpbmcobGVhcm5pbmdNYXJrZXJKc29uRWw/LnZhbHVlIHx8ICd7fScpKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHNldExlYXJuaW5nTWFya2VyU3RhdHVzKCdBY3RpdmUgY3VlIEpTT04gaXMgbm90IHZhbGlkLicsICd3YXJuaW5nJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHRvcGljSWQgPSBTdHJpbmcocGFyc2VkPy50b3BpY0lkIHx8IGNvbnRleHQudG9waWNJZCk7XG4gICAgaWYgKHRvcGljSWQgIT09IGNvbnRleHQudG9waWNJZCkge1xuICAgICAgc2V0TGVhcm5pbmdNYXJrZXJTdGF0dXMoJ0FjdGl2ZSBjdWUgSlNPTiBiZWxvbmdzIHRvIGEgZGlmZmVyZW50IHRvcGljLicsICd3YXJuaW5nJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHN0YXRzID0geyBrZXB0OiAwLCBkcm9wcGVkOiAwLCBkZWR1cGVkOiAwLCBjbGFtcGVkOiAwIH07XG4gICAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZUltcG9ydGVkQ3Vlcyh7IFtjb250ZXh0LnRvcGljSWRdOiBwYXJzZWQgfSwgeyBtYXhUaW1lOiBjb250ZXh0LmR1cmF0aW9uLCBzdGF0cyB9KTtcbiAgICBjb25zdCBjdWVzID0gbm9ybWFsaXplZD8uW2NvbnRleHQudG9waWNJZF07XG4gICAgaWYgKCFjdWVzKSB7XG4gICAgICBzZXRMZWFybmluZ01hcmtlclN0YXR1cygnQWN0aXZlIGN1ZSBKU09OIG5lZWRzIGNoYXB0ZXJzIG9yIHRyYW5zY3JpcHQgYXJyYXlzLicsICd3YXJuaW5nJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGF1dGhvcmVkTWVkaWFDdWVzID0ge1xuICAgICAgLi4uYXV0aG9yZWRNZWRpYUN1ZXMsXG4gICAgICBbY29udGV4dC50b3BpY0lkXToge1xuICAgICAgICBjaGFwdGVyczogY3VlTGlzdChjdWVzLmNoYXB0ZXJzKSxcbiAgICAgICAgdHJhbnNjcmlwdDogY3VlTGlzdChjdWVzLnRyYW5zY3JpcHQpLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGF3YWl0IHBlcnNpc3RBdXRob3JlZE1lZGlhQ3VlcygpO1xuICAgIHN5bmNBY3RpdmVUcmFja0N1ZXMoY29udGV4dCk7XG4gICAgY29udGV4dC5pbnN0Py5zaG93Q2hhcHRlcnM/LigpO1xuICAgIGNvbnRleHQuaW5zdD8uc2hvd1RyYW5zY3JpcHQ/LigpO1xuICAgIHJlbmRlckxlYXJuaW5nQ3VlTGlzdCgpO1xuICAgIHNldExlYXJuaW5nTWFya2VyU3RhdHVzKGN1ZUltcG9ydFN1bW1hcnkoc3RhdHMsICdBY3RpdmUgdG9waWMgY3VlcyBhcHBsaWVkJyksICdzdWNjZXNzJyk7XG4gIH07XG4gIGNvbnN0IGltcG9ydExlYXJuaW5nQ3VlcyA9IGFzeW5jICgpID0+IHtcbiAgICBsZXQgcGFyc2VkO1xuICAgIHRyeSB7XG4gICAgICBwYXJzZWQgPSBKU09OLnBhcnNlKFN0cmluZyhsZWFybmluZ01hcmtlckpzb25FbD8udmFsdWUgfHwgJ3t9JykpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgc2V0TGVhcm5pbmdNYXJrZXJTdGF0dXMoJ0N1ZSBKU09OIGlzIG5vdCB2YWxpZC4nLCAnd2FybmluZycpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBzdGF0cyA9IHsga2VwdDogMCwgZHJvcHBlZDogMCwgZGVkdXBlZDogMCwgY2xhbXBlZDogMCB9O1xuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVJbXBvcnRlZEN1ZXMocGFyc2VkLCB7IHN0YXRzIH0pO1xuICAgIGlmICghbm9ybWFsaXplZCkge1xuICAgICAgc2V0TGVhcm5pbmdNYXJrZXJTdGF0dXMoJ0N1ZSBKU09OIG11c3QgYmUgYW4gb2JqZWN0IGtleWVkIGJ5IHRvcGljIGlkLicsICd3YXJuaW5nJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGF1dGhvcmVkTWVkaWFDdWVzID0ge1xuICAgICAgLi4uYXV0aG9yZWRNZWRpYUN1ZXMsXG4gICAgICAuLi5PYmplY3QuZnJvbUVudHJpZXMoT2JqZWN0LmVudHJpZXMobm9ybWFsaXplZCkubWFwKChbdG9waWNJZCwgY3Vlc10pID0+IHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBhdXRob3JlZE1lZGlhQ3Vlc1t0b3BpY0lkXSB8fCB7fTtcbiAgICAgICAgcmV0dXJuIFt0b3BpY0lkLCB7XG4gICAgICAgICAgY2hhcHRlcnM6IG5vcm1hbGl6ZUN1ZUxpc3QoWy4uLmN1ZUxpc3QoZXhpc3RpbmcuY2hhcHRlcnMpLCAuLi5jdWVMaXN0KGN1ZXMuY2hhcHRlcnMpXSwgJ2NoYXB0ZXJzJywgdW5kZWZpbmVkLCBzdGF0cyksXG4gICAgICAgICAgdHJhbnNjcmlwdDogbm9ybWFsaXplQ3VlTGlzdChbLi4uY3VlTGlzdChleGlzdGluZy50cmFuc2NyaXB0KSwgLi4uY3VlTGlzdChjdWVzLnRyYW5zY3JpcHQpXSwgJ3RyYW5zY3JpcHQnLCB1bmRlZmluZWQsIHN0YXRzKSxcbiAgICAgICAgfV07XG4gICAgICB9KSksXG4gICAgfTtcbiAgICBhd2FpdCBwZXJzaXN0QXV0aG9yZWRNZWRpYUN1ZXMoKTtcbiAgICBjb25zdCBjb250ZXh0ID0gY3VycmVudFBsYXllckNvbnRleHQoKTtcbiAgICBzeW5jQWN0aXZlVHJhY2tDdWVzKGNvbnRleHQpO1xuICAgIGNvbnRleHQ/Lmluc3Q/LnNob3dDaGFwdGVycz8uKCk7XG4gICAgY29udGV4dD8uaW5zdD8uc2hvd1RyYW5zY3JpcHQ/LigpO1xuICAgIHJlbmRlckxlYXJuaW5nQ3VlTGlzdCgpO1xuICAgIHNldExlYXJuaW5nTWFya2VyU3RhdHVzKGN1ZUltcG9ydFN1bW1hcnkoc3RhdHMsICdMZWFybmluZyBjdWUgSlNPTiBpbXBvcnRlZCcpLCAnc3VjY2VzcycpO1xuICB9O1xuICBjb25zdCBzYXZlTGVhcm5pbmdDdWUgPSBhc3luYyAodHlwZSkgPT4ge1xuICAgIGNvbnN0IGNvbnRleHQgPSBjdXJyZW50UGxheWVyQ29udGV4dCgpO1xuICAgIGlmICghY29udGV4dD8udG9waWNJZCB8fCAhY29udGV4dD8uY291cnNlSWQpIHtcbiAgICAgIHNldExlYXJuaW5nTWFya2VyU3RhdHVzKCdQbGF5IGEgY291cnNlIHRvcGljIGJlZm9yZSBhZGRpbmcgYSBsZWFybmluZyBtYXJrZXIuJywgJ3dhcm5pbmcnKTtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBjb25zdCB0ZXh0SW5wdXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1sZWFybmluZy1tYXJrZXItdGV4dF0nKTtcbiAgICBjb25zdCB0ZXh0ID0gU3RyaW5nKHRleHRJbnB1dD8udmFsdWUgfHwgJycpLnRyaW0oKTtcbiAgICBpZiAoIXRleHQpIHtcbiAgICAgIHNldExlYXJuaW5nTWFya2VyU3RhdHVzKCdFbnRlciBhIGNoYXB0ZXIgdGl0bGUgb3IgdHJhbnNjcmlwdCBsaW5lIGZpcnN0LicsICd3YXJuaW5nJyk7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgY29uc3Qga2V5ID0gdHlwZSA9PT0gJ2NoYXB0ZXInID8gJ2NoYXB0ZXJzJyA6ICd0cmFuc2NyaXB0JztcbiAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICAgIGNvbnN0IHRpbWUgPSBNYXRoLm1heCgwLCBOdW1iZXIoY29udGV4dC5jdXJyZW50VGltZSkgfHwgMCk7XG4gICAgY29uc3QgY3VlID0gdHlwZSA9PT0gJ2NoYXB0ZXInXG4gICAgICA/IHsgdGltZSwgdGl0bGU6IHRleHQsIGF1dGhvcmVkOiB0cnVlLCBjcmVhdGVkQXQ6IG5vdywgdXBkYXRlZEF0OiBub3cgfVxuICAgICAgOiB7IHN0YXJ0OiB0aW1lLCB0ZXh0LCBhdXRob3JlZDogdHJ1ZSwgY3JlYXRlZEF0OiBub3csIHVwZGF0ZWRBdDogbm93IH07XG4gICAgY29uc3QgdG9waWNDdWVzID0gYXV0aG9yZWRNZWRpYUN1ZXNbY29udGV4dC50b3BpY0lkXSAmJiB0eXBlb2YgYXV0aG9yZWRNZWRpYUN1ZXNbY29udGV4dC50b3BpY0lkXSA9PT0gJ29iamVjdCdcbiAgICAgID8gYXV0aG9yZWRNZWRpYUN1ZXNbY29udGV4dC50b3BpY0lkXVxuICAgICAgOiB7fTtcbiAgICBjb25zdCBuZXh0VG9waWNDdWVzID0ge1xuICAgICAgLi4udG9waWNDdWVzLFxuICAgICAgW2tleV06IFsuLi5jdWVMaXN0KHRvcGljQ3Vlc1trZXldKSwgY3VlXS5zb3J0KChhLCBiKSA9PiBOdW1iZXIoYS50aW1lID8/IGEuc3RhcnQgPz8gMCkgLSBOdW1iZXIoYi50aW1lID8/IGIuc3RhcnQgPz8gMCkpLFxuICAgIH07XG4gICAgYXV0aG9yZWRNZWRpYUN1ZXMgPSB7XG4gICAgICAuLi5hdXRob3JlZE1lZGlhQ3VlcyxcbiAgICAgIFtjb250ZXh0LnRvcGljSWRdOiBuZXh0VG9waWNDdWVzLFxuICAgIH07XG4gICAgYXdhaXQgcGVyc2lzdEF1dGhvcmVkTWVkaWFDdWVzKCk7XG4gICAgY29uc3QgYWN0aXZlVHJhY2sgPSBjb250ZXh0LmFjdGl2ZVRyYWNrIHx8IGNvbnRleHQudHJhY2s7XG4gICAgYWN0aXZlVHJhY2tba2V5XSA9IFsuLi5jdWVMaXN0KGFjdGl2ZVRyYWNrW2tleV0pLCBjdWVdLnNvcnQoKGEsIGIpID0+IE51bWJlcihhLnRpbWUgPz8gYS5zdGFydCA/PyAwKSAtIE51bWJlcihiLnRpbWUgPz8gYi5zdGFydCA/PyAwKSk7XG4gICAgaWYgKHR5cGUgPT09ICdjaGFwdGVyJykgY29udGV4dC5pbnN0Py5zaG93Q2hhcHRlcnM/LigpO1xuICAgIGVsc2UgY29udGV4dC5pbnN0Py5zaG93VHJhbnNjcmlwdD8uKCk7XG4gICAgdGV4dElucHV0ICYmICh0ZXh0SW5wdXQudmFsdWUgPSAnJyk7XG4gICAgcmVuZGVyTGVhcm5pbmdDdWVMaXN0KCk7XG4gICAgc2V0TGVhcm5pbmdNYXJrZXJTdGF0dXMoXG4gICAgICBgJHt0eXBlID09PSAnY2hhcHRlcicgPyAnQ2hhcHRlcicgOiAnVHJhbnNjcmlwdCBsaW5lJ30gYWRkZWQgYXQgJHtmb3JtYXRNZWRpYUNsb2NrKHRpbWUpfS5gLFxuICAgICAgJ3N1Y2Nlc3MnXG4gICAgKTtcbiAgICBUb2FzdC5zdWNjZXNzKHR5cGUgPT09ICdjaGFwdGVyJyA/ICdDaGFwdGVyIG1hcmtlciBhZGRlZCcgOiAnVHJhbnNjcmlwdCBsaW5lIGFkZGVkJyk7XG4gICAgcmV0dXJuIGN1ZTtcbiAgfTtcbiAgY29uc3Qgb25Db3Vyc2VTeW5jTWVzc2FnZSA9IGFzeW5jIChwYXlsb2FkID0ge30pID0+IHtcbiAgICBpZiAocGF5bG9hZC5raW5kID09PSAncHJvZ3Jlc3MnKSB7XG4gICAgICBjb25zdCByZWNvcmQgPSBwYXlsb2FkLnJlY29yZCB8fCB7fTtcbiAgICAgIGNvbnN0IGFjdGl2ZUNvdXJzZUlkID0gbGlzdEVsLnF1ZXJ5U2VsZWN0b3IoJy5jb3Vyc2UtaXRlbS5hY3RpdmUnKT8uZGF0YXNldC5jb3Vyc2VJZDtcbiAgICAgIGNvbnN0IGNvdXJzZVRvcGljcyA9IGFjdGl2ZUNvdXJzZUlkID8gKHRvcGljc0J5Q291cnNlW2FjdGl2ZUNvdXJzZUlkXSB8fCBbXSkgOiBbXTtcbiAgICAgIGNvbnN0IGNvbnRleHQgPSBjdXJyZW50UGxheWVyQ29udGV4dCgpO1xuICAgICAgY29uc3QgYWZmZWN0c0RldGFpbCA9IHJlY29yZC5jb3Vyc2VJZCA9PT0gYWN0aXZlQ291cnNlSWQgfHwgY291cnNlVG9waWNzLnNvbWUodCA9PiB0LnRvcGljSWQgPT09IHJlY29yZC50b3BpY0lkKTtcbiAgICAgIGNvbnN0IGFmZmVjdHNQbGF5ZXIgPSByZWNvcmQudG9waWNJZCAmJiByZWNvcmQudG9waWNJZCA9PT0gY29udGV4dD8udG9waWNJZDtcbiAgICAgIGlmICghYWZmZWN0c0RldGFpbCAmJiAhYWZmZWN0c1BsYXllcikgcmV0dXJuO1xuICAgICAgaWYgKGFjdGl2ZUNvdXJzZUlkKSBhd2FpdCByZW5kZXJDb3Vyc2VEZXRhaWwoYWN0aXZlQ291cnNlSWQpO1xuICAgICAgaWYgKGFmZmVjdHNQbGF5ZXIpIHNldFRpbWVzdGFtcFN0YXR1cygnUHJvZ3Jlc3MgcmVmcmVzaGVkIGZyb20gYW5vdGhlciB0YWIuJywgJ3N1Y2Nlc3MnKTtcbiAgICAgIHdpbmRvdy5QbGFzbWFEZWNrPy5idXMuZW1pdD8uKCdwbGF5ZXI6c3luYy1yZWZyZXNoJywge1xuICAgICAgICBraW5kOiAncHJvZ3Jlc3MnLFxuICAgICAgICB0b3BpY0lkOiByZWNvcmQudG9waWNJZCB8fCBudWxsLFxuICAgICAgICBjb3Vyc2VJZDogcmVjb3JkLmNvdXJzZUlkIHx8IGFjdGl2ZUNvdXJzZUlkIHx8IG51bGwsXG4gICAgICAgIHBsYXliYWNrUHJlc2VydmVkOiB0cnVlLFxuICAgICAgICBxdWV1ZVByZXNlcnZlZDogdHJ1ZSxcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAocGF5bG9hZC5raW5kICE9PSAnc2V0dGluZycgfHwgcGF5bG9hZC5yZWNvcmQ/LmtleSAhPT0gTUVESUFfQ1VFU19LRVkpIHJldHVybjtcbiAgICBjb25zdCBuZXh0Q3VlcyA9IHBheWxvYWQucmVjb3JkPy52YWx1ZSAmJiB0eXBlb2YgcGF5bG9hZC5yZWNvcmQudmFsdWUgPT09ICdvYmplY3QnXG4gICAgICA/IHBheWxvYWQucmVjb3JkLnZhbHVlXG4gICAgICA6IGF3YWl0IHdpbmRvdy5EQj8uZ2V0U2V0dGluZz8uKE1FRElBX0NVRVNfS0VZKTtcbiAgICBhdXRob3JlZE1lZGlhQ3VlcyA9IG5leHRDdWVzICYmIHR5cGVvZiBuZXh0Q3VlcyA9PT0gJ29iamVjdCcgPyBuZXh0Q3VlcyA6IHt9O1xuICAgIGNvbnN0IGNvbnRleHQgPSBjdXJyZW50UGxheWVyQ29udGV4dCgpO1xuICAgIHN5bmNBY3RpdmVUcmFja0N1ZXMoY29udGV4dCk7XG4gICAgcmVuZGVyTGVhcm5pbmdDdWVMaXN0KCk7XG4gICAgY29udGV4dD8uaW5zdD8uc2hvd0NoYXB0ZXJzPy4oKTtcbiAgICBjb250ZXh0Py5pbnN0Py5zaG93VHJhbnNjcmlwdD8uKCk7XG4gICAgc2V0TGVhcm5pbmdNYXJrZXJTdGF0dXMoJ0xlYXJuaW5nIGN1ZXMgcmVmcmVzaGVkIGZyb20gYW5vdGhlciB0YWIuJywgJ3N1Y2Nlc3MnKTtcbiAgICB3aW5kb3cuUGxhc21hRGVjaz8uYnVzLmVtaXQ/LignY291cnNlczpzeW5jLXJlZnJlc2gnLCB7IGtpbmQ6ICdtZWRpYS1jdWVzJywgdG9waWNJZDogY29udGV4dD8udG9waWNJZCB8fCBudWxsIH0pO1xuICB9O1xuICBjb25zdCBzYXZlVGltZXN0YW1wQ2FwdHVyZSA9IGFzeW5jICh7IGNyZWF0ZU5vdGUgPSBmYWxzZSB9ID0ge30pID0+IHtcbiAgICBjb25zdCBjb250ZXh0ID0gY3VycmVudFBsYXllckNvbnRleHQoKTtcbiAgICBpZiAoIWNvbnRleHQ/LnRvcGljSWQgfHwgIWNvbnRleHQ/LmNvdXJzZUlkKSB7XG4gICAgICBzZXRUaW1lc3RhbXBTdGF0dXMoJ1BsYXkgYSBjb3Vyc2UgdG9waWMgYmVmb3JlIHNhdmluZyBhIHRpbWVzdGFtcC4nLCAnd2FybmluZycpO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gICAgY29uc3QgdGl0bGVJbnB1dCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXRpbWVzdGFtcC1ub3RlLXRpdGxlXScpO1xuICAgIGNvbnN0IGJvZHlJbnB1dCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXRpbWVzdGFtcC1ub3RlLWJvZHldJyk7XG4gICAgY29uc3Qgbm90ZVRleHQgPSBTdHJpbmcoYm9keUlucHV0Py52YWx1ZSB8fCAnJykudHJpbSgpO1xuICAgIGNvbnN0IHRpdGxlID0gU3RyaW5nKHRpdGxlSW5wdXQ/LnZhbHVlIHx8IGNvbnRleHQudHJhY2sudGl0bGUgfHwgJ1RpbWVzdGFtcCBub3RlJykudHJpbSgpIHx8ICdUaW1lc3RhbXAgbm90ZSc7XG4gICAgbGV0IGxpbmtlZE5vdGUgPSBudWxsO1xuXG4gICAgaWYgKGNyZWF0ZU5vdGUpIHtcbiAgICAgIGNvbnN0IHBhcmFncmFwaHMgPSBbXG4gICAgICAgIG5vdGVUZXh0IHx8IGBDYXB0dXJlZCBhdCAke2Zvcm1hdE1lZGlhQ2xvY2soY29udGV4dC5jdXJyZW50VGltZSl9LmAsXG4gICAgICAgIGBTb3VyY2U6ICR7Y29udGV4dC50cmFjay50aXRsZSB8fCBjb250ZXh0LnRvcGljSWR9IGF0ICR7Zm9ybWF0TWVkaWFDbG9jayhjb250ZXh0LmN1cnJlbnRUaW1lKX0uYCxcbiAgICAgIF07XG4gICAgICBsaW5rZWROb3RlID0gYXdhaXQgd2luZG93LkRCPy5zYXZlTm90ZT8uKHtcbiAgICAgICAgdGl0bGUsXG4gICAgICAgIGNvbnRlbnQ6IHBhcmFncmFwaHNcbiAgICAgICAgICAubWFwKGxpbmUgPT4gYDxwPiR7ZXNjYXBlSHRtbFRleHQobGluZSkucmVwbGFjZSgvXFxuL2csICc8YnI+Jyl9PC9wPmApXG4gICAgICAgICAgLmpvaW4oJycpLFxuICAgICAgICB0b3BpY0lkOiBjb250ZXh0LnRvcGljSWQsXG4gICAgICAgIGNvdXJzZUlkOiBjb250ZXh0LmNvdXJzZUlkLFxuICAgICAgICBwb3NpdGlvbjogY29udGV4dC5jdXJyZW50VGltZSxcbiAgICAgICAgdGFnczogWyd0aW1lc3RhbXAnXSxcbiAgICAgICAgY3JlYXRlZEF0OiBub3csXG4gICAgICAgIHVwZGF0ZWRBdDogbm93LFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgdGltZXN0YW1wID0ge1xuICAgICAgaWQ6IGB0cy0ke25vd30tJHtNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyLCA3KX1gLFxuICAgICAgdGl0bGUsXG4gICAgICB0b3BpY1RpdGxlOiBjb250ZXh0LnRyYWNrLnRpdGxlIHx8IHRpdGxlLFxuICAgICAgdG9waWNJZDogY29udGV4dC50b3BpY0lkLFxuICAgICAgY291cnNlSWQ6IGNvbnRleHQuY291cnNlSWQsXG4gICAgICBwb3NpdGlvbjogY29udGV4dC5jdXJyZW50VGltZSxcbiAgICAgIGR1cmF0aW9uOiBjb250ZXh0LmR1cmF0aW9uLFxuICAgICAgbm90ZTogbm90ZVRleHQsXG4gICAgICBub3RlSWQ6IGxpbmtlZE5vdGU/LmlkLFxuICAgICAgY3JlYXRlZEF0OiBub3csXG4gICAgICB1cGRhdGVkQXQ6IG5vdyxcbiAgICB9O1xuICAgIGF3YWl0IHdpbmRvdy5EQj8uc2F2ZVRpbWVzdGFtcD8uKHRpbWVzdGFtcCk7XG4gICAgYm9keUlucHV0ICYmIChib2R5SW5wdXQudmFsdWUgPSAnJyk7XG4gICAgdGl0bGVJbnB1dCAmJiAodGl0bGVJbnB1dC52YWx1ZSA9ICcnKTtcbiAgICBzZXRUaW1lc3RhbXBTdGF0dXMoXG4gICAgICBjcmVhdGVOb3RlID8gYFNhdmVkIGxpbmtlZCBub3RlIGF0ICR7Zm9ybWF0TWVkaWFDbG9jayhjb250ZXh0LmN1cnJlbnRUaW1lKX0uYCA6IGBTYXZlZCBib29rbWFyayBhdCAke2Zvcm1hdE1lZGlhQ2xvY2soY29udGV4dC5jdXJyZW50VGltZSl9LmAsXG4gICAgICAnc3VjY2VzcydcbiAgICApO1xuICAgIFRvYXN0LnN1Y2Nlc3MoY3JlYXRlTm90ZSA/ICdUaW1lc3RhbXAgbm90ZSBzYXZlZCcgOiAnVGltZXN0YW1wIGJvb2ttYXJrIHNhdmVkJyk7XG4gICAgcmV0dXJuIHsgdGltZXN0YW1wLCBub3RlOiBsaW5rZWROb3RlIH07XG4gIH07XG5cbiAgY29uc3QgYnVpbGRDb3Vyc2VCdXR0b24gPSAoY291cnNlKSA9PiB7XG4gICAgY29uc3QgbWV0YSA9IGNvdXJzZU1ldGFCeUlkLmdldChjb3Vyc2UuaWQpIHx8IHsgdG9waWNDb3VudDogMCwgbWVkaWFDbGFzczogJ25vbmUnLCBzb3VyY2VDb3VudDogMCB9O1xuICAgIGNvbnN0IGJ0biA9IGNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicsIHsgY2xhc3M6ICdjb3Vyc2UtaXRlbScsICdkYXRhLWNvdXJzZS1pZCc6IGNvdXJzZS5pZCB9KTtcbiAgICBjb25zdCBtZWRpYU1ldGEgPSBjcmVhdGVFbGVtZW50KCdkaXYnLCB7IGNsYXNzOiAndG9waWMtbWV0YScgfSk7XG4gICAgbWVkaWFNZXRhLmFwcGVuZChiYWRnZU5vZGUobWV0YS5tZWRpYUNsYXNzID09PSAnbWl4ZWQnID8gJ3ZpZGVvICsgcGRmJyA6IG1ldGEubWVkaWFDbGFzcyA9PT0gJ25vbmUnID8gJ25vIG1lZGlhJyA6IG1ldGEubWVkaWFDbGFzcykpO1xuICAgIGJ0bi5hcHBlbmQoXG4gICAgICBjcmVhdGVFbGVtZW50KCdkaXYnLCB7IGNsYXNzOiAnY291cnNlLWl0ZW0tdGl0bGUnIH0sIGNvdXJzZS50aXRsZSksXG4gICAgICBjcmVhdGVFbGVtZW50KCdkaXYnLCB7IGNsYXNzOiAnY291cnNlLWl0ZW0tbWV0YScgfSwgYCR7bWV0YS50b3BpY0NvdW50fSB0b3BpY3MgLSAke21ldGEuc291cmNlQ291bnQgfHwgMH0gc291cmNlKHMpYCksXG4gICAgICBtZWRpYU1ldGFcbiAgICApO1xuICAgIHJldHVybiBidG47XG4gIH07XG5cbiAgY29uc3QgYnVpbGRUb3BpY1JvdyA9ICh0b3BpYywgc3RhdHVzLCB7IHRvZ2dsZSA9IGZhbHNlIH0gPSB7fSkgPT4ge1xuICAgIGNvbnN0IGhhc1ZpZGVvID0gKHRvcGljLnZpZGVvcz8ubGVuZ3RoID8/IDApID4gMDtcbiAgICBjb25zdCBoYXNQZGYgPSAodG9waWMucGRmcz8ubGVuZ3RoID8/IDApID4gMDtcbiAgICBjb25zdCByb3cgPSBjcmVhdGVFbGVtZW50KCdkaXYnLCB7XG4gICAgICBjbGFzczogJ3RvcGljLXJvdycsXG4gICAgICAnZGF0YS10b3BpYy1pZCc6IHRvcGljLnRvcGljSWQsXG4gICAgICAnZGF0YS1jb3Vyc2UtaWQnOiB0b3BpYy5jb3Vyc2VJZCxcbiAgICAgICdkYXRhLW1lZGlhJzogbWVkaWFDbGFzcyh0b3BpYyksXG4gICAgfSk7XG4gICAgY29uc3QgY29weSA9IGNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGNvcHkuYXBwZW5kKFxuICAgICAgY3JlYXRlRWxlbWVudCgnZGl2JywgeyBjbGFzczogJ3RvcGljLXRpdGxlJyB9LCB0b3BpYy50aXRsZSksXG4gICAgICBjcmVhdGVFbGVtZW50KCdkaXYnLCB7IGNsYXNzOiAndG9waWMtc3VibWV0YScgfSwgdG9waWMuc291cmNlTGFiZWwgPz8gJycpXG4gICAgKTtcbiAgICBjb25zdCBtZXRhID0gY3JlYXRlRWxlbWVudCgnZGl2JywgeyBjbGFzczogJ3RvcGljLW1ldGEnIH0pO1xuICAgIG1ldGEuYXBwZW5kQ2hpbGQoc3RhdHVzQmFkZ2VOb2RlKHN0YXR1cykpO1xuICAgIGlmIChoYXNWaWRlbykgbWV0YS5hcHBlbmRDaGlsZChiYWRnZU5vZGUoJ3ZpZGVvJykpO1xuICAgIGlmIChoYXNQZGYpIG1ldGEuYXBwZW5kQ2hpbGQoYmFkZ2VOb2RlKCdwZGYnKSk7XG4gICAgaWYgKCFoYXNWaWRlbyAmJiAhaGFzUGRmKSBtZXRhLmFwcGVuZENoaWxkKGJhZGdlTm9kZSgnbm8gbWVkaWEnKSk7XG5cbiAgICBjb25zdCBhY3Rpb25zID0gY3JlYXRlRWxlbWVudCgnZGl2JywgeyBjbGFzczogJ3RvcGljLWFjdGlvbnMnIH0pO1xuICAgIGlmIChoYXNWaWRlbykgYWN0aW9ucy5hcHBlbmRDaGlsZChhY3Rpb25CdXR0b24oJ3BsYXktdmlkZW8nLCAnUGxheScpKTtcbiAgICBpZiAoaGFzUGRmKSBhY3Rpb25zLmFwcGVuZENoaWxkKGFjdGlvbkJ1dHRvbignb3Blbi1wZGYnLCAnUERGJykpO1xuICAgIGlmICh0b2dnbGUpIGFjdGlvbnMuYXBwZW5kQ2hpbGQoYWN0aW9uQnV0dG9uKCd0b2dnbGUtZG9uZScsIHN0YXR1cyA9PT0gJ2RvbmUnID8gJ1VuZG9uZScgOiAnRG9uZScpKTtcbiAgICByb3cuYXBwZW5kKGNvcHksIG1ldGEsIGFjdGlvbnMpO1xuICAgIHJldHVybiByb3c7XG4gIH07XG5cbiAgY29uc3QgbWF0Y2hlc0NvdXJzZUZhY2V0ID0gKGNvdXJzZSkgPT4ge1xuICAgIGNvbnN0IG1ldGEgPSBjb3Vyc2VNZXRhQnlJZC5nZXQoY291cnNlLmlkKSB8fCB7IG1lZGlhQ2xhc3M6ICdub25lJywgc291cmNlQ291bnQ6IDAsIGhhc1ZpZGVvOiBmYWxzZSwgaGFzUGRmOiBmYWxzZSwgaGFzTm9NZWRpYTogZmFsc2UgfTtcbiAgICBpZiAoY291cnNlRmFjZXRTdGF0ZS5maWx0ZXIgIT09ICdhbGwnKSB7XG4gICAgICBpZiAoY291cnNlRmFjZXRTdGF0ZS5maWx0ZXIgPT09ICd2aWRlbycgJiYgIW1ldGEuaGFzVmlkZW8pIHJldHVybiBmYWxzZTtcbiAgICAgIGVsc2UgaWYgKGNvdXJzZUZhY2V0U3RhdGUuZmlsdGVyID09PSAncGRmJyAmJiAhbWV0YS5oYXNQZGYpIHJldHVybiBmYWxzZTtcbiAgICAgIGVsc2UgaWYgKGNvdXJzZUZhY2V0U3RhdGUuZmlsdGVyID09PSAnbWl4ZWQnICYmIG1ldGEubWVkaWFDbGFzcyAhPT0gJ21peGVkJykgcmV0dXJuIGZhbHNlO1xuICAgICAgZWxzZSBpZiAoY291cnNlRmFjZXRTdGF0ZS5maWx0ZXIgPT09ICdub25lJyAmJiAhbWV0YS5oYXNOb01lZGlhKSByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGlmIChjb3Vyc2VGYWNldFN0YXRlLnNvdXJjZVNjb3BlID09PSAnc2luZ2xlJyAmJiBtZXRhLnNvdXJjZUNvdW50ICE9PSAxKSByZXR1cm4gZmFsc2U7XG4gICAgaWYgKGNvdXJzZUZhY2V0U3RhdGUuc291cmNlU2NvcGUgPT09ICdtdWx0aScgJiYgbWV0YS5zb3VyY2VDb3VudCA8IDIpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfTtcblxuICBjb25zdCByZW5kZXJDb3Vyc2VzID0gKHF1ZXJ5ID0gY291cnNlRmFjZXRTdGF0ZS5xdWVyeSkgPT4ge1xuICAgIGNvbnN0IHEgPSBTdHJpbmcocXVlcnkgfHwgJycpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgIGNvdXJzZUZhY2V0U3RhdGUucXVlcnkgPSBxdWVyeTtcbiAgICBjb25zdCBmaWx0ZXJlZCA9IGFsbENvdXJzZXMuZmlsdGVyKChjb3Vyc2UpID0+IHtcbiAgICAgIGNvbnN0IG1ldGEgPSBjb3Vyc2VNZXRhQnlJZC5nZXQoY291cnNlLmlkKSB8fCB7IHRvcGljQ291bnQ6IDAgfTtcbiAgICAgIGNvbnN0IG1hdGNoZXNRdWVyeSA9ICFxXG4gICAgICAgIHx8IFN0cmluZyhjb3Vyc2UudGl0bGUgPz8gJycpLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMocSlcbiAgICAgICAgfHwgU3RyaW5nKG1ldGEudG9waWNDb3VudCA/PyAnJykuaW5jbHVkZXMocSlcbiAgICAgICAgfHwgKHRvcGljc0J5Q291cnNlW2NvdXJzZS5pZF0gPz8gW10pLnNvbWUoKHRvcGljKSA9PiBTdHJpbmcodG9waWMuc291cmNlTGFiZWwgfHwgJycpLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMocSkpO1xuICAgICAgcmV0dXJuIG1hdGNoZXNRdWVyeSAmJiBtYXRjaGVzQ291cnNlRmFjZXQoY291cnNlKTtcbiAgICB9KTtcbiAgICBsaXN0RWwucmVwbGFjZUNoaWxkcmVuKCk7XG4gICAgaWYgKCFmaWx0ZXJlZC5sZW5ndGgpIHtcbiAgICAgIGNhbmNlbERldGFpbFJlbmRlcigpO1xuICAgICAgY291cnNlRmFjZXRTdGF0ZS5zZWxlY3RlZENvdXJzZUlkID0gJyc7XG4gICAgICBjb25zdCBjYXJkID0gY3JlYXRlRWxlbWVudCgnZGl2JywgeyBjbGFzczogJ2NhcmQgY2FyZC1naG9zdCcgfSk7XG4gICAgICBjYXJkLmFwcGVuZENoaWxkKGNyZWF0ZUVsZW1lbnQoJ2RpdicsIHsgY2xhc3M6ICdjYXJkLWJvZHknIH0sICdObyBjb3Vyc2VzIG1hdGNoIHRoaXMgc2VhcmNoIG9yIGZpbHRlci4nKSk7XG4gICAgICBsaXN0RWwuYXBwZW5kQ2hpbGQoY2FyZCk7XG4gICAgICBkZXRhaWxFbC5yZXBsYWNlQ2hpbGRyZW4oY3JlYXRlRWxlbWVudCgnZGl2JywgeyBjbGFzczogJ2NhcmQgY2FyZC1maWxsZWQnIH0sIGNyZWF0ZUVsZW1lbnQoJ2RpdicsIHsgY2xhc3M6ICdjYXJkLWJvZHknIH0sICdQaWNrIGEgZGlmZmVyZW50IHNlYXJjaCBvciBjb3Vyc2UgZmlsdGVyIHRvIGNvbnRpbnVlLicpKSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGZpbHRlcmVkLmZvckVhY2goKGNvdXJzZSkgPT4ge1xuICAgICAgY29uc3QgYnV0dG9uID0gYnVpbGRDb3Vyc2VCdXR0b24oY291cnNlKTtcbiAgICAgIGlmIChjb3Vyc2UuaWQgPT09IGNvdXJzZUZhY2V0U3RhdGUuc2VsZWN0ZWRDb3Vyc2VJZCkgYnV0dG9uLmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xuICAgICAgbGlzdEVsLmFwcGVuZENoaWxkKGJ1dHRvbik7XG4gICAgfSk7XG4gICAgaWYgKCFmaWx0ZXJlZC5zb21lKChjb3Vyc2UpID0+IGNvdXJzZS5pZCA9PT0gY291cnNlRmFjZXRTdGF0ZS5zZWxlY3RlZENvdXJzZUlkKSkge1xuICAgICAgY2FuY2VsRGV0YWlsUmVuZGVyKCk7XG4gICAgICBjb3Vyc2VGYWNldFN0YXRlLnNlbGVjdGVkQ291cnNlSWQgPSAnJztcbiAgICB9XG4gIH07XG5cbiAgY29uc3QgcmVuZGVyQ291cnNlRGV0YWlsID0gYXN5bmMgKGNvdXJzZUlkKSA9PiB7XG4gICAgY2FuY2VsRGV0YWlsUmVuZGVyKCk7XG4gICAgY29uc3QgcmVuZGVyVG9rZW4gPSBkZXRhaWxSZW5kZXJUb2tlbjtcbiAgICBjb25zdCBjb3Vyc2UgPSBhbGxDb3Vyc2VzLmZpbmQoYyA9PiBjLmlkID09PSBjb3Vyc2VJZCk7XG4gICAgY29uc3QgdG9waWNzID0gKHRvcGljc0J5Q291cnNlW2NvdXJzZUlkXSA/PyBbXSk7XG4gICAgaWYgKCFjb3Vyc2UpIHJldHVybjtcbiAgICBjb25zdCBhY3RpdmVGaWx0ZXIgPSBkZXRhaWxFbC5kYXRhc2V0LnRvcGljRmlsdGVyIHx8ICdhbGwnO1xuXG4gICAgLy8gTG9hZCBwcm9ncmVzcyBmb3IgdGhpcyBjb3Vyc2UgdG9waWNzXG4gICAgY29uc3QgcHJvZ0xpc3QgPSBhd2FpdCBQcm9taXNlLmFsbCh0b3BpY3MubWFwKHQgPT4gd2luZG93LkRCPy5nZXRQcm9ncmVzcz8uKHQudG9waWNJZCkpKTtcbiAgICBpZiAocmVuZGVyVG9rZW4gIT09IGRldGFpbFJlbmRlclRva2VuKSByZXR1cm47XG4gICAgY29uc3QgcHJvZ0J5SWQgPSBuZXcgTWFwKHByb2dMaXN0LmZpbHRlcihCb29sZWFuKS5tYXAocCA9PiBbcC50b3BpY0lkLCBwXSkpO1xuICAgIGNvbnN0IGZpbHRlcmVkVG9waWNzID0gdG9waWNzLmZpbHRlcigodG9waWMpID0+IHBhc3NDb3Vyc2VGaWx0ZXIodG9waWMsIHByb2dCeUlkLmdldCh0b3BpYy50b3BpY0lkKT8uc3RhdHVzID8/ICdub3Qtc3RhcnRlZCcsIGFjdGl2ZUZpbHRlcikpO1xuICAgIGNvbnN0IGdyb3VwZWQgPSBmaWx0ZXJlZFRvcGljcy5yZWR1Y2UoKGFjYywgdG9waWMpID0+IHtcbiAgICAgIGNvbnN0IGtleSA9IHNvdXJjZUtleSh0b3BpYyk7XG4gICAgICAoYWNjW2tleV0gPSBhY2Nba2V5XSA/PyBbXSkucHVzaCh0b3BpYyk7XG4gICAgICByZXR1cm4gYWNjO1xuICAgIH0sIHt9KTtcbiAgICBjb25zdCBmaWx0ZXJEZWZpbml0aW9ucyA9IFtcbiAgICAgIFsnYWxsJywgJ0FsbCddLFxuICAgICAgWyd2aWRlbycsICdWaWRlbyddLFxuICAgICAgWydwZGYnLCAnUERGJ10sXG4gICAgICBbJ25vbmUnLCAnTm8gbWVkaWEnXSxcbiAgICAgIFsnZG9uZScsICdEb25lJ10sXG4gICAgICBbJ2luLXByb2dyZXNzJywgJ0luIHByb2dyZXNzJ10sXG4gICAgICBbJ25vdC1zdGFydGVkJywgJ05vdCBzdGFydGVkJ10sXG4gICAgXTtcbiAgICBjb25zdCBwcm9kdWN0VXJsID0gc2FmZUV4dGVybmFsVXJsKGNvdXJzZS5wcm9kdWN0VXJsKTtcblxuICAgIGNvbnN0IHN1bW1hcnlDYXJkID0gY3JlYXRlRWxlbWVudCgnZGl2JywgeyBjbGFzczogJ2NhcmQgY2FyZC1maWxsZWQnIH0pO1xuICAgIGNvbnN0IHN1bW1hcnlCb2R5ID0gY3JlYXRlRWxlbWVudCgnZGl2JywgeyBjbGFzczogJ2NhcmQtYm9keScgfSk7XG4gICAgY29uc3QgdGl0bGUgPSBjcmVhdGVFbGVtZW50KCdoMicsIHt9LCBjb3Vyc2UudGl0bGUpO1xuICAgIHRpdGxlLnN0eWxlLm1hcmdpbiA9ICcwIDAgNnB4IDAnO1xuICAgIHN1bW1hcnlCb2R5LmFwcGVuZENoaWxkKHRpdGxlKTtcbiAgICBpZiAocHJvZHVjdFVybCkge1xuICAgICAgc3VtbWFyeUJvZHkuYXBwZW5kQ2hpbGQoY3JlYXRlRWxlbWVudCgnYScsIHsgaHJlZjogcHJvZHVjdFVybCwgdGFyZ2V0OiAnX2JsYW5rJywgcmVsOiAnbm9vcGVuZXInIH0sICdQcm9kdWN0IHBhZ2UnKSk7XG4gICAgfVxuICAgIGNvbnN0IHNvdXJjZUNvdW50ID0gT2JqZWN0LmtleXModG9waWNzLnJlZHVjZSgoYWNjLCB0KSA9PiB7IGFjY1tzb3VyY2VLZXkodCldID0gdHJ1ZTsgcmV0dXJuIGFjYzsgfSwge30pKS5sZW5ndGg7XG4gICAgc3VtbWFyeUJvZHkuYXBwZW5kQ2hpbGQoY3JlYXRlRWxlbWVudCgnZGl2JywgeyBjbGFzczogJ2NvdXJzZS1kZXRhaWwtbWV0YScgfSwgYCR7dG9waWNzLmxlbmd0aH0gdG9waWNzIGFjcm9zcyAke3NvdXJjZUNvdW50fSBzb3VyY2UocylgKSk7XG4gICAgYWlSZWFkeSgpLnRoZW4oKHJlYWR5KSA9PiB7XG4gICAgICBpZiAoIXJlYWR5IHx8IHJlbmRlclRva2VuICE9PSBkZXRhaWxSZW5kZXJUb2tlbiB8fCAhc3VtbWFyeUJvZHkuaXNDb25uZWN0ZWQpIHJldHVybjtcbiAgICAgIHN1bW1hcnlCb2R5LmFwcGVuZENoaWxkKGNyZWF0ZUVsZW1lbnQoJ2RpdicsIHsgY2xhc3M6ICdidXR0b24tcm93Jywgc3R5bGU6ICdtYXJnaW4tdG9wOjEwcHgnIH0sIFtcbiAgICAgICAgY3JlYXRlRWxlbWVudCgnYnV0dG9uJywgeyBjbGFzczogJ2J0biBidG4tZ2hvc3QgYnRuLXNtJywgdHlwZTogJ2J1dHRvbicsICdkYXRhLWFjdGlvbic6ICdzdW1tYXJpemUtY291cnNlJywgJ2RhdGEtY291cnNlLWlkJzogY291cnNlSWQgfSwgJ1N1bW1hcml6ZSBjb3Vyc2UnKSxcbiAgICAgICAgY3JlYXRlRWxlbWVudCgnc3BhbicsIHsgY2xhc3M6ICd0ZXh0LXNtJywgJ2RhdGEtY291cnNlLWFpLXN0YXR1cyc6ICcnLCAnYXJpYS1saXZlJzogJ3BvbGl0ZScgfSksXG4gICAgICBdKSk7XG4gICAgfSkuY2F0Y2goKCkgPT4ge30pO1xuICAgIHN1bW1hcnlDYXJkLmFwcGVuZENoaWxkKHN1bW1hcnlCb2R5KTtcblxuICAgIGNvbnN0IHRvcGljc0NhcmQgPSBjcmVhdGVFbGVtZW50KCdkaXYnLCB7IGNsYXNzOiAnY2FyZCBjYXJkLWZpbGxlZCcgfSk7XG4gICAgdG9waWNzQ2FyZC5zdHlsZS5tYXJnaW5Ub3AgPSAnMTJweCc7XG4gICAgY29uc3QgdG9waWNzQm9keSA9IGNyZWF0ZUVsZW1lbnQoJ2RpdicsIHsgY2xhc3M6ICdjYXJkLWJvZHknIH0pO1xuICAgIGNvbnN0IGZpbHRlclJvdyA9IGNyZWF0ZUVsZW1lbnQoJ2RpdicsIHsgY2xhc3M6ICdmaWx0ZXItcm93JywgJ2FyaWEtbGFiZWwnOiAnVG9waWMgZmlsdGVycycgfSk7XG4gICAgZmlsdGVyRGVmaW5pdGlvbnMuZm9yRWFjaCgoW3ZhbHVlLCBsYWJlbF0pID0+IHtcbiAgICAgIGZpbHRlclJvdy5hcHBlbmRDaGlsZChjcmVhdGVFbGVtZW50KCdidXR0b24nLCB7XG4gICAgICAgIGNsYXNzOiBgZmlsdGVyLWNoaXAke2FjdGl2ZUZpbHRlciA9PT0gdmFsdWUgPyAnIGFjdGl2ZScgOiAnJ31gLFxuICAgICAgICB0eXBlOiAnYnV0dG9uJyxcbiAgICAgICAgJ2RhdGEtdG9waWMtZmlsdGVyJzogdmFsdWUsXG4gICAgICAgICdhcmlhLXByZXNzZWQnOiBhY3RpdmVGaWx0ZXIgPT09IHZhbHVlID8gJ3RydWUnIDogJ2ZhbHNlJyxcbiAgICAgIH0sIGxhYmVsKSk7XG4gICAgfSk7XG4gICAgY29uc3QgdG9waWNzTGlzdCA9IGNyZWF0ZUVsZW1lbnQoJ2RpdicsIHsgY2xhc3M6ICd0b3BpY3MtbGlzdCcgfSk7XG4gICAgY29uc3QgZ3JvdXBzID0gT2JqZWN0LmVudHJpZXMoZ3JvdXBlZCk7XG4gICAgbGV0IHN0YXJ0RGV0YWlsUmVuZGVyID0gKCkgPT4ge307XG4gICAgaWYgKCFncm91cHMubGVuZ3RoKSB7XG4gICAgICBjb25zdCBlbXB0eSA9IGNyZWF0ZUVsZW1lbnQoJ2RpdicsIHsgY2xhc3M6ICdlbXB0eS1zdGF0ZScgfSk7XG4gICAgICBlbXB0eS5hcHBlbmRDaGlsZChjcmVhdGVFbGVtZW50KCdwJywge30sICdObyB0b3BpY3MgbWF0Y2ggdGhpcyBmaWx0ZXIuJykpO1xuICAgICAgdG9waWNzTGlzdC5hcHBlbmRDaGlsZChlbXB0eSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHJvd1Rhc2tzID0gW107XG4gICAgICBncm91cHMuZm9yRWFjaCgoW2dyb3VwS2V5LCBncm91cFRvcGljc10pID0+IHtcbiAgICAgICAgY29uc3Qgc2VjdGlvbiA9IGNyZWF0ZUVsZW1lbnQoJ3NlY3Rpb24nLCB7IGNsYXNzOiAnc291cmNlLWdyb3VwJyB9KTtcbiAgICAgICAgY29uc3QgaGVhZGVyID0gY3JlYXRlRWxlbWVudCgnZGl2JywgeyBjbGFzczogJ3NvdXJjZS1ncm91cC1oZWFkZXInIH0pO1xuICAgICAgICBoZWFkZXIuYXBwZW5kKFxuICAgICAgICAgIGNyZWF0ZUVsZW1lbnQoJ2RpdicsIHsgY2xhc3M6ICdzb3VyY2UtZ3JvdXAtdGl0bGUnIH0sIHNvdXJjZUxhYmVsRnJvbUtleShncm91cEtleSkpLFxuICAgICAgICAgIGNyZWF0ZUVsZW1lbnQoJ2RpdicsIHsgY2xhc3M6ICdzb3VyY2UtZ3JvdXAtY291bnQnIH0sIGAke2dyb3VwVG9waWNzLmxlbmd0aH0gdG9waWMke2dyb3VwVG9waWNzLmxlbmd0aCA9PT0gMSA/ICcnIDogJ3MnfWApXG4gICAgICAgICk7XG4gICAgICAgIHNlY3Rpb24uYXBwZW5kQ2hpbGQoaGVhZGVyKTtcbiAgICAgICAgdG9waWNzTGlzdC5hcHBlbmRDaGlsZChzZWN0aW9uKTtcbiAgICAgICAgZ3JvdXBUb3BpY3MuZm9yRWFjaCh0b3BpYyA9PiByb3dUYXNrcy5wdXNoKHsgc2VjdGlvbiwgdG9waWMgfSkpO1xuICAgICAgfSk7XG4gICAgICBjb25zdCBiYXRjaFNpemUgPSBNYXRoLm1heCgxLCBOdW1iZXIod2luZG93LlBsYXNtYURlY2s/LmNvdXJzZURldGFpbFJlbmRlckJhdGNoU2l6ZSkgfHwgNTApO1xuICAgICAgY29uc3Qgc3RhdHVzID0gY3JlYXRlRWxlbWVudCgnZGl2Jywge1xuICAgICAgICBjbGFzczogJ2NvdXJzZS1kZXRhaWwtcmVuZGVyLXN0YXR1cyB0ZXh0LXNtJyxcbiAgICAgICAgJ2FyaWEtbGl2ZSc6ICdwb2xpdGUnLFxuICAgICAgICAnZGF0YS1jb3Vyc2UtZGV0YWlsLXJlbmRlci1zdGF0dXMnOiAnJyxcbiAgICAgIH0pO1xuICAgICAgdG9waWNzTGlzdC5hcHBlbmRDaGlsZChzdGF0dXMpO1xuICAgICAgbGV0IGluZGV4ID0gMDtcbiAgICAgIGNvbnN0IHJlbmRlckJhdGNoID0gKCkgPT4ge1xuICAgICAgICBpZiAoIXRvcGljc0xpc3QuaXNDb25uZWN0ZWQgfHwgcmVuZGVyVG9rZW4gIT09IGRldGFpbFJlbmRlclRva2VuKSByZXR1cm47XG4gICAgICAgIGNvbnN0IGVuZCA9IE1hdGgubWluKHJvd1Rhc2tzLmxlbmd0aCwgaW5kZXggKyBiYXRjaFNpemUpO1xuICAgICAgICBmb3IgKDsgaW5kZXggPCBlbmQ7IGluZGV4ICs9IDEpIHtcbiAgICAgICAgICBjb25zdCB7IHNlY3Rpb24sIHRvcGljIH0gPSByb3dUYXNrc1tpbmRleF07XG4gICAgICAgICAgY29uc3Qgc3RhdHVzVmFsdWUgPSBwcm9nQnlJZC5nZXQodG9waWMudG9waWNJZCk/LnN0YXR1cyA/PyAnbm90LXN0YXJ0ZWQnO1xuICAgICAgICAgIHNlY3Rpb24uYXBwZW5kQ2hpbGQoYnVpbGRUb3BpY1Jvdyh0b3BpYywgc3RhdHVzVmFsdWUsIHsgdG9nZ2xlOiB0cnVlIH0pKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoaW5kZXggPCByb3dUYXNrcy5sZW5ndGgpIHtcbiAgICAgICAgICBzdGF0dXMudGV4dENvbnRlbnQgPSBgU2hvd2luZyAke2luZGV4fSBvZiAke3Jvd1Rhc2tzLmxlbmd0aH0gdG9waWNzYDtcbiAgICAgICAgICBkZXRhaWxSZW5kZXJUaW1lciA9IHNldFRpbWVvdXQocmVuZGVyQmF0Y2gsIDApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRldGFpbFJlbmRlclRpbWVyID0gbnVsbDtcbiAgICAgICAgICBzdGF0dXMucmVtb3ZlKCk7XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBzdGFydERldGFpbFJlbmRlciA9IHJlbmRlckJhdGNoO1xuICAgIH1cbiAgICB0b3BpY3NCb2R5LmFwcGVuZChmaWx0ZXJSb3csIHRvcGljc0xpc3QpO1xuICAgIHRvcGljc0NhcmQuYXBwZW5kQ2hpbGQodG9waWNzQm9keSk7XG4gICAgZGV0YWlsRWwucmVwbGFjZUNoaWxkcmVuKHN1bW1hcnlDYXJkLCB0b3BpY3NDYXJkKTtcbiAgICBzdGFydERldGFpbFJlbmRlcigpO1xuICB9O1xuXG4gIC8vIEluaXRpYWwgcmVuZGVyXG4gIHJlbmRlckNvdXJzZXMoJycpO1xuICBpZiAoc291cmNlU2NvcGVFbCkgc291cmNlU2NvcGVFbC52YWx1ZSA9IGNvdXJzZUZhY2V0U3RhdGUuc291cmNlU2NvcGU7XG5cbiAgaWYgKCFsaXN0RWwuZGF0YXNldC5wZEJvdW5kKSB7XG4gICAgbGlzdEVsLmRhdGFzZXQucGRCb3VuZCA9ICd0cnVlJztcbiAgICBsaXN0RWwuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgY29uc3QgdGFyZ2V0ID0gZXZlbnRUYXJnZXRFbChlKTtcbiAgICAgIGlmICghdGFyZ2V0KSByZXR1cm47XG4gICAgICBjb25zdCBidG4gPSB0YXJnZXQuY2xvc2VzdCgnW2RhdGEtY291cnNlLWlkXScpO1xuICAgICAgaWYgKCFidG4pIHJldHVybjtcbiAgICAgICQkKCcuY291cnNlLWl0ZW0nLCBsaXN0RWwpLmZvckVhY2goeCA9PiB4LmNsYXNzTGlzdC50b2dnbGUoJ2FjdGl2ZScsIHggPT09IGJ0bikpO1xuICAgICAgY291cnNlRmFjZXRTdGF0ZS5zZWxlY3RlZENvdXJzZUlkID0gYnRuLmRhdGFzZXQuY291cnNlSWQgfHwgJyc7XG4gICAgICByZW5kZXJDb3Vyc2VEZXRhaWwoYnRuLmRhdGFzZXQuY291cnNlSWQpO1xuICAgIH0pO1xuICB9XG5cbiAgaWYgKHNlYXJjaEVsICYmICFzZWFyY2hFbC5kYXRhc2V0LnBkQm91bmQpIHtcbiAgICBzZWFyY2hFbC5kYXRhc2V0LnBkQm91bmQgPSAndHJ1ZSc7XG4gICAgc2VhcmNoRWwuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCAoKSA9PiB7XG4gICAgICByZW5kZXJDb3Vyc2VzKHNlYXJjaEVsLnZhbHVlKTtcbiAgICAgIGNvbnN0IGN1cnJlbnQgPSBjb3Vyc2VGYWNldFN0YXRlLnNlbGVjdGVkQ291cnNlSWQgJiYgbGlzdEVsLnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWNvdXJzZS1pZD1cIiR7Y291cnNlRmFjZXRTdGF0ZS5zZWxlY3RlZENvdXJzZUlkfVwiXWApO1xuICAgICAgaWYgKGN1cnJlbnQpIHtcbiAgICAgICAgY3VycmVudC5jbGFzc0xpc3QuYWRkKCdhY3RpdmUnKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgZmlyc3RWaXNpYmxlID0gbGlzdEVsLnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWNvdXJzZS1pZF0nKTtcbiAgICAgIGlmIChmaXJzdFZpc2libGUpIHtcbiAgICAgICAgZmlyc3RWaXNpYmxlLmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xuICAgICAgICBjb3Vyc2VGYWNldFN0YXRlLnNlbGVjdGVkQ291cnNlSWQgPSBmaXJzdFZpc2libGUuZGF0YXNldC5jb3Vyc2VJZCB8fCAnJztcbiAgICAgICAgcmVuZGVyQ291cnNlRGV0YWlsKGNvdXJzZUZhY2V0U3RhdGUuc2VsZWN0ZWRDb3Vyc2VJZCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbiAgaWYgKHNvdXJjZVNjb3BlRWwgJiYgIXNvdXJjZVNjb3BlRWwuZGF0YXNldC5wZEJvdW5kKSB7XG4gICAgc291cmNlU2NvcGVFbC5kYXRhc2V0LnBkQm91bmQgPSAndHJ1ZSc7XG4gICAgc291cmNlU2NvcGVFbC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoKSA9PiB7XG4gICAgICBjb3Vyc2VGYWNldFN0YXRlLnNvdXJjZVNjb3BlID0gc291cmNlU2NvcGVFbC52YWx1ZSB8fCAnYWxsJztcbiAgICAgIHJlbmRlckNvdXJzZXMoY291cnNlRmFjZXRTdGF0ZS5xdWVyeSk7XG4gICAgICBjb25zdCBmaXJzdFZpc2libGUgPSBsaXN0RWwucXVlcnlTZWxlY3RvcignW2RhdGEtY291cnNlLWlkXScpO1xuICAgICAgaWYgKGZpcnN0VmlzaWJsZSkge1xuICAgICAgICBmaXJzdFZpc2libGUuY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7XG4gICAgICAgIGNvdXJzZUZhY2V0U3RhdGUuc2VsZWN0ZWRDb3Vyc2VJZCA9IGZpcnN0VmlzaWJsZS5kYXRhc2V0LmNvdXJzZUlkIHx8ICcnO1xuICAgICAgICByZW5kZXJDb3Vyc2VEZXRhaWwoY291cnNlRmFjZXRTdGF0ZS5zZWxlY3RlZENvdXJzZUlkKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIGlmICghZGV0YWlsRWwuZGF0YXNldC5wZEJvdW5kKSB7XG4gICAgZGV0YWlsRWwuZGF0YXNldC5wZEJvdW5kID0gJ3RydWUnO1xuICAgIGRldGFpbEVsLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgYXN5bmMgKGUpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGV2ZW50VGFyZ2V0RWwoZSk7XG4gICAgICBpZiAoIXRhcmdldCkgcmV0dXJuO1xuICAgICAgY29uc3QgYWN0aW9uQnRuID0gdGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWFjdGlvbl0nKTtcbiAgICAgIGNvbnN0IGZpbHRlckJ0biA9IHRhcmdldC5jbG9zZXN0KCdbZGF0YS10b3BpYy1maWx0ZXJdJyk7XG4gICAgICBpZiAoZmlsdGVyQnRuKSB7XG4gICAgICAgIGRldGFpbEVsLmRhdGFzZXQudG9waWNGaWx0ZXIgPSBmaWx0ZXJCdG4uZGF0YXNldC50b3BpY0ZpbHRlciB8fCAnYWxsJztcbiAgICAgICAgY29uc3QgYWN0aXZlQ291cnNlID0gbGlzdEVsLnF1ZXJ5U2VsZWN0b3IoJy5jb3Vyc2UtaXRlbS5hY3RpdmUnKT8uZGF0YXNldC5jb3Vyc2VJZDtcbiAgICAgICAgaWYgKGFjdGl2ZUNvdXJzZSkgcmVuZGVyQ291cnNlRGV0YWlsKGFjdGl2ZUNvdXJzZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmICghYWN0aW9uQnRuKSByZXR1cm47XG4gICAgICBjb25zdCBhY3Rpb24gPSBhY3Rpb25CdG4uZGF0YXNldC5hY3Rpb247XG4gICAgICBpZiAoYWN0aW9uID09PSAnc3VtbWFyaXplLWNvdXJzZScpIHtcbiAgICAgICAgY29uc3QgY291cnNlSWQgPSBhY3Rpb25CdG4uZGF0YXNldC5jb3Vyc2VJZDtcbiAgICAgICAgY29uc3QgY291cnNlID0gYWxsQ291cnNlcy5maW5kKGMgPT4gYy5pZCA9PT0gY291cnNlSWQpO1xuICAgICAgICBjb25zdCB0b3BpY3MgPSB0b3BpY3NCeUNvdXJzZVtjb3Vyc2VJZF0gPz8gW107XG4gICAgICAgIGNvbnN0IHN0YXR1c0VsID0gZGV0YWlsRWwucXVlcnlTZWxlY3RvcignW2RhdGEtY291cnNlLWFpLXN0YXR1c10nKTtcbiAgICAgICAgY29uc3QgYWkgPSB3aW5kb3cuUGxhc21hRGVjaz8uQUk7XG4gICAgICAgIGlmICghY291cnNlIHx8ICFhaT8uc3VtbWFyaXplVGV4dCkgcmV0dXJuO1xuICAgICAgICBjb25zdCBwcmV2aW91cyA9IGFjdGlvbkJ0bi50ZXh0Q29udGVudDtcbiAgICAgICAgYWN0aW9uQnRuLmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgICAgYWN0aW9uQnRuLnRleHRDb250ZW50ID0gJ1N1bW1hcml6aW5nLi4uJztcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBhaS5zdW1tYXJpemVUZXh0KGNvdXJzZVN1bW1hcnlJbnB1dChjb3Vyc2UsIHRvcGljcyksIHsgYnVsbGV0czogNiB9KTtcbiAgICAgICAgICBpZiAoIXJlc3VsdD8ub2sgfHwgIXJlc3VsdC50ZXh0KSB0aHJvdyBuZXcgRXJyb3IocmVzdWx0Py5yZWFzb24gfHwgJ3N1bW1hcnktZmFpbGVkJyk7XG4gICAgICAgICAgYXdhaXQgYWkuc2F2ZVN1bW1hcnlOb3RlPy4oe1xuICAgICAgICAgICAgc3VtbWFyeTogcmVzdWx0LnRleHQsXG4gICAgICAgICAgICB0aXRsZTogYCR7Y291cnNlLnRpdGxlIHx8IGNvdXJzZUlkfSBBSSBzdW1tYXJ5YCxcbiAgICAgICAgICAgIHNvdXJjZUxhYmVsOiBjb3Vyc2UudGl0bGUgfHwgY291cnNlSWQsXG4gICAgICAgICAgICBub3RlOiB7IGlkOiBgY291cnNlLWFpLXN1bW1hcnktJHtjb3Vyc2VJZH0tJHtEYXRlLm5vdygpfWAsIHNvdXJjZVR5cGU6ICdjb3Vyc2UnLCBjb3Vyc2VJZCwgdGFnczogWydjb3Vyc2UnLCAnYWktc3VtbWFyeSddIH0sXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgaWYgKHN0YXR1c0VsKSBzdGF0dXNFbC50ZXh0Q29udGVudCA9ICdBSSBzdW1tYXJ5IHNhdmVkIHRvIE5vdGVzJztcbiAgICAgICAgICBUb2FzdC5zdWNjZXNzKCdDb3Vyc2UgQUkgc3VtbWFyeSBzYXZlZCcpO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICBpZiAoc3RhdHVzRWwpIHN0YXR1c0VsLnRleHRDb250ZW50ID0gJ0FJIHN1bW1hcnkgZmFpbGVkJztcbiAgICAgICAgICBUb2FzdC5lcnJvcignQ291cnNlIEFJIHN1bW1hcnkgZmFpbGVkJyk7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgYWN0aW9uQnRuLmRpc2FibGVkID0gZmFsc2U7XG4gICAgICAgICAgYWN0aW9uQnRuLnRleHRDb250ZW50ID0gcHJldmlvdXM7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3Qgcm93ID0gdGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLXRvcGljLWlkXScpO1xuICAgICAgaWYgKCFyb3cpIHJldHVybjtcbiAgICAgIGNvbnN0IHRvcGljSWQgPSByb3cuZGF0YXNldC50b3BpY0lkO1xuICAgICAgY29uc3QgY291cnNlSWQgPSByb3cuZGF0YXNldC5jb3Vyc2VJZDtcbiAgICAgIGNvbnN0IHRvcGljID0gKHdpbmRvdy5EYXRhU3RvcmU/LmFsbFRvcGljcz8uKCkgPz8gW10pLmZpbmQodCA9PiB0LnRvcGljSWQgPT09IHRvcGljSWQpO1xuICAgICAgaWYgKCF0b3BpYykgcmV0dXJuO1xuXG4gICAgICBpZiAoYWN0aW9uID09PSAndG9nZ2xlLWRvbmUnKSB7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nID0gYXdhaXQgd2luZG93LkRCPy5nZXRQcm9ncmVzcz8uKHRvcGljSWQpO1xuICAgICAgICBjb25zdCBpc0RvbmUgPSBleGlzdGluZz8uc3RhdHVzID09PSAnZG9uZSc7XG4gICAgICAgIGF3YWl0IHdpbmRvdy5EQj8uc2F2ZVByb2dyZXNzPy4odG9waWNJZCwgY291cnNlSWQsIHtcbiAgICAgICAgICBzdGF0dXM6IGlzRG9uZSA/ICdub3Qtc3RhcnRlZCcgOiAnZG9uZScsXG4gICAgICAgICAgcGVyY2VudDogaXNEb25lID8gMCA6IDEwMCxcbiAgICAgICAgICB1cGRhdGVkQXQ6IERhdGUubm93KCksXG4gICAgICAgIH0pO1xuICAgICAgICAvLyBSZS1yZW5kZXIgY3VycmVudCBjb3Vyc2VcbiAgICAgICAgcmVuZGVyQ291cnNlRGV0YWlsKGNvdXJzZUlkKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAoYWN0aW9uID09PSAnb3Blbi1wZGYnKSB7XG4gICAgICAgIGNvbnN0IHVybCA9IHNhZmVNZWRpYVVybCh0b3BpYy5wZGZzPy5bMF0pO1xuICAgICAgICBpZiAoIXVybCkgcmV0dXJuO1xuICAgICAgICBSb3V0ZXIubmF2aWdhdGUoJyMvcGRmJyk7XG4gICAgICAgIC8vIFdhaXQgYSB0aWNrIGZvciB0aGUgdmlldyB0byBtb3VudCwgdGhlbiBsb2FkXG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgIHRyeSB7IHdpbmRvdy5QbGFzbWFQREZWaWV3ZXI/LmxvYWQ/Lih1cmwpOyB9IGNhdGNoIHt9XG4gICAgICAgIH0sIDUwKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAoYWN0aW9uID09PSAncGxheS12aWRlbycpIHtcbiAgICAgICAgY29uc3QgdXJsID0gc2FmZU1lZGlhVXJsKHRvcGljLnZpZGVvcz8uWzBdKTtcbiAgICAgICAgaWYgKCF1cmwpIHJldHVybjtcbiAgICAgICAgLy8gRW5zdXJlIHBsYXllciBleGlzdHMgYW5kIGhhcyBhbiBpbnN0YW5jZVxuICAgICAgICBjb25zdCBlbCA9IHBsYXllckVsO1xuICAgICAgICBjb25zdCBpbnN0ID0gZWw/Ll9wZFBsYXllcjtcbiAgICAgICAgaWYgKGluc3Q/LmxvYWRQbGF5bGlzdCkge1xuICAgICAgICAgIGJpbmRDb3Vyc2VQbGF5ZXJQcm9ncmVzcygpO1xuICAgICAgICAgIGluc3QubG9hZFBsYXlsaXN0KFtjb3Vyc2VNZWRpYVRyYWNrKHRvcGljLCB1cmwsIGNvdXJzZUlkKV0sIHRydWUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIEZhbGxiYWNrOiB0cnkgdG8gaW5pdCB0aGVuIGxvYWRcbiAgICAgICAgICB0cnkgeyB3aW5kb3cuUGxhc21hRGVjaz8uUGxheWVyPy5pbml0Py4oKTsgfSBjYXRjaCB7fVxuICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgaTIgPSBlbD8uX3BkUGxheWVyO1xuICAgICAgICAgICAgYmluZENvdXJzZVBsYXllclByb2dyZXNzKCk7XG4gICAgICAgICAgICBpMj8ubG9hZFBsYXlsaXN0Py4oW2NvdXJzZU1lZGlhVHJhY2sodG9waWMsIHVybCwgY291cnNlSWQpXSwgdHJ1ZSk7XG4gICAgICAgICAgfSwgNTApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICBjb25zdCBiaW5kQ291cnNlUGxheWVyUHJvZ3Jlc3MgPSAoKSA9PiB7XG4gICAgLy8gUGVyc2lzdCB3YXRjaCBwcm9ncmVzcyBpbnRvIERCIGFzIHRoZSBwbGF5ZXIgcnVucyAoaWRlbXBvdGVudCBwZXIgcGxheWVyIGVsZW1lbnQpXG4gICAgaWYgKCFwbGF5ZXJFbCB8fCBwbGF5ZXJFbC5kYXRhc2V0LnBkUHJvZ3Jlc3NCb3VuZCkgcmV0dXJuO1xuICAgIGNvbnN0IGluc3QgPSBwbGF5ZXJFbC5fcGRQbGF5ZXI7XG4gICAgaWYgKCFpbnN0KSByZXR1cm47XG4gICAgcGxheWVyRWwuZGF0YXNldC5wZFByb2dyZXNzQm91bmQgPSAndHJ1ZSc7XG4gICAgY29uc3QgdGhyb3R0bGVNcyA9IDI1MDA7XG4gICAgbGV0IGxhc3RTYXZlID0gMDtcblxuICAgIGNvbnN0IHNhdmUgPSBhc3luYyAodHJhY2ssIHsgY3VycmVudFRpbWUsIGR1cmF0aW9uLCBwZXJjZW50IH0gPSB7fSkgPT4ge1xuICAgICAgY29uc3QgdCA9IHRyYWNrID8/IGluc3Q/LnF1ZXVlPy5baW5zdD8udHJhY2tJbmRleCA/PyAwXSA/PyBudWxsO1xuICAgICAgY29uc3QgdG9waWNJZCA9IHQ/LnRvcGljSWQ7XG4gICAgICBjb25zdCBjb3Vyc2VJZCA9IHQ/LmNvdXJzZUlkO1xuICAgICAgaWYgKCF0b3BpY0lkIHx8ICFjb3Vyc2VJZCkgcmV0dXJuO1xuXG4gICAgICBjb25zdCBjdXIgPSBjdXJyZW50VGltZSA/PyBpbnN0Py5jdXJyZW50VGltZSA/PyAwO1xuICAgICAgY29uc3QgZHVyID0gZHVyYXRpb24gPz8gaW5zdD8uZHVyYXRpb24gPz8gMDtcbiAgICAgIGNvbnN0IHBjdCA9IHBlcmNlbnQgPz8gKGR1ciA+IDAgPyBNYXRoLnJvdW5kKChjdXIgLyBkdXIpICogMTAwKSA6IDApO1xuXG4gICAgICBjb25zdCBzdGF0dXMgPSBwY3QgPj0gOTggPyAnZG9uZScgOiAocGN0ID4gMCA/ICdpbi1wcm9ncmVzcycgOiAnbm90LXN0YXJ0ZWQnKTtcbiAgICAgIGF3YWl0IHdpbmRvdy5EQj8uc2F2ZVByb2dyZXNzPy4odG9waWNJZCwgY291cnNlSWQsIHtcbiAgICAgICAgcG9zaXRpb246IE1hdGgubWF4KDAsIGN1ciksXG4gICAgICAgIGR1cmF0aW9uOiBNYXRoLm1heCgwLCBkdXIgfHwgMCksXG4gICAgICAgIHBlcmNlbnQ6IE1hdGgubWF4KDAsIE1hdGgubWluKDEwMCwgcGN0IHx8IDApKSxcbiAgICAgICAgc3RhdHVzLFxuICAgICAgICB1cGRhdGVkQXQ6IERhdGUubm93KCksXG4gICAgICB9KTtcbiAgICB9O1xuXG4gICAgY29uc3Qgc2F2ZUN1cnJlbnQgPSAoKSA9PiBzYXZlKG51bGwpO1xuICAgIGZsdXNoUGxheWVyUHJvZ3Jlc3MgPSBzYXZlQ3VycmVudDtcbiAgICBjb25zdCBvblRpbWVVcGRhdGUgPSBhc3luYyAocGF5bG9hZCkgPT4ge1xuICAgICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgICAgIGlmIChub3cgLSBsYXN0U2F2ZSA8IHRocm90dGxlTXMpIHJldHVybjtcbiAgICAgIGxhc3RTYXZlID0gbm93O1xuICAgICAgYXdhaXQgc2F2ZShudWxsLCBwYXlsb2FkKTtcbiAgICB9O1xuICAgIGNvbnN0IG9uUGF1c2UgPSBhc3luYyAodHJhY2spID0+IHtcbiAgICAgIGF3YWl0IHNhdmUodHJhY2spO1xuICAgIH07XG4gICAgY29uc3Qgb25TZWVrZWQgPSBhc3luYyAocGF5bG9hZCkgPT4ge1xuICAgICAgYXdhaXQgc2F2ZShwYXlsb2FkPy50cmFjaywgcGF5bG9hZCk7XG4gICAgfTtcbiAgICBjb25zdCBvbkVuZGVkID0gYXN5bmMgKHRyYWNrKSA9PiB7XG4gICAgICBhd2FpdCBzYXZlKHRyYWNrLCB7IGN1cnJlbnRUaW1lOiBpbnN0Py5kdXJhdGlvbiA/PyAwLCBkdXJhdGlvbjogaW5zdD8uZHVyYXRpb24gPz8gMCwgcGVyY2VudDogMTAwIH0pO1xuICAgIH07XG4gICAgY29uc3Qgb25CZWZvcmVUcmFja0NoYW5nZSA9IGFzeW5jICh0cmFjaykgPT4ge1xuICAgICAgYXdhaXQgc2F2ZSh0cmFjayk7XG4gICAgfTtcbiAgICBjb25zdCBvblRyYWNrQ2hhbmdlID0gYXN5bmMgKHRyYWNrKSA9PiB7XG4gICAgICAvLyBSZWNvcmQgYSBcInN0YXJ0XCIgdG91Y2ggc28gaXQgc2hvd3MgdXAgaW4gYWN0aXZpdHkvc3RyZWFrc1xuICAgICAgYXdhaXQgc2F2ZSh0cmFjaywgeyBjdXJyZW50VGltZTogMCwgZHVyYXRpb246IGluc3Q/LmR1cmF0aW9uID8/IDAsIHBlcmNlbnQ6IDAgfSk7XG4gICAgfTtcbiAgICBjb25zdCBvbkJlZm9yZVVubG9hZCA9ICgpID0+IHsgc2F2ZUN1cnJlbnQoKTsgfTtcblxuICAgIGluc3Q/Lm9uPy4oJ3RpbWV1cGRhdGUnLCBvblRpbWVVcGRhdGUpO1xuICAgIGluc3Q/Lm9uPy4oJ3BhdXNlJywgb25QYXVzZSk7XG4gICAgaW5zdD8ub24/Lignc2Vla2VkJywgb25TZWVrZWQpO1xuICAgIGluc3Q/Lm9uPy4oJ2VuZGVkJywgb25FbmRlZCk7XG4gICAgaW5zdD8ub24/LignYmVmb3JlVHJhY2tDaGFuZ2UnLCBvbkJlZm9yZVRyYWNrQ2hhbmdlKTtcbiAgICBpbnN0Py5vbj8uKCd0cmFja0NoYW5nZScsIG9uVHJhY2tDaGFuZ2UpO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdiZWZvcmV1bmxvYWQnLCBvbkJlZm9yZVVubG9hZCk7XG4gICAgcm91dGVEaXNwb3NlcnMucHVzaCgoKSA9PiB7XG4gICAgICBpbnN0Py5vZmY/LigndGltZXVwZGF0ZScsIG9uVGltZVVwZGF0ZSk7XG4gICAgICBpbnN0Py5vZmY/LigncGF1c2UnLCBvblBhdXNlKTtcbiAgICAgIGluc3Q/Lm9mZj8uKCdzZWVrZWQnLCBvblNlZWtlZCk7XG4gICAgICBpbnN0Py5vZmY/LignZW5kZWQnLCBvbkVuZGVkKTtcbiAgICAgIGluc3Q/Lm9mZj8uKCdiZWZvcmVUcmFja0NoYW5nZScsIG9uQmVmb3JlVHJhY2tDaGFuZ2UpO1xuICAgICAgaW5zdD8ub2ZmPy4oJ3RyYWNrQ2hhbmdlJywgb25UcmFja0NoYW5nZSk7XG4gICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignYmVmb3JldW5sb2FkJywgb25CZWZvcmVVbmxvYWQpO1xuICAgIH0pO1xuICB9O1xuXG4gIGNvbnN0IHNldHVwQ291cnNlQXV0b1BpY3R1cmVJblBpY3R1cmUgPSAoKSA9PiB7XG4gICAgaWYgKCFwbGF5ZXJFbCB8fCB0eXBlb2Ygd2luZG93LkludGVyc2VjdGlvbk9ic2VydmVyICE9PSAnZnVuY3Rpb24nKSByZXR1cm47XG4gICAgaWYgKHBsYXllckVsLmRhdGFzZXQucGRBdXRvUGlwQm91bmQpIHJldHVybjtcbiAgICBwbGF5ZXJFbC5kYXRhc2V0LnBkQXV0b1BpcEJvdW5kID0gJ3RydWUnO1xuICAgIGxldCByZXF1ZXN0ZWRGb3JIaWRkZW5QYXNzID0gZmFsc2U7XG4gICAgY29uc3Qgb2JzZXJ2ZXIgPSBuZXcgd2luZG93LkludGVyc2VjdGlvbk9ic2VydmVyKChlbnRyaWVzKSA9PiB7XG4gICAgICBjb25zdCBlbnRyeSA9IGVudHJpZXMuZmluZChpdGVtID0+IGl0ZW0udGFyZ2V0ID09PSBwbGF5ZXJFbCk7XG4gICAgICBpZiAoIWVudHJ5KSByZXR1cm47XG4gICAgICBjb25zdCB2aXNpYmxlID0gZW50cnkuaXNJbnRlcnNlY3RpbmcgJiYgTnVtYmVyKGVudHJ5LmludGVyc2VjdGlvblJhdGlvID8/IDApID49IDAuMjtcbiAgICAgIGlmICh2aXNpYmxlKSB7XG4gICAgICAgIHJlcXVlc3RlZEZvckhpZGRlblBhc3MgPSBmYWxzZTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKHJlcXVlc3RlZEZvckhpZGRlblBhc3MpIHJldHVybjtcbiAgICAgIGNvbnN0IHNuYXBzaG90ID0gcGxheWVyRWwuX3BkUGxheWVyPy5zbmFwc2hvdD8uKCk7XG4gICAgICBpZiAoIXNuYXBzaG90Py5wbGF5aW5nKSByZXR1cm47XG4gICAgICByZXF1ZXN0ZWRGb3JIaWRkZW5QYXNzID0gdHJ1ZTtcbiAgICAgIHdpbmRvdy5QbGFzbWFEZWNrPy5QbGF5ZXI/LnJlcXVlc3RBY3RpdmVQaWN0dXJlSW5QaWN0dXJlPy4oZG9jdW1lbnQpLmNhdGNoPy4oKCkgPT4ge30pO1xuICAgIH0sIHsgdGhyZXNob2xkOiBbMCwgMC4yLCAwLjYsIDFdIH0pO1xuICAgIG9ic2VydmVyLm9ic2VydmUocGxheWVyRWwpO1xuICAgIHJvdXRlRGlzcG9zZXJzLnB1c2goKCkgPT4ge1xuICAgICAgb2JzZXJ2ZXIuZGlzY29ubmVjdD8uKCk7XG4gICAgICBkZWxldGUgcGxheWVyRWw/LmRhdGFzZXQ/LnBkQXV0b1BpcEJvdW5kO1xuICAgIH0pO1xuICB9O1xuXG4gIGJpbmRDb3Vyc2VQbGF5ZXJQcm9ncmVzcygpO1xuICBzZXR1cENvdXJzZUF1dG9QaWN0dXJlSW5QaWN0dXJlKCk7XG5cbiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtc2F2ZS10aW1lc3RhbXBdJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgIHNhdmVUaW1lc3RhbXBDYXB0dXJlKHsgY3JlYXRlTm90ZTogZmFsc2UgfSk7XG4gIH0pO1xuICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1zYXZlLXRpbWVzdGFtcC1ub3RlXScpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICBzYXZlVGltZXN0YW1wQ2FwdHVyZSh7IGNyZWF0ZU5vdGU6IHRydWUgfSk7XG4gIH0pO1xuICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1zYXZlLWNoYXB0ZXItY3VlXScpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICBzYXZlTGVhcm5pbmdDdWUoJ2NoYXB0ZXInKTtcbiAgfSk7XG4gIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXNhdmUtdHJhbnNjcmlwdC1jdWVdJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgIHNhdmVMZWFybmluZ0N1ZSgndHJhbnNjcmlwdCcpO1xuICB9KTtcbiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtcmV2aWV3LWxlYXJuaW5nLWN1ZXNdJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgIHJlbmRlckxlYXJuaW5nQ3VlTGlzdCgpO1xuICB9KTtcbiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZXhwb3J0LWFjdGl2ZS1sZWFybmluZy1jdWVzXScpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICBleHBvcnRBY3RpdmVMZWFybmluZ0N1ZXMoKTtcbiAgfSk7XG4gIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWFwcGx5LWFjdGl2ZS1sZWFybmluZy1jdWVzXScpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICBhcHBseUFjdGl2ZUxlYXJuaW5nQ3VlcygpO1xuICB9KTtcbiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZXhwb3J0LWxlYXJuaW5nLWN1ZXNdJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgIGV4cG9ydExlYXJuaW5nQ3VlcygpO1xuICB9KTtcbiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtaW1wb3J0LWxlYXJuaW5nLWN1ZXNdJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgIGltcG9ydExlYXJuaW5nQ3VlcygpO1xuICB9KTtcbiAgbGVhcm5pbmdNYXJrZXJMaXN0RWw/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgYnV0dG9uID0gZXZlbnRUYXJnZXRFbChldmVudCk/LmNsb3Nlc3Q/LignW2RhdGEtZGVsZXRlLWxlYXJuaW5nLWN1ZV0nKTtcbiAgICBpZiAoIWJ1dHRvbikgcmV0dXJuO1xuICAgIGRlbGV0ZUxlYXJuaW5nQ3VlKGJ1dHRvbi5kYXRhc2V0LmRlbGV0ZUxlYXJuaW5nQ3VlLCBOdW1iZXIoYnV0dG9uLmRhdGFzZXQuY3VlSW5kZXgpKTtcbiAgfSk7XG4gIHdpbmRvdy5QbGFzbWFEZWNrPy5idXMub24/Lignc3luYzptZXNzYWdlJywgb25Db3Vyc2VTeW5jTWVzc2FnZSk7XG4gIHJvdXRlRGlzcG9zZXJzLnB1c2goKCkgPT4gd2luZG93LlBsYXNtYURlY2s/LmJ1cy5vZmY/Lignc3luYzptZXNzYWdlJywgb25Db3Vyc2VTeW5jTWVzc2FnZSkpO1xuXG4gIC8vIEF1dG8tc2VsZWN0IGZpcnN0IGNvdXJzZVxuICBjb25zdCBwZW5kaW5nU2Vzc2lvbiA9IGNvbnN1bWVQZW5kaW5nQ291cnNlU2Vzc2lvbigpO1xuICBjb25zdCBwZW5kaW5nVG9waWNJZCA9IHNlc3Npb25TdG9yYWdlLmdldEl0ZW0oJ3BsYXNtYV9wZW5kaW5nX3RvcGljJyk7XG4gIGNvbnN0IHBlbmRpbmdQb3NpdGlvbiA9IE51bWJlcihzZXNzaW9uU3RvcmFnZS5nZXRJdGVtKCdwbGFzbWFfcGVuZGluZ19wb3NpdGlvbicpIHx8IDApO1xuICBpZiAocGVuZGluZ1RvcGljSWQpIHNlc3Npb25TdG9yYWdlLnJlbW92ZUl0ZW0oJ3BsYXNtYV9wZW5kaW5nX3RvcGljJyk7XG4gIGlmIChwZW5kaW5nUG9zaXRpb24pIHNlc3Npb25TdG9yYWdlLnJlbW92ZUl0ZW0oJ3BsYXNtYV9wZW5kaW5nX3Bvc2l0aW9uJyk7XG5cbiAgY29uc3Qgc2VsZWN0Q291cnNlID0gKGNvdXJzZUlkKSA9PiB7XG4gICAgY29uc3QgYnRuID0gbGlzdEVsLnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWNvdXJzZS1pZD1cIiR7Y291cnNlSWR9XCJdYCk7XG4gICAgaWYgKCFidG4pIHJldHVybiBmYWxzZTtcbiAgICAkJCgnLmNvdXJzZS1pdGVtJywgbGlzdEVsKS5mb3JFYWNoKHggPT4geC5jbGFzc0xpc3QudG9nZ2xlKCdhY3RpdmUnLCB4ID09PSBidG4pKTtcbiAgICBjb3Vyc2VGYWNldFN0YXRlLnNlbGVjdGVkQ291cnNlSWQgPSBjb3Vyc2VJZDtcbiAgICByZW5kZXJDb3Vyc2VEZXRhaWwoY291cnNlSWQpO1xuICAgIHJldHVybiB0cnVlO1xuICB9O1xuXG4gIGNvbnN0IGNvdXJzZUZpbHRlclJvb3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuY291cnNlcy1zaWRlYmFyJyk7XG4gIGlmIChjb3Vyc2VGaWx0ZXJSb290ICYmICFjb3Vyc2VGaWx0ZXJSb290LmRhdGFzZXQucGRDb3Vyc2VGYWNldEJvdW5kKSB7XG4gICAgY291cnNlRmlsdGVyUm9vdC5kYXRhc2V0LnBkQ291cnNlRmFjZXRCb3VuZCA9ICd0cnVlJztcbiAgICBjb3Vyc2VGaWx0ZXJSb290LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGV2ZW50KSA9PiB7XG4gICAgICBjb25zdCBidXR0b24gPSBldmVudC50YXJnZXQ/LmNsb3Nlc3Q/LignW2RhdGEtY291cnNlLWZpbHRlcl0nKTtcbiAgICAgIGlmICghYnV0dG9uKSByZXR1cm47XG4gICAgICBjb3Vyc2VGYWNldFN0YXRlLmZpbHRlciA9IGJ1dHRvbi5kYXRhc2V0LmNvdXJzZUZpbHRlciB8fCAnYWxsJztcbiAgICAgIGNvdXJzZUZpbHRlclJvb3QucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtY291cnNlLWZpbHRlcl0nKS5mb3JFYWNoKChidG4pID0+IHtcbiAgICAgICAgY29uc3QgYWN0aXZlID0gYnRuID09PSBidXR0b247XG4gICAgICAgIGJ0bi5jbGFzc0xpc3QudG9nZ2xlKCdhY3RpdmUnLCBhY3RpdmUpO1xuICAgICAgICBidG4uc2V0QXR0cmlidXRlKCdhcmlhLXByZXNzZWQnLCBhY3RpdmUgPyAndHJ1ZScgOiAnZmFsc2UnKTtcbiAgICAgIH0pO1xuICAgICAgcmVuZGVyQ291cnNlcyhjb3Vyc2VGYWNldFN0YXRlLnF1ZXJ5KTtcbiAgICAgIGNvbnN0IGZpcnN0VmlzaWJsZSA9IGxpc3RFbC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1jb3Vyc2UtaWRdJyk7XG4gICAgICBpZiAoZmlyc3RWaXNpYmxlKSB7XG4gICAgICAgIGZpcnN0VmlzaWJsZS5jbGFzc0xpc3QuYWRkKCdhY3RpdmUnKTtcbiAgICAgICAgY291cnNlRmFjZXRTdGF0ZS5zZWxlY3RlZENvdXJzZUlkID0gZmlyc3RWaXNpYmxlLmRhdGFzZXQuY291cnNlSWQgfHwgJyc7XG4gICAgICAgIHJlbmRlckNvdXJzZURldGFpbChjb3Vyc2VGYWNldFN0YXRlLnNlbGVjdGVkQ291cnNlSWQpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgaWYgKHBlbmRpbmdTZXNzaW9uKSB7XG4gICAgY29uc3QgcGVuZGluZ1RyYWNrID0gcGVuZGluZ1Nlc3Npb24udHJhY2sgfHwgcGVuZGluZ1Nlc3Npb24ucXVldWVbcGVuZGluZ1Nlc3Npb24ucXVldWVJbmRleF0gfHwgcGVuZGluZ1Nlc3Npb24ucXVldWVbMF07XG4gICAgY29uc3QgZmFsbGJhY2tDb3Vyc2VJZCA9IHBlbmRpbmdUcmFjaz8uY291cnNlSWQgfHwgcGVuZGluZ1Nlc3Npb24ucXVldWUuZmluZChpdGVtID0+IGl0ZW0/LmNvdXJzZUlkKT8uY291cnNlSWQ7XG4gICAgaWYgKGZhbGxiYWNrQ291cnNlSWQgJiYgc2VsZWN0Q291cnNlKGZhbGxiYWNrQ291cnNlSWQpKSB7XG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgY29uc3QgaW5zdCA9IHBsYXllckVsPy5fcGRQbGF5ZXI7XG4gICAgICAgIGlmICghaW5zdCkgcmV0dXJuO1xuICAgICAgICBiaW5kQ291cnNlUGxheWVyUHJvZ3Jlc3MoKTtcbiAgICAgICAgaWYgKGluc3QucmVzdG9yZVNuYXBzaG90Py4ocGVuZGluZ1Nlc3Npb24pKSByZXR1cm47XG4gICAgICAgIGlmIChpbnN0LmxvYWRQbGF5bGlzdCkge1xuICAgICAgICAgIGluc3QubG9hZFBsYXlsaXN0KHBlbmRpbmdTZXNzaW9uLnF1ZXVlLCBmYWxzZSk7XG4gICAgICAgICAgaWYgKE51bWJlci5pc0Zpbml0ZShOdW1iZXIocGVuZGluZ1Nlc3Npb24ucXVldWVJbmRleCkpICYmIE51bWJlcihwZW5kaW5nU2Vzc2lvbi5xdWV1ZUluZGV4KSA+IDApIHtcbiAgICAgICAgICAgIHRyeSB7IGluc3QucGxheUF0Py4oTnVtYmVyKHBlbmRpbmdTZXNzaW9uLnF1ZXVlSW5kZXgpKTsgfSBjYXRjaCB7fVxuICAgICAgICAgICAgaWYgKCFwZW5kaW5nU2Vzc2lvbi5wbGF5aW5nKSB7XG4gICAgICAgICAgICAgIHRyeSB7IGluc3QucGF1c2U/LigpOyB9IGNhdGNoIHt9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmIChwZW5kaW5nU2Vzc2lvbi5wbGF5aW5nKSB7XG4gICAgICAgICAgICB0cnkgeyBpbnN0LnBsYXk/LigpOyB9IGNhdGNoIHt9XG4gICAgICAgICAgfVxuICAgICAgICAgIHNlZWtQbGF5ZXJUb1BlbmRpbmdQb3NpdGlvbihpbnN0LCBwZW5kaW5nU2Vzc2lvbi5jdXJyZW50VGltZSk7XG4gICAgICAgIH1cbiAgICAgIH0sIDEyMCk7XG4gICAgICByZXR1cm4gcm91dGVDb250cm9sbGVyO1xuICAgIH1cbiAgfVxuXG4gIGlmIChwZW5kaW5nVG9waWNJZCkge1xuICAgIGNvbnN0IHQgPSBhbGxUb3BpY3MuZmluZCh4ID0+IHgudG9waWNJZCA9PT0gcGVuZGluZ1RvcGljSWQpO1xuICAgIGlmICh0ICYmIHNlbGVjdENvdXJzZSh0LmNvdXJzZUlkKSkge1xuICAgICAgLy8gQXV0b3BsYXkgYWZ0ZXIgZGV0YWlsIGlzIHJlbmRlcmVkXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgY29uc3QgdXJsID0gc2FmZU1lZGlhVXJsKHQudmlkZW9zPy5bMF0pO1xuICAgICAgICBpZiAoIXVybCkgcmV0dXJuO1xuICAgICAgICBjb25zdCBlbCA9IHBsYXllckVsO1xuICAgICAgICBjb25zdCBpbnN0ID0gZWw/Ll9wZFBsYXllcjtcbiAgICAgICAgaWYgKGluc3Q/LmxvYWRQbGF5bGlzdCkge1xuICAgICAgICAgIGJpbmRDb3Vyc2VQbGF5ZXJQcm9ncmVzcygpO1xuICAgICAgICAgIGluc3QubG9hZFBsYXlsaXN0KFtjb3Vyc2VNZWRpYVRyYWNrKHQsIHVybCwgdC5jb3Vyc2VJZCldLCB0cnVlKTtcbiAgICAgICAgICBzZWVrUGxheWVyVG9QZW5kaW5nUG9zaXRpb24oaW5zdCwgcGVuZGluZ1Bvc2l0aW9uKTtcbiAgICAgICAgfVxuICAgICAgfSwgMTIwKTtcbiAgICAgIHJldHVybiByb3V0ZUNvbnRyb2xsZXI7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgZmlyc3QgPSBsaXN0RWwucXVlcnlTZWxlY3RvcignW2RhdGEtY291cnNlLWlkXScpO1xuICBpZiAoZmlyc3QpIHtcbiAgICBmaXJzdC5jbGFzc0xpc3QuYWRkKCdhY3RpdmUnKTtcbiAgICByZW5kZXJDb3Vyc2VEZXRhaWwoZmlyc3QuZGF0YXNldC5jb3Vyc2VJZCk7XG4gIH1cbiAgcmV0dXJuIHJvdXRlQ29udHJvbGxlcjtcbn1cblxuXG5cbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBQSxlQUFzQixpQkFBaUIsT0FBTyxDQUFDLEdBQUc7QUFDaEQsUUFBTTtBQUFBLElBQ0o7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBLFFBQVEsT0FBTyxZQUFZO0FBQUEsSUFDM0I7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLEVBQ0YsSUFBSTtBQUVKLFVBQVE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtB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
