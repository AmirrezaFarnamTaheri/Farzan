import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountTagsView } from '../src/views/tagsRoute.js';

const mount = () => mountTagsView({
  setView(markup) { document.getElementById('tags-first-use-host').innerHTML = markup; },
});
const metrics = () => document.querySelector('[data-tag-metrics]');
const list = () => document.querySelector('[data-tag-list]');
const search = () => document.querySelector('[data-tag-search]');
const filters = () => document.querySelector('[data-tag-filters]');

describe('Tags first-use state with trusted canonical reads', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="tags-first-use-host"></main>';
    window.OpenCourseDeck = window.OpenCourseDeck || {};
    delete window.OpenCourseDeck.tagFacetState;
    delete window.OpenCourseDeck.rerenderVisibleTags;
    window.DB = { getAllNotes: vi.fn(async () => []) };
    window.DataStore = {
      init: vi.fn(async () => {}),
      allTopics: vi.fn(() => []),
    };
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('replaces empty metrics and useless filters with a clear Notes entry point', async () => {
    mount();
    await vi.waitFor(() => expect(list()?.getAttribute('aria-busy')).toBe('false'));

    const empty = list().querySelector('.tags-empty-state');
    expect(empty).not.toBeNull();
    expect(empty.textContent).toContain('No tags');
    expect(empty.querySelector('a[href="#/notes"]')?.textContent).toContain('Notes');
    expect(metrics().children).toHaveLength(0);
    expect(metrics().hidden).toBe(true);
    expect(search().hidden).toBe(true);
    expect(filters().hidden).toBe(true);
    expect(list().querySelector('[data-tag-retry]')).toBeNull();
    expect(window.DB.getAllNotes).toHaveBeenCalledTimes(1);
  });

  it('also offers first-use guidance when saved records exist but are not tagged', async () => {
    window.DB.getAllNotes.mockResolvedValue([{ id: 'untagged', title: 'Untitled', tags: [] }]);
    window.DataStore.allTopics.mockReturnValue([{ topicId: 'book', tags: [] }]);
    mount();
    await vi.waitFor(() => expect(list()?.getAttribute('aria-busy')).toBe('false'));

    expect(list().querySelector('.tags-empty-state a[href="#/notes"]')).not.toBeNull();
    expect(list().textContent).toContain('Add tags');
    expect(metrics().children).toHaveLength(0);
    expect(search().hidden).toBe(true);
    expect(filters().hidden).toBe(true);
  });

  it('retains search, source facets, metrics and cards for non-empty tags', async () => {
    window.DB.getAllNotes.mockResolvedValue([{ id: 'note-1', tags: ['Memory'] }]);
    window.DataStore.allTopics.mockReturnValue([{ topicId: 'topic-1', tags: ['Memory', 'Biology'] }]);
    mount();
    await vi.waitFor(() => expect(list().querySelector('[data-tag-name="memory"]')).not.toBeNull());

    expect(metrics().children).toHaveLength(4);
    expect(metrics().hidden).toBe(false);
    expect(search().hidden).toBe(false);
    expect(filters().hidden).toBe(false);
    expect(list().querySelector('.tags-empty-state')).toBeNull();
    search().value = 'biol';
    search().dispatchEvent(new Event('input', { bubbles: true }));
    expect(list().querySelectorAll('[data-tag-name]')).toHaveLength(1);
    expect(list().querySelector('[data-tag-name="biology"]')).not.toBeNull();
  });

  it('distinguishes a storage outage from empty first-use and recovers after retry', async () => {
    window.DB.getAllNotes.mockRejectedValueOnce(new Error('Notes unavailable')).mockResolvedValue([]);
    mount();
    await vi.waitFor(() => expect(list().querySelector('[data-tag-retry]')).not.toBeNull());
    expect(list().querySelector('[role="alert"]')).not.toBeNull();
    expect(list().querySelector('.tags-empty-state')).toBeNull();
    expect(search().disabled).toBe(true);
    list().querySelector('[data-tag-retry]').click();

    await vi.waitFor(() => expect(list().querySelector('.tags-empty-state')).not.toBeNull());
    expect(list().querySelector('[role="alert"]')).toBeNull();
    expect(search().disabled).toBe(false);
    expect(search().hidden).toBe(true);
    expect(window.DB.getAllNotes).toHaveBeenCalledTimes(2);
  });
});
