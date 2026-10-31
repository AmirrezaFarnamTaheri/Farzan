import { describe, expect, it } from 'vitest';
import { dueReviewCards } from '../src/core/studyMetrics.js';

describe('mixed SM-2 and FSRS due metric parity', () => {
  const at = new Date('2026-01-02T12:00:00.000Z');
  const date = '2026-01-02';

  it('does not falsely mark a same-day FSRS short-term card as currently due', () => {
    const cards = [
      { id: 'legacy-today', nextReviewDate: '2026-01-02' },
      { id: 'fsrs-later', scheduler: 'fsrs-v5', nextReviewDate: date, fsrsState: { card: { due: '2026-01-02T12:10:00.000Z' } } },
      { id: 'fsrs-due', scheduler: 'fsrs-v5', nextReviewDate: date, fsrsState: { card: { due: '2026-01-02T11:59:59.000Z' } } },
      { id: 'fsrs-future', scheduler: 'fsrs-v5', nextReviewDate: '2026-01-03', fsrsState: { card: { due: '2026-01-03T00:00:00.000Z' } } },
    ];
    expect(dueReviewCards(cards, date, at).map(card => card.id)).toEqual(['legacy-today','fsrs-due']);
  });

  it('becomes due at the exact UTC timestamp, independently of local calendar boundaries', () => {
    const card = { id: 'fsrs', scheduler: 'fsrs-v5', nextReviewDate:'2026-01-02',
      fsrsState: { card: { due: '2026-01-02T12:10:00.000Z' } } };
    expect(dueReviewCards([card], date, new Date('2026-01-02T12:09:59.999Z'))).toHaveLength(0);
    expect(dueReviewCards([card], date, new Date('2026-01-02T12:10:00.000Z'))).toHaveLength(1);
  });

  it('rejects invalid FSRS timestamps rather than showing fictitious due results', () => {
    for(const due of ['nonsense','2026-01-02','',null]) {
      expect(() => dueReviewCards([{
        id:'broken',scheduler:'fsrs-v5',nextReviewDate:date,fsrsState: { card:{due} },
      }],date,at)).toThrow(/FSRS/);
    }
  });

  it('preserves the existing SM-2 date-only contract for old and explicitly versioned records', () => {
    const cards = [
      {id:'old',nextReviewDate:'2026-01-02'},
      {id:'explicit',scheduler:'sm2-v1',nextReviewDate:'2026-01-02'},
      {id:'later',nextReviewDate:'2026-01-03'},
      {id:'undated'},
    ];
    expect(dueReviewCards(cards,date,at).map(card=>card.id)).toEqual(['old','explicit','undated']);
  });
});
