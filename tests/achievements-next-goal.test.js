import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mountAchievementsView } from '../src/views/achievementsRoute.js';

let progress;
let segments;
const topic = id => ({ topicId: id, courseId: 'course-a', title: id });
const mount = () => mountAchievementsView({
  setView: markup => { document.querySelector('main').innerHTML = markup; },
  Router: { navigate: vi.fn() },
});

describe('achievement next attainable goal and meaningful first use', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main></main>';
    progress = [];
    segments = [];
    window.DB = {
      getAllProgress: vi.fn(async () => progress),
      getAllNotes: vi.fn(async () => []),
      getAllTimestamps: vi.fn(async () => []),
      getAllWatchedSegments: vi.fn(async () => segments),
      getSetting: vi.fn(async () => []),
    };
    window.DataStore = {
      init: vi.fn(async () => true),
      allTopics: vi.fn(() => Array.from({ length: 12 }, (_, index) => topic('topic-' + index))),
    };
  });
  afterEach(() => {
    delete window.DB;
    delete window.DataStore;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('leads first use with a reachable first action, without five empty metrics or six locked cards', async () => {
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-next-achievement]')?.textContent).toContain('First Step'));
    const panel = document.querySelector('[data-next-achievement]');
    expect(panel.textContent).toContain('0 of 1');
    expect(panel.querySelector('bdi[dir="ltr"]')?.textContent).toBe('0 of 1');
    expect(panel.querySelector('a[href="#/courses"]')).not.toBeNull();
    expect(document.querySelector('[data-achievement-metrics]').hidden).toBe(true);
    expect(document.querySelector('[data-locked-achievements]')?.open).toBe(false);
    expect(document.querySelector('[data-achievement-id="first-step"]').dataset.achievementState).toBe('locked');
  });

  it('guides an active learner to finishing a topic after the first step', async () => {
    progress = [{ topicId: 'topic-0', courseId: 'course-a', percent: 30, status: 'in-progress' }];
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-next-achievement]')?.textContent).toContain('First Finish'));
    expect(document.querySelector('[data-achievement-id="first-step"]').dataset.achievementState).toBe('unlocked');
    expect(document.querySelector('[data-achievement-metrics]').hidden).toBe(false);
    expect(document.querySelector('[data-achievement-metrics]').textContent).toContain('Touched topics');
    expect(document.querySelector('[data-achievement-metrics]').textContent).not.toContain('Completed courses');
  });

  it('chooses a nearby measurable objective instead of a distant locked reward', async () => {
    progress = Array.from({ length: 9 }, (_, index) => ({
      topicId: 'topic-' + index, courseId: 'course-a', percent: 12, status: 'in-progress',
    }));
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-next-achievement]')?.textContent).toContain('Collector'));
    expect(document.querySelector('[data-next-achievement]').textContent).toContain('9 of 10');
    expect(document.querySelector('[data-next-achievement] progress').value).toBe(9);
    expect(document.querySelector('[data-next-achievement] progress').max).toBe(10);
  });

  it('does not display stale achievement progress after an unreadable canonical request', async () => {
    window.DB.getAllProgress.mockRejectedValue(new Error('Locked'));
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-achievements-error]')).not.toBeNull());
    expect(document.querySelector('[data-next-achievement]').hidden).toBe(true);
    expect(document.querySelector('[data-achievement-metrics]').children).toHaveLength(0);
  });
});
