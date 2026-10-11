import { describe, it, expect } from 'vitest';
import { createSyncPackage, mergeSyncPackage } from '../src/features/offlineSync.js';

describe('offlineSync PWA sync pipeline', () => {
  it('creates a sync package JSON', () => {
    const cards = [{ id: 'c1', front: 'Q1', back: 'A1', updatedAt: 1000 }];
    const notes = [{ id: 'n1', title: 'Note 1', updatedAt: 1000 }];
    const pkg = createSyncPackage(cards, notes);
    expect(pkg).toContain('c1');
    expect(pkg).toContain('Note 1');
  });

  it('rejects misleading encryption requests instead of exporting private notes in plaintext', () => {
    expect(() => createSyncPackage([], [], { passphrase: 'secret' })).toThrow(/not supported/);
    expect(() => createSyncPackage([], [], { _passphrase: 'secret' })).toThrow(/not supported/);
  });

  it('rejects malformed and future-version packages without changing input lists', () => {
    const cards = [{ id: 'a', updatedAt: 10 }];
    for (const payload of [
      '{not-json', 'null', '[]', JSON.stringify({ version: 2, cards: [], notes: [] }),
      JSON.stringify({ version: 1, cards: {}, notes: [] }),
      JSON.stringify({ version: 1, cards: [null], notes: [] }),
      JSON.stringify({ version: 1, cards: [{ id: 'x', updatedAt: -1 }], notes: [] }),
    ]) {
      expect(() => mergeSyncPackage(cards, [], payload)).toThrow();
    }
    expect(cards).toEqual([{ id: 'a', updatedAt: 10 }]);
  });

  it('rejects non-finite numeric record IDs rather than serializing them to null', () => {
    for (const id of [NaN, Infinity, -Infinity]) {
      expect(() => createSyncPackage([{ id, updatedAt: 1 }], [])).toThrow(/invalid id/);
      expect(() => mergeSyncPackage([{ id }], [], createSyncPackage([], []))).toThrow(/invalid id/);
    }
  });

  it('uses a stable local tie-break for equal timestamps', () => {
    const pkg = createSyncPackage([{ id: 'a', front: 'Incoming', updatedAt: 10 }], []);
    const result = mergeSyncPackage([{ id: 'a', front: 'Local', updatedAt: 10 }], [], pkg);
    expect(result.mergedCards).toEqual([{ id: 'a', front: 'Local', updatedAt: 10 }]);
  });

  it('merges incoming cards using Last-Write-Wins (LWW) strategy', () => {
    const existingCards = [{ id: 'c1', front: 'Old Q', updatedAt: 1000 }];
    const incomingPackage = createSyncPackage(
      [{ id: 'c1', front: 'Updated Q', updatedAt: 2000 }],
      []
    );

    const { mergedCards } = mergeSyncPackage(existingCards, [], incomingPackage);
    expect(mergedCards).toHaveLength(1);
    expect(mergedCards[0].front).toBe('Updated Q');
  });
});
