import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountTagsView } from '../src/views/tagsRoute.js';

const mount = () => mountTagsView({
  setView: markup => { document.getElementById('tags-test-host').innerHTML = markup; },
});

describe('Tags first-use, populated, and read-failure states', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="tags-test-host"></main>';
    window.OpenCourseDeck = window.OpenCourseDeck || {};
    delete window.OpenCourseDeck.tagFacetState;
    delete window.OpenCourseDeck.rerenderVisibleTags;
    window.DB = { getAllNotes: vi.fn(async () => []) };
    window.DataStore = {
      init: vi.fn(async () => {}),
      allTopics: vi.fn(async () => []),
    };
  });

  it('offers useful Notes and Courses actions instead of empty metrics and inert filters', async () => {
    mount();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-tag-first-use]')).not.toBeNull();
    });
    const firstUse = document.querySelector('[data-tag-first-use]');
    expect(firstUse.textContent).toContain('No tags yet');
    expect([...firstUse.querySelectorAll('a')].map(a => a.getAttribute('href')))
      .toEqual(expect.arrayContaining(['#/notes', '#/courses']));
    const metrics = document.querySelector('[data-tag-metrics]');
    expect(metrics.hidden).toBe(true);
    expect(metrics.children).toHaveLength(0);
    expect(document.querySelector('[data-tag-search]').hidden).toBe(true);
    expect(document.querySelector('[data-tag-filters]').hidden).toBe(true);
    expect(document.querySelector('[data-tag-list] [role="alert"]')).toBeNull();
  });

  it('keeps populated tag metrics, search, filters and cards visible', async () => {
    window.DB.getAllNotes.mockResolvedValue([{ id: 'note-1', tags: ['Revision'] }]);
    mount();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-tag-name="revision"]')).not.toBeNull();
    });
    const metrics = document.querySelector('[data-tag-metrics]');
    expect(metrics.hidden).toBe(false);
    expect(metrics.querySelectorAll('.stat-card')).toHaveLength(4);
    expect(document.querySelector('[data-tag-search]').hidden).toBe(false);
    expect(document.querySelector('[data-tag-filters]').hidden).toBe(false);
    expect(document.querySelector('[data-tag-first-use]')).toBeNull();
  });

  it('recovers normal browse controls when tags are added and the route is remounted', async () => {
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-tag-first-use]')).not.toBeNull());
    window.DB.getAllNotes.mockResolvedValue([{ id: 'note-2', tags: ['Biology'] }]);
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-tag-name="biology"]')).not.toBeNull());
    expect(document.querySelector('[data-tag-first-use]')).toBeNull();
    expect(document.querySelector('[data-tag-metrics]').hidden).toBe(false);
    expect(document.querySelector('[data-tag-search]').hidden).toBe(false);
  });

  it('never disguises a failed canonical read as normal first use', async () => {
    window.DB.getAllNotes.mockRejectedValue(new Error('Database unavailable'));
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-tag-retry]')).not.toBeNull());
    expect(document.querySelector('[data-tag-first-use]')).toBeNull();
    expect(document.querySelector('[data-tag-list] [role="alert"]')).not.toBeNull();
    expect(document.querySelector('[data-tag-metrics]').children).toHaveLength(0);
    expect(document.querySelector('[data-tag-search]').disabled).toBe(true);
  });
});
