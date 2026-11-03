/**
 * Canonical identity for a lesson that belongs to a specific course.
 * JSON tuple encoding avoids delimiter collisions and is shared by progress
 * records and authored course-media cues.
 */
export function courseTopicIdentity(courseId, topicId) {
  const normalizedCourseId = String(courseId ?? '').trim();
  const normalizedTopicId = String(topicId ?? '').trim();
  if (!normalizedCourseId || !normalizedTopicId) {
    throw new TypeError('Course and topic identity are both required');
  }
  return JSON.stringify([normalizedCourseId, normalizedTopicId]);
}

export function parseCourseTopicIdentity(identity) {
  if (typeof identity !== 'string') return null;
  try {
    const value = JSON.parse(identity);
    if (!Array.isArray(value) || value.length !== 2
      || typeof value[0] !== 'string' || typeof value[1] !== 'string'
      || !value[0].trim() || !value[1].trim()
      || courseTopicIdentity(value[0], value[1]) !== identity) return null;
    return { courseId: value[0], topicId: value[1] };
  } catch {
    return null;
  }
}
