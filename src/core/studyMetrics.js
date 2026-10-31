/**
 * Review counts come from actual due-card schedules, not "completed
 * topics older than 30 days". Dates are ISO UTC calendar days, matching
 * the flashcard scheduler.
 */
export function dueReviewCards(cards, today = new Date().toISOString().slice(0, 10), now = new Date()) {
  if (!Array.isArray(cards)) return [];
  const nowMillis = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowMillis)) throw new TypeError('Invalid review clock');
  return cards.filter(card => {
    if (!card || typeof card !== 'object') return false;
    if (card.scheduler === 'fsrs-v5') {
      // FSRS learning steps use exact UTC instants. Comparing only the date
      // would prematurely show cards due later today on Home/Achievements.
      const due = card.fsrsState?.card?.due;
      if (typeof due !== 'string' || !due.endsWith('Z') || !Number.isFinite(Date.parse(due))) {
        throw new TypeError('Invalid FSRS due timestamp');
      }
      return Date.parse(due) <= nowMillis;
    }
    if (card.scheduler && card.scheduler !== 'sm2-v1') {
      throw new TypeError('Unknown review scheduler');
    }
    // Keep legacy cards on their originally persisted UTC calendar date.
    return !card.nextReviewDate || String(card.nextReviewDate) <= today;
  });
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
