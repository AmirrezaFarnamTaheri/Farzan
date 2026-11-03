import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountStudioView } from '../src/views/studioRoute.js';

describe('Studio linked timestamp opens canonical course identity (#172/#174)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.matchMedia = vi.fn(() => ({ matches: false }));
  });
  afterEach(() => {
    document.body.innerHTML = '';
    delete window.OpenCourseDeck;
    delete window.DataStore;
    delete window.DB;
    vi.restoreAllMocks();
  });

  function mount({ topics = [], init = async () => {}, overlay = async () => {}, getTopics } = {}) {
    const board = {
      version: 1, activeLayerIdx: 0, layers: [{
        id: 'layer-1', name: 'Main', visible: true, locked: false,
        elements: [{
          id: 'time-link', type: 'rect', text: 'Course moment',
          linkType: 'timestamp', linkTarget: 'topic-1', linkLabel: 'Lesson',
        }],
      }],
    };
    const canvasApi = {
      init: vi.fn(), destroy: vi.fn(), serialize: vi.fn(() => structuredClone(board)),
      getState: vi.fn(() => ({ tool: 'select', selectedIds: [] })),
      restoreBoard: vi.fn(async () => false),
    };
    const setPendingCourseMedia = vi.fn();
    const Router = { navigate: vi.fn() };
    const Toast = { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() };
    window.OpenCourseDeck = {
      Canvas: canvasApi, UserLibrary: { overlay: vi.fn(overlay) },
      bus: { on: vi.fn(), off: vi.fn() },
    };
    window.DB = {
      getSetting: vi.fn(async () => null),
      getAllNotes: vi.fn(async () => []),
      getAllTimestamps: vi.fn(async () => []),
      getAllAnnotations: vi.fn(async () => []),
    };
    window.DataStore = {
      init: vi.fn(init),
      allCourses: vi.fn(async () => []),
      allTopics: vi.fn(getTopics ?? (async () => structuredClone(topics))),
    };
    const controller = mountStudioView({
      setView: html => { document.body.innerHTML = html; },
      Router, Toast, setPendingCourseMedia,
    });
    const click = () => document.querySelector('[data-open-studio-link="time-link"]').click();
    return { controller, click, setPendingCourseMedia, Router, Toast };
  }

  it('binds a unique source to its canonical course ID before navigating', async () => {
    const fixture = mount({ topics: [{ topicId: 'topic-1', courseId: 'course-a', title: 'Medical lesson' }] });
    try {
      fixture.click();
      await vi.waitFor(() => expect(fixture.setPendingCourseMedia)
        .toHaveBeenCalledExactlyOnceWith('topic-1', null, 'course-a'));
      expect(fixture.Router.navigate).toHaveBeenCalledExactlyOnceWith('#/courses');
    } finally { fixture.controller.unmount(); }
  });

  it.each([
    ['ambiguous duplicate topic', {
      topics: [{ topicId: 'topic-1', courseId: 'course-a' }, { topicId: 'topic-1', courseId: 'course-b' }],
    }],
    ['missing topic', { topics: [{ topicId: 'other', courseId: 'course-a' }] }],
    ['failed catalog read', { getTopics: async () => { throw new Error('Catalog unavailable'); } }],
    ['invalid catalog shape', { getTopics: async () => ({ topicId: 'topic-1' }) }],
    ['failed imported-library overlay', {
      topics: [{ topicId: 'topic-1', courseId: 'course-a' }],
      overlay: async () => { throw new Error('Imported library unavailable'); },
    }],
  ])('refuses %s without queuing a stale or unrelated media handoff', async (_kind, options) => {
    const fixture = mount(options);
    try {
      fixture.click();
      await vi.waitFor(() => expect(document.querySelector('[data-studio-status]').textContent)
        .toMatch(/source unavailable|ambiguous|could not open|catalog unavailable/i));
      expect(fixture.setPendingCourseMedia).not.toHaveBeenCalled();
      expect(fixture.Router.navigate).not.toHaveBeenCalled();
    } finally { fixture.controller.unmount(); }
  });

  it('does not navigate after the route was torn down during a pending overlay read', async () => {
    let release;
    const overlay = () => new Promise(resolve => { release = resolve; });
    const fixture = mount({
      topics: [{ topicId: 'topic-1', courseId: 'course-a' }],
      overlay,
    });
    fixture.click();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    fixture.controller.unmount();
    release();
    await vi.waitFor(() => expect(fixture.setPendingCourseMedia).not.toHaveBeenCalled());
    expect(fixture.Router.navigate).not.toHaveBeenCalled();
  });
});
