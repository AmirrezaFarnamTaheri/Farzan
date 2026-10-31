import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountBookmarksView } from '../src/views/bookmarksRoute.js';

const host = () => document.getElementById('bookmarks-focus-host');
const metrics = () => document.querySelector('[data-bookmark-metrics]');
const filters = () => document.querySelector('[data-bookmark-filters]');
const list = () => document.querySelector('[data-bookmark-list]');
const cardTypes = () => [...list().querySelectorAll('[data-bookmark-type]')]
  .map(card => card.dataset.bookmarkType);
const mount = () => mountBookmarksView({
  setView: html => { host().innerHTML = html; },
  sanitizeHtml: html => html,
  createElement: (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    children.flat().forEach(child => node.append(child));
    return node;
  },
});

describe('Bookmarks focused saved-item and first-use states', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="bookmarks-focus-host"></main>';
    window.DB = {
      getAllTimestamps: vi.fn(async () => []),
      getAllNotes: vi.fn(async () => []),
      getAllAnnotations: vi.fn(async () => []),
    };
  });

  afterEach(() => {
    delete window.DB;
    vi.restoreAllMocks();
  });

  it('shows useful Notes and Courses entry points rather than four empty metrics and filters', async () => {
    mount();
    await vi.waitFor(() => expect(list().querySelector('.bookmarks-empty-state')).not.toBeNull());
    const empty = list().querySelector('.bookmarks-empty-state');
    expect(empty.textContent).toContain('No saved items yet');
    expect(empty.querySelector('a[href="#/notes"]')).not.toBeNull();
    expect(empty.querySelector('a[href="#/courses"]')).not.toBeNull();
    expect(metrics().children).toHaveLength(0);
    expect(metrics().hidden).toBe(true);
    expect(filters().hidden).toBe(true);
    expect(cardTypes()).toHaveLength(0);
  });

  it('places a single saved note first without meaningless zero-category counters or filter chips', async () => {
    window.DB.getAllNotes.mockResolvedValue([{ id: 'n1', title: 'First idea', content: 'saved' }]);
    mount();
    await vi.waitFor(() => expect(cardTypes()).toEqual(['note']));
    expect(list().textContent).toContain('First idea');
    expect(metrics().hidden).toBe(true);
    expect(metrics().children).toHaveLength(0);
    expect(filters().hidden).toBe(true);
    expect(list().querySelector('.bookmarks-empty-state')).toBeNull();
  });

  it('retains summary counts and working source filters for a genuinely mixed bookmark library', async () => {
    window.DB.getAllTimestamps.mockResolvedValue([{ id: 'ts1', title: 'Lecture', position: 120 }]);
    window.DB.getAllNotes.mockResolvedValue([{ id: 'n1', title: 'Study note' }]);
    mount();
    await vi.waitFor(() => expect(cardTypes()).toHaveLength(2));
    expect(metrics().hidden).toBe(false);
    expect(metrics().children).toHaveLength(4);
    expect(filters().hidden).toBe(false);
    filters().querySelector('[data-bookmark-filter="note"]').click();
    await vi.waitFor(() => expect(cardTypes()).toEqual(['note']));
    expect(filters().querySelector('[data-bookmark-filter="note"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('clears a stale active filter when the library shrinks to one type', async () => {
    window.DB.getAllTimestamps.mockResolvedValue([{ id: 'ts1', title: 'Lecture', position: 120 }]);
    window.DB.getAllNotes.mockResolvedValue([{ id: 'n1', title: 'Study note' }]);
    mount();
    await vi.waitFor(() => expect(cardTypes()).toHaveLength(2));
    filters().querySelector('[data-bookmark-filter="timestamp"]').click();
    await vi.waitFor(() => expect(cardTypes()).toEqual(['timestamp']));

    window.DB.getAllTimestamps.mockResolvedValue([]);
    filters().querySelector('[data-bookmark-filter="timestamp"]').click();
    await vi.waitFor(() => expect(cardTypes()).toEqual(['note']));
    expect(metrics().hidden).toBe(true);
    expect(filters().hidden).toBe(true);
    expect(filters().dataset.activeFilter).toBe('all');
    expect(filters().querySelector('[data-bookmark-filter="all"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('never turns a canonical read failure into a misleading first-use state', async () => {
    window.DB.getAllNotes.mockRejectedValue(new Error('Database locked'));
    mount();
    await vi.waitFor(() => expect(list().querySelector('[role="alert"]')).not.toBeNull());
    expect(metrics().children).toHaveLength(0);
    expect(metrics().hidden).toBe(true);
    expect(filters().hidden).toBe(true);
    expect(list().querySelector('.bookmarks-empty-state')).toBeNull();
    expect(list().textContent).toContain('Your stored data was not changed');
  });
});
