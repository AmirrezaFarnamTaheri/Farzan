import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as library from '../src/features/userLibrary.js';

describe('canonical course/topic editing', () => {
  let settings;
  beforeEach(() => {
    settings = {};
    window.DB = {
      getSetting: vi.fn(async key => settings[key] ?? null),
      saveSetting: vi.fn(async (key, value) => { settings[key] = value; return value; }),
    };
    window.DataStore = { mergeRaw: vi.fn() };
    window.OpenCourseDeck = { bus: { emit: vi.fn() } };
  });

  it('rejects inherited prototype names as explicit course identities', async () => {
    await expect(library.upsertCourse({ id: '__proto__', title: 'Injected' }))
      .rejects.toThrow(/invalid|reserved|unsafe/i);
    await expect(library.upsertCourse({ id: 'constructor', title: 'Injected' }))
      .rejects.toThrow(/invalid|reserved|unsafe/i);
    await expect(library.addTopic({ courseId: 'toString', title: 'Injected' }))
      .rejects.toThrow(/invalid|reserved|unsafe|no longer exists/i);
    const state = await library.loadLibrary();
    expect(Object.keys(state.courses)).toEqual([]);
  });

  it('keeps an intentionally empty canonical library empty after reload', async () => {
    const created = await library.upsertCourse({ title: 'Removed' });
    await library.removeCourse(created.id);
    const data = await library.loadLibrary();
    expect(Object.keys(data.courses)).toEqual([]);
    expect(settings.ocd_user_library).toBeDefined();
  });

  it('moves only the selected user topic, preserving its URL and resource references', async () => {
    const first = await library.upsertCourse({ title: 'First' });
    const second = await library.upsertCourse({ title: 'Second' });
    const topic = await library.addTopic({
      courseId: first.id, title: 'Week 1',
      videos: [{ url: 'https://example.test/week1.mp4', label: 'Week 1' }],
    });
    const moved = await library.moveTopic({ topicId: topic.topicId, fromCourseId: first.id, toCourseId: second.id });
    expect(moved).toMatchObject({ topicId: topic.topicId, courseId: second.id });
    const state = await library.loadLibrary();
    expect(state.courses[first.id].sources[0].topics).toHaveLength(0);
    expect(state.courses[second.id].sources[0].topics[0]).toMatchObject({
      url: topic.topicId,
      videos: [{ url: 'https://example.test/week1.mp4', label: 'Week 1' }],
    });
  });

  it('moves saved progress to the new course while preserving playback position', async () => {
    const from = await library.upsertCourse({ title: 'Started course' });
    const to = await library.upsertCourse({ title: 'Destination' });
    const topic = await library.addTopic({ courseId: from.id, title: 'Started topic' });
    let progress = { topicId: topic.topicId, courseId: from.id, position: 340, status: 'in-progress' };
    window.DB.getProgress = vi.fn(async () => progress);
    window.DB.saveProgress = vi.fn(async (topicId, courseId, fields) => {
      progress = { ...fields, topicId, courseId };
      return progress;
    });
    await library.moveTopic({ topicId: topic.topicId, fromCourseId: from.id, toCourseId: to.id });
    expect(progress).toMatchObject({ topicId: topic.topicId, courseId: to.id, position: 340, status: 'in-progress' });
  });

  it('compensates a canonical topic move when the progress migration fails', async () => {
    const from = await library.upsertCourse({ title: 'Source' });
    const to = await library.upsertCourse({ title: 'Destination' });
    const topic = await library.addTopic({ courseId: from.id, title: 'Protected topic' });
    window.DB.getProgress = vi.fn(async () => ({ topicId: topic.topicId, courseId: from.id, position: 15 }));
    window.DB.saveProgress = vi.fn(async () => { throw new Error('progress storage is full'); });
    await expect(library.moveTopic({ topicId: topic.topicId, fromCourseId: from.id, toCourseId: to.id }))
      .rejects.toThrow('progress storage is full');
    const state = await library.loadLibrary();
    expect(state.courses[from.id].sources[0].topics.map(item => item.url)).toEqual([topic.topicId]);
    expect(state.courses[to.id].sources[0].topics).toHaveLength(0);
  });

  it('rejects a missing target without losing the source topic', async () => {
    const first = await library.upsertCourse({ title: 'First' });
    const topic = await library.addTopic({ courseId: first.id, title: 'Keep' });
    await expect(library.moveTopic({ topicId: topic.topicId, fromCourseId: first.id, toCourseId: 'deleted' }))
      .rejects.toThrow(/does not exist|not found/i);
    const state = await library.loadLibrary();
    expect(state.courses[first.id].sources[0].topics[0].url).toBe(topic.topicId);
  });

  it('renames a topic in place without changing progress or source identity', async () => {
    const course = await library.upsertCourse({ title: 'Course' });
    const topic = await library.addTopic({ courseId: course.id, title: 'Old topic' });
    await library.renameTopic({ courseId: course.id, topicId: topic.topicId, title: 'New topic' });
    const state = await library.loadLibrary();
    expect(state.courses[course.id].sources[0].topics[0]).toMatchObject({ url: topic.topicId, title: 'New topic' });
  });

  it('rejects a failed canonical write without changing the visible overlaid course state', async () => {
    const c = await library.upsertCourse({ title: 'Original' });
    const prev = JSON.stringify(settings.ocd_user_library);
    window.DB.saveSetting.mockRejectedValueOnce(new Error('No space'));
    await expect(library.upsertCourse({ id: c.id, title: 'Unsaved' })).rejects.toThrow('No space');
    expect(JSON.stringify(settings.ocd_user_library)).toBe(prev);
    expect(window.DataStore.mergeRaw).not.toHaveBeenLastCalledWith(
      expect.objectContaining({ [c.id]: expect.objectContaining({ title: 'Unsaved' }) }),
      expect.anything(),
    );
  });
});
