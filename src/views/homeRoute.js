const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Build a sprite-backed inline icon: <svg class="icon ..."><use href="#i-id"/></svg>.
 * Replaces the Font Awesome `<i>` glyph pattern with the same sprite set used by
 * the static template, so icons inherit currentColor and scale with font-size.
 * @param {string} id  sprite symbol id, e.g. 'i-play'
 * @param {string} [extraClass] optional modifier class (e.g. 'home-widget-arrow')
 * @returns {SVGSVGElement}
 */
function svgIcon(id, extraClass = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', extraClass ? `icon ${extraClass}` : 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${id}`);
  svg.appendChild(use);
  return svg;
}

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
          <p class="home-subtitle">Continue where you left off, capture ideas, and keep every learning artifact on your device.</p>
          <div class="home-actions">
            <button class="btn btn-primary" type="button" data-home-resume>
              <svg class="icon" aria-hidden="true"><use href="#i-play"/></svg>
              <span>Continue studying</span>
            </button>
            <a class="btn btn-ghost" href="#/courses">
              <svg class="icon" aria-hidden="true"><use href="#i-curriculum"/></svg>
              Browse courses
            </a>
            <button class="btn btn-ghost" type="button" data-home-add>
              <svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg>
              Add to library
            </button>
            <a class="btn btn-ghost" href="#/notes">
              <svg class="icon" aria-hidden="true"><use href="#i-note"/></svg>
              Write notes
            </a>
          </div>
          <div class="home-command-strip" aria-label="Learning overview" data-home-command-strip>
            <span><strong data-home-active-count>0</strong> active</span>
            <span><strong data-home-note-count>0</strong> notes</span>
            <span><strong data-home-review-count>0</strong> due for review</span>
          </div>
        </div>

        <section class="home-focus-panel" aria-labelledby="home-focus-title" aria-live="polite">
          <div class="home-focus-head">
            <div>
              <h2 id="home-focus-title">Pick up where you left off</h2>
            </div>
            <span class="home-focus-status" data-home-focus-status>Ready</span>
          </div>
          <p data-home-focus-detail>Open a course to begin building your learning history.</p>
          <div class="home-focus-progress" aria-hidden="true">
            <span data-home-focus-progress></span>
          </div>
          <div class="home-focus-meta">
            <span data-home-focus-percent>0% complete</span>
            <span data-home-focus-time>No saved position</span>
          </div>
          <button class="home-focus-action" type="button" data-home-focus-action>
            <span>Browse the catalog</span>
            <svg class="icon" aria-hidden="true"><use href="#i-arrow-right"/></svg>
          </button>
        </section>
      </div>

      <div class="home-grid">
        <section class="card card-filled home-card home-card-wide">
          <div class="card-body">
            <div class="home-card-head">
              <div>
                <h2 class="home-card-title">Your library at a glance</h2>
              </div>
              <a class="btn btn-ghost btn-sm" href="#/progress">Open analytics</a>
            </div>
            <div class="home-pulse-grid" data-home-pulse aria-live="polite">
              <div class="home-pulse-item">
                <span class="home-pulse-icon"><svg class="icon icon--spin" aria-hidden="true"><use href="#i-spinner"/></svg></span>
                <strong data-pulse-active>0</strong>
                <span>In progress</span>
              </div>
              <div class="home-pulse-item">
                <span class="home-pulse-icon"><svg class="icon" aria-hidden="true"><use href="#i-circle-check"/></svg></span>
                <strong data-pulse-complete>0</strong>
                <span>Completed</span>
              </div>
              <div class="home-pulse-item">
                <span class="home-pulse-icon"><svg class="icon" aria-hidden="true"><use href="#i-bolt"/></svg></span>
                <strong data-pulse-week>0</strong>
                <span>Activities this week</span>
              </div>
              <div class="home-pulse-item">
                <span class="home-pulse-icon"><svg class="icon" aria-hidden="true"><use href="#i-chart-columns"/></svg></span>
                <strong data-pulse-average>0%</strong>
                <span>Average progress</span>
              </div>
            </div>
          </div>
        </section>

        <section class="card card-filled home-card">
          <div class="card-body">
            <h3 class="home-card-title" style="margin-bottom:var(--space-3)">Library snapshot</h3>
            <div class="home-stat"><strong id="home-course-count">—</strong><span>Courses</span></div>
            <div class="home-stat"><strong id="home-topic-count">—</strong><span>Topics</span></div>
            <p class="home-card-note">Your catalog stays available offline after the first successful load.</p>
          </div>
        </section>

        <section class="card card-filled home-card">
          <div class="card-body">
            <h3 class="home-card-title" style="margin-bottom:var(--space-3)">Quick tools</h3>
            <div class="home-tool-list">
              <a href="#/pdf"><svg class="icon" aria-hidden="true"><use href="#i-file-pdf"/></svg><span><strong>Read PDFs</strong><small>Annotate and reference pages.</small></span></a>
              <a href="#/studio"><svg class="icon" aria-hidden="true"><use href="#i-studio"/></svg><span><strong>Open Studio</strong><small>Sketch concepts visually.</small></span></a>
              <a href="#/settings"><svg class="icon" aria-hidden="true"><use href="#i-sliders"/></svg><span><strong>Preferences</strong><small>Tune appearance and behavior.</small></span></a>
            </div>
          </div>
        </section>

        <section class="card card-filled home-card home-card-wide">
          <div class="card-body">
            <div class="home-card-head">
              <div>
                <h2 class="home-card-title">Continue, review, and capture</h2>
              </div>
              <kbd>Ctrl+K</kbd>
            </div>
            <div class="home-widget-list" data-home-widgets aria-live="polite" aria-busy="true">
              <div class="home-widget-skeleton" aria-hidden="true"></div>
              <div class="home-widget-skeleton" aria-hidden="true"></div>
              <div class="home-widget-skeleton" aria-hidden="true"></div>
            </div>
          </div>
        </section>

        <section class="card card-filled home-card home-card-activity">
          <div class="card-body">
            <div class="home-card-head">
              <div>
                <h2 class="home-card-title">Your latest learning trail</h2>
              </div>
            </div>
            <div class="home-activity-list" data-home-activity aria-live="polite">
              <p class="home-empty-state">Your recent notes, timestamps, and progress updates will appear here.</p>
            </div>
          </div>
        </section>
      </div>
    </section>
  `);

  renderCatalogCounts();
  renderHomeDashboard({ Router, setPendingCourseMedia });
  document.querySelector('[data-home-add]')?.addEventListener('click', () => {
    if (typeof window.OpenCourseDeck?.AddContent?.openMenu === 'function') {
      window.OpenCourseDeck.AddContent.openMenu();
      return;
    }
    document.getElementById('topbar-add-btn')?.click();
  });
}

async function renderCatalogCounts() {
  try {
    await window.DataStore?.init?.();
    try { await window.OpenCourseDeck?.UserLibrary?.overlay?.(); } catch { /* overlay is optional */ }
    const courses = window.DataStore?.allCourses?.() ?? [];
    const topics = window.DataStore?.allTopics?.() ?? [];
    const courseCount = document.getElementById('home-course-count');
    const topicCount = document.getElementById('home-topic-count');
    if (courseCount) courseCount.textContent = String(courses.length);
    if (topicCount) topicCount.textContent = String(topics.length);
  } catch {
    const note = document.querySelector('.home-card-note');
    if (note) note.textContent = 'Catalog details are unavailable right now. Check the local data files and rebuild.';
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

function formatRelativeTime(timestamp) {
  const value = Number(timestamp) || 0;
  if (!value) return 'Recently';
  const elapsed = Date.now() - value;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (elapsed < minute) return 'Just now';
  if (elapsed < hour) return `${Math.max(1, Math.floor(elapsed / minute))}m ago`;
  if (elapsed < day) return `${Math.max(1, Math.floor(elapsed / hour))}h ago`;
  if (elapsed < 7 * day) return `${Math.max(1, Math.floor(elapsed / day))}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getRecordTime(record = {}) {
  return Number(record.updatedAt || record.createdAt || record.completedAt || record.reviewedAt || 0);
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = String(value);
}

function createActivityItem({ icon, title, detail, time, href }) {
  const item = document.createElement(href ? 'a' : 'div');
  item.className = 'home-activity-item';
  if (href) item.href = href;

  const iconWrap = document.createElement('span');
  iconWrap.className = 'home-activity-icon';
  iconWrap.appendChild(svgIcon(icon));
  iconWrap.setAttribute('aria-hidden', 'true');

  const copy = document.createElement('span');
  copy.className = 'home-activity-copy';
  const strong = document.createElement('strong');
  strong.textContent = title;
  const small = document.createElement('small');
  small.textContent = detail;
  copy.append(strong, small);

  const timestamp = document.createElement('time');
  timestamp.textContent = formatRelativeTime(time);
  if (time) timestamp.dateTime = new Date(time).toISOString();

  item.append(iconWrap, copy, timestamp);
  return item;
}

async function renderHomeDashboard({ Router, setPendingCourseMedia }) {
  const widgetsRoot = document.querySelector('[data-home-widgets]');
  const activityRoot = document.querySelector('[data-home-activity]');
  if (!widgetsRoot || !activityRoot) return;

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
  if (!document.body.contains(widgetsRoot)) return;

  const topicMap = new Map(topics.map(topic => [topic.topicId, topic]));
  const latestProgress = [...progress]
    .filter(record => record?.topicId && (Number(record.percent) > 0 || Number(record.position) > 0 || record.status))
    .sort((a, b) => getRecordTime(b) - getRecordTime(a))[0];
  const latestTimestamp = [...timestamps]
    .filter(item => item?.topicId)
    .sort((a, b) => getRecordTime(b) - getRecordTime(a))[0];
  const latestNote = [...notes].sort((a, b) => getRecordTime(b) - getRecordTime(a))[0];

  const completed = progress.filter(record => record?.status === 'done' || Number(record?.percent) >= 100);
  const active = progress.filter(record => record?.topicId && Number(record?.percent) > 0 && Number(record?.percent) < 100);
  const reviewCutoff = 30 * 24 * 60 * 60 * 1000;
  const dueReviews = completed
    .map(record => ({ record, lastActivity: getRecordTime(record) }))
    .filter(item => !item.lastActivity || Date.now() - item.lastActivity >= reviewCutoff)
    .sort((a, b) => a.lastActivity - b.lastActivity);
  const weekCutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const weeklyActivity = [...progress, ...notes, ...timestamps].filter(item => getRecordTime(item) >= weekCutoff).length;
  const measuredProgress = progress.map(item => Math.max(0, Math.min(100, Number(item?.percent) || 0)));
  const averageProgress = measuredProgress.length
    ? Math.round(measuredProgress.reduce((sum, value) => sum + value, 0) / measuredProgress.length)
    : 0;

  setText('[data-home-active-count]', active.length);
  setText('[data-home-note-count]', notes.length);
  setText('[data-home-review-count]', dueReviews.length);
  setText('[data-pulse-active]', active.length);
  setText('[data-pulse-complete]', completed.length);
  setText('[data-pulse-week]', weeklyActivity);
  setText('[data-pulse-average]', `${averageProgress}%`);

  const focusRecord = latestProgress || latestTimestamp;
  const focusTopicId = focusRecord?.topicId;
  const focusTopic = topicMap.get(focusTopicId);
  const focusPercent = Math.max(0, Math.min(100, Number(latestProgress?.percent) || 0));
  const focusTitle = focusTopic?.title || latestProgress?.topicTitle || latestTimestamp?.title || 'Explore your course library';
  const focusDetail = focusRecord
    ? 'Your latest learning session is ready to resume.'
    : 'Choose a course and OpenCourseDeck will keep your next step ready here.';

  setText('#home-focus-title', focusTitle);
  setText('[data-home-focus-detail]', focusDetail);
  setText('[data-home-focus-status]', focusRecord ? 'Resume' : 'Start');
  setText('[data-home-focus-percent]', `${Math.round(focusPercent)}% complete`);
  setText('[data-home-focus-time]', latestTimestamp?.position ? `Saved at ${formatDuration(latestTimestamp.position)}` : 'No saved position');
  const focusProgress = document.querySelector('[data-home-focus-progress]');
  if (focusProgress) focusProgress.style.width = `${focusPercent}%`;

  const openFocus = () => {
    if (focusTopicId) {
      setPendingCourseMedia(focusTopicId, latestTimestamp?.position);
      Router.navigate('#/courses');
      return;
    }
    Router.navigate('#/courses');
  };

  const focusAction = document.querySelector('[data-home-focus-action]');
  const resumeAction = document.querySelector('[data-home-resume]');
  if (focusAction) {
    focusAction.querySelector('span').textContent = focusRecord ? 'Resume this topic' : 'Browse the catalog';
    focusAction.addEventListener('click', openFocus);
  }
  if (resumeAction) {
    resumeAction.querySelector('span').textContent = focusRecord ? 'Continue studying' : 'Start learning';
    resumeAction.addEventListener('click', openFocus);
  }

  const dueReview = dueReviews[0];
  const widgetData = [
    {
      id: 'continue',
      icon: 'i-play',
      label: 'Continue studying',
      title: focusTitle,
      detail: latestProgress ? `${Math.round(focusPercent)}% complete` : latestTimestamp ? `Saved at ${formatDuration(latestTimestamp.position)}` : 'Start with the course catalog.',
      action: 'courses',
      topicId: focusTopicId,
      position: latestTimestamp?.position,
    },
    {
      id: 'review',
      icon: 'i-redo',
      label: 'Due review',
      title: topicMap.get(dueReview?.record?.topicId)?.title || dueReview?.record?.topicTitle || 'Nothing due',
      detail: dueReview ? 'Revisit a completed topic to reinforce retention.' : 'Completed topics are still fresh.',
      action: dueReview ? 'review' : 'achievements',
      topicId: dueReview?.record?.topicId,
    },
    {
      id: 'recent',
      icon: 'i-lightbulb',
      label: 'Recent insight',
      title: latestNote?.title || latestTimestamp?.title || 'No notes yet',
      detail: latestNote?.sourceType === 'pdf'
        ? `PDF page ${latestNote.pdfPage || latestNote.page || 1}`
        : latestNote?.topicId
          ? `Linked to ${topicMap.get(latestNote.topicId)?.title || latestNote.topicId}`
          : latestTimestamp
            ? 'Saved timestamp'
            : 'Capture a note or timestamp.',
      action: latestNote ? 'notes' : latestTimestamp ? 'courses' : 'notes',
      topicId: latestTimestamp?.topicId,
      position: latestTimestamp?.position,
    },
  ];

  widgetsRoot.replaceChildren();
  widgetsRoot.setAttribute('aria-busy', 'false');
  widgetData.forEach(widget => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'home-widget';
    card.dataset.homeWidget = widget.id;

    const icon = document.createElement('span');
    icon.className = 'home-widget-icon';
    icon.appendChild(svgIcon(widget.icon));
    icon.setAttribute('aria-hidden', 'true');

    const copy = document.createElement('span');
    copy.className = 'home-widget-copy';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = widget.label;
    const title = document.createElement('strong');
    title.textContent = widget.title;
    const detail = document.createElement('small');
    detail.textContent = widget.detail;
    copy.append(eyebrow, title, detail);

    const arrow = svgIcon('i-arrow-right', 'home-widget-arrow');

    card.append(icon, copy, arrow);
    card.addEventListener('click', () => {
      if ((widget.action === 'courses' || widget.action === 'review') && widget.topicId) {
        setPendingCourseMedia(widget.topicId, widget.position);
        Router.navigate('#/courses');
        return;
      }
      // A fresh user with no progress/timestamps gets action:'courses' with
      // no topicId (widget copy says "Start with the course catalog") --
      // without this branch they fell through to '#/notes' instead.
      if (widget.action === 'courses') {
        Router.navigate('#/courses');
        return;
      }
      Router.navigate(widget.action === 'achievements' ? '#/achievements' : '#/notes');
    });
    widgetsRoot.appendChild(card);
  });

  const activity = [
    ...notes.map(note => ({
      icon: 'i-note',
      title: note.title || 'Untitled note',
      detail: 'Note updated',
      time: getRecordTime(note),
      href: '#/notes',
    })),
    ...timestamps.map(item => ({
      icon: 'i-clock',
      title: item.title || topicMap.get(item.topicId)?.title || 'Saved timestamp',
      detail: `Position ${formatDuration(item.position)}`,
      time: getRecordTime(item),
      href: '#/courses',
    })),
    ...progress.filter(item => getRecordTime(item)).map(item => ({
      icon: Number(item.percent) >= 100 ? 'i-circle-check' : 'i-chart-columns',
      title: topicMap.get(item.topicId)?.title || item.topicTitle || 'Learning progress',
      detail: Number(item.percent) >= 100 ? 'Topic completed' : `${Math.round(Number(item.percent) || 0)}% complete`,
      time: getRecordTime(item),
      href: '#/progress',
    })),
  ].sort((a, b) => b.time - a.time).slice(0, 5);

  activityRoot.replaceChildren();
  if (!activity.length) {
    const empty = document.createElement('div');
    empty.className = 'home-empty-state';
    const icon = svgIcon('i-sprout');
    const title = document.createElement('strong');
    title.textContent = 'Your learning trail starts here';
    const detail = document.createElement('span');
    detail.textContent = 'Open a course, save a timestamp, or create a note.';
    empty.append(icon, title, detail);
    activityRoot.appendChild(empty);
    return;
  }
  activity.forEach(item => activityRoot.appendChild(createActivityItem(item)));
}
