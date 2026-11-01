/**
 * Verify the exact queued course/topic before attributing notes, timestamps,
 * or authored media cues to a playing lesson. A broken index or stale snapshot
 * must never silently select queue[0] or an unrelated course with the same ID.
 *
 * This resolver does not seek, play, pause or mutate the media transport.
 */
export function resolveActiveCoursePlayback(inst) {
  if (!inst || typeof inst.snapshot !== 'function') return null;
  let snapshot;
  try { snapshot = inst.snapshot(); } catch { return null; }
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;

  const index = Object.hasOwn(snapshot, 'queueIndex') ? snapshot.queueIndex : inst.trackIndex;
  if (!Number.isInteger(index) || index < 0) return null;

  const queue = inst.queue;
  const queued = Array.isArray(queue) ? queue : snapshot.queue;
  if (!Array.isArray(queued) || index >= queued.length) return null;
  const activeTrack = queued[index];
  const identity = track => typeof track?.topicId === 'string' && Boolean(track.topicId.trim())
    && typeof track?.courseId === 'string' && Boolean(track.courseId.trim());
  const sameSource = (a, b) => identity(a) && identity(b)
    && a.topicId === b.topicId && a.courseId === b.courseId;
  if (!identity(activeTrack)) return null;

  // Snapshot and transport queues can diverge during a rapid track change.
  // An index that was valid in either queue is not sufficient on its own.
  if (Array.isArray(snapshot.queue)
    && (index >= snapshot.queue.length || !sameSource(snapshot.queue[index], activeTrack))) {
    return null;
  }
  if (snapshot.track != null && !sameSource(snapshot.track, activeTrack)) return null;

  const currentTime = snapshot.currentTime ?? inst.currentTime;
  if (typeof currentTime !== 'number' || !Number.isFinite(currentTime) || currentTime < 0) {
    return null;
  }
  const durationValue = snapshot.duration ?? inst.duration ?? 0;
  const duration = typeof durationValue === 'number' && Number.isFinite(durationValue)
    && durationValue >= 0 ? durationValue : 0;

  return {
    inst,
    track: snapshot.track || activeTrack,
    activeTrack,
    topicId: activeTrack.topicId,
    courseId: activeTrack.courseId,
    currentTime,
    duration,
  };
}
