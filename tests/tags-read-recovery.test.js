import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountTagsView } from '../src/views/tagsRoute.js';

const mount = () => mountTagsView({
  setView: markup => {
    document.getElementById('tag-host').innerHTML = markup;
  },
});

describe('Tags canonical read recovery', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="tag-host"></main>';
    window.OpenCourseDeck = window.OpenCourseDeck || {};
    delete window.OpenCourseDeck.tagFacetState;
    delete window.OpenCourseDeck.rerenderVisibleTags;
    window.DB = {
      getAllNotes: vi.fn(async () => []),
    };
    window.DataStore = {
      init: vi.fn(async () => {}),
      allTopics: vi.fn(() => []),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render fabricated zero tag counts when the canonical notes read fails', async () => {
    window.DB.getAllNotes.mockRejectedValue(new Error('Notes database locked'));
    mount();

    await vi.waitFor(() => {
      expect(document.querySelector('[data-tag-list] [role="alert"]')?.textContent)
        .toContain('could not be loaded');
    });
    expect(document.querySelector('[data-tag-metrics]').children).toHaveLength(0);
    expect(document.querySelector('[data-tag-list]').textContent).not.toContain('No tags yet');
    expect(document.querySelector('[data-tag-retry]')).not.toBeNull();
    expect(window.DB.getAllNotes).toHaveBeenCalledTimes(1);
  });

  it('fails closed when catalog initialization fails instead of showing only note tags', async () => {
    window.DB.getAllNotes.mockResolvedValue([{ id: 'n1', tags: ['Medicine'] }]);
    window.DataStore.init.mockRejectedValue(new Error('Catalog unavailable'));
    mount();

    await vi.waitFor(() => {
      expect(document.querySelector('[data-tag-list] [role="alert"]')).not.toBeNull();
    });
    expect(document.querySelector('[data-tag-metrics]').children).toHaveLength(0);
    expect(document.querySelector('[data-tag-list] [data-tag-name="medicine"]')).toBeNull();
    expect(document.querySelector('[data-tag-retry]')).not.toBeNull();
  });

  it('retries a failed read and preserves the existing search and filter selections', async () => {
    let fail = true;
    window.DB.getAllNotes.mockImplementation(async () => {
      if (fail) throw new Error('Temporary notes outage');
      return [{ id: 'n1', tags: ['Cardiology'], title: 'Heart' }];
    });
    window.OpenCourseDeck.tagFacetState = { query: 'cardio', filter: 'note' };
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-tag-retry]')).not.toBeNull());
    fail = false;
    document.querySelector('[data-tag-retry]').click();

    await vi.waitFor(() => {
      expect(document.querySelector('[data-tag-list] [data-tag-name="cardiology"]')).not.toBeNull();
    });
    expect(document.querySelector('[data-tag-search]').value).toBe('cardio');
    expect(document.querySelector('[data-tag-filter="note"]').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-tag-list] [role="alert"]')).toBeNull();
    expect(window.DB.getAllNotes).toHaveBeenCalledTimes(2);
  });
});
