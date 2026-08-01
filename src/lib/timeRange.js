/**
 * TimeRange — interval merging and normalization from Vidstack.
 * Each interval: { start: number, end: number } where start < end.
 */

/**
 * Normalize time intervals: sort, merge overlapping/adjacent.
 * @param {{ start: number, end: number }[]} intervals
 * @returns {{ start: number, end: number }[]}
 */
export function normalizeTimeIntervals(intervals) {
  if (!intervals || intervals.length === 0) return [];
  const sorted = intervals
    .filter((i) => i && Number.isFinite(i.start) && Number.isFinite(i.end) && i.start < i.end)
    .slice()
    .sort((a, b) => a.start - b.start);

  if (sorted.length === 0) return [];
  // Copy each interval so merging never mutates the caller's objects.
  const merged = [{ start: sorted[0].start, end: sorted[0].end }];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const curr = sorted[i];
    // Overlapping or adjacent
    if (curr.start <= last.end) {
      last.end = Math.max(last.end, curr.end);
    } else {
      merged.push({ start: curr.start, end: curr.end });
    }
  }
  return merged;
}

/**
 * Add a new interval to existing intervals and merge.
 * @param {{ start: number, end: number }[]} intervals
 * @param {{ start: number, end: number }} newInterval
 * @returns {{ start: number, end: number }[]}
 */
export function updateTimeIntervals(intervals, newInterval) {
  if (!newInterval || newInterval.start >= newInterval.end) return normalizeTimeIntervals(intervals);
  return normalizeTimeIntervals([...intervals, newInterval]);
}
