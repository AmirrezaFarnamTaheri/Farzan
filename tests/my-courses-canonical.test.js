import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountMyCoursesView } from '../src/views/myCoursesRoute.js';
import { initUserLibrary, addTopic, loadLibrary, upsertCourse } from '../src/features/userLibrary.js';

describe('My Courses canonical ownership and legacy recovery', () => {
  let settings;
  let toast;
  const mount = () => mountMyCoursesView({
    setView(html) { document.querySelector('#view-container').innerHTML = html; },
    Toast: toast,
  });

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = '<div id="view-container"></div>';
    settings = {};
    window.DB = {
      getSetting: vi.fn(async key => settings[key] ?? null),
      saveSetting: vi.fn(async (key, value) => { settings[key] = value; return value; }),
    };
    toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    window.OpenCourseDeck = { Toast: toast, UI: { confirm: vi.fn(async () => true) }, bus: { on: vi.fn(), emit: vi.fn() } };
    window.DataStore = { isLoaded: () => false, mergeRaw: vi.fn() };
    initUserLibrary(window);
  });

  it('presents one primary Create action without duplicate zero metrics or a persistent backup warning', async () => {
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-my-course-list]').textContent).toContain('No custom courses'));
    expect(document.querySelector('[data-my-course-metrics]').hidden).toBe(true);
    expect(document.querySelector('[data-my-course-create]').hidden).toBe(true);
    expect(document.querySelector('[data-my-courses-add]').hidden).toBe(true);
    const backup = document.querySelector('details[data-media-backup-options]');
    expect(backup).not.toBeNull();
    expect(backup.open).toBe(false);
    expect(backup.querySelector('[data-backup-media-folder]')).not.toBeNull();
    expect(document.querySelectorAll('[data-my-course-empty-create]')).toHaveLength(1);
    document.querySelector('[data-my-course-empty-create]').click();
    expect(document.querySelector('[data-my-course-dialog]').open).toBe(true);
  });

  it('restores create, import and metrics controls for an existing custom course', async () => {
    await upsertCourse({ title: 'Biochemistry' });
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-my-course-list]').textContent).toContain('Biochemistry'));
    expect(document.querySelector('[data-my-course-metrics]').hidden).toBe(false);
    expect(document.querySelector('[data-my-course-create]').hidden).toBe(false);
    expect(document.querySelector('[data-my-courses-add]').hidden).toBe(false);
  });

  it('keeps creation hidden until requested and restores focus on cancellation', async () => {
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-my-course-empty-create]')).not.toBeNull());
    const opener = document.querySelector('[data-my-course-empty-create]');
    const dialog = document.querySelector('[data-my-course-dialog]');
    expect(opener).not.toBeNull();
    expect(dialog).not.toBeNull();
    expect(dialog.hasAttribute('open')).toBe(false);
    opener.click();
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(document.activeElement).toBe(document.querySelector('[data-my-course-title]'));
    dialog.querySelector('[data-my-course-cancel]').click();
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('opens course creation from the empty state and closes it after a successful save', async () => {
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-my-course-list]').textContent).toContain('No custom courses'));
    const emptyCreate = document.querySelector('[data-my-course-empty-create]');
    expect(emptyCreate).not.toBeNull();
    emptyCreate.click();
    const dialog = document.querySelector('[data-my-course-dialog]');
    expect(dialog.hasAttribute('open')).toBe(true);
    document.querySelector('[data-my-course-title]').value = 'Study track';
    document.querySelector('[data-my-course-save]').click();
    await vi.waitFor(() => expect(document.querySelector('[data-my-course-list]').textContent).toContain('Study track'));
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(settings.ocd_my_courses).toBeUndefined();
  });

  it('lists courses created through Add Course even without a legacy outline record', async () => {
    const course = await upsertCourse({ title: 'Anatomy', description: 'Modules' });
    expect(settings.ocd_my_courses).toBeUndefined();
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-my-course-list]').textContent).toContain('Anatomy'));
    expect(document.querySelector('[data-my-course-id="'+course.id+'"]')).not.toBeNull();
  });

  it('migrates only orphaned legacy outlines when the canonical library has never been initialized', async () => {
    settings.ocd_my_courses = [{ id: 'course-legacy', title: 'Legacy saved course', description: 'Historical' }];
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-my-course-list]').textContent).toContain('Legacy saved course'));
    expect(settings.ocd_user_library.courses['course-legacy'].description).toBe('Historical');
    expect(settings.ocd_my_courses).toHaveLength(1);
  });

  it('never resurrects a deleted canonical course from its stale legacy outline', async () => {
    settings.ocd_my_courses = [{ id: 'course-old', title: 'Old course' }];
    const c = await upsertCourse({ id: 'course-old', title: 'Old course' });
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-my-course-id="'+c.id+'"]')).not.toBeNull());
    const deleteButton = document.querySelector('[data-my-course-id="'+c.id+'"] [data-my-course-delete]');
    expect(deleteButton).not.toBeNull();
    deleteButton.click();
    await vi.waitFor(async () => {
      expect((await loadLibrary()).courses[c.id]).toBeUndefined();
      expect(document.querySelector('[data-my-course-list]').textContent).toContain('No custom courses');
    });
    expect(settings.ocd_my_courses).toHaveLength(1);
  });

  it('creates a course through one canonical write instead of two disagreeing settings', async () => {
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-my-course-list]').textContent).toContain('No custom courses'));
    document.querySelector('[data-my-course-title]').value = 'Study track';
    document.querySelector('[data-my-course-save]').click();
    await vi.waitFor(() => expect(document.querySelector('[data-my-course-list]').textContent).toContain('Study track'));
    expect(settings.ocd_my_courses).toBeUndefined();
    expect(Object.values(settings.ocd_user_library.courses).map(c => c.title)).toEqual(['Study track']);
  });

  it('renames a course through its stable canonical ID without losing topics', async () => {
    const course = await upsertCourse({ title: 'Old title' });
    const topic = await addTopic({ courseId: course.id, title: 'Lecture' });
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-my-course-id="'+course.id+'"]')).not.toBeNull());
    document.querySelector('[data-my-course-id="'+course.id+'"] [data-my-course-edit]').click();
    const input = document.querySelector('[data-my-course-id="'+course.id+'"] [data-my-course-edit-title]');
    expect(input).not.toBeNull();
    input.value = 'New title';
    document.querySelector('[data-my-course-id="'+course.id+'"] [data-my-course-edit-save]').click();
    await vi.waitFor(() => expect(settings.ocd_user_library.courses[course.id].title).toBe('New title'));
    expect(settings.ocd_user_library.courses[course.id].sources[0].topics[0].url).toBe(topic.topicId);
  });

  it('moves a topic to another course without changing its identity or attached media', async () => {
    const from = await upsertCourse({ title: 'Course A' });
    const to = await upsertCourse({ title: 'Course B' });
    const topic = await addTopic({
      courseId: from.id, title: 'Topic to move',
      pdfs: [{ url: 'https://example.test/lecture.pdf', label: 'Lecture PDF' }],
    });
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-my-topic-id="'+topic.topicId+'"]')).not.toBeNull());
    const row = document.querySelector('[data-my-topic-id="'+topic.topicId+'"]');
    row.querySelector('[data-my-topic-destination]').value = to.id;
    row.querySelector('[data-my-topic-move]').click();
    await vi.waitFor(() => expect(settings.ocd_user_library.courses[to.id].sources[0].topics[0].url).toBe(topic.topicId));
    const data = await loadLibrary();
    expect(data.courses[from.id].sources[0].topics).toHaveLength(0);
    expect(data.courses[to.id].sources[0].topics[0].pdfs).toEqual([{ url: 'https://example.test/lecture.pdf', label: 'Lecture PDF' }]);
  });
});
