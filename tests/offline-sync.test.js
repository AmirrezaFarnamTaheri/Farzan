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
