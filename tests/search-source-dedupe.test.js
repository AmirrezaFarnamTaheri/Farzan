import { describe, expect, it } from 'vitest';
import { dedupeSearchResults, searchResultIdentity } from '../src/core/searchRanking.js';

describe('canonical search identity and duplicate handling', () => {
  it('deduplicates the same source despite changed labels and related-note suggestion wrappers', () => {
    const items = [
      { id: 'note:42', sourceType: 'note', sourceId: '42', label: 'Cell biology', category: 'Note' },
      { id: 'related-note:42', sourceType: 'note', sourceId: '42', label: 'Renamed biology', category: 'Related note' },
      { id: 'topic:42', sourceType: 'topic', sourceId: '42', label: 'Biology lesson', category: 'Topic' },
    ];
    expect(dedupeSearchResults(items).map(x => x.id)).toEqual(['note:42', 'topic:42']);
    expect(searchResultIdentity(items[0])).toBe(searchResultIdentity(items[1]));
    expect(searchResultIdentity(items[1])).not.toBe(searchResultIdentity(items[2]));
  });

  it('returns twelve unique results even when duplicate records precede other matches', () => {
    const duplicate = { label: 'Physics', sourceType: 'course', sourceId: 'c1' };
    const others = Array.from({ length: 14 }, (_, index) => ({
      label: 'Physics ' + index, sourceType: 'course', sourceId: 'c' + (index + 2),
    }));
    const got = dedupeSearchResults([...Array(24).fill(duplicate), ...others], { limit: 12 });
    expect(got).toHaveLength(12);
    expect(got.map(x => x.sourceId)).toEqual(['c1', ...others.slice(0, 11).map(x => x.sourceId)]);
  });

  it('distinguishes same local IDs across distinct categories and preserves separate saved moments', () => {
    const records = [
      { id: '7', category: 'Note', label: 'Same id' },
      { id: '7', category: 'Course', label: 'Same id' },
      { sourceType: 'timestamp', sourceId: 'topic:3:10', label: 'Intro' },
      { sourceType: 'timestamp', sourceId: 'topic:3:30', label: 'Intro' },
    ];
    expect(dedupeSearchResults(records)).toEqual(records);
  });

  it('is bounded, stable and fails closed on malformed entries', () => {
    const rows = [null, 'not a document', {}, { label: 'A', href: '#/a', category: 'Help' },
      { label: 'A', href: '#/a', category: 'Help' }];
    expect(dedupeSearchResults(rows, { limit: 10 })).toEqual([rows[3]]);
    expect(dedupeSearchResults(rows, { limit: 0 })).toEqual([]);
  });
});
