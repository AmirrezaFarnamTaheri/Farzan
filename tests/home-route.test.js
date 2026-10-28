import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountHomeView } from '../src/views/homeRoute.js';

function mountDashboard({ progress = [], notes = [], timestamps = [], flashcards = [], failNotes = false } = {}) {
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
    getAllNotes: vi.fn(async () => {
      if (failNotes) throw new Error('IndexedDB read failed');
      return notes;
    }),
    getAllTimestamps: vi.fn(async () => timestamps),
    getSetting: vi.fn(async key => key === 'ocd_flashcards' ? flashcards : null),
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
      flashcards: [{ id: 'card-due', front: 'Explain spacing', deck: 'Design', nextReviewDate: '2020-01-01' }],
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

  it('counts only actual scheduled flashcards and opens the Review screen', async () => {
    const { Router } = mountDashboard({
      progress: [{ topicId: 'topic-2', percent: 100, status: 'done', updatedAt: Date.now() - 40 * 86400000 }],
      flashcards: [
        { id: 'one', front: 'Review this', nextReviewDate: '2020-01-01' },
        { id: 'two', front: 'Later', nextReviewDate: '2099-01-01' },
      ],
    });
    await vi.waitFor(() => expect(document.querySelector('[data-home-widgets]')?.getAttribute('aria-busy')).toBe('false'));
    expect(document.querySelector('[data-home-review-count]').textContent).toBe('1');
    const review = document.querySelector('[data-home-widget="review"]');
    expect(review.textContent).toContain('Review this');
    review.click();
    expect(Router.navigate).toHaveBeenCalledWith('#/flashcards');
  });

  it('resumes the latest topic from its saved position', async () => {
    const { Router, setPendingCourseMedia } = mountDashboard({
      progress: [{ topicId: 'topic-1', percent: 60, updatedAt: Date.now() }],
      timestamps: [{ topicId: 'topic-1', position: 180, updatedAt: Date.now() }],
    });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-home-focus-action] span')?.textContent).toBe('Resume this topic');
    });

    expect(document.querySelector('[data-home-browse-secondary]')?.getAttribute('href')).toBe('#/courses');
    expect(document.querySelector('[data-home-resume] use')?.getAttribute('href')).toBe('#i-play');
    document.querySelector('[data-home-resume]')?.click();
    expect(setPendingCourseMedia).toHaveBeenCalledWith('topic-1', 180);
    expect(Router.navigate).toHaveBeenCalledWith('#/courses');
  });

  it('shows an error instead of fabricated zeros when saved activity cannot be read', async () => {
    mountDashboard({ failNotes: true });
    await vi.waitFor(() => expect(document.querySelector('.home-data-error')).not.toBeNull());
    expect(document.querySelector('[data-home-widgets]').getAttribute('aria-busy')).toBe('false');
    expect(document.querySelector('[data-home-active-count]').textContent).toBe('—');
    expect(document.querySelector('[data-pulse-active]').textContent).toBe('—');
    expect(document.querySelector('.home-empty-state').textContent).toContain('temporarily unavailable');
  });

  it('shows a useful empty state for a new learner', async () => {
    mountDashboard();

    await vi.waitFor(() => {
      expect(document.querySelector('[data-home-widgets]')?.getAttribute('aria-busy')).toBe('false');
    });

    expect(document.getElementById('home-focus-title')?.textContent).toBe('Choose a course');
    expect(document.body.textContent).toContain('No recent activity');
    expect(document.querySelector('[data-home-resume] span')?.textContent).toBe('Browse courses');
    expect(document.querySelector('[data-home-resume] use')?.getAttribute('href')).toBe('#i-curriculum');
    expect(document.querySelector('[data-home-browse-secondary]')).toBeNull();
    expect(document.querySelectorAll('.home-actions > button, .home-actions > a')).toHaveLength(3);
  });
});

describe('home entry and resume contracts', () => {
  it('does not bubble the Home Add action to outside-click dismiss handlers', () => {
    mountDashboard();
    const openMenu = vi.fn();
    window.OpenCourseDeck = { AddContent: { openMenu } };
    const outsideClick = vi.fn();
    document.addEventListener('click', outsideClick);
    try {
      document.querySelector('[data-home-add]').click();
      expect(openMenu).toHaveBeenCalledOnce();
      expect(outsideClick).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('click', outsideClick);
    }
  });

  it('does not pair the Continue widget topic with a different topic timestamp', async () => {
    const now = Date.now();
    const { Router, setPendingCourseMedia } = mountDashboard({
      progress: [{ topicId: 'topic-1', percent: 60, position: 90, updatedAt: now }],
      timestamps: [{ topicId: 'topic-2', position: 10, updatedAt: now - 60000 }],
    });
    await vi.waitFor(() => expect(document.querySelector('[data-home-widgets]')?.getAttribute('aria-busy')).toBe('false'));
    document.querySelector('[data-home-widget="continue"]').click();
    expect(setPendingCourseMedia).toHaveBeenCalledWith('topic-1', 90);
    expect(Router.navigate).toHaveBeenCalledWith('#/courses');
  });

  it('only resumes a position belonging to the focused topic', async () => {
    const now = Date.now();
    const { setPendingCourseMedia } = mountDashboard({
      progress: [{ topicId: 'topic-1', percent: 60, position: 90, updatedAt: now }],
      timestamps: [{ topicId: 'topic-2', position: 10, updatedAt: now - 60000 }],
    });
    await vi.waitFor(() => expect(document.querySelector('[data-home-widgets]')?.getAttribute('aria-busy')).toBe('false'));
    document.querySelector('[data-home-resume]').click();
    expect(setPendingCourseMedia).toHaveBeenCalledWith('topic-1', 90);
  });
});
