import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { $$, createElement, eventTargetEl } from '../src/lib/dom.js';
import { mountCoursesView } from '../src/views/coursesRoute.js';

const COURSE_ID = 'medicine';
const topics = [
  {
    topicId: 'anemia', courseId: COURSE_ID, title: 'Anemia and Iron Deficiency',
    sourceIndex: 0, sourceLabel: 'شروع این دوره',
    videos: ['https://example.test/anemia.mp4'], pdfs: ['https://example.test/anemia.pdf'],
  },
  {
    topicId: 'heart', courseId: COURSE_ID, title: 'Cardiology Basics',
    sourceIndex: 0, sourceLabel: 'شروع این دوره',
    videos: [], pdfs: ['https://example.test/heart.pdf'],
  },
];

async function mountCourses() {
  const controller = await mountCoursesView({
    setView: (html) => { document.getElementById('view-container').innerHTML = html; },
    createElement, $$, eventTargetEl,
    safeExternalUrl: (url) => url || null,
    safeMediaUrl: (url) => url || null,
    Router: { navigate: vi.fn() },
    Toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
    consumePendingCourseSession: () => null,
    formatMediaClock: (value) => String(value),
    escapeHtmlText: (value) => String(value),
  });
  return controller;
}

describe('Courses workbench progress and accessible row actions', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="view-container"></main>';
    Element.prototype.scrollIntoView = vi.fn();
    window.OpenCourseDeck = {
      bus: { on: vi.fn(), off: vi.fn() },
      Player: { init: vi.fn() },
      MiniPlayer: { restorePlayer: (el) => el },
      courseDetailRenderBatchSize: 100,
    };
    window.DataStore = {
      init: vi.fn(async () => {}),
      allCourses: vi.fn(() => [{ id: COURSE_ID, title: 'دوره جامع داخلی پزشکی' }]),
      allTopics: vi.fn(() => topics),
    };
    window.DB = {
      getSetting: vi.fn(async () => null),
      getAllProgress: vi.fn(async () => [
        { topicId: 'anemia', courseId: COURSE_ID, status: 'done', percent: 100 },
      ]),
      getProgress: vi.fn(async (id, courseId) => id === 'anemia' && courseId === COURSE_ID ? { topicId: id, courseId, status: 'done' } : null),
      saveProgress: vi.fn(async () => true),
    };
  });

  afterEach(() => {
    sessionStorage.removeItem('ocd_pending_topic');
    sessionStorage.removeItem('ocd_pending_position');
    sessionStorage.removeItem('ocd_pending_course');
    document.body.innerHTML = '';
    delete window.DB;
    delete window.DataStore;
    delete window.OpenCourseDeck;
    vi.restoreAllMocks();
  });

  it('lets a playing lesson enter and leave theater without remounting media or writing progress', async () => {
    const player = {
      queue: [], trackIndex: 0, currentTime: 78, duration: 240,
      loadPlaylist: vi.fn(), pause: vi.fn(), on: vi.fn(), off: vi.fn(),
    };
    window.OpenCourseDeck.Player.init = vi.fn(() => {
      document.getElementById('course-player')._pdPlayer = player;
    });
    const controller = await mountCourses();
    const theater = document.querySelector('[data-course-theater]');
    expect(theater).not.toBeNull();
    expect(theater.tagName).toBe('BUTTON');
    expect(theater.getAttribute('aria-pressed')).toBe('false');
    expect(theater.getAttribute('aria-controls')).toBe('course-player');
    theater.click();
    expect(document.querySelector('.courses-shell').dataset.theater).not.toBe('true');

    const video = await vi.waitFor(() => {
      const el = document.querySelector('[data-topic-id="anemia"] [data-action="play-video"]');
      expect(el).not.toBeNull();
      return el;
    });
    video.click();
    await vi.waitFor(() => expect(document.querySelector('[data-course-playback]').hidden).toBe(false));
    await vi.waitFor(() => expect(player.loadPlaylist).toHaveBeenCalledOnce());

    const mediaRoot = document.getElementById('course-player');
    const timeBefore = player.currentTime;
    const savesBefore = window.DB.saveProgress.mock.calls.length;
    theater.click();
    expect(document.querySelector('.courses-shell').dataset.theater).toBe('true');
    expect(theater.getAttribute('aria-pressed')).toBe('true');
    expect(theater.textContent).toMatch(/exit|leave|normal/i);
    expect(document.getElementById('course-player')).toBe(mediaRoot);
    expect(mediaRoot._pdPlayer).toBe(player);
    expect(player.currentTime).toBe(timeBefore);
    expect(window.DB.saveProgress.mock.calls.length).toBe(savesBefore);
    theater.click();
    expect(document.querySelector('.courses-shell').dataset.theater).toBe('false');
    expect(theater.getAttribute('aria-pressed')).toBe('false');
    expect(player.loadPlaylist).toHaveBeenCalledTimes(1);
    controller.unmount();
  });

  it('resets theater state on closing playback and allows a normal reopen', async () => {
    const player = {
      queue: [], trackIndex: 0, currentTime: 15,
      loadPlaylist: vi.fn(), pause: vi.fn(), on: vi.fn(), off: vi.fn(),
    };
    window.OpenCourseDeck.Player.init = vi.fn(() => {
      document.getElementById('course-player')._pdPlayer = player;
    });
    const controller = await mountCourses();
    const video = await vi.waitFor(() => {
      const row = document.querySelector('[data-topic-id="anemia"] [data-action="play-video"]');
      expect(row).not.toBeNull();
      return row;
    });
    video.click();
    await vi.waitFor(() => expect(document.querySelector('[data-course-playback]').hidden).toBe(false));
    const theater = document.querySelector('[data-course-theater]');
    theater.click();
    document.querySelector('[data-course-close-playback]').click();
    expect(document.querySelector('[data-course-playback]').hidden).toBe(true);
    expect(document.querySelector('.courses-shell').dataset.theater).toBe('false');
    expect(theater.getAttribute('aria-pressed')).toBe('false');
    expect(player.pause).toHaveBeenCalledOnce();

    video.click();
    await vi.waitFor(() => expect(document.querySelector('[data-course-playback]').hidden).toBe(false));
    expect(theater.getAttribute('aria-pressed')).toBe('false');
    controller.unmount();
  });

  it('highlights only the current player topic and clears the announcement when playback closes', async () => {
    const listeners = new Map();
    const firstTrack = { id: 'lecture-a', topicId: 'anemia', courseId: COURSE_ID };
    const player = {
      queue: [firstTrack], trackIndex: 0, currentTime: 10, duration: 120,
      loadPlaylist: vi.fn(), pause: vi.fn(),
      on: vi.fn((event, cb) => listeners.set(event, cb)),
      off: vi.fn((event) => listeners.delete(event)),
    };
    window.OpenCourseDeck.Player.init = vi.fn(() => {
      document.getElementById('course-player')._pdPlayer = player;
    });
    const controller = await mountCourses();
    await vi.waitFor(() => expect(document.querySelectorAll('.topic-row')).toHaveLength(2));
    const anemia = document.querySelector('[data-topic-id="anemia"]');
    const heart = document.querySelector('[data-topic-id="heart"]');
    expect(listeners.has('trackChange')).toBe(true);
    await listeners.get('trackChange')(firstTrack);
    expect(anemia.dataset.playing).toBe('true');
    expect(anemia.querySelector('[data-action="play-video"]')?.getAttribute('aria-current')).toBe('true');
    expect(anemia.querySelector('[data-current-lesson]')?.textContent).toMatch(/playing/i);
    expect(heart.dataset.playing).toBeUndefined();
    expect(heart.querySelector('[data-current-lesson]')).toBeNull();

    await listeners.get('trackChange')({ id: 'elsewhere', topicId: 'different', courseId: 'other' });
    expect(anemia.dataset.playing).toBeUndefined();
    expect(anemia.querySelector('[data-current-lesson]')).toBeNull();

    await listeners.get('trackChange')(firstTrack);
    document.querySelector('[data-course-close-playback]').click();
    expect(anemia.dataset.playing).toBeUndefined();
    expect(anemia.querySelector('[data-current-lesson]')).toBeNull();
    expect(window.DB.saveProgress).toHaveBeenCalled();
    controller.unmount();
  });

  it('shows one current-lesson state without announcing or painting a second Playing badge', async () => {
    const listeners = new Map();
    const track = { topicId: 'anemia', courseId: COURSE_ID, id: 'lecture-anemia' };
    const player = {
      queue: [track], trackIndex: 0, currentTime: 0, duration: 120,
      loadPlaylist: vi.fn(), pause: vi.fn(),
      on: vi.fn((event, listener) => listeners.set(event, listener)),
      off: vi.fn(event => listeners.delete(event)),
    };
    window.OpenCourseDeck.Player.init = vi.fn(() => {
      document.getElementById('course-player')._pdPlayer = player;
    });
    const controller = await mountCourses();
    await vi.waitFor(() => expect(document.querySelectorAll('.topic-row')).toHaveLength(2));
    await listeners.get('trackChange')(track);
    const row = document.querySelector('[data-topic-id="anemia"]');
    const button = row.querySelector('[data-action="play-video"]');
    expect(button.getAttribute('aria-current')).toBe('true');
    expect(button.querySelector('.topic-primary-hint')?.textContent).toBe('Current');
    expect(row.querySelectorAll('[data-current-lesson]')).toHaveLength(0);
    expect(row.textContent.match(/Playing/g)).toBeNull();
    expect(document.querySelector('[data-topic-id="heart"] [data-current-lesson]')).toBeNull();
    controller.unmount();
  });

  it('loads one authoritative progress snapshot instead of a read per topic', async () => {
    const controller = await mountCourses();
    await vi.waitFor(() => expect(document.querySelectorAll('.topic-row')).toHaveLength(2));
    expect(window.DB.getAllProgress).toHaveBeenCalledTimes(1);
    expect(window.DB.getProgress).not.toHaveBeenCalled();
    expect(document.querySelector('[data-topic-id="anemia"] [data-status="done"]')).not.toBeNull();
    controller.unmount();
  });

  it('keeps the Persian course header, product link and metadata in one reading direction', async () => {
    const controller = await mountCourses();
    await vi.waitFor(() => expect(document.querySelector('.course-detail h2')).not.toBeNull());
    const heading = document.querySelector('.course-detail h2');
    const body = heading.closest('.card-body');
    expect(heading?.getAttribute('dir')).toBe('auto');
    expect(body?.getAttribute('dir')).toBe('auto');
    expect(body?.querySelector('.course-detail-meta bdi')?.getAttribute('dir')).toBe('ltr');
    controller.unmount();
  });

  it('uses distinct native controls for primary media and completion and avoids repeated source subtitles', async () => {
    const controller = await mountCourses();
    await vi.waitFor(() => expect(document.querySelectorAll('.topic-row')).toHaveLength(2));
    const row = document.querySelector('[data-topic-id="anemia"]');
    const primary = row.querySelector('button[data-action="play-video"]');
    const completion = row.querySelector('button[data-action="toggle-done"]');
    expect(primary?.textContent).toContain('Anemia and Iron Deficiency');
    expect(primary?.getAttribute('aria-label')).toContain('Play');
    expect(completion?.getAttribute('aria-pressed')).toBe('true');
    expect(primary?.querySelector('.topic-primary-hint')?.textContent).toMatch(/Play/i);
    expect(completion?.querySelector('.topic-completion-label')?.textContent).toMatch(/Done/i);
    expect(primary?.getAttribute('aria-label')).toContain('Anemia');
    expect(completion?.getAttribute('title')).toMatch(/Mark not started/i);

    expect(completion?.getAttribute('aria-label')).toContain('Anemia and Iron Deficiency');
    expect(row.querySelector('[data-action="open-pdf"]')).not.toBeNull();
    expect(row.querySelector('.topic-submeta')).toBeNull();
    expect(row.closest('button')).toBeNull();
    expect(document.querySelector('.course-item-title')?.getAttribute('dir')).toBe('auto');

    completion.click();
    await vi.waitFor(() => expect(window.DB.saveProgress).toHaveBeenCalledWith(
      'anemia', COURSE_ID, expect.objectContaining({ status: 'not-started' }),
    ));
    controller.unmount();
  });

  it('requires the canonical bulk progress snapshot instead of an obsolete per-topic adapter', async () => {
    delete window.DB.getAllProgress;
    const controller = await mountCourses();
    await vi.waitFor(() => expect(document.querySelector('[data-retry-course-progress]')).not.toBeNull());
    expect(window.DB.getProgress).not.toHaveBeenCalled();
    expect(document.querySelectorAll('.topic-row')).toHaveLength(0);
    controller.unmount();
  });

  it('shows an honest retry path after a failed canonical progress read, never fake not-started rows', async () => {
    window.DB.getAllProgress.mockRejectedValueOnce(new Error('IndexedDB unavailable'));
    const controller = await mountCourses();
    await vi.waitFor(() => expect(document.querySelector('[data-retry-course-progress]')).not.toBeNull());
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Could not load saved progress');
    expect(document.querySelectorAll('.topic-row')).toHaveLength(0);
    document.querySelector('[data-retry-course-progress]').click();
    await vi.waitFor(() => expect(document.querySelectorAll('.topic-row')).toHaveLength(2));
    expect(window.DB.getAllProgress).toHaveBeenCalledTimes(2);
    controller.unmount();
  });

  it('does not erase a completed lesson when playback opens or moves backward', async () => {
    const progressId = JSON.stringify([COURSE_ID, 'anemia']);
    const records = new Map([[progressId, {
      topicId: 'anemia', courseId: COURSE_ID, status: 'done', percent: 100,
      position: 105, duration: 120,
    }]]);
    window.DB.getProgress.mockImplementation(async (id, courseId) =>
      records.get(JSON.stringify([courseId, id])) ?? null);
    window.DB.saveProgress.mockImplementation(async (topicId, courseId, patch) => {
      const key = JSON.stringify([courseId, topicId]);
      const next = { ...records.get(key), ...patch, topicId, courseId };
      records.set(key, next);
      return next;
    });

    const callbacks = new Map();
    const track = { id: 'lecture-1', topicId: 'anemia', courseId: COURSE_ID, src: 'https://example.test/anemia.mp4' };
    const player = {
      queue: [track], trackIndex: 0, currentTime: 105, duration: 120,
      on: vi.fn((event, cb) => callbacks.set(event, cb)),
      off: vi.fn((event) => callbacks.delete(event)),
      loadPlaylist: vi.fn(),
    };
    window.OpenCourseDeck.Player.init = vi.fn(() => {
      document.getElementById('course-player')._pdPlayer = player;
    });

    const controller = await mountCourses();
    expect(callbacks.has('trackChange')).toBe(true);

    // Opening an existing lesson is an activity touch, never a progress reset.
    await callbacks.get('trackChange')(track);
    expect(records.get(progressId)).toMatchObject({ status: 'done', percent: 100, position: 105 });

    // Replaying an already-completed lesson at an earlier position is not
    // equivalent to the learner explicitly marking it incomplete.
    await callbacks.get('timeupdate')({ currentTime: 12, duration: 120, percent: 10 });
    expect(records.get(progressId)).toMatchObject({ status: 'done', percent: 100, position: 12 });
    controller.unmount();
  });

  it('retains an unfinished lesson resume point when it is opened again', async () => {
    const progressId = JSON.stringify([COURSE_ID, 'anemia']);
    const records = new Map([[progressId, {
      topicId: 'anemia', courseId: COURSE_ID, status: 'in-progress',
      percent: 40, position: 48, duration: 120,
    }]]);
    window.DB.getProgress.mockImplementation(async (id, courseId) =>
      records.get(JSON.stringify([courseId, id])) ?? null);
    window.DB.saveProgress.mockImplementation(async (id, courseId, patch) => {
      const key = JSON.stringify([courseId, id]);
      const next = { ...records.get(key), ...patch, topicId: id, courseId };
      records.set(key, next);
      return next;
    });
    const callbacks = new Map();
    const track = { id: 'lecture-1', topicId: 'anemia', courseId: COURSE_ID };
    const player = {
      queue: [track], trackIndex: 0, currentTime: 0, duration: 120,
      on: vi.fn((event, cb) => callbacks.set(event, cb)),
      off: vi.fn((event) => callbacks.delete(event)),
    };
    window.OpenCourseDeck.Player.init = vi.fn(() => {
      document.getElementById('course-player')._pdPlayer = player;
    });

    const controller = await mountCourses();
    await callbacks.get('trackChange')(track);
    expect(records.get(progressId)).toMatchObject({
      status: 'in-progress', percent: 40, position: 48,
    });
    controller.unmount();
  });


  it('places a Persian source heading and English lesson rows in RTL order with an isolated Latin count', async () => {
    const controller = await mountCourses();
    await vi.waitFor(() => expect(document.querySelectorAll('.source-group .topic-row')).toHaveLength(2));
    const group = document.querySelector('.course-detail .source-group');
    expect(group.getAttribute('dir')).toBe('rtl');
    expect(group.querySelector('.source-group-title')?.getAttribute('dir')).toBe('auto');
    expect(group.querySelector('.source-group-title')?.textContent).toBe('شروع این دوره');
    expect(group.querySelector('.source-group-count')?.getAttribute('dir')).toBe('ltr');
    expect(group.querySelector('.source-group-count')?.textContent).toBe('2 topics');
    expect(group.querySelector('[data-topic-id="anemia"] .topic-title')?.getAttribute('dir')).toBe('auto');
    expect(group.querySelector('[data-topic-id="anemia"] .topic-actions')?.getAttribute('dir')).toBe('ltr');
    controller.unmount();
  });

  it('retains LTR layout for an English course with an English source label', async () => {
    window.DataStore.allCourses = () => [{ id: COURSE_ID, title: 'English course' }];
    window.DataStore.allTopics = () => topics.map(t => ({ ...t, sourceLabel: 'Introduction' }));
    const controller = await mountCourses();
    await vi.waitFor(() => expect(document.querySelector('.source-group .topic-row')).not.toBeNull());
    expect(document.querySelector('.source-group')?.getAttribute('dir')).toBe('ltr');
    controller.unmount();
  });


  it('routes same-ID timestamp lessons to their exact saved course instead of the first catalog match', async () => {
    window.DataStore.allCourses = () => [
      { id: 'course-a', title: 'Anatomy A' },
      { id: 'course-b', title: 'Anatomy B' },
    ];
    window.DataStore.allTopics = () => [
      { ...topics[0], courseId: 'course-a', topicId: 'shared',
        title: 'Wrong video A', videos: ['https://example.test/a.mp4'] },
      { ...topics[0], courseId: 'course-b', topicId: 'shared',
        title: 'Saved video B', videos: ['https://example.test/b.mp4'] },
    ];
    sessionStorage.setItem('ocd_pending_topic', 'shared');
    sessionStorage.setItem('ocd_pending_course', 'course-b');
    sessionStorage.setItem('ocd_pending_position', '78');

    const controller = await mountCourses();
    await vi.waitFor(() => expect(document.querySelector('.course-item.active')?.dataset.courseId).toBe('course-b'));
    expect(document.querySelector('.course-detail h2')?.textContent).toBe('Anatomy B');
    expect(sessionStorage.getItem('ocd_pending_course')).toBeNull();
    expect(sessionStorage.getItem('ocd_pending_topic')).toBeNull();
    controller.unmount();
  });

  it('plays the clicked course media, never the first matching topic ID from another course', async () => {
    window.DataStore.allCourses = () => [
      { id: 'course-a', title: 'Cardiac A' },
      { id: 'course-b', title: 'Renal B' },
    ];
    window.DataStore.allTopics = () => [
      { ...topics[0], topicId: 'shared', courseId: 'course-a',
        title: 'Wrong course A', videos: ['https://example.test/course-a.mp4'] },
      { ...topics[0], topicId: 'shared', courseId: 'course-b',
        title: 'Selected course B', videos: ['https://example.test/course-b.mp4'] },
    ];
    const player = {
      queue: [], trackIndex: 0, currentTime: 0, duration: 100,
      loadPlaylist: vi.fn(), pause: vi.fn(), on: vi.fn(), off: vi.fn(),
    };
    window.OpenCourseDeck.Player.init = vi.fn(() => {
      document.getElementById('course-player')._pdPlayer = player;
    });
    const controller = await mountCourses();
    const courseB = await vi.waitFor(() => {
      const button = document.querySelector('#courses-list [data-course-id="course-b"]');
      expect(button).not.toBeNull();
      return button;
    });
    courseB.click();
    const play = await vi.waitFor(() => {
      const button = document.querySelector(
        '#course-detail [data-course-id="course-b"][data-topic-id="shared"] [data-action="play-video"]');
      expect(button).not.toBeNull();
      return button;
    });
    play.click();
    await vi.waitFor(() => expect(player.loadPlaylist).toHaveBeenCalledOnce());
    expect(player.loadPlaylist).toHaveBeenCalledWith([
      expect.objectContaining({
        topicId: 'shared', courseId: 'course-b', title: 'Selected course B',
        src: 'https://example.test/course-b.mp4',
      }),
    ], true);
    controller.unmount();
  });

  it('keeps progress independent and editable for duplicate topic IDs across courses', async () => {
    window.DataStore.allCourses = () => [
      { id: 'course-a', title: 'Heart' },
      { id: 'course-b', title: 'Kidneys' },
    ];
    window.DataStore.allTopics = () => [
      { ...topics[0], topicId: 'shared', courseId: 'course-a', title: 'Cardiac lesson' },
      { ...topics[0], topicId: 'shared', courseId: 'course-b', title: 'Renal lesson' },
    ];
    const records = new Map([
      [JSON.stringify(['course-a', 'shared']), {
        topicId: 'shared', courseId: 'course-a', status: 'done', percent: 100,
      }],
      [JSON.stringify(['course-b', 'shared']), {
        topicId: 'shared', courseId: 'course-b', status: 'in-progress', percent: 35,
      }],
    ]);
    window.DB.getAllProgress.mockImplementation(async () => [...records.values()]);
    window.DB.getProgress.mockImplementation(async (topicId, courseId) =>
      records.get(JSON.stringify([courseId, topicId])) ?? null);
    window.DB.saveProgress.mockImplementation(async (topicId, courseId, patch) => {
      const key = JSON.stringify([courseId, topicId]);
      const next = { ...records.get(key), ...patch, topicId, courseId };
      records.set(key, next);
      return next;
    });

    const controller = await mountCourses();
    const button = await vi.waitFor(() => {
      const candidate = document.querySelector('#courses-list [data-course-id="course-b"]');
      expect(candidate).not.toBeNull();
      return candidate;
    });
    button.click();
    const row = await vi.waitFor(() => {
      const candidate = document.querySelector(
        '#course-detail [data-course-id="course-b"][data-topic-id="shared"]');
      expect(candidate).not.toBeNull();
      return candidate;
    });
    expect(row.querySelector('[data-status="done"]')).toBeNull();
    const completion = row.querySelector('[data-action="toggle-done"]');
    expect(completion.disabled).toBe(false);
    completion.click();
    await vi.waitFor(() => expect(window.DB.saveProgress).toHaveBeenCalledWith(
      'shared', 'course-b', expect.objectContaining({ status: 'done' }),
    ));
    expect(records.get(JSON.stringify(['course-a', 'shared'])).status).toBe('done');
    expect(records.get(JSON.stringify(['course-b', 'shared'])).status).toBe('done');
    controller.unmount();
  });

  it('never chooses the first of duplicate topic IDs when a bookmark has no course identity', async () => {
    window.DataStore.allCourses = () => [
      { id: 'course-a', title: 'Anatomy A' },
      { id: 'course-b', title: 'Anatomy B' },
    ];
    window.DataStore.allTopics = () => [
      { ...topics[0], courseId: 'course-a', topicId: 'shared' },
      { ...topics[0], courseId: 'course-b', topicId: 'shared' },
    ];
    sessionStorage.setItem('ocd_pending_topic', 'shared');
    sessionStorage.setItem('ocd_pending_position', '80');
    const controller = await mountCourses();
    await vi.waitFor(() => expect(document.querySelector('.course-item.active')).not.toBeNull());
    // Player shell setup may occur on first mount. An ambiguous bookmark
    // must not open playback or mark any course lesson as playing.
    expect(document.querySelector('[data-course-playback]')?.hidden).toBe(true);
    expect(document.querySelector('.topic-row[data-playing="true"]')).toBeNull();
    expect(sessionStorage.getItem('ocd_pending_position')).toBeNull();
    controller.unmount();
  });

});
