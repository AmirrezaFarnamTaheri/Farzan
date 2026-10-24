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
