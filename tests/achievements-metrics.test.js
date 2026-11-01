import { describe, expect, it, vi } from 'vitest';
import { mountAchievementsView } from '../src/views/achievementsRoute.js';

describe('achievements truthful activity', () => {
  it('does not treat an unseen playhead or a stale completed topic as watch time or a due review', async () => {
    document.body.innerHTML = '<main id="main-content"></main>';
    window.DB = {
      getAllProgress: vi.fn(async () => [{
        topicId: 'topic-a', courseId: 'course-a', percent: 100,
        position: 7200, status: 'done', updatedAt: Date.now() - 60 * 86400000,
      }]),
      getAllNotes: vi.fn(async () => []),
      getAllTimestamps: vi.fn(async () => []),
      getAllWatchedSegments: vi.fn(async () => [
        { topicId: 'topic-a', start: 20, end: 80 },
      ]),
      getSetting: vi.fn(async key => key === 'ocd_flashcards'
        ? [{ id: 'card-one', front: 'Explain this', deck: 'Biology', scheduler: 'fsrs-v5', fsrsState: { card: { due: '2020-01-01T00:00:00.000Z' } } }]
        : null),
    };
    window.DataStore = {
      init: vi.fn(async () => true),
      allTopics: vi.fn(() => [{ topicId: 'topic-a', courseId: 'course-a', title: 'Lesson' }]),
    };
    const Router = { navigate: vi.fn() };
    mountAchievementsView({
      setView: html => { document.querySelector('main').innerHTML = html; },
      Router,
      setPendingCourseMedia: vi.fn(),
    });
    await vi.waitFor(() => expect(document.querySelector('[data-achievement-metrics]')?.textContent)
      .toContain('Tracked coverage minutes'));
    const metrics = document.querySelector('[data-achievement-metrics]').textContent;
    expect(metrics).toContain('Tracked coverage minutes');
    expect(metrics).not.toContain('Watched minutes');
    expect(document.querySelector('[data-achievement-id="deep-focus"]')?.dataset.achievementState).toBe('locked');
    expect(document.querySelectorAll('[data-review-card-id]')).toHaveLength(1);
    document.querySelector('[data-review-card-id] button').click();
    expect(Router.navigate).toHaveBeenCalledWith('#/flashcards');
  });

  it('shows an actionable storage error instead of substituting false zero achievements', async () => {
    document.body.innerHTML = '<main id="main-content"></main>';
    window.DB = {
      getAllProgress: vi.fn().mockRejectedValueOnce(new Error('Database temporarily unavailable'))
        .mockResolvedValue([{ topicId: 't1', courseId: 'c1', percent: 100, status: 'done' }]),
      getAllNotes: vi.fn(async () => []),
      getAllTimestamps: vi.fn(async () => []),
      getAllWatchedSegments: vi.fn(async () => []),
      getSetting: vi.fn(async () => []),
    };
    window.DataStore = {
      init: vi.fn(async () => true),
      allTopics: vi.fn(() => [{ topicId: 't1', courseId: 'c1', title: 'Intro' }]),
    };
    mountAchievementsView({
      setView: html => { document.querySelector('main').innerHTML = html; },
      Router: { navigate: vi.fn() },
    });
    await vi.waitFor(() => {
      expect(document.querySelector('[data-achievements-error]')?.textContent)
        .toMatch(/could not load|try again|unavailable/i);
    });
    expect(document.querySelector('[data-achievement-metrics]').children).toHaveLength(0);
    const retry = document.querySelector('[data-achievements-retry]');
    expect(retry).not.toBeNull();
    retry.click();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-achievements-error]')).toBeNull();
      expect(document.querySelector('[data-achievement-metrics]').textContent)
        .toContain('Done topics');
    });
    expect(document.querySelector('[data-achievement-metrics]').textContent).toContain('1');
    expect(window.DB.getAllProgress).toHaveBeenCalledTimes(2);
  });

});
