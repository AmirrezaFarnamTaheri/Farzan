import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountBookmarksView } from '../src/views/bookmarksRoute.js';

const cards = () => [...document.querySelectorAll('[data-bookmark-type]')]
  .map(element => element.dataset.bookmarkType);

describe('Bookmarks retryable canonical reads and newest-render wins', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="bookmarks-retry-host"></main>';
    window.DB = {
      getAllTimestamps: vi.fn(async () => [{ id: 'ts-a', title: 'Saved moment', position: 30 }]),
      getAllNotes: vi.fn(async () => [{ id: 'note-a', title: 'Saved idea' }]),
      getAllAnnotations: vi.fn(async () => []),
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete window.DB;
    vi.restoreAllMocks();
  });

  function mount() {
    mountBookmarksView({
      setView: html => { document.getElementById('bookmarks-retry-host').innerHTML = html; },
      sanitizeHtml: html => html,
      createElement: (tag, attrs = {}, ...children) => {
        const el = document.createElement(tag);
        Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
        children.flat().forEach(child => el.append(child));
        return el;
      },
      Router: { navigate: vi.fn() },
    });
  }

  it('retries a failed Notes read without fabricating zeros or changing saved data', async () => {
    window.DB.getAllNotes.mockRejectedValueOnce(new Error('read locked'));
    mount();
    await vi.waitFor(() => expect(document.querySelector('[role="alert"].bookmarks-load-error')).not.toBeNull());
    expect(document.querySelector('[data-bookmark-metrics]').children).toHaveLength(0);
    expect(cards()).toHaveLength(0);
    const retry = document.querySelector('[data-bookmark-retry]');
    expect(retry).not.toBeNull();
    retry.click();
    await vi.waitFor(() => expect(cards()).toEqual(['timestamp', 'note']));
    expect(document.querySelector('[role="alert"].bookmarks-load-error')).toBeNull();
    expect(window.DB.getAllNotes).toHaveBeenCalledTimes(2);
  });

  it('ignores a stale slow filter read after a newer filter has completed', async () => {
    mount();
    await vi.waitFor(() => expect(cards()).toHaveLength(2));
    let resolveSlow;
    window.DB.getAllNotes.mockImplementationOnce(() => new Promise(resolve => { resolveSlow = resolve; }))
      .mockResolvedValue([{ id: 'note-a', title: 'Saved idea' }]);
    const filters = document.querySelector('[data-bookmark-filters]');
    filters.querySelector('[data-bookmark-filter="note"]').click();
    await vi.waitFor(() => expect(resolveSlow).toBeTypeOf('function'));
    filters.querySelector('[data-bookmark-filter="timestamp"]').click();
    await vi.waitFor(() => expect(cards()).toEqual(['timestamp']));
    resolveSlow([{ id: 'note-a', title: 'Saved idea' }]);
    await Promise.resolve();
    await Promise.resolve();
    expect(cards()).toEqual(['timestamp']);
    expect(filters.dataset.activeFilter).toBe('timestamp');
  });
});
