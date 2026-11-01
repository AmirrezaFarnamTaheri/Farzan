import { dueReviewCards } from '../core/studyMetrics.js';
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
          <p class="home-eyebrow">A quieter place to learn</p>
          <h1 class="home-title" data-home-title><bdi>What will you learn today?</bdi></h1>
          <p class="home-subtitle"><bdi>Choose a course, continue reading, or open your notes. Saved notes and progress stay in this browser.</bdi></p>
          <div class="home-actions">
            <button class="btn btn-primary" type="button" data-home-resume>
              <svg class="icon" aria-hidden="true"><use href="#i-play"/></svg>
              <span>Continue studying</span>
            </button>
            <a class="btn btn-ghost" href="#/courses" data-home-browse-secondary>
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
            <span><strong data-home-active-count>—</strong> active</span>
            <span><strong data-home-note-count>—</strong> notes</span>
            <span><strong data-home-review-count>—</strong> due for review</span>
          </div>
        </div>

        <section class="home-focus-panel" aria-labelledby="home-focus-title" aria-live="polite">
          <div class="home-focus-head">
            <div>
              <h2 id="home-focus-title" dir="auto">Pick up where you left off</h2>
            </div>
            <span class="home-focus-status" data-home-focus-status>Start</span>
          </div>
          <p data-home-focus-detail dir="auto">Open a course to see your recent work here.</p>
          <div class="home-focus-progress" aria-hidden="true">
            <span data-home-focus-progress></span>
          </div>
          <div class="home-focus-meta">
            <span data-home-focus-percent>—</span>
            <span data-home-focus-time>No saved position</span>
          </div>
          <button class="home-focus-action" type="button" data-home-focus-action>
            <span>Browse the catalog</span>
            <svg class="icon" aria-hidden="true"><use href="#i-arrow-right"/></svg>
          </button>
        </section>
      </div>

      <div class="home-grid">
        <section class="card card-filled home-card home-card-wide" data-home-progress-card>
          <div class="card-body">
            <div class="home-card-head">
              <div>
                <h2 class="home-card-title">Progress</h2>
              </div>
              <a class="btn btn-ghost btn-sm" href="#/progress">View progress</a>
            </div>
            <div class="home-pulse-grid" data-home-pulse aria-live="polite">
              <div class="home-pulse-item">
                <span class="home-pulse-icon"><svg class="icon icon--spin" aria-hidden="true"><use href="#i-spinner"/></svg></span>
                <strong data-pulse-active>—</strong>
                <span>In progress</span>
              </div>
              <div class="home-pulse-item">
                <span class="home-pulse-icon"><svg class="icon" aria-hidden="true"><use href="#i-circle-check"/></svg></span>
                <strong data-pulse-complete>—</strong>
                <span>Completed</span>
              </div>
              <div class="home-pulse-item">
                <span class="home-pulse-icon"><svg class="icon" aria-hidden="true"><use href="#i-bolt"/></svg></span>
                <strong data-pulse-week>—</strong>
                <span>Activities this week</span>
              </div>
              <div class="home-pulse-item">
                <span class="home-pulse-icon"><svg class="icon" aria-hidden="true"><use href="#i-chart-columns"/></svg></span>
                <strong data-pulse-average>—</strong>
                <span>Average progress</span>
              </div>
            </div>
          </div>
        </section>

        <section class="card card-filled home-card">
          <div class="card-body">
            <h3 class="home-card-title" style="margin-bottom:var(--space-3)">Catalog</h3>
            <div class="home-stat"><strong id="home-course-count">—</strong><span>Courses</span></div>
            <div class="home-stat"><strong id="home-topic-count">—</strong><span>Topics</span></div>
            <p class="home-card-note">Your catalog stays available offline after the first successful load.</p>
          </div>
        </section>

        <section class="card card-filled home-card home-card-focus" aria-labelledby="home-focus-timer-title" data-focus-widget>
          <div class="card-body">
            <div class="home-card-head">
              <div>
                <span class="eyebrow">Make space for deep work</span>
                <h2 id="home-focus-timer-title" class="home-card-title">Focus timer</h2>
              </div>
              <span class="home-focus-count"><strong data-focus-count>0</strong> focus blocks finished</span>
            </div>
            <div class="focus-widget-layout">
              <div class="focus-clock-face" data-focus-ring>
                <span data-focus-phase>Focus</span>
                <output data-focus-clock aria-label="Time remaining" aria-live="off">25:00</output>
              </div>
              <div class="focus-widget-controls">
                <p class="focus-widget-message" data-focus-message role="status" aria-live="polite">Loading focus timer…</p>
                <label for="home-focus-preset">Study interval</label>
                <select id="home-focus-preset" class="select" data-focus-preset disabled>
                  <option value="classic">Classic · 25 min focus / 5 min break</option>
                  <option value="deep">Deep work · 50 min focus / 10 min break</option>
                </select>
                <div class="focus-widget-actions">
                  <button class="btn btn-primary" type="button" data-focus-start disabled>Start</button>
                  <button class="btn btn-secondary" type="button" data-focus-next hidden>Next block</button>
                  <button class="btn btn-ghost" type="button" data-focus-reset disabled>Reset</button>
                </div>
                <p class="focus-widget-note">Breaks start only when you choose. Time is tracked locally on this device, not added to course progress.</p>
              </div>
            </div>
          </div>
        </section>

        <section class="card card-filled home-card">
          <div class="card-body">
            <h3 class="home-card-title" style="margin-bottom:var(--space-3)">Tools</h3>
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
                <h2 class="home-card-title">Next steps</h2>
              </div>
              <span class="home-card-hint">Search: Ctrl+K</span>
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
                <h2 class="home-card-title">Recent activity</h2>
              </div>
            </div>
            <div class="home-activity-list" data-home-activity aria-live="polite">
              <p class="home-empty-state">Recent notes, bookmarks, and progress will appear here.</p>
            </div>
          </div>
        </section>
      </div>
    </section>
  `);

  renderCatalogCounts();
  renderHomeDashboard({ Router, setPendingCourseMedia });
  // Load the focus clock only on Home. Keep it out of the eager app bundle.
  void import('../features/focusTimer.js').then(({ mountFocusTimerWidget }) => {
    mountFocusTimerWidget();
  }).catch(() => {
    const root = document.querySelector('[data-focus-widget]');
    if (!root) return;
    const note = root.querySelector('[data-focus-message]');
    if (note) note.textContent = 'Focus timer is unavailable. Reload to try again.';
    root.querySelectorAll('button, select').forEach(control => { control.disabled = true; });
  });
  document.querySelector('[data-home-add]')?.addEventListener('click', (event) => {
    event.stopPropagation();
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
    // Use the browser's locale-aware numeric formatter instead of manually
    // rendering raw digits (e.g. "6421") or introducing a custom separator
    // algorithm. This also honors Persian numerals when the document is fa.
    let formatter;
    try {
      formatter = new Intl.NumberFormat(document.documentElement.lang || 'en-US');
    } catch {
      formatter = new Intl.NumberFormat('en-US');
    }
    if (courseCount) courseCount.textContent = formatter.format(courses.length);
    if (topicCount) topicCount.textContent = formatter.format(topics.length);
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

  const readSaved = async (method) => {
    const reader = window.DB?.[method];
    if (typeof reader !== 'function') throw new Error(`Saved study data is unavailable: ${method}`);
    const records = await reader.call(window.DB);
    if (!Array.isArray(records)) throw new TypeError(`Invalid saved study data: ${method}`);
    return records;
  };
  let collections;
  try {
    collections = await Promise.all([
      readSaved('getAllProgress'),
      readSaved('getAllNotes'),
      readSaved('getAllTimestamps'),
      (async () => {
        if (typeof window.DB?.getSetting !== 'function') return [];
        const cards = await window.DB.getSetting('ocd_flashcards');
        if (cards == null) return [];
        if (!Array.isArray(cards)) throw new TypeError('Saved flashcards are not a valid deck');
        return cards;
      })(),
      (async () => {
        try {
          await window.DataStore?.init?.();
          return window.DataStore?.allTopics?.() ?? [];
        } catch {
          return [];
        }
      })(),
    ]);
  } catch (error) {
    console.warn('[Home] Could not load saved activity:', error);
    if (!document.body.contains(widgetsRoot)) return;
    widgetsRoot.replaceChildren();
    widgetsRoot.setAttribute('aria-busy', 'false');
    const message = document.createElement('p');
    message.className = 'home-data-error';
    message.setAttribute('role', 'alert');
    message.textContent = 'Saved activity could not be loaded. Nothing was changed. Reload to try again.';
    widgetsRoot.append(message);
    activityRoot.replaceChildren();
    const activityMessage = document.createElement('p');
    activityMessage.className = 'home-empty-state';
    activityMessage.textContent = 'Recent activity is temporarily unavailable.';
    activityRoot.append(activityMessage);
    setText('#home-focus-title', 'Saved activity unavailable');
    setText('[data-home-focus-status]', 'Unavailable');
    setText('[data-home-focus-detail]', 'Your saved activity could not be read.');
    setText('[data-home-focus-percent]', '—');
    setText('[data-home-focus-time]', '');
    document.querySelector('[data-home-focus-action]')?.addEventListener('click', () => Router.navigate('#/courses'));
    document.querySelector('[data-home-resume]')?.addEventListener('click', () => Router.navigate('#/courses'));
    return;
  }
  const [progress, notes, timestamps, flashcards, topics] = collections;
  // Do not greet a fresh learner as if they already have saved history.
  const homeHeading = document.querySelector('[data-home-title]');
  if (homeHeading) {
    // Preserve the bidirectional isolate when asynchronous progress arrives.
    // Replacing the h1 textContent destroyed <bdi> and broke RTL punctuation.
    const label = (progress.length || notes.length || timestamps.length)
      ? 'Welcome back to your studies.' : 'What will you learn today?';
    let isolate = homeHeading.querySelector('bdi');
    if (!isolate) {
      isolate = document.createElement('bdi');
      homeHeading.replaceChildren(isolate);
    }
    isolate.textContent = label;
  }
  if (!document.body.contains(widgetsRoot)) return;

  const topicMap = new Map(topics.map(topic => [topic.topicId, topic]));
  // Use the freshest canonical row for each topic. Earlier unfinished rows
  // cannot resurrect a lesson that a later update already completed.
  const progressByTopic = new Map();
  [...progress].filter(record => record?.topicId)
    .sort((a, b) => getRecordTime(b) - getRecordTime(a))
    .forEach(record => {
      if (!progressByTopic.has(record.topicId)) progressByTopic.set(record.topicId, record);
    });
  const isFinished = record => record?.status === 'done' || Number(record?.percent) >= 100;
  const canResume = record => record?.topicId && !isFinished(record)
    && (Number(record?.percent) > 0 || Number(record?.position) > 0
      || record.status === 'in-progress');
  const latestTimestamp = [...timestamps]
    .filter(item => item?.topicId)
    .sort((a, b) => getRecordTime(b) - getRecordTime(a))[0];
  const latestNote = [...notes].sort((a, b) => getRecordTime(b) - getRecordTime(a))[0];

  // One latest record per canonical topic already owns resume selection.
  // Use that same view for summary metrics: import/recovery histories may
  // contain earlier copies that must not inflate completed totals or means.
  const currentProgress = [...progressByTopic.values()];
  const completed = currentProgress.filter(isFinished);
  const active = currentProgress.filter(canResume);
  // Resume the most recently saved *unfinished* work, regardless of whether
  // its latest position came from video progress or a timestamp. A completed
  // topic must never displace the next active lesson.
  const focusCandidates = [
    ...active.map(record => ({ record, source: 'progress' })),
    ...timestamps.filter(item => item?.topicId
      && Number.isFinite(Number(item.position)) && Number(item.position) >= 0
      && !isFinished(progressByTopic.get(item.topicId)))
      .map(record => ({ record, source: 'timestamp' })),
  ];
  const focusCandidate = focusCandidates.sort((a, b) =>
    getRecordTime(b.record) - getRecordTime(a.record)
      || (a.source === 'progress' ? -1 : 1))[0];
  const focusRecord = focusCandidate?.record ?? null;
  const dueReviews = dueReviewCards(flashcards);
  const weekCutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const weeklyActivity = [...progress, ...notes, ...timestamps].filter(item => getRecordTime(item) >= weekCutoff).length;
  const measuredProgress = currentProgress.map(item => Math.max(0, Math.min(100, Number(item?.percent) || 0)));
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

  const focusTopicId = focusRecord?.topicId;
  const focusProgress = progressByTopic.get(focusTopicId) ?? null;
  const focusTimestamp = [...timestamps]
    .filter(item => item?.topicId === focusTopicId)
    .sort((a, b) => getRecordTime(b) - getRecordTime(a))[0];
  const progressPosition = Math.max(0, Number(focusProgress?.position) || 0);
  const timestampPosition = Math.max(0, Number(focusTimestamp?.position) || 0);
  // A stale bookmark is not the current playback position. Conversely, a
  // newly saved timestamp takes precedence when it is the fresher activity.
  const focusPosition = focusTimestamp && (
    !focusProgress || getRecordTime(focusTimestamp) > getRecordTime(focusProgress)
      || !progressPosition
  ) ? timestampPosition : progressPosition || timestampPosition;
  const focusTopic = topicMap.get(focusTopicId);
  const focusPercent = Math.max(0, Math.min(100, Number(focusProgress?.percent) || 0));
  const focusTitle = focusTopic?.title || focusProgress?.topicTitle || focusTimestamp?.title || 'Choose a course';
  const focusDetail = focusRecord
    ? 'Continue from your last saved activity.'
    : 'Open a course to start tracking progress.';

  setText('#home-focus-title', focusTitle);
  setText('[data-home-focus-detail]', focusDetail);
  setText('[data-home-focus-status]', focusRecord ? 'Resume' : 'Start');
  setText('[data-home-focus-percent]', `${Math.round(focusPercent)}% complete`);
  setText('[data-home-focus-time]', focusPosition ? `Saved at ${formatDuration(focusPosition)}` : 'No saved position');
  const focusProgressBar = document.querySelector('[data-home-focus-progress]');
  if (focusProgressBar) focusProgressBar.style.width = `${focusPercent}%`;

  const openFocus = () => {
    if (focusTopicId) {
      setPendingCourseMedia(focusTopicId, focusPosition || undefined);
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
    resumeAction.querySelector('span').textContent = focusRecord ? 'Continue studying' : 'Browse courses';
    resumeAction.querySelector('use')?.setAttribute('href', focusRecord ? '#i-play' : '#i-curriculum');
    resumeAction.addEventListener('click', openFocus);
  }
  // Avoid repeating empty counters and the same browse CTA twice on the
  // mobile first-run screen. This is presentation-only: all saved state,
  // resume behavior, and navigation targets remain unchanged.
  const hasSavedActivity = Boolean(progress.length || timestamps.length || notes.length || dueReviews.length);
  const hero = document.querySelector('.home-hero');
  if (hero) hero.dataset.homeHasProgress = hasSavedActivity ? 'true' : 'false';
  const view = document.querySelector('.view-home');
  if (view) view.dataset.homeHasProgress = hasSavedActivity ? 'true' : 'false';
  const commandStrip = document.querySelector('[data-home-command-strip]');
  if (commandStrip) commandStrip.hidden = !hasSavedActivity;

  // On a new profile the primary action already opens Courses, so a second
  // identical hero button adds visual noise and needless keyboard stops.
  // Once there is saved progress the two actions have distinct purposes:
  // resume the topic, or browse the full catalog.
  if (!focusRecord) document.querySelector('[data-home-browse-secondary]')?.remove();

  const dueReview = dueReviews[0];
  const widgetData = [
    {
      id: 'continue',
      icon: 'i-play',
      label: 'Continue studying',
      title: focusTitle,
      detail: focusRecord
        ? (focusPercent > 0 ? `${Math.round(focusPercent)}% complete`
          : focusPosition ? `Saved at ${formatDuration(focusPosition)}` : 'Continue your saved topic.')
        : 'Start with the course catalog.',
      action: 'courses',
      topicId: focusTopicId,
      // Use the same topic-scoped position as the Home hero. A later
      // timestamp from another topic must never be handed to this topic.
      position: focusPosition || undefined,
    },
    {
      id: 'review',
      icon: 'i-redo',
      label: 'Review',
      title: dueReview?.front || 'Nothing due',
      detail: dueReview ? `Review ${dueReviews.length} scheduled card${dueReviews.length === 1 ? '' : 's'}.` : 'Nothing scheduled for review.',
      action: 'flashcards',
    },
    {
      id: 'recent',
      icon: 'i-lightbulb',
      label: 'Latest note',
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
      if (widget.action === 'flashcards') {
        Router.navigate('#/flashcards');
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
    title.textContent = 'No recent activity';
    const detail = document.createElement('span');
    detail.textContent = 'Open a course, save a timestamp, or create a note.';
    empty.append(icon, title, detail);
    activityRoot.appendChild(empty);
    return;
  }
  activity.forEach(item => activityRoot.appendChild(createActivityItem(item)));
}
