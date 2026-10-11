import { beforeEach, describe, expect, it, vi } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import {
  addMediaFiles,
  addPdfFile,
  addRemoteLink,
  addTopic,
  addVideoFile,
  initUserLibrary,
  isSafeRemoteUrl,
  loadLibrary,
  overlayLibrary,
  putLibraryFile,
  removeCourse,
  resolveMediaUrl,
  unwrapMediaRef,
  upsertCourse,
} from '../src/features/userLibrary.js';

describe('user library overlay', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', indexedDB);
    window.DB = {
      store: {},
      getSetting: vi.fn(async (key) => window.DB.store[key] ?? null),
      saveSetting: vi.fn(async (key, value) => {
        window.DB.store[key] = value;
        return value;
      }),
    };
    window.DataStore = {
      overlay: null,
      mergeRaw: vi.fn((courses, options) => {
        window.DataStore.overlay = { courses, options };
        return { courses: Object.keys(courses).length, topics: 0, userOwned: Boolean(options?.userOwned) };
      }),
      isLoaded: vi.fn(() => false),
    };
    window.OpenCourseDeck = { bus: { emit: vi.fn(), on: vi.fn() } };
  });

  it('unwraps string and {url,label} media refs', () => {
    expect(unwrapMediaRef('https://example.test/a.mp4')).toBe('https://example.test/a.mp4');
    expect(unwrapMediaRef({ url: 'library-file:abc', label: 'Lecture' })).toBe('library-file:abc');
    expect(unwrapMediaRef(null)).toBe('');
  });

  it('persists a user course overlay without mixing it into the catalog half', async () => {
    const created = await upsertCourse({ title: 'Anatomy review', description: 'Local notes' });
    expect(created.title).toBe('Anatomy review');
    expect(window.DB.saveSetting).toHaveBeenCalledWith(
      'ocd_user_library',
      expect.objectContaining({
        courses: expect.objectContaining({
          [created.id]: expect.objectContaining({ title: 'Anatomy review' }),
        }),
      }),
    );
    expect(window.DataStore.mergeRaw).toHaveBeenCalledWith(
      expect.objectContaining({ [created.id]: expect.objectContaining({ title: 'Anatomy review' }) }),
      { userOwned: true },
    );

    await removeCourse(created.id);
    expect(window.DataStore.mergeRaw).toHaveBeenLastCalledWith({}, { userOwned: true });
  });

  it('stores a local video blob and resolves library-file refs to blob URLs', async () => {
    const file = new File(['fake-video'], 'lecture.mp4', { type: 'video/mp4' });
    const topic = await addVideoFile(file, { title: 'Week 1 lecture' });
    expect(topic.title).toBe('Week 1 lecture');

    const library = await loadLibrary();
    const videos = library.courses['user-library'].sources[0].topics[0].videos;
    expect(videos[0].url).toMatch(/^library-file:/);

    const url = await resolveMediaUrl(videos[0]);
    expect(url).toMatch(/^blob:/);
  });

  it('adds PDFs, topics, and remote URLs into My Library', async () => {
    const pdf = new File(['%PDF-1.4'], 'notes.pdf', { type: 'application/pdf' });
    await addPdfFile(pdf);
    await addTopic({ title: 'Empty topic' });
    await addRemoteLink({ url: 'https://example.test/watch', title: 'Remote lecture', kind: 'video' });

    const library = await loadLibrary();
    const titles = library.courses['user-library'].sources[0].topics.map((topic) => topic.title);
    expect(titles).toEqual(expect.arrayContaining(['notes', 'Empty topic', 'Remote lecture']));
  });

  it('rejects javascript URLs and keeps embeds out of the video list', async () => {
    expect(isSafeRemoteUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeRemoteUrl('https://example.test/watch')).toBe(true);
    await expect(addRemoteLink({ url: 'javascript:alert(1)', title: 'Nope' })).rejects.toThrow(/http/i);

    await addRemoteLink({ url: 'https://example.test/embed', title: 'Embed lecture', kind: 'embed' });
    const library = await loadLibrary();
    const topic = library.courses['user-library'].sources[0].topics.find((item) => item.title === 'Embed lecture');
    expect(topic.videos).toEqual([]);
    expect(topic.pdfs).toEqual([]);
    expect(topic.iframes[0].url).toBe('https://example.test/embed');
  });

  it('reuses a course when adding media by matching title', async () => {
    const created = await upsertCourse({ title: 'Anatomy review' });
    const file = new File(['fake-video'], 'lecture.mp4', { type: 'video/mp4' });
    const topic = await addVideoFile(file, { courseTitle: 'Anatomy review', title: 'Week 1 lecture' });
    expect(topic.courseId).toBe(created.id);
    const library = await loadLibrary();
    expect(Object.keys(library.courses)).toEqual([created.id]);
  });

  it('persists a batch of media files once', async () => {
    const files = [
      new File(['a'], 'a.mp4', { type: 'video/mp4' }),
      new File(['b'], 'b.mp4', { type: 'video/mp4' }),
    ];
    window.DB.saveSetting.mockClear();
    await addMediaFiles(files, { kind: 'video' });
    const libraryWrites = window.DB.saveSetting.mock.calls.filter(([key]) => key === 'ocd_user_library');
    expect(libraryWrites).toHaveLength(1);
    const library = await loadLibrary();
    expect(library.courses['user-library'].sources[0].topics).toHaveLength(2);
  });

  it('deletes stored blobs when a course is removed', async () => {
    const file = new File(['fake-video'], 'lecture.mp4', { type: 'video/mp4' });
    const topic = await addVideoFile(file);
    const library = await loadLibrary();
    const ref = library.courses[topic.courseId].sources[0].topics[0].videos[0];
    expect(await resolveMediaUrl(ref)).toMatch(/^blob:/);
    await removeCourse(topic.courseId);
    expect(await resolveMediaUrl(ref)).toBe('');
  });

  it('rejects files over the library size cap', async () => {
    const file = new File(['x'], 'huge.mp4', { type: 'video/mp4' });
    Object.defineProperty(file, 'size', { value: 2 * 1024 * 1024 * 1024 });
    await expect(putLibraryFile(file, { kind: 'video' })).rejects.toThrow(/too large/i);
  });

  it('rejects file uploads when IndexedDB is unavailable without adding phantom topics', async () => {
    const original = globalThis.indexedDB;
    vi.stubGlobal('indexedDB', undefined);
    try {
      const file = new File(['file'], 'never-persisted.pdf', { type: 'application/pdf' });
      await expect(putLibraryFile(file, { kind: 'pdf' })).rejects.toThrow(/storage is unavailable/);
      await expect(addPdfFile(file)).rejects.toThrow(/storage is unavailable/);
      expect(window.DB.saveSetting).not.toHaveBeenCalled();
    } finally {
      vi.stubGlobal('indexedDB', original);
    }
  });

  it('keeps committed imported file blobs when a noncritical overlay callback throws', async () => {
    window.DataStore.mergeRaw = vi.fn(() => { throw new Error('view unavailable'); });
    const pdf = new File(['%PDF-1.4'], 'lecture.pdf', { type: 'application/pdf' });
    const topic = await addPdfFile(pdf);
    expect(topic.title).toBe('lecture');
    const stored = (await loadLibrary()).courses[topic.courseId].sources[0].topics[0].pdfs[0];
    expect(await resolveMediaUrl(stored)).toMatch(/^blob:/);
  });

  it('registers the UserLibrary namespace', () => {
    const api = initUserLibrary(window);
    expect(window.OpenCourseDeck.UserLibrary).toBe(api);
    expect(typeof api.overlay).toBe('function');
    overlayLibrary({ version: 1, courses: { demo: { title: 'Demo', sources: [] } } });
    expect(window.DataStore.mergeRaw).toHaveBeenCalledWith(
      { demo: { title: 'Demo', sources: [] } },
      { userOwned: true },
    );
  });

  it('rejects library creation when the persistent storage adapter is missing', async () => {
    const originalDB = window.DB;
    window.DB = undefined;
    try {
      await expect(upsertCourse({ title: 'Must not claim saved' })).rejects.toThrow(/storage is unavailable/);
      await expect(addTopic({ title: 'No storage' })).rejects.toThrow(/storage is unavailable/);
      expect(window.DataStore.mergeRaw).not.toHaveBeenCalled();
    } finally {
      window.DB = originalDB;
    }
  });

  it('rejects library mutations without a storage writer and keeps the overlay unchanged', async () => {
    window.DB.saveSetting = undefined;
    await expect(upsertCourse({ title: 'Not saved' })).rejects.toThrow(/Unable to save/);
    expect(window.DataStore.mergeRaw).not.toHaveBeenCalled();
  });

  it('serializes concurrent user-library edits without dropping a course or topic', async () => {
    // Interleave reads via an asynchronous adapter; without the lock both
    // operations see the same empty snapshot and the last writer wins.
    const originalGet = window.DB.getSetting;
    window.DB.getSetting = vi.fn(async (key) => {
      const result = await originalGet(key);
      await new Promise(resolve => setTimeout(resolve, 2));
      return result;
    });
    const [a, b] = await Promise.all([
      upsertCourse({ title: 'Course A' }),
      upsertCourse({ title: 'Course B' }),
    ]);
    expect(Object.keys((await loadLibrary()).courses).sort()).toEqual([a.id, b.id].sort());

    await Promise.all([
      addTopic({ courseId: a.id, title: 'Topic 1' }),
      addTopic({ courseId: a.id, title: 'Topic 2' }),
    ]);
    const topics = (await loadLibrary()).courses[a.id].sources[0].topics;
    expect(topics.map(item => item.title).sort()).toEqual(['Topic 1', 'Topic 2']);
  });

  it('does not leave newly imported blobs when user-library metadata cannot be saved', async () => {
    const file = new File(['data'], 'rejected.mp4', { type: 'video/mp4' });
    window.DB.saveSetting = vi.fn(async () => { throw new Error('metadata quota exhausted'); });
    const storage = await import('../src/features/userLibrary.js');
    await expect(addVideoFile(file)).rejects.toThrow(/metadata quota exhausted/);
    // The file record is not linked or visible as a phantom course.
    expect(window.DataStore.mergeRaw).not.toHaveBeenCalled();
    expect(storage).toBeDefined();
  });

  it('does not overwrite the library when a transient read failure occurs', async () => {
    const created = await upsertCourse({ title: 'Anatomy review' });
    expect(Object.keys((await loadLibrary()).courses)).toEqual([created.id]);

    // A transient storage read failure must not become an empty library that a
    // mutator then persists over the user's real data.
    const workingGet = window.DB.getSetting;
    window.DB.getSetting = vi.fn(async () => { throw new Error('storage unavailable'); });
    try {
      await expect(upsertCourse({ title: 'Neurology review' }))
        .rejects.toThrow(/Unable to read the user library/);
      await expect(addTopic({ title: 'Topic under fire' }))
        .rejects.toThrow(/Unable to read the user library/);
      await expect(removeCourse(created.id))
        .rejects.toThrow(/Unable to read the user library/);

      // The best-effort overlay tolerates the same failure.
      await expect(initUserLibrary(window).overlay()).resolves.toBeUndefined();
    } finally {
      window.DB.getSetting = workingGet;
    }

    // The persisted library survived the outage untouched.
    const library = await loadLibrary();
    expect(Object.keys(library.courses)).toEqual([created.id]);
    expect(library.courses[created.id].title).toBe('Anatomy review');
  });
});
