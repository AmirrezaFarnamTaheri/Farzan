export function mountHomeView(deps = {}) {
  const {
    setView,
    Router,
    setPendingCourseMedia,
  } = deps;

  setView(`
    <section class="view view-home">
      <div class="home-hero card card-filled">
        <div class="home-hero-copy">
          <span class="eyebrow">Local-first learning studio</span>
          <h1 class="home-title">Your study command deck is ready.</h1>
          <p class="home-subtitle">Open a course, capture notes, mark progress, and keep backups close. OpenCourseDeck stores your work on this device unless you export it.</p>
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
    const courseCount = document.getElementById('home-course-count');
    const topicCount = document.getElementById('home-topic-count');
    if (courseCount) courseCount.textContent = String(courses.length);
    if (topicCount) topicCount.textContent = String(topics.length);
  } catch {
    const note = document.querySelector('.home-card-note');
    if (note) note.textContent = 'Catalog counts are unavailable right now. Try rebuilding or checking data/catalog.json.';
  }
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}

async function renderHomeWidgets({ Router, setPendingCourseMedia }) {
  const root = document.querySelector('[data-home-widgets]');
  if (!root) return;
  const [progress, notes, timestamps, topics] = await Promise.all([
    (async () => { try { return await window.DB?.getAllProgress?.() ?? []; } catch { return []; } })(),
    (async () => { try { return await window.DB?.getAllNotes?.() ?? []; } catch { return []; } })(),
    (async () => { try { return await window.DB?.getAllTimestamps?.() ?? []; } catch { return []; } })(),
    (async () => {
      try {
        await window.DataStore?.init?.();
        return window.DataStore?.allTopics?.() ?? [];
      } catch {
        return [];
      }
    })(),
  ]);
  if (!document.body.contains(root)) return;

  const topicMap = new Map(topics.map(topic => [topic.topicId, topic]));
  const latestProgress = [...progress]
    .filter(record => record?.topicId && (Number(record.percent) > 0 || Number(record.position) > 0 || record.status))
    .sort((a, b) => Number(b.updatedAt || b.completedAt || 0) - Number(a.updatedAt || a.completedAt || 0))[0];
  const latestTimestamp = [...timestamps]
    .filter(item => item?.topicId)
    .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0))[0];
  const latestNote = [...notes]
    .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0))[0];
  const now = Date.now();
  const reviewCutoff = 30 * 24 * 60 * 60 * 1000;
  const dueReview = [...progress]
    .filter(record => record?.topicId && (record.status === 'done' || Number(record.percent) >= 100))
    .map(record => {
      const topic = topicMap.get(record.topicId);
      const relatedTimes = [
        record.reviewedAt,
        record.updatedAt,
        record.completedAt,
        ...timestamps.filter(item => item?.topicId === record.topicId).map(item => item.updatedAt || item.createdAt),
        ...notes.filter(item => item?.topicId === record.topicId).map(item => item.updatedAt || item.createdAt),
      ].map(value => Number(value) || 0);
      const lastActivity = Math.max(...relatedTimes, 0);
      return { record, topic, lastActivity };
    })
    .filter(item => !item.lastActivity || now - item.lastActivity >= reviewCutoff)
    .sort((a, b) => (a.lastActivity || 0) - (b.lastActivity || 0))[0];

  const widgetData = [
    {
      id: 'continue',
      label: 'Continue studying',
      title: topicMap.get(latestProgress?.topicId)?.title || latestProgress?.topicTitle || latestTimestamp?.title || latestTimestamp?.topicId || 'Open a course',
      detail: latestProgress ? `${Math.round(Number(latestProgress.percent) || 0)}% complete` : latestTimestamp ? `Saved at ${formatDuration(latestTimestamp.position)}` : 'Start with the catalog.',
      action: 'courses',
      topicId: latestProgress?.topicId || latestTimestamp?.topicId,
      position: latestTimestamp?.position,
    },
    {
      id: 'review',
      label: 'Due review',
      title: dueReview?.topic?.title || dueReview?.record?.topicTitle || dueReview?.record?.topicId || 'Nothing due',
      detail: dueReview ? 'Revisit a completed topic.' : 'Completed topics are still fresh.',
      action: dueReview ? 'review' : 'achievements',
      topicId: dueReview?.record?.topicId,
    },
    {
      id: 'recent',
      label: 'Recent insight',
      title: latestNote?.title || latestTimestamp?.title || 'No notes yet',
      detail: latestNote?.sourceType === 'pdf' ? `PDF page ${latestNote.pdfPage || latestNote.page || 1}` : latestNote?.topicId ? `Linked to ${latestNote.topicId}` : latestTimestamp ? 'Saved timestamp' : 'Capture a note or timestamp.',
      action: latestNote ? 'notes' : latestTimestamp ? 'courses' : 'notes',
      topicId: latestTimestamp?.topicId,
      position: latestTimestamp?.position,
    },
  ];

  root.replaceChildren();
  widgetData.forEach(widget => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'home-widget';
    card.dataset.homeWidget = widget.id;
    if (widget.topicId) card.dataset.topicId = widget.topicId;
    const eyebrow = document.createElement('span');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = widget.label;
    const title = document.createElement('strong');
    title.textContent = widget.title;
    const detail = document.createElement('small');
    detail.textContent = widget.detail;
    card.append(eyebrow, title, detail);
    card.addEventListener('click', () => {
      if ((widget.action === 'courses' || widget.action === 'review') && widget.topicId) {
        setPendingCourseMedia(widget.topicId, widget.position);
        Router.navigate('#/courses');
        return;
      }
      Router.navigate(widget.action === 'achievements' ? '#/achievements' : '#/notes');
    });
    root.appendChild(card);
  });
}
