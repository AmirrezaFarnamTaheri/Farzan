import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBObjectStore, indexedDB } from 'fake-indexeddb';
import {
  addMediaFiles,
  addPdfFile,
  addRemoteLink,
  addTopic,
  addVideoFile,
  clearLibraryFiles,
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

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function trackStoredFileIds() {
  const ids = [];
  const originalPut = IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function putAndTrack(...args) {
    if (args[0]?.id) ids.push(args[0].id);
    return originalPut.apply(this, args);
  });
  return ids;
}

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

  it('serializes concurrent whole-library mutations', async () => {
    const firstReadStarted = deferred();
    const releaseFirstRead = deferred();
    const releaseFirstSave = deferred();
    let readCount = 0;
    let saveCount = 0;

    window.DB.getSetting = vi.fn(async (key) => {
      const saved = window.DB.store[key] ?? null;
      readCount += 1;
      if (readCount === 1) {
        firstReadStarted.resolve();
        await releaseFirstRead.promise;
      }
      return saved;
    });
    window.DB.saveSetting = vi.fn(async (key, value) => {
      saveCount += 1;
      if (saveCount === 1) await releaseFirstSave.promise;
      window.DB.store[key] = value;
      return value;
    });

    const firstMutation = upsertCourse({ title: 'First course' });
    await firstReadStarted.promise;
    const secondMutation = addTopic({ title: 'Second topic' });

    // Let the unfixed implementation reach its second read/write before the
    // first operation is released. The serialized implementation queues it.
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseFirstRead.resolve();
    releaseFirstSave.resolve();

    const [created, topic] = await Promise.all([firstMutation, secondMutation]);
    const library = await loadLibrary();
    expect(library.courses[created.id]?.title).toBe('First course');
    expect(library.courses[topic.courseId]?.sources?.[0]?.topics || [])
      .toEqual(expect.arrayContaining([expect.objectContaining({ title: 'Second topic' })]));
  });

  it('compensates earlier files when a later batch file write fails', async () => {
    const storedIds = [];
    const originalPut = IDBObjectStore.prototype.put;
    let putCount = 0;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function putWithFailure(...args) {
      if (args[0]?.id) storedIds.push(args[0].id);
      putCount += 1;
      if (putCount === 2) {
        const error = new Error('forced second-file failure');
        error.name = 'ConstraintError';
        throw error;
      }
      return originalPut.apply(this, args);
    });

    await expect(addMediaFiles([
      new File(['a'], 'a.mp4', { type: 'video/mp4' }),
      new File(['b'], 'b.mp4', { type: 'video/mp4' }),
    ])).rejects.toMatchObject({ name: 'ConstraintError' });

    expect(storedIds).toHaveLength(2);
    await expect(resolveMediaUrl(`library-file:${storedIds[0]}`)).resolves.toBe('');
    expect((await loadLibrary()).courses).toEqual({});
  });

  it('compensates all files when library metadata persistence fails', async () => {
    const storedIds = trackStoredFileIds();
    window.DB.saveSetting.mockRejectedValueOnce(new Error('forced metadata failure'));

    await expect(addMediaFiles([
      new File(['a'], 'a.mp4', { type: 'video/mp4' }),
      new File(['b'], 'b.mp4', { type: 'video/mp4' }),
    ])).rejects.toThrow(/forced metadata failure/);

    expect(storedIds).toHaveLength(2);
    await expect(Promise.all(
      storedIds.map((id) => resolveMediaUrl(`library-file:${id}`)),
    )).resolves.toEqual(['', '']);
    expect(window.DB.store.ocd_user_library).toBeUndefined();
  });

  it('clears the auxiliary library file database through the public API', async () => {
    const [result] = await addMediaFiles([new File(['video'], 'clear-me.mp4', { type: 'video/mp4' })]);
    const library = await loadLibrary();
    const ref = library.courses[result.courseId].sources[0].topics[0].videos[0];

    await expect(clearLibraryFiles()).resolves.toBe(true);
    await expect(resolveMediaUrl(ref)).resolves.toBe('');
  });

  it('rejects file writes instead of returning refs when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const file = new File(['video'], 'lecture.mp4', { type: 'video/mp4' });
    let stored;

    try {
      stored = await putLibraryFile(file, { kind: 'video' });
    } catch (error) {
      expect(error).toMatchObject({ name: 'LibraryFileStorageUnavailableError' });
    }
    expect(stored).toBeUndefined();
    await expect(addMediaFiles([file])).rejects.toThrow(/storage is unavailable/i);
  });

  it('does not compensate committed files when a post-commit notification fails', async () => {
    const storedIds = trackStoredFileIds();
    window.OpenCourseDeck.bus.emit.mockImplementationOnce(() => {
      throw new Error('forced listener failure');
    });

    const [result] = await addMediaFiles([
      new File(['video'], 'lecture.mp4', { type: 'video/mp4' }),
    ]);
    expect(result.title).toBe('lecture');
    expect(storedIds).toHaveLength(1);

    const library = await loadLibrary();
    const ref = library.courses[result.courseId].sources[0].topics[0].videos[0];
    await expect(resolveMediaUrl(ref)).resolves.toMatch(/^blob:/);
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
