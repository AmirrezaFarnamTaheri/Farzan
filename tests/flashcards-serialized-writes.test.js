import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../flashcards.js';
import { createFsrsV5State } from '../src/features/flashcardsFsrsAdapter.js';

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
      scheduler: 'fsrs-v5', fsrsState: createFsrsV5State(new Date()),
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
    expect(secondResult.fsrsState.card.reps).toBe(2);
    expect(secondResult.fsrsState.reviewLog).toHaveLength(2);
    expect(store.records()[0].fsrsState.reviewLog).toHaveLength(2);
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
  it('does not announce a successful rating when canonical persistence rejects it', async () => {
    const existing = {
      id: 'fc_uncommitted_review', deck: 'Review', front: 'Question', back: 'Answer',
      scheduler: 'fsrs-v5', fsrsState: createFsrsV5State(new Date()),
      nextReviewDate: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    };
    const records = [existing];
    window.DB = {
      getSetting: vi.fn(async () => records),
      saveSetting: vi.fn(async () => { throw new Error('Canonical database unavailable'); }),
    };
    manager.invalidateCache();
    document.body.innerHTML = '<div id="aria-announcer" aria-live="polite"></div><div id="studio-host"></div>';
    const container = document.getElementById('studio-host');
    await window.OpenCourseDeck.Flashcards.renderStudio(container);
    container.querySelector('#fc-flip-btn').click();

    container.dispatchEvent(new KeyboardEvent('keydown', {
      key: '4', bubbles: true, cancelable: true,
    }));
    await vi.waitFor(() => {
      expect(document.getElementById('aria-announcer').textContent)
        .toContain('Canonical database unavailable');
    });
    expect(document.getElementById('aria-announcer').textContent).not.toContain('Card rated');
    expect(container.querySelector('#fc-grade-btns button[data-grade="4"]').disabled).toBe(false);
    expect(records[0].fsrsState.reviewLog).toHaveLength(0);
  });

  it('does not grade the same visible card twice while its first save is pending', async () => {
    const existing = {
      id: 'fc_double_click', deck: 'Review', front: 'Question', back: 'Answer',
      scheduler: 'fsrs-v5', fsrsState: createFsrsV5State(new Date()),
      nextReviewDate: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    };
    let records = [existing];
    let startWrite;
    let releaseWrite;
    const entered = new Promise(resolve => { startWrite = resolve; });
    const pending = new Promise(resolve => { releaseWrite = resolve; });
    window.DB = {
      getSetting: vi.fn(async () => records),
      saveSetting: vi.fn(async (_key, snapshot) => {
        startWrite();
        await pending;
        records = snapshot;
        return true;
      }),
    };
    manager.invalidateCache();
    document.body.innerHTML = '<div id="aria-announcer" aria-live="polite"></div><div id="studio-host"></div>';
    const container = document.getElementById('studio-host');
    await window.OpenCourseDeck.Flashcards.renderStudio(container);
    container.querySelector('#fc-flip-btn').click();
    const grade = container.querySelector('#fc-grade-btns button[data-grade="4"]');
    grade.click();
    grade.click();
    await entered;
    releaseWrite();
    await vi.waitFor(() => {
      expect(document.getElementById('aria-announcer').textContent).toContain('Card rated');
    });
    expect(window.DB.saveSetting).toHaveBeenCalledTimes(1);
    expect(records[0].fsrsState.reviewLog).toHaveLength(1);
  });

});
