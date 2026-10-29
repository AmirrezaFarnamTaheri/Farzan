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
      getProgress: vi.fn(async id => id === 'anemia' ? { topicId: id, courseId: COURSE_ID, status: 'done' } : null),
      saveProgress: vi.fn(async () => true),
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete window.DB;
    delete window.DataStore;
    delete window.OpenCourseDeck;
    vi.restoreAllMocks();
  });

  it('loads one authoritative progress snapshot instead of a read per topic', async () => {
    const controller = await mountCourses();
    await vi.waitFor(() => expect(document.querySelectorAll('.topic-row')).toHaveLength(2));
    expect(window.DB.getAllProgress).toHaveBeenCalledTimes(1);
    expect(window.DB.getProgress).not.toHaveBeenCalled();
    expect(document.querySelector('[data-topic-id="anemia"] [data-status="done"]')).not.toBeNull();
    controller.unmount();
  });

  it('keeps a one-click note entry point in study-focus chrome', async () => {
    const controller = await mountCourses();
    const focus = document.querySelector('[data-course-take-note]');
    const playback = document.querySelector('[data-course-playback]');
    const textarea = document.querySelector('[data-timestamp-note-body]');
    expect(focus?.getAttribute('aria-controls')).toBe('course-timestamp-note');
    playback.hidden = false;
    focus.click();
    expect(document.activeElement).toBe(textarea);
    expect(textarea.closest('#course-timestamp-note')).not.toBeNull();
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

  it('supports older progress adapters that expose only the per-topic read API', async () => {
    delete window.DB.getAllProgress;
    window.DB.getProgress.mockImplementation(async id => id === 'anemia'
      ? { topicId: id, courseId: COURSE_ID, status: 'done' } : null);
    const controller = await mountCourses();
    await vi.waitFor(() => expect(document.querySelectorAll('.topic-row')).toHaveLength(2));
    expect(window.DB.getProgress).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-topic-id="anemia"] [data-status="done"]')).not.toBeNull();
    controller.unmount();
  });

  it('does not disguise rejected legacy reads as empty progress', async () => {
    delete window.DB.getAllProgress;
    window.DB.getProgress.mockRejectedValueOnce(new Error('Database offline'));
    const controller = await mountCourses();
    await vi.waitFor(() => expect(document.querySelector('[data-retry-course-progress]')).not.toBeNull());
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
});
