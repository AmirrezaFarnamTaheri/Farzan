import { describe, expect, it } from 'vitest';
import { normalizeTimeIntervals, updateTimeIntervals } from '../src/lib/timeRange.js';

describe('timeRange interval merging', () => {
  it('merges overlapping and adjacent intervals', () => {
    expect(normalizeTimeIntervals([
      { start: 0, end: 10 },
      { start: 8, end: 20 },
      { start: 20, end: 25 },
      { start: 40, end: 50 },
    ])).toEqual([
      { start: 0, end: 25 },
      { start: 40, end: 50 },
    ]);
  });

  it('never mutates the caller-owned interval objects', () => {
    const first = { start: 0, end: 10 };
    const second = { start: 5, end: 30 };
    const input = [first, second];

    const merged = normalizeTimeIntervals(input);

    expect(first).toEqual({ start: 0, end: 10 });
    expect(second).toEqual({ start: 5, end: 30 });
    expect(merged).toEqual([{ start: 0, end: 30 }]);
    expect(merged[0]).not.toBe(first);
  });

  it('drops invalid intervals and handles empty input', () => {
    expect(normalizeTimeIntervals(null)).toEqual([]);
    expect(normalizeTimeIntervals([{ start: 5, end: 5 }, { start: NaN, end: 2 }])).toEqual([]);
  });

  it('updateTimeIntervals merges the new interval without touching existing objects', () => {
    const existing = [{ start: 0, end: 4 }];
    const result = updateTimeIntervals(existing, { start: 3, end: 9 });

    expect(result).toEqual([{ start: 0, end: 9 }]);
    expect(existing[0]).toEqual({ start: 0, end: 4 });
  });
});
