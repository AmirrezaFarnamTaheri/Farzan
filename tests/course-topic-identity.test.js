import { describe, expect, it } from 'vitest';
import { courseTopicIdentity, parseCourseTopicIdentity } from '../src/core/courseTopicIdentity.js';

describe('canonical course/topic identity', () => {
  it('creates a stable tuple key for one course and topic', () => {
    expect(courseTopicIdentity('course-a', 'shared-topic'))
      .toBe(JSON.stringify(['course-a', 'shared-topic']));
    expect(parseCourseTopicIdentity(JSON.stringify(['course-a', 'shared-topic'])))
      .toEqual({ courseId: 'course-a', topicId: 'shared-topic' });
  });

  it('does not collide when either ID contains delimiter characters', () => {
    expect(courseTopicIdentity('course:a', 'topic')).not.toBe(courseTopicIdentity('course', 'a:topic'));
  });

  it('rejects missing identities and legacy topic-only keys', () => {
    expect(() => courseTopicIdentity('', 'topic')).toThrow(/both|required/i);
    expect(() => courseTopicIdentity('course', '')).toThrow(/both|required/i);
    expect(parseCourseTopicIdentity('shared-topic')).toBeNull();
    expect(parseCourseTopicIdentity('source:["course-a","shared-topic"]')).toBeNull();
  });
});
