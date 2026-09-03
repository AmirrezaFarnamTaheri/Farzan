import { beforeEach, describe, expect, it, vi } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import {
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
});
