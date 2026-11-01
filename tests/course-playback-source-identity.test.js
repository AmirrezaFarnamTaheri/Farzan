import { describe, expect, it } from 'vitest';
import { resolveActiveCoursePlayback } from '../src/core/coursePlaybackIdentity.js';

const track = (topicId, courseId) => ({ topicId, courseId, title: topicId });

describe('course playback timestamp source identity (#174)', () => {
  it('resolves the real queued source only with an integer in-range index and matching snapshot', () => {
    const first = track('topic-1', 'course-a');
    const second = track('topic-2', 'course-b');
    const context = resolveActiveCoursePlayback({
      queue: [first, second], trackIndex: 1,
      snapshot: () => ({ queueIndex: 1, track: { ...second }, currentTime: 95, duration: 300 }),
    });
    expect(context).toMatchObject({ topicId: 'topic-2', courseId: 'course-b',
      activeTrack: second, currentTime: 95, duration: 300 });
  });

  it.each([-1, 2, 0.5, '0', null, NaN, Infinity])(
    'refuses invalid snapshot index %s instead of saving the first lesson', index => {
      const one = track('topic-1', 'course-a');
      expect(resolveActiveCoursePlayback({
        queue: [one],
        trackIndex: 0,
        snapshot: () => ({ queueIndex: index, track: { ...one }, currentTime: 95, duration: 300 }),
      })).toBeNull();
    },
  );

  it('does not attribute a second-course current track to another course that shares a topic ID', () => {
    const a = track('shared', 'course-a');
    const b = track('shared', 'course-b');
    expect(resolveActiveCoursePlayback({
      queue: [a], trackIndex: 0,
      snapshot: () => ({ queueIndex: 0, track: { ...b }, currentTime: 95 }),
    })).toBeNull();
  });

  it('refuses a mismatched source even when the queue index is valid', () => {
    const a = track('topic-1', 'course-a');
    const b = track('topic-2', 'course-a');
    expect(resolveActiveCoursePlayback({
      queue: [a, b], trackIndex: 1,
      snapshot: () => ({ queueIndex: 1, track: { ...a }, currentTime: 95 }),
    })).toBeNull();
  });

  it.each([undefined, null, '', '95', Infinity, -1, NaN])(
    'refuses stale or invalid saved position %s', currentTime => {
      const one = track('topic-1', 'course-a');
      expect(resolveActiveCoursePlayback({
        queue: [one], trackIndex: 0,
        snapshot: () => ({ queueIndex: 0, track: { ...one }, currentTime }),
      })).toBeNull();
    },
  );

  it('supports legacy player fixtures with their canonical trackIndex when snapshot index is absent', () => {
    const one = track('topic-1', 'course-a');
    expect(resolveActiveCoursePlayback({
      queue: [one], trackIndex: 0,
      snapshot: () => ({ track: { ...one }, currentTime: 0, duration: 0 }),
    })).toMatchObject({ topicId: 'topic-1', courseId: 'course-a', currentTime: 0 });
  });

  it('refuses a malformed queue, missing source identity and a missing player', () => {
    const one = track('topic-1', 'course-a');
    expect(resolveActiveCoursePlayback(null)).toBeNull();
    expect(resolveActiveCoursePlayback({
      queue: [], trackIndex: 0, snapshot: () => ({ track: one, currentTime: 1 }),
    })).toBeNull();
    expect(resolveActiveCoursePlayback({
      queue: [track('topic-1', '')], trackIndex: 0, snapshot: () => ({ currentTime: 1 }),
    })).toBeNull();
  });
});
