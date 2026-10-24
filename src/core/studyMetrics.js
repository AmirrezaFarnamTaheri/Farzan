/**
 * Review counts come from actual due-card schedules, not "completed
 * topics older than 30 days". Dates are ISO UTC calendar days, matching
 * the flashcard scheduler.
 */
export function dueReviewCards(cards, today = new Date().toISOString().slice(0, 10)) {
  if (!Array.isArray(cards)) return [];
  return cards.filter(card => card && typeof card === 'object'
    && (!card.nextReviewDate || String(card.nextReviewDate) <= today));
}

/**
 * Count the union of recorded watched intervals per topic. Playhead positions
 * are not watch time: seeking to an hour should not grant an hour of study.
 * This is coverage, not time spent at the desk or a learning outcome.
 */
export function watchedCoverageSeconds(segments) {
  if (!Array.isArray(segments)) return 0;
  const groups = new Map();
  for (const segment of segments) {
    const topicId = String(segment?.topicId || '').trim();
    const start = Number(segment?.start);
    const end = Number(segment?.end);
    if (!topicId || !Number.isFinite(start) || !Number.isFinite(end)
      || start < 0 || end <= start) continue;
    const key = `${segment.courseId || ''}:${topicId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push([start, end]);
  }
  let covered = 0;
  for (const intervals of groups.values()) {
    intervals.sort((a, b) => a[0] - b[0]);
    let [from, to] = intervals[0];
    for (const [start, end] of intervals.slice(1)) {
      if (start <= to) to = Math.max(to, end);
      else {
        covered += to - from;
        [from, to] = [start, end];
      }
    }
    covered += to - from;
  }
  return covered;
}
