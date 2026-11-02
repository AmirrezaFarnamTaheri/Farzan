import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountBookmarksView } from '../src/views/bookmarksRoute.js';

describe('saved timestamp Bookmark destination preflight (#174)', () => {
  let saved, topics, Router, Toast, pending;
  beforeEach(() => {
    document.body.innerHTML = '<main id="bookmarks-root"></main>';
    saved = [{ id: 'recent', title: 'Study at 1:18', topicId: 'shared',
      courseId: 'renal', position: 78, updatedAt: 10 }];
    topics = [
      { topicId: 'shared', courseId: 'cardiac', title: 'Heart lecture' },
      { topicId: 'shared', courseId: 'renal', title: 'Kidney lecture' },
    ];
    Router = { navigate: vi.fn() };
    Toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    pending = vi.fn();
    window.DB = {
      getAllTimestamps: vi.fn(async () => structuredClone(saved)),
      getAllNotes: vi.fn(async () => []),
      getAllAnnotations: vi.fn(async () => []),
    };
    window.DataStore = { init: vi.fn(async () => true), allTopics: vi.fn(() => topics) };
    window.OpenCourseDeck = { UserLibrary: { overlay: vi.fn(async () => {}) } };
  });
  afterEach(() => {
    document.body.innerHTML = '';
    delete window.DB; delete window.DataStore; delete window.OpenCourseDeck;
    vi.restoreAllMocks();
  });
  const mount = () => mountBookmarksView({
    setView: html => { document.getElementById('bookmarks-root').innerHTML = html; },
    createElement: (tag, attrs = {}, ...children) => {
      const element = document.createElement(tag);
      Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
      element.append(...children.filter(Boolean)); return element;
    },
    setPendingCourseMedia: pending, setPendingPdfPage: vi.fn(),
    Router, Toast, sanitizeHtml: value => String(value),
  });
  async function openBookmark() {
    const link = await vi.waitFor(() => {
      const value = document.querySelector('[data-bookmark-type="timestamp"] a.btn');
      expect(value).not.toBeNull(); return value;
    });
    link.click();
  }

  it('opens an exact course-scoped video when another course reuses its topic ID', async () => {
    mount();
    await openBookmark();
    await vi.waitFor(() => expect(pending).toHaveBeenCalledExactlyOnceWith('shared', 78, 'renal'));
    expect(Router.navigate).toHaveBeenCalledWith('#/courses');
  });

  it('refuses an unscoped ambiguous source without changing the saved bookmark or launching media', async () => {
    delete saved[0].courseId;
    const previous = structuredClone(saved);
    mount();
    await openBookmark();
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith(expect.stringMatching(/ambiguous|identify|source/i)));
    expect(pending).not.toHaveBeenCalled();
    expect(Router.navigate).not.toHaveBeenCalled();
    expect(saved).toEqual(previous);
  });

  it('rejects a removed source even when the bookmark has an explicit course ID', async () => {
    topics = [{ topicId: 'shared', courseId: 'cardiac', title: 'Other course' }];
    mount();
    await openBookmark();
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith(expect.stringMatching(/missing|unavailable|source/i)));
    expect(pending).not.toHaveBeenCalled();
    expect(Router.navigate).not.toHaveBeenCalled();
  });

  it('rejects duplicate identical course/topic references instead of trusting the first source', async () => {
    topics.push({ topicId: 'shared', courseId: 'renal', title: 'Conflicting import' });
    mount();
    await openBookmark();
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith(expect.stringMatching(/ambiguous|source/i)));
    expect(pending).not.toHaveBeenCalled();
  });

  it('refuses stale timestamp handoff after another tab updates the canonical bookmark', async () => {
    mount();
    const link = await vi.waitFor(() => {
      const value = document.querySelector('[data-bookmark-type="timestamp"] a.btn');
      expect(value).not.toBeNull(); return value;
    });
    saved[0] = { ...saved[0], courseId: 'cardiac', position: 501, updatedAt: 11 };
    link.click();
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith(expect.stringMatching(/changed|reload|stale/i)));
    expect(pending).not.toHaveBeenCalled();
    expect(Router.navigate).not.toHaveBeenCalled();
  });

  it('accepts a globally unique unscoped source but sends the catalog course ID explicitly', async () => {
    topics = [{ topicId: 'shared', courseId: 'renal', title: 'Unique lecture' }];
    delete saved[0].courseId;
    mount();
    await openBookmark();
    await vi.waitFor(() => expect(pending).toHaveBeenCalledExactlyOnceWith('shared', 78, 'renal'));
    expect(Router.navigate).toHaveBeenCalledWith('#/courses');
  });

  it('keeps an ID-less legacy timestamp visible but disables unsafe source navigation', async () => {
    delete saved[0].topicId;
    const original = structuredClone(saved);
    mount();
    const link = await vi.waitFor(() => {
      const result = document.querySelector('[data-bookmark-type="timestamp"] a.btn');
      expect(result).not.toBeNull();
      return result;
    });
    expect(document.querySelector('[data-bookmark-type="timestamp"]').textContent)
      .toContain('Study at 1:18');
    expect(link.hasAttribute('href')).toBe(false);
    expect(link.getAttribute('aria-disabled')).toBe('true');
    expect(link.textContent).toMatch(/source unavailable/i);
    link.click();
    expect(pending).not.toHaveBeenCalled();
    expect(Router.navigate).not.toHaveBeenCalled();
    expect(saved).toEqual(original);
  });

  it('cancels an in-flight timestamp click when its Bookmarks view is replaced', async () => {
    let resolveCatalog;
    const deferredCatalog = new Promise(resolve => { resolveCatalog = resolve; });
    window.DataStore.allTopics.mockImplementation(() => deferredCatalog);
    mount();
    const link = await vi.waitFor(() => {
      const result = document.querySelector('[data-bookmark-type="timestamp"] a.btn');
      expect(result).not.toBeNull();
      return result;
    });
    link.click();
    await vi.waitFor(() => expect(window.DataStore.allTopics).toHaveBeenCalledTimes(1));
    // Route transition or an asynchronous filter redraw detaches this card.
    document.getElementById('bookmarks-root').replaceChildren(document.createElement('div'));
    resolveCatalog(topics);
    // One real event-loop turn drains the entire async source validation,
    // including its second canonical DB read. A few bare microtasks can
    // falsely pass before the stale navigation callback actually runs.
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(pending).not.toHaveBeenCalled();
    expect(Router.navigate).not.toHaveBeenCalled();
    expect(Toast.error).not.toHaveBeenCalled();
  });

  it('refuses navigation if the canonical catalog cannot be loaded', async () => {
    window.DataStore.allTopics.mockRejectedValue(new Error('offline catalog unavailable'));
    mount();
    await openBookmark();
    await vi.waitFor(() => expect(Toast.error).toHaveBeenCalledWith(expect.stringMatching(/catalog|unavailable|source/i)));
    expect(pending).not.toHaveBeenCalled();
    expect(Router.navigate).not.toHaveBeenCalled();
  });
});
