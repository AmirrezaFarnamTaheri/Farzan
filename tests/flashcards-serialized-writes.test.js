import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../flashcards.js';

const manager = window.OpenCourseDeck.Flashcards.manager;

function delayedCanonicalDeck(initial = []) {
  let records = initial.map(card => ({ ...card }));
  let starts = 0;
  let active = 0;
  let maxActive = 0;
  let releaseFirst;
  let firstStarted;
  const waitFirst = new Promise(resolve => { firstStarted = resolve; });
  const blockFirst = new Promise(resolve => { releaseFirst = resolve; });
  window.DB = {
    getSetting: vi.fn(async () => records.map(card => ({ ...card }))),
    saveSetting: vi.fn(async (_key, snapshot) => {
      starts += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      if (starts === 1) {
        firstStarted();
        await blockFirst;
      }
      records = snapshot.map(card => ({ ...card }));
      active -= 1;
      return true;
    }),
  };
  manager.invalidateCache();
  return {
    waitFirst: () => waitFirst,
    releaseFirst: () => releaseFirst(),
    records: () => records,
    maxActive: () => maxActive,
    saveCalls: () => starts,
  };
}

describe('Flashcard canonical write serialization', () => {
  beforeEach(() => {
    try { delete window.DB; } catch { window.DB = undefined; }
    manager.reset();
  });

  it('preserves both cards when two additions overlap a slow canonical write', async () => {
    const store = delayedCanonicalDeck();
    const first = manager.addCard({ front: 'First question', back: 'First answer', deck: 'Study' });
    await store.waitFirst();
    const second = manager.addCard({ front: 'Second question', back: 'Second answer', deck: 'Study' });

    // Allow the second public call to reach the old, concurrent read path.
    await Promise.resolve();
    await Promise.resolve();
    store.releaseFirst();

    await Promise.all([first, second]);
    expect(store.records().map(card => card.front)).toEqual(['First question', 'Second question']);
    expect(store.maxActive()).toBe(1);
    expect((await manager.getCards()).map(card => card.front))
      .toEqual(['First question', 'Second question']);
  });

  it('applies two overlapping reviews to the latest card state, not two stale copies', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const existing = {
      id: 'fc_two_reviews', deck: 'Study', front: 'Q', back: 'A', sourceNoteId: null,
      repetitions: 0, interval: 0, easeFactor: 2.5,
      nextReviewDate: today, createdAt: new Date().toISOString(),
    };
    const store = delayedCanonicalDeck([existing]);
    const first = manager.reviewCard(existing.id, 4);
    await store.waitFirst();
    const second = manager.reviewCard(existing.id, 4);
    await Promise.resolve();
    await Promise.resolve();
    store.releaseFirst();

    const [, secondResult] = await Promise.all([first, second]);
    expect(store.maxActive()).toBe(1);
    expect(secondResult.repetitions).toBe(2);
    expect(secondResult.interval).toBe(6);
    expect(store.records()[0].repetitions).toBe(2);
  });

  it('continues the mutation queue after an earlier persistence failure', async () => {
    let persisted = [];
    let calls = 0;
    window.DB = {
      getSetting: vi.fn(async () => persisted),
      saveSetting: vi.fn(async (_key, snapshot) => {
        if (++calls === 1) throw new Error('Temporary canonical write failure');
        persisted = snapshot.map(card => ({ ...card }));
        return true;
      }),
    };
    manager.invalidateCache();

    const failed = manager.addCard({ front: 'Uncommitted', back: 'Not stored' });
    const recovered = manager.addCard({ front: 'Committed', back: 'Stored' });
    await expect(failed).rejects.toThrow('Temporary canonical write failure');
    await recovered;

    expect(persisted.map(card => card.front)).toEqual(['Committed']);
    expect((await manager.getCards()).map(card => card.front)).toEqual(['Committed']);
    expect(calls).toBe(2);
  });
});
