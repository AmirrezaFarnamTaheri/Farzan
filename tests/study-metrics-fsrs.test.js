import { describe, expect, it } from 'vitest';
import { dueReviewCards } from '../src/core/studyMetrics.js';

const fsrs = (id, due) => ({
  id, scheduler: 'fsrs-v5', fsrsState: { card: { due } },
});

describe('FSRS-only due review metrics', () => {
  const at = new Date('2026-01-02T12:00:00.000Z');
  const date = '2026-01-02';

  it('does not falsely mark a same-day short-term card as currently due', () => {
    const cards = [
      fsrs('later', '2026-01-02T12:10:00.000Z'),
      fsrs('due', '2026-01-02T11:59:59.000Z'),
      fsrs('tomorrow', '2026-01-03T00:00:00.000Z'),
    ];
    expect(dueReviewCards(cards, date, at).map(card => card.id)).toEqual(['due']);
  });

  it('becomes due at its exact UTC timestamp regardless of calendar boundaries', () => {
    const card = fsrs('fsrs', '2026-01-02T12:10:00.000Z');
    expect(dueReviewCards([card], date, new Date('2026-01-02T12:09:59.999Z'))).toHaveLength(0);
    expect(dueReviewCards([card], date, new Date('2026-01-02T12:10:00.000Z'))).toHaveLength(1);
  });

  it('rejects invalid FSRS timestamps rather than showing fabricated due results', () => {
    for (const due of ['nonsense', '2026-01-02', '', null]) {
      expect(() => dueReviewCards([fsrs('broken', due)], date, at)).toThrow(/FSRS/);
    }
  });

  it('rejects any obsolete or unknown scheduler instead of guessing a due date', () => {
    for (const card of [
      { id: 'undated' }, { id: 'date-only', nextReviewDate: '2026-01-02' },
      { id: 'sm2', scheduler: 'sm2-v1', nextReviewDate: '2026-01-02' },
      { id: 'future', scheduler: 'fsrs-v7', nextReviewDate: '2026-01-02' },
    ]) {
      expect(() => dueReviewCards([card], date, at)).toThrow(/scheduler/);
    }
  });
});
