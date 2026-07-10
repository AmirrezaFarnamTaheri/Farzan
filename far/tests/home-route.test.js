import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountHomeView } from '../src/views/homeRoute.js';

function mountDashboard({ progress = [], notes = [], timestamps = [] } = {}) {
  document.body.innerHTML = '<main id="main-content"></main>';
  window.DataStore = {
    init: vi.fn(async () => true),
    allCourses: vi.fn(() => [{ id: 'course-1' }, { id: 'course-2' }]),
    allTopics: vi.fn(() => [
      { topicId: 'topic-1', title: 'Design Systems' },
      { topicId: 'topic-2', title: 'Frontend Performance' },
    ]),
  };
  window.DB = {
    getAllProgress: vi.fn(async () => progress),
    getAllNotes: vi.fn(async () => notes),
    getAllTimestamps: vi.fn(async () => timestamps),
  };

  const Router = { navigate: vi.fn() };
  const setPendingCourseMedia = vi.fn();
  mountHomeView({
    setView: html => { document.getElementById('main-content').innerHTML = html; },
    Router,
    setPendingCourseMedia,
  });
  return { Router, setPendingCourseMedia };
}

beforeEach(() => {
  vi.useRealTimers();
});

describe('home dashboard', () => {
  it('renders learning pulse, focus state, widgets, and recent activity', async () => {
    const now = Date.now();
    mountDashboard({
      progress: [
        { topicId: 'topic-1', percent: 42, updatedAt: now },
        { topicId: 'topic-2', percent: 100, status: 'done', updatedAt: now - 40 * 24 * 60 * 60 * 1000 },
      ],
      notes: [{ id: 'note-1', title: 'Spacing principles', topicId: 'topic-1', updatedAt: now - 1000 }],
      timestamps: [{ topicId: 'topic-1', title: 'Design Systems', position: 125, updatedAt: now - 2000 }],
    });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-home-widgets]')?.getAttribute('aria-busy')).toBe('false');
    });

    expect(document.getElementById('home-course-count')?.textContent).toBe('2');
    expect(document.getElementById('home-topic-count')?.textContent).toBe('2');
    expect(document.querySelector('[data-home-active-count]')?.textContent).toBe('1');
    expect(document.querySelector('[data-home-note-count]')?.textContent).toBe('1');
    expect(document.querySelector('[data-home-review-count]')?.textContent).toBe('1');
    expect(document.getElementById('home-focus-title')?.textContent).toBe('Design Systems');
    expect(document.querySelector('[data-home-focus-percent]')?.textContent).toBe('42% complete');
    expect(document.querySelectorAll('.home-widget')).toHaveLength(3);
    expect(document.querySelectorAll('.home-activity-item').length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain('Spacing principles');
  });

  it('resumes the latest topic from its saved position', async () => {
    const { Router, setPendingCourseMedia } = mountDashboard({
      progress: [{ topicId: 'topic-1', percent: 60, updatedAt: Date.now() }],
      timestamps: [{ topicId: 'topic-1', position: 180, updatedAt: Date.now() }],
    });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-home-focus-action] span')?.textContent).toBe('Resume this topic');
    });

    document.querySelector('[data-home-resume]')?.click();
    expect(setPendingCourseMedia).toHaveBeenCalledWith('topic-1', 180);
    expect(Router.navigate).toHaveBeenCalledWith('#/courses');
  });

  it('shows a useful empty state for a new learner', async () => {
    mountDashboard();

    await vi.waitFor(() => {
      expect(document.querySelector('[data-home-widgets]')?.getAttribute('aria-busy')).toBe('false');
    });

    expect(document.getElementById('home-focus-title')?.textContent).toBe('Explore your course library');
    expect(document.body.textContent).toContain('Your learning trail starts here');
    expect(document.querySelector('[data-home-resume] span')?.textContent).toBe('Start learning');
  });
});
