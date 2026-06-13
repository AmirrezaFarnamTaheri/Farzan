// src/views/homeRoute.js
function mountHomeView(deps = {}) {
  const {
    setView,
    Router,
    setPendingCourseMedia
  } = deps;
  setView(`
    <section class="view view-home">
      <div class="home-hero card card-filled">
        <div class="home-hero-copy">
          <span class="eyebrow">Local-first learning studio</span>
          <h1 class="home-title">Your study command deck is ready.</h1>
          <p class="home-subtitle">Open a course, capture notes, mark progress, and keep backups close. PlasmaDeck stores your work on this device unless you export it.</p>
          <div class="home-actions">
            <a class="btn btn-primary" href="#/courses">
              <i class="fa-solid fa-graduation-cap" aria-hidden="true"></i>
              Browse courses
            </a>
            <a class="btn btn-ghost" href="#/notes">
              <i class="fa-solid fa-note-sticky" aria-hidden="true"></i>
              Write notes
            </a>
            <a class="btn btn-ghost" href="#/help">
              <i class="fa-solid fa-circle-question" aria-hidden="true"></i>
              First-run guide
            </a>
          </div>
        </div>
        <div class="home-orbit" aria-hidden="true">
          <div class="home-orbit-core">PD</div>
          <span style="--i:0">Notes</span>
          <span style="--i:1">PDF</span>
          <span style="--i:2">Video</span>
          <span style="--i:3">Canvas</span>
        </div>
      </div>

      <div class="home-grid">
        <section class="card card-filled home-card home-card-wide">
          <div class="card-body">
            <div class="home-card-head">
              <div>
                <span class="eyebrow">Next best steps</span>
                <h2 class="home-card-title">Start strong in three clicks</h2>
              </div>
              <kbd>Ctrl+K</kbd>
            </div>
            <div class="home-steps">
              <a href="#/courses">
                <span>1</span>
                <strong>Choose a course</strong>
                <small>Browse the catalog and open the first lesson.</small>
              </a>
              <a href="#/notes">
                <span>2</span>
                <strong>Create a note</strong>
                <small>Capture ideas, links, code blocks, and tags.</small>
              </a>
              <a href="#/progress">
                <span>3</span>
                <strong>Review progress</strong>
                <small>Export backups before changing browser or port.</small>
              </a>
            </div>
          </div>
        </section>

        <section class="card card-filled home-card">
          <div class="card-body">
            <span class="eyebrow">Library snapshot</span>
            <div class="home-stat"><strong id="home-course-count">-</strong><span>Courses</span></div>
            <div class="home-stat"><strong id="home-topic-count">-</strong><span>Topics</span></div>
            <p class="home-card-note">Counts load from the active catalog selected in <code>data/catalog.json</code>.</p>
          </div>
        </section>

        <section class="card card-filled home-card">
          <div class="card-body">
            <span class="eyebrow">Daily tools</span>
            <div class="home-tool-list">
              <a href="#/pdf"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i><span>Read PDFs</span></a>
              <a href="#/studio"><i class="fa-solid fa-pen-ruler" aria-hidden="true"></i><span>Sketch in Studio</span></a>
              <a href="#/settings"><i class="fa-solid fa-sliders" aria-hidden="true"></i><span>Tune preferences</span></a>
            </div>
          </div>
        </section>

        <section class="card card-filled home-card home-card-wide">
          <div class="card-body">
            <div class="home-card-head">
              <div>
                <span class="eyebrow">Study dashboard</span>
                <h2 class="home-card-title">Continue, review, and reuse</h2>
              </div>
              <a class="btn btn-ghost btn-sm" href="#/achievements">Review queue</a>
            </div>
            <div class="home-widget-list" data-home-widgets>
              <p class="text-muted">Loading study widgets...</p>
            </div>
          </div>
        </section>
      </div>
    </section>
  `);
  renderCatalogCounts();
  renderHomeWidgets({ Router, setPendingCourseMedia });
}
async function renderCatalogCounts() {
  try {
    await window.DataStore?.init?.();
    const courses = window.DataStore?.allCourses?.() ?? [];
    const topics = window.DataStore?.allTopics?.() ?? [];
    const courseCount = document.getElementById("home-course-count");
    const topicCount = document.getElementById("home-topic-count");
    if (courseCount) courseCount.textContent = String(courses.length);
    if (topicCount) topicCount.textContent = String(topics.length);
  } catch {
    const note = document.querySelector(".home-card-note");
    if (note) note.textContent = "Catalog counts are unavailable right now. Try rebuilding or checking data/catalog.json.";
  }
}
function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const secs = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${minutes}:${String(secs).padStart(2, "0")}`;
}
async function renderHomeWidgets({ Router, setPendingCourseMedia }) {
  const root = document.querySelector("[data-home-widgets]");
  if (!root) return;
  const [progress, notes, timestamps, topics] = await Promise.all([
    (async () => {
      try {
        return await window.DB?.getAllProgress?.() ?? [];
      } catch {
        return [];
      }
    })(),
    (async () => {
      try {
        return await window.DB?.getAllNotes?.() ?? [];
      } catch {
        return [];
      }
    })(),
    (async () => {
      try {
        return await window.DB?.getAllTimestamps?.() ?? [];
      } catch {
        return [];
      }
    })(),
    (async () => {
      try {
        await window.DataStore?.init?.();
        return window.DataStore?.allTopics?.() ?? [];
      } catch {
        return [];
      }
    })()
  ]);
  if (!document.body.contains(root)) return;
  const topicMap = new Map(topics.map((topic) => [topic.topicId, topic]));
  const latestProgress = [...progress].filter((record) => record?.topicId && (Number(record.percent) > 0 || Number(record.position) > 0 || record.status)).sort((a, b) => Number(b.updatedAt || b.completedAt || 0) - Number(a.updatedAt || a.completedAt || 0))[0];
  const latestTimestamp = [...timestamps].filter((item) => item?.topicId).sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0))[0];
  const latestNote = [...notes].sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0))[0];
  const now = Date.now();
  const reviewCutoff = 30 * 24 * 60 * 60 * 1e3;
  const dueReview = [...progress].filter((record) => record?.topicId && (record.status === "done" || Number(record.percent) >= 100)).map((record) => {
    const topic = topicMap.get(record.topicId);
    const relatedTimes = [
      record.reviewedAt,
      record.updatedAt,
      record.completedAt,
      ...timestamps.filter((item) => item?.topicId === record.topicId).map((item) => item.updatedAt || item.createdAt),
      ...notes.filter((item) => item?.topicId === record.topicId).map((item) => item.updatedAt || item.createdAt)
    ].map((value) => Number(value) || 0);
    const lastActivity = Math.max(...relatedTimes, 0);
    return { record, topic, lastActivity };
  }).filter((item) => !item.lastActivity || now - item.lastActivity >= reviewCutoff).sort((a, b) => (a.lastActivity || 0) - (b.lastActivity || 0))[0];
  const widgetData = [
    {
      id: "continue",
      label: "Continue studying",
      title: topicMap.get(latestProgress?.topicId)?.title || latestProgress?.topicTitle || latestTimestamp?.title || latestTimestamp?.topicId || "Open a course",
      detail: latestProgress ? `${Math.round(Number(latestProgress.percent) || 0)}% complete` : latestTimestamp ? `Saved at ${formatDuration(latestTimestamp.position)}` : "Start with the catalog.",
      action: "courses",
      topicId: latestProgress?.topicId || latestTimestamp?.topicId,
      position: latestTimestamp?.position
    },
    {
      id: "review",
      label: "Due review",
      title: dueReview?.topic?.title || dueReview?.record?.topicTitle || dueReview?.record?.topicId || "Nothing due",
      detail: dueReview ? "Revisit a completed topic." : "Completed topics are still fresh.",
      action: dueReview ? "review" : "achievements",
      topicId: dueReview?.record?.topicId
    },
    {
      id: "recent",
      label: "Recent insight",
      title: latestNote?.title || latestTimestamp?.title || "No notes yet",
      detail: latestNote?.sourceType === "pdf" ? `PDF page ${latestNote.pdfPage || latestNote.page || 1}` : latestNote?.topicId ? `Linked to ${latestNote.topicId}` : latestTimestamp ? "Saved timestamp" : "Capture a note or timestamp.",
      action: latestNote ? "notes" : latestTimestamp ? "courses" : "notes",
      topicId: latestTimestamp?.topicId,
      position: latestTimestamp?.position
    }
  ];
  root.replaceChildren();
  widgetData.forEach((widget) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "home-widget";
    card.dataset.homeWidget = widget.id;
    if (widget.topicId) card.dataset.topicId = widget.topicId;
    const eyebrow = document.createElement("span");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = widget.label;
    const title = document.createElement("strong");
    title.textContent = widget.title;
    const detail = document.createElement("small");
    detail.textContent = widget.detail;
    card.append(eyebrow, title, detail);
    card.addEventListener("click", () => {
      if ((widget.action === "courses" || widget.action === "review") && widget.topicId) {
        setPendingCourseMedia(widget.topicId, widget.position);
        Router.navigate("#/courses");
        return;
      }
      Router.navigate(widget.action === "achievements" ? "#/achievements" : "#/notes");
    });
    root.appendChild(card);
  });
}
export {
  mountHomeView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3ZpZXdzL2hvbWVSb3V0ZS5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiZXhwb3J0IGZ1bmN0aW9uIG1vdW50SG9tZVZpZXcoZGVwcyA9IHt9KSB7XG4gIGNvbnN0IHtcbiAgICBzZXRWaWV3LFxuICAgIFJvdXRlcixcbiAgICBzZXRQZW5kaW5nQ291cnNlTWVkaWEsXG4gIH0gPSBkZXBzO1xuXG4gIHNldFZpZXcoYFxuICAgIDxzZWN0aW9uIGNsYXNzPVwidmlldyB2aWV3LWhvbWVcIj5cbiAgICAgIDxkaXYgY2xhc3M9XCJob21lLWhlcm8gY2FyZCBjYXJkLWZpbGxlZFwiPlxuICAgICAgICA8ZGl2IGNsYXNzPVwiaG9tZS1oZXJvLWNvcHlcIj5cbiAgICAgICAgICA8c3BhbiBjbGFzcz1cImV5ZWJyb3dcIj5Mb2NhbC1maXJzdCBsZWFybmluZyBzdHVkaW88L3NwYW4+XG4gICAgICAgICAgPGgxIGNsYXNzPVwiaG9tZS10aXRsZVwiPllvdXIgc3R1ZHkgY29tbWFuZCBkZWNrIGlzIHJlYWR5LjwvaDE+XG4gICAgICAgICAgPHAgY2xhc3M9XCJob21lLXN1YnRpdGxlXCI+T3BlbiBhIGNvdXJzZSwgY2FwdHVyZSBub3RlcywgbWFyayBwcm9ncmVzcywgYW5kIGtlZXAgYmFja3VwcyBjbG9zZS4gUGxhc21hRGVjayBzdG9yZXMgeW91ciB3b3JrIG9uIHRoaXMgZGV2aWNlIHVubGVzcyB5b3UgZXhwb3J0IGl0LjwvcD5cbiAgICAgICAgICA8ZGl2IGNsYXNzPVwiaG9tZS1hY3Rpb25zXCI+XG4gICAgICAgICAgICA8YSBjbGFzcz1cImJ0biBidG4tcHJpbWFyeVwiIGhyZWY9XCIjL2NvdXJzZXNcIj5cbiAgICAgICAgICAgICAgPGkgY2xhc3M9XCJmYS1zb2xpZCBmYS1ncmFkdWF0aW9uLWNhcFwiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPjwvaT5cbiAgICAgICAgICAgICAgQnJvd3NlIGNvdXJzZXNcbiAgICAgICAgICAgIDwvYT5cbiAgICAgICAgICAgIDxhIGNsYXNzPVwiYnRuIGJ0bi1naG9zdFwiIGhyZWY9XCIjL25vdGVzXCI+XG4gICAgICAgICAgICAgIDxpIGNsYXNzPVwiZmEtc29saWQgZmEtbm90ZS1zdGlja3lcIiBhcmlhLWhpZGRlbj1cInRydWVcIj48L2k+XG4gICAgICAgICAgICAgIFdyaXRlIG5vdGVzXG4gICAgICAgICAgICA8L2E+XG4gICAgICAgICAgICA8YSBjbGFzcz1cImJ0biBidG4tZ2hvc3RcIiBocmVmPVwiIy9oZWxwXCI+XG4gICAgICAgICAgICAgIDxpIGNsYXNzPVwiZmEtc29saWQgZmEtY2lyY2xlLXF1ZXN0aW9uXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+PC9pPlxuICAgICAgICAgICAgICBGaXJzdC1ydW4gZ3VpZGVcbiAgICAgICAgICAgIDwvYT5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJob21lLW9yYml0XCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+XG4gICAgICAgICAgPGRpdiBjbGFzcz1cImhvbWUtb3JiaXQtY29yZVwiPlBEPC9kaXY+XG4gICAgICAgICAgPHNwYW4gc3R5bGU9XCItLWk6MFwiPk5vdGVzPC9zcGFuPlxuICAgICAgICAgIDxzcGFuIHN0eWxlPVwiLS1pOjFcIj5QREY8L3NwYW4+XG4gICAgICAgICAgPHNwYW4gc3R5bGU9XCItLWk6MlwiPlZpZGVvPC9zcGFuPlxuICAgICAgICAgIDxzcGFuIHN0eWxlPVwiLS1pOjNcIj5DYW52YXM8L3NwYW4+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG5cbiAgICAgIDxkaXYgY2xhc3M9XCJob21lLWdyaWRcIj5cbiAgICAgICAgPHNlY3Rpb24gY2xhc3M9XCJjYXJkIGNhcmQtZmlsbGVkIGhvbWUtY2FyZCBob21lLWNhcmQtd2lkZVwiPlxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJjYXJkLWJvZHlcIj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJob21lLWNhcmQtaGVhZFwiPlxuICAgICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiZXllYnJvd1wiPk5leHQgYmVzdCBzdGVwczwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8aDIgY2xhc3M9XCJob21lLWNhcmQtdGl0bGVcIj5TdGFydCBzdHJvbmcgaW4gdGhyZWUgY2xpY2tzPC9oMj5cbiAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgIDxrYmQ+Q3RybCtLPC9rYmQ+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJob21lLXN0ZXBzXCI+XG4gICAgICAgICAgICAgIDxhIGhyZWY9XCIjL2NvdXJzZXNcIj5cbiAgICAgICAgICAgICAgICA8c3Bhbj4xPC9zcGFuPlxuICAgICAgICAgICAgICAgIDxzdHJvbmc+Q2hvb3NlIGEgY291cnNlPC9zdHJvbmc+XG4gICAgICAgICAgICAgICAgPHNtYWxsPkJyb3dzZSB0aGUgY2F0YWxvZyBhbmQgb3BlbiB0aGUgZmlyc3QgbGVzc29uLjwvc21hbGw+XG4gICAgICAgICAgICAgIDwvYT5cbiAgICAgICAgICAgICAgPGEgaHJlZj1cIiMvbm90ZXNcIj5cbiAgICAgICAgICAgICAgICA8c3Bhbj4yPC9zcGFuPlxuICAgICAgICAgICAgICAgIDxzdHJvbmc+Q3JlYXRlIGEgbm90ZTwvc3Ryb25nPlxuICAgICAgICAgICAgICAgIDxzbWFsbD5DYXB0dXJlIGlkZWFzLCBsaW5rcywgY29kZSBibG9ja3MsIGFuZCB0YWdzLjwvc21hbGw+XG4gICAgICAgICAgICAgIDwvYT5cbiAgICAgICAgICAgICAgPGEgaHJlZj1cIiMvcHJvZ3Jlc3NcIj5cbiAgICAgICAgICAgICAgICA8c3Bhbj4zPC9zcGFuPlxuICAgICAgICAgICAgICAgIDxzdHJvbmc+UmV2aWV3IHByb2dyZXNzPC9zdHJvbmc+XG4gICAgICAgICAgICAgICAgPHNtYWxsPkV4cG9ydCBiYWNrdXBzIGJlZm9yZSBjaGFuZ2luZyBicm93c2VyIG9yIHBvcnQuPC9zbWFsbD5cbiAgICAgICAgICAgICAgPC9hPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvc2VjdGlvbj5cblxuICAgICAgICA8c2VjdGlvbiBjbGFzcz1cImNhcmQgY2FyZC1maWxsZWQgaG9tZS1jYXJkXCI+XG4gICAgICAgICAgPGRpdiBjbGFzcz1cImNhcmQtYm9keVwiPlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJleWVicm93XCI+TGlicmFyeSBzbmFwc2hvdDwvc3Bhbj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJob21lLXN0YXRcIj48c3Ryb25nIGlkPVwiaG9tZS1jb3Vyc2UtY291bnRcIj4tPC9zdHJvbmc+PHNwYW4+Q291cnNlczwvc3Bhbj48L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJob21lLXN0YXRcIj48c3Ryb25nIGlkPVwiaG9tZS10b3BpYy1jb3VudFwiPi08L3N0cm9uZz48c3Bhbj5Ub3BpY3M8L3NwYW4+PC9kaXY+XG4gICAgICAgICAgICA8cCBjbGFzcz1cImhvbWUtY2FyZC1ub3RlXCI+Q291bnRzIGxvYWQgZnJvbSB0aGUgYWN0aXZlIGNhdGFsb2cgc2VsZWN0ZWQgaW4gPGNvZGU+ZGF0YS9jYXRhbG9nLmpzb248L2NvZGU+LjwvcD5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9zZWN0aW9uPlxuXG4gICAgICAgIDxzZWN0aW9uIGNsYXNzPVwiY2FyZCBjYXJkLWZpbGxlZCBob21lLWNhcmRcIj5cbiAgICAgICAgICA8ZGl2IGNsYXNzPVwiY2FyZC1ib2R5XCI+XG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cImV5ZWJyb3dcIj5EYWlseSB0b29sczwvc3Bhbj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJob21lLXRvb2wtbGlzdFwiPlxuICAgICAgICAgICAgICA8YSBocmVmPVwiIy9wZGZcIj48aSBjbGFzcz1cImZhLXNvbGlkIGZhLWZpbGUtcGRmXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+PC9pPjxzcGFuPlJlYWQgUERGczwvc3Bhbj48L2E+XG4gICAgICAgICAgICAgIDxhIGhyZWY9XCIjL3N0dWRpb1wiPjxpIGNsYXNzPVwiZmEtc29saWQgZmEtcGVuLXJ1bGVyXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+PC9pPjxzcGFuPlNrZXRjaCBpbiBTdHVkaW88L3NwYW4+PC9hPlxuICAgICAgICAgICAgICA8YSBocmVmPVwiIy9zZXR0aW5nc1wiPjxpIGNsYXNzPVwiZmEtc29saWQgZmEtc2xpZGVyc1wiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPjwvaT48c3Bhbj5UdW5lIHByZWZlcmVuY2VzPC9zcGFuPjwvYT5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L3NlY3Rpb24+XG5cbiAgICAgICAgPHNlY3Rpb24gY2xhc3M9XCJjYXJkIGNhcmQtZmlsbGVkIGhvbWUtY2FyZCBob21lLWNhcmQtd2lkZVwiPlxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJjYXJkLWJvZHlcIj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJob21lLWNhcmQtaGVhZFwiPlxuICAgICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiZXllYnJvd1wiPlN0dWR5IGRhc2hib2FyZDwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8aDIgY2xhc3M9XCJob21lLWNhcmQtdGl0bGVcIj5Db250aW51ZSwgcmV2aWV3LCBhbmQgcmV1c2U8L2gyPlxuICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgPGEgY2xhc3M9XCJidG4gYnRuLWdob3N0IGJ0bi1zbVwiIGhyZWY9XCIjL2FjaGlldmVtZW50c1wiPlJldmlldyBxdWV1ZTwvYT5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImhvbWUtd2lkZ2V0LWxpc3RcIiBkYXRhLWhvbWUtd2lkZ2V0cz5cbiAgICAgICAgICAgICAgPHAgY2xhc3M9XCJ0ZXh0LW11dGVkXCI+TG9hZGluZyBzdHVkeSB3aWRnZXRzLi4uPC9wPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvc2VjdGlvbj5cbiAgICAgIDwvZGl2PlxuICAgIDwvc2VjdGlvbj5cbiAgYCk7XG5cbiAgcmVuZGVyQ2F0YWxvZ0NvdW50cygpO1xuICByZW5kZXJIb21lV2lkZ2V0cyh7IFJvdXRlciwgc2V0UGVuZGluZ0NvdXJzZU1lZGlhIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZW5kZXJDYXRhbG9nQ291bnRzKCkge1xuICB0cnkge1xuICAgIGF3YWl0IHdpbmRvdy5EYXRhU3RvcmU/LmluaXQ/LigpO1xuICAgIGNvbnN0IGNvdXJzZXMgPSB3aW5kb3cuRGF0YVN0b3JlPy5hbGxDb3Vyc2VzPy4oKSA/PyBbXTtcbiAgICBjb25zdCB0b3BpY3MgPSB3aW5kb3cuRGF0YVN0b3JlPy5hbGxUb3BpY3M/LigpID8/IFtdO1xuICAgIGNvbnN0IGNvdXJzZUNvdW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2hvbWUtY291cnNlLWNvdW50Jyk7XG4gICAgY29uc3QgdG9waWNDb3VudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdob21lLXRvcGljLWNvdW50Jyk7XG4gICAgaWYgKGNvdXJzZUNvdW50KSBjb3Vyc2VDb3VudC50ZXh0Q29udGVudCA9IFN0cmluZyhjb3Vyc2VzLmxlbmd0aCk7XG4gICAgaWYgKHRvcGljQ291bnQpIHRvcGljQ291bnQudGV4dENvbnRlbnQgPSBTdHJpbmcodG9waWNzLmxlbmd0aCk7XG4gIH0gY2F0Y2gge1xuICAgIGNvbnN0IG5vdGUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuaG9tZS1jYXJkLW5vdGUnKTtcbiAgICBpZiAobm90ZSkgbm90ZS50ZXh0Q29udGVudCA9ICdDYXRhbG9nIGNvdW50cyBhcmUgdW5hdmFpbGFibGUgcmlnaHQgbm93LiBUcnkgcmVidWlsZGluZyBvciBjaGVja2luZyBkYXRhL2NhdGFsb2cuanNvbi4nO1xuICB9XG59XG5cbmZ1bmN0aW9uIGZvcm1hdER1cmF0aW9uKHNlY29uZHMpIHtcbiAgY29uc3QgdG90YWwgPSBNYXRoLm1heCgwLCBNYXRoLmZsb29yKE51bWJlcihzZWNvbmRzKSB8fCAwKSk7XG4gIGNvbnN0IGhvdXJzID0gTWF0aC5mbG9vcih0b3RhbCAvIDM2MDApO1xuICBjb25zdCBtaW51dGVzID0gTWF0aC5mbG9vcigodG90YWwgJSAzNjAwKSAvIDYwKTtcbiAgY29uc3Qgc2VjcyA9IHRvdGFsICUgNjA7XG4gIHJldHVybiBob3Vyc1xuICAgID8gYCR7aG91cnN9OiR7U3RyaW5nKG1pbnV0ZXMpLnBhZFN0YXJ0KDIsICcwJyl9OiR7U3RyaW5nKHNlY3MpLnBhZFN0YXJ0KDIsICcwJyl9YFxuICAgIDogYCR7bWludXRlc306JHtTdHJpbmcoc2VjcykucGFkU3RhcnQoMiwgJzAnKX1gO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZW5kZXJIb21lV2lkZ2V0cyh7IFJvdXRlciwgc2V0UGVuZGluZ0NvdXJzZU1lZGlhIH0pIHtcbiAgY29uc3Qgcm9vdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWhvbWUtd2lkZ2V0c10nKTtcbiAgaWYgKCFyb290KSByZXR1cm47XG4gIGNvbnN0IFtwcm9ncmVzcywgbm90ZXMsIHRpbWVzdGFtcHMsIHRvcGljc10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgKGFzeW5jICgpID0+IHsgdHJ5IHsgcmV0dXJuIGF3YWl0IHdpbmRvdy5EQj8uZ2V0QWxsUHJvZ3Jlc3M/LigpID8/IFtdOyB9IGNhdGNoIHsgcmV0dXJuIFtdOyB9IH0pKCksXG4gICAgKGFzeW5jICgpID0+IHsgdHJ5IHsgcmV0dXJuIGF3YWl0IHdpbmRvdy5EQj8uZ2V0QWxsTm90ZXM/LigpID8/IFtdOyB9IGNhdGNoIHsgcmV0dXJuIFtdOyB9IH0pKCksXG4gICAgKGFzeW5jICgpID0+IHsgdHJ5IHsgcmV0dXJuIGF3YWl0IHdpbmRvdy5EQj8uZ2V0QWxsVGltZXN0YW1wcz8uKCkgPz8gW107IH0gY2F0Y2ggeyByZXR1cm4gW107IH0gfSkoKSxcbiAgICAoYXN5bmMgKCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgd2luZG93LkRhdGFTdG9yZT8uaW5pdD8uKCk7XG4gICAgICAgIHJldHVybiB3aW5kb3cuRGF0YVN0b3JlPy5hbGxUb3BpY3M/LigpID8/IFtdO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH1cbiAgICB9KSgpLFxuICBdKTtcbiAgaWYgKCFkb2N1bWVudC5ib2R5LmNvbnRhaW5zKHJvb3QpKSByZXR1cm47XG5cbiAgY29uc3QgdG9waWNNYXAgPSBuZXcgTWFwKHRvcGljcy5tYXAodG9waWMgPT4gW3RvcGljLnRvcGljSWQsIHRvcGljXSkpO1xuICBjb25zdCBsYXRlc3RQcm9ncmVzcyA9IFsuLi5wcm9ncmVzc11cbiAgICAuZmlsdGVyKHJlY29yZCA9PiByZWNvcmQ/LnRvcGljSWQgJiYgKE51bWJlcihyZWNvcmQucGVyY2VudCkgPiAwIHx8IE51bWJlcihyZWNvcmQucG9zaXRpb24pID4gMCB8fCByZWNvcmQuc3RhdHVzKSlcbiAgICAuc29ydCgoYSwgYikgPT4gTnVtYmVyKGIudXBkYXRlZEF0IHx8IGIuY29tcGxldGVkQXQgfHwgMCkgLSBOdW1iZXIoYS51cGRhdGVkQXQgfHwgYS5jb21wbGV0ZWRBdCB8fCAwKSlbMF07XG4gIGNvbnN0IGxhdGVzdFRpbWVzdGFtcCA9IFsuLi50aW1lc3RhbXBzXVxuICAgIC5maWx0ZXIoaXRlbSA9PiBpdGVtPy50b3BpY0lkKVxuICAgIC5zb3J0KChhLCBiKSA9PiBOdW1iZXIoYi51cGRhdGVkQXQgfHwgYi5jcmVhdGVkQXQgfHwgMCkgLSBOdW1iZXIoYS51cGRhdGVkQXQgfHwgYS5jcmVhdGVkQXQgfHwgMCkpWzBdO1xuICBjb25zdCBsYXRlc3ROb3RlID0gWy4uLm5vdGVzXVxuICAgIC5zb3J0KChhLCBiKSA9PiBOdW1iZXIoYi51cGRhdGVkQXQgfHwgYi5jcmVhdGVkQXQgfHwgMCkgLSBOdW1iZXIoYS51cGRhdGVkQXQgfHwgYS5jcmVhdGVkQXQgfHwgMCkpWzBdO1xuICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICBjb25zdCByZXZpZXdDdXRvZmYgPSAzMCAqIDI0ICogNjAgKiA2MCAqIDEwMDA7XG4gIGNvbnN0IGR1ZVJldmlldyA9IFsuLi5wcm9ncmVzc11cbiAgICAuZmlsdGVyKHJlY29yZCA9PiByZWNvcmQ/LnRvcGljSWQgJiYgKHJlY29yZC5zdGF0dXMgPT09ICdkb25lJyB8fCBOdW1iZXIocmVjb3JkLnBlcmNlbnQpID49IDEwMCkpXG4gICAgLm1hcChyZWNvcmQgPT4ge1xuICAgICAgY29uc3QgdG9waWMgPSB0b3BpY01hcC5nZXQocmVjb3JkLnRvcGljSWQpO1xuICAgICAgY29uc3QgcmVsYXRlZFRpbWVzID0gW1xuICAgICAgICByZWNvcmQucmV2aWV3ZWRBdCxcbiAgICAgICAgcmVjb3JkLnVwZGF0ZWRBdCxcbiAgICAgICAgcmVjb3JkLmNvbXBsZXRlZEF0LFxuICAgICAgICAuLi50aW1lc3RhbXBzLmZpbHRlcihpdGVtID0+IGl0ZW0/LnRvcGljSWQgPT09IHJlY29yZC50b3BpY0lkKS5tYXAoaXRlbSA9PiBpdGVtLnVwZGF0ZWRBdCB8fCBpdGVtLmNyZWF0ZWRBdCksXG4gICAgICAgIC4uLm5vdGVzLmZpbHRlcihpdGVtID0+IGl0ZW0/LnRvcGljSWQgPT09IHJlY29yZC50b3BpY0lkKS5tYXAoaXRlbSA9PiBpdGVtLnVwZGF0ZWRBdCB8fCBpdGVtLmNyZWF0ZWRBdCksXG4gICAgICBdLm1hcCh2YWx1ZSA9PiBOdW1iZXIodmFsdWUpIHx8IDApO1xuICAgICAgY29uc3QgbGFzdEFjdGl2aXR5ID0gTWF0aC5tYXgoLi4ucmVsYXRlZFRpbWVzLCAwKTtcbiAgICAgIHJldHVybiB7IHJlY29yZCwgdG9waWMsIGxhc3RBY3Rpdml0eSB9O1xuICAgIH0pXG4gICAgLmZpbHRlcihpdGVtID0+ICFpdGVtLmxhc3RBY3Rpdml0eSB8fCBub3cgLSBpdGVtLmxhc3RBY3Rpdml0eSA+PSByZXZpZXdDdXRvZmYpXG4gICAgLnNvcnQoKGEsIGIpID0+IChhLmxhc3RBY3Rpdml0eSB8fCAwKSAtIChiLmxhc3RBY3Rpdml0eSB8fCAwKSlbMF07XG5cbiAgY29uc3Qgd2lkZ2V0RGF0YSA9IFtcbiAgICB7XG4gICAgICBpZDogJ2NvbnRpbnVlJyxcbiAgICAgIGxhYmVsOiAnQ29udGludWUgc3R1ZHlpbmcnLFxuICAgICAgdGl0bGU6IHRvcGljTWFwLmdldChsYXRlc3RQcm9ncmVzcz8udG9waWNJZCk/LnRpdGxlIHx8IGxhdGVzdFByb2dyZXNzPy50b3BpY1RpdGxlIHx8IGxhdGVzdFRpbWVzdGFtcD8udGl0bGUgfHwgbGF0ZXN0VGltZXN0YW1wPy50b3BpY0lkIHx8ICdPcGVuIGEgY291cnNlJyxcbiAgICAgIGRldGFpbDogbGF0ZXN0UHJvZ3Jlc3MgPyBgJHtNYXRoLnJvdW5kKE51bWJlcihsYXRlc3RQcm9ncmVzcy5wZXJjZW50KSB8fCAwKX0lIGNvbXBsZXRlYCA6IGxhdGVzdFRpbWVzdGFtcCA/IGBTYXZlZCBhdCAke2Zvcm1hdER1cmF0aW9uKGxhdGVzdFRpbWVzdGFtcC5wb3NpdGlvbil9YCA6ICdTdGFydCB3aXRoIHRoZSBjYXRhbG9nLicsXG4gICAgICBhY3Rpb246ICdjb3Vyc2VzJyxcbiAgICAgIHRvcGljSWQ6IGxhdGVzdFByb2dyZXNzPy50b3BpY0lkIHx8IGxhdGVzdFRpbWVzdGFtcD8udG9waWNJZCxcbiAgICAgIHBvc2l0aW9uOiBsYXRlc3RUaW1lc3RhbXA/LnBvc2l0aW9uLFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6ICdyZXZpZXcnLFxuICAgICAgbGFiZWw6ICdEdWUgcmV2aWV3JyxcbiAgICAgIHRpdGxlOiBkdWVSZXZpZXc/LnRvcGljPy50aXRsZSB8fCBkdWVSZXZpZXc/LnJlY29yZD8udG9waWNUaXRsZSB8fCBkdWVSZXZpZXc/LnJlY29yZD8udG9waWNJZCB8fCAnTm90aGluZyBkdWUnLFxuICAgICAgZGV0YWlsOiBkdWVSZXZpZXcgPyAnUmV2aXNpdCBhIGNvbXBsZXRlZCB0b3BpYy4nIDogJ0NvbXBsZXRlZCB0b3BpY3MgYXJlIHN0aWxsIGZyZXNoLicsXG4gICAgICBhY3Rpb246IGR1ZVJldmlldyA/ICdyZXZpZXcnIDogJ2FjaGlldmVtZW50cycsXG4gICAgICB0b3BpY0lkOiBkdWVSZXZpZXc/LnJlY29yZD8udG9waWNJZCxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiAncmVjZW50JyxcbiAgICAgIGxhYmVsOiAnUmVjZW50IGluc2lnaHQnLFxuICAgICAgdGl0bGU6IGxhdGVzdE5vdGU/LnRpdGxlIHx8IGxhdGVzdFRpbWVzdGFtcD8udGl0bGUgfHwgJ05vIG5vdGVzIHlldCcsXG4gICAgICBkZXRhaWw6IGxhdGVzdE5vdGU/LnNvdXJjZVR5cGUgPT09ICdwZGYnID8gYFBERiBwYWdlICR7bGF0ZXN0Tm90ZS5wZGZQYWdlIHx8IGxhdGVzdE5vdGUucGFnZSB8fCAxfWAgOiBsYXRlc3ROb3RlPy50b3BpY0lkID8gYExpbmtlZCB0byAke2xhdGVzdE5vdGUudG9waWNJZH1gIDogbGF0ZXN0VGltZXN0YW1wID8gJ1NhdmVkIHRpbWVzdGFtcCcgOiAnQ2FwdHVyZSBhIG5vdGUgb3IgdGltZXN0YW1wLicsXG4gICAgICBhY3Rpb246IGxhdGVzdE5vdGUgPyAnbm90ZXMnIDogbGF0ZXN0VGltZXN0YW1wID8gJ2NvdXJzZXMnIDogJ25vdGVzJyxcbiAgICAgIHRvcGljSWQ6IGxhdGVzdFRpbWVzdGFtcD8udG9waWNJZCxcbiAgICAgIHBvc2l0aW9uOiBsYXRlc3RUaW1lc3RhbXA/LnBvc2l0aW9uLFxuICAgIH0sXG4gIF07XG5cbiAgcm9vdC5yZXBsYWNlQ2hpbGRyZW4oKTtcbiAgd2lkZ2V0RGF0YS5mb3JFYWNoKHdpZGdldCA9PiB7XG4gICAgY29uc3QgY2FyZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICAgIGNhcmQudHlwZSA9ICdidXR0b24nO1xuICAgIGNhcmQuY2xhc3NOYW1lID0gJ2hvbWUtd2lkZ2V0JztcbiAgICBjYXJkLmRhdGFzZXQuaG9tZVdpZGdldCA9IHdpZGdldC5pZDtcbiAgICBpZiAod2lkZ2V0LnRvcGljSWQpIGNhcmQuZGF0YXNldC50b3BpY0lkID0gd2lkZ2V0LnRvcGljSWQ7XG4gICAgY29uc3QgZXllYnJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgICBleWVicm93LmNsYXNzTmFtZSA9ICdleWVicm93JztcbiAgICBleWVicm93LnRleHRDb250ZW50ID0gd2lkZ2V0LmxhYmVsO1xuICAgIGNvbnN0IHRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3Ryb25nJyk7XG4gICAgdGl0bGUudGV4dENvbnRlbnQgPSB3aWRnZXQudGl0bGU7XG4gICAgY29uc3QgZGV0YWlsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc21hbGwnKTtcbiAgICBkZXRhaWwudGV4dENvbnRlbnQgPSB3aWRnZXQuZGV0YWlsO1xuICAgIGNhcmQuYXBwZW5kKGV5ZWJyb3csIHRpdGxlLCBkZXRhaWwpO1xuICAgIGNhcmQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICBpZiAoKHdpZGdldC5hY3Rpb24gPT09ICdjb3Vyc2VzJyB8fCB3aWRnZXQuYWN0aW9uID09PSAncmV2aWV3JykgJiYgd2lkZ2V0LnRvcGljSWQpIHtcbiAgICAgICAgc2V0UGVuZGluZ0NvdXJzZU1lZGlhKHdpZGdldC50b3BpY0lkLCB3aWRnZXQucG9zaXRpb24pO1xuICAgICAgICBSb3V0ZXIubmF2aWdhdGUoJyMvY291cnNlcycpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBSb3V0ZXIubmF2aWdhdGUod2lkZ2V0LmFjdGlvbiA9PT0gJ2FjaGlldmVtZW50cycgPyAnIy9hY2hpZXZlbWVudHMnIDogJyMvbm90ZXMnKTtcbiAgICB9KTtcbiAgICByb290LmFwcGVuZENoaWxkKGNhcmQpO1xuICB9KTtcbn1c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
