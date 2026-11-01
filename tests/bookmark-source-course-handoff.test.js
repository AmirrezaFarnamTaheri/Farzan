import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountBookmarksView } from '../src/views/bookmarksRoute.js';

describe('Saved timestamp destination identity', () => {
  let pending;
  let router;
  beforeEach(() => {
    document.body.innerHTML = '<main id="bookmark-view"></main>';
    pending = vi.fn();
    router = { navigate: vi.fn() };
    window.DB = {
      getAllTimestamps: vi.fn(async () => [{
        id: 'timestamp-b', title: 'Lesson at 1:18', topicId: 'shared',
        courseId: 'course-b', position: 78, updatedAt: 99,
      }]),
      getAllNotes: vi.fn(async () => []),
      getAllAnnotations: vi.fn(async () => []),
    };
  });
  afterEach(() => {
    document.body.innerHTML = '';
    delete window.DB;
    vi.restoreAllMocks();
  });
  const mount = () => mountBookmarksView({
    setView: html => { document.getElementById('bookmark-view').innerHTML = html; },
    createElement: (tag, attrs = {}, ...children) => {
      const node = document.createElement(tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      node.append(...children.filter(Boolean));
      return node;
    },
    setPendingCourseMedia: pending,
    setPendingPdfPage: vi.fn(),
    Router: router,
    sanitizeHtml: value => String(value),
  });

  it('retains both courseId and topicId on timestamp deep links', async () => {
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-bookmark-type="timestamp"] a')).not.toBeNull());
    const card = document.querySelector('[data-bookmark-type="timestamp"]');
    card.querySelector('a.btn').click();
    expect(pending).toHaveBeenCalledWith('shared', 78, 'course-b');
    expect(router.navigate).toHaveBeenCalledWith('#/courses');
  });
});
