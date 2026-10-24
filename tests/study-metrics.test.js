import { describe, expect, it } from 'vitest';
import { dueReviewCards, watchedCoverageSeconds } from '../src/core/studyMetrics.js';

describe('truthful study metrics', () => {
  it('counts due flashcards by their schedule rather than old completed topics', () => {
    const cards = [
      { id: 'due', front: 'Question', nextReviewDate: '2026-10-23' },
      { id: 'future', nextReviewDate: '2026-11-20' },
      { id: 'undated' },
    ];
    expect(dueReviewCards(cards, '2026-10-24').map(card => card.id)).toEqual(['due', 'undated']);
    expect(dueReviewCards([], '2026-10-24')).toEqual([]);
  });

  it('measures tracked watched coverage, not a playback seek position', () => {
    const segments = [
      { id: 'a', topicId: 'lesson-1', start: 0, end: 120 },
      { id: 'b', topicId: 'lesson-1', start: 90, end: 180 },
      { id: 'c', topicId: 'lesson-2', start: 10, end: 20 },
      { id: 'bad', topicId: 'lesson-1', start: 200, end: -1 },
    ];
    expect(watchedCoverageSeconds(segments)).toBe(190);
    expect(watchedCoverageSeconds([])).toBe(0);
  });
});
