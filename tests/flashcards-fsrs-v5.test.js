import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFsrsV5State,
  rateFsrsV5State,
  ratingFromLegacyGrade,
  assertFsrsV5State,
} from '../src/features/flashcardsFsrsAdapter.js';
import '../flashcards.js';

const fs = () => window.OpenCourseDeck.Flashcards;
let canonical;

describe('opt-in FSRS-6 scheduling through pinned ts-fsrs v5', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T23:59:00.000Z'));
    canonical = null;
    window.localStorage.clear();
    window.DB = {
      getSetting: vi.fn(async name => name === 'ocd_flashcards' ? canonical : null),
      saveSetting: vi.fn(async (name, snapshot) => {
        if (name !== 'ocd_flashcards') throw new Error('Unexpected key');
        canonical = structuredClone(snapshot);
        return true;
      }),
    };
    fs().invalidateCache();
  });

  afterEach(() => {
    delete window.DB;
    fs().manager.reset();
    window.localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('maps Farzan buttons 1/2/4/5 to FSRS ratings 1/2/3/4, rejecting invalid grades', () => {
    expect([1, 2, 4, 5].map(ratingFromLegacyGrade)).toEqual([1, 2, 3, 4]);
    for (const invalid of [0, 3, 6, -1, 2.5, '5', NaN, null]) {
      expect(() => ratingFromLegacyGrade(invalid)).toThrow();
    }
  });

  it('creates a JSON-safe versioned new card without fabricating SM-2 history', () => {
    const created = createFsrsV5State(new Date());
    expect(created.version).toBe(1);
    expect(created.packageVersion).toBe('5.4.2');
    expect(created.model).toBe('fsrs-6');
    expect(created.card.due).toBe('2026-01-01T23:59:00.000Z');
    expect(created.reviewLog).toEqual([]);
    expect(created.card.state).toBe(0);
    expect(assertFsrsV5State(JSON.parse(JSON.stringify(created)))).toBeDefined();
  });

  it('stores a first Again review with exact short-term UTC due time and reversible log', () => {
    const initial = createFsrsV5State(new Date());
    const { state, nextReviewDate } = rateFsrsV5State(initial, 1, new Date());
    const due = Date.parse(state.card.due);
    expect(due).toBeGreaterThan(Date.now());
    expect(due).toBeLessThan(Date.now() + 24 * 60 * 60 * 1000);
    expect(nextReviewDate).toBe(new Date(due).toISOString().slice(0, 10));
    expect(state.reviewLog).toHaveLength(1);
    expect(state.reviewLog[0].rating).toBe(1);
    expect(state.card.reps).toBe(1);
    expect(JSON.stringify(state)).not.toContain('Date(');
  });

  it('refuses corrupt or foreign scheduler snapshots before accessing the library', () => {
    const initial = createFsrsV5State(new Date());
    const broken = structuredClone(initial);
    broken.card.due = 'not-a-date';
    expect(() => assertFsrsV5State(broken)).toThrow();
    const v7 = structuredClone(initial);
    v7.model = 'fsrs-7';
    expect(() => rateFsrsV5State(v7, 4, new Date())).toThrow();
  });

  it('preserves old SM-2 defaults and exact date-only due behavior', async () => {
    const card = await fs().addCard({ front: 'Legacy', back: 'SM-2' });
    expect(card.scheduler).toBeUndefined();
    expect(card.repetitions).toBe(0);
    expect(card.interval).toBe(0);
    expect(card.easeFactor).toBe(2.5);
    expect(card.nextReviewDate).toBe('2026-01-01');
    const updated = await fs().reviewCard(card.id, 4);
    expect(updated.interval).toBe(1);
    expect(updated.scheduler).toBeUndefined();
    expect(updated.nextReviewDate).toBe('2026-01-02');
    expect(updated.fsrsState).toBeUndefined();
  });

  it('requires explicit opt-in for a new FSRS card and uses timestamp-accurate due checks', async () => {
    const card = await fs().addCard({ front: 'New', back: 'FSRS', scheduler: 'fsrs-v5' });
    expect(card.scheduler).toBe('fsrs-v5');
    expect(card.fsrsState.packageVersion).toBe('5.4.2');
    expect(card.repetitions).toBeUndefined();
    expect(card.interval).toBeUndefined();
    expect((await fs().getDueCards()).map(c => c.id)).toContain(card.id);
    const reviewed = await fs().reviewCard(card.id, 1);
    expect(reviewed.fsrsState.reviewLog).toHaveLength(1);
    expect(Date.parse(reviewed.fsrsState.card.due)).toBeGreaterThan(Date.now());
    expect((await fs().getDueCards()).map(c => c.id)).not.toContain(card.id);
    expect(window.DB.saveSetting).toHaveBeenCalledTimes(2);
    vi.setSystemTime(new Date(reviewed.fsrsState.card.due));
    expect((await fs().getDueCards()).map(c => c.id)).toContain(card.id);
  });

  it('round-trips an FSRS record through canonical JSON backup and rehydration', async () => {
    const first = await fs().addCard({ front: 'Recover', back: 'Record', scheduler: 'fsrs-v5' });
    await fs().reviewCard(first.id, 4);
    const saved = JSON.parse(JSON.stringify(canonical));
    expect(saved[0].fsrsState.reviewLog[0].rating).toBe(3);
    canonical = saved;
    fs().invalidateCache();
    const restored = (await fs().getCards())[0];
    expect(restored.fsrsState).toEqual(saved[0].fsrsState);
    const after = await fs().reviewCard(restored.id, 5);
    expect(after.fsrsState.reviewLog).toHaveLength(2);
  });

  it('never changes the canonical deck on invalid grades or corrupt FSRS records', async () => {
    const first = await fs().addCard({ front: 'Safe', back: 'Review', scheduler: 'fsrs-v5' });
    const prior = structuredClone(canonical);
    await expect(fs().reviewCard(first.id, 3)).rejects.toThrow();
    expect(canonical).toEqual(prior);
    expect(window.DB.saveSetting).toHaveBeenCalledTimes(1);
    canonical[0].fsrsState.card.due = 'invalid-date';
    fs().invalidateCache();
    await expect(fs().reviewCard(first.id, 4)).rejects.toThrow();
    expect(window.DB.saveSetting).toHaveBeenCalledTimes(1);
  });

  it('does not permit an unknown scheduling engine on new cards', async () => {
    await expect(fs().addCard({ front: 'A', back: 'B', scheduler: 'fsrs-v7' })).rejects.toThrow();
    expect(window.DB.saveSetting).not.toHaveBeenCalled();
  });
});
