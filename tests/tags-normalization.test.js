import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountTagsView } from '../src/views/tagsRoute.js';

const mount = () => mountTagsView({
  setView: markup => { document.getElementById('tags-normalize-host').innerHTML = markup; },
});
const visibleCards = () => [...document.querySelectorAll('[data-tag-list] [data-tag-name]')];

describe('Tags shared multilingual search and record-level aggregation', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="tags-normalize-host"></main>';
    window.OpenCourseDeck = window.OpenCourseDeck || {};
    delete window.OpenCourseDeck.tagFacetState;
    delete window.OpenCourseDeck.rerenderVisibleTags;
    window.DB = { getAllNotes: vi.fn(async () => []) };
    window.DataStore = {
      init: vi.fn(async () => {}),
      allTopics: vi.fn(async () => []),
    };
  });

  it('groups Arabic/Persian keyboard spellings into one mixed facet without modifying source tags', async () => {
    const notes = [{ id: 'n1', tags: ['فیزیک'] }];
    const topics = [{ topicId: 't1', keywords: 'فيزيك' }];
    window.DB.getAllNotes.mockResolvedValue(notes);
    window.DataStore.allTopics.mockReturnValue(topics);
    mount();
    await vi.waitFor(() => expect(visibleCards()).toHaveLength(1));
    const card = visibleCards()[0];
    expect(card.dataset.tagName).toBe('فیزیک');
    expect(card.dataset.tagSource).toBe('mixed');
    expect(card.textContent).toContain('1 note and 1 catalog topic');
    expect(document.querySelector('[data-tag-metrics]').textContent).toContain('1Unique tags');

    const search = document.querySelector('[data-tag-search]');
    search.value = 'فيزيك';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(visibleCards()).toHaveLength(1);
    search.value = 'فِیـزیک';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(visibleCards()).toHaveLength(1);
    expect(notes[0].tags).toEqual(['فیزیک']);
    expect(topics[0].keywords).toBe('فيزيك');
  });

  it('counts each note and catalog record only once when tag, keywords and labels repeat the same facet', async () => {
    window.DB.getAllNotes.mockResolvedValue([
      { id: 'n1', tags: ['Medicine', 'medicine'], keywords: ' Medicine', labels: ['MEDICINE'] },
      { id: 'n2', tags: ['medicine'] },
    ]);
    window.DataStore.allTopics.mockReturnValue([
      { id: 'topic1', tags: ['Medicine'], labels: ['medicine', 'MEDICINE'] },
    ]);
    mount();
    await vi.waitFor(() => expect(visibleCards()).toHaveLength(1));
    const card = visibleCards()[0];
    expect(card.textContent).toContain('2 notes and 1 catalog topic');
    expect(document.querySelector('[data-tag-metrics]').textContent).toContain('3Tagged records');
    expect(window.DB.getAllNotes).toHaveBeenCalledTimes(1);
  });

  it('keeps multilingual query and selected filter after a new read without changing canonical data', async () => {
    const record = { id: 'n1', tags: ['كيميا'] };
    window.DB.getAllNotes.mockResolvedValue([record]);
    const query = 'کیمیا';
    window.OpenCourseDeck.tagFacetState = { query, filter: 'note' };
    mount();
    await vi.waitFor(() => expect(visibleCards()).toHaveLength(1));
    expect(document.querySelector('[data-tag-search]').value).toBe(query);
    expect(document.querySelector('[data-tag-filter="note"]').getAttribute('aria-pressed')).toBe('true');

    mount();
    await vi.waitFor(() => expect(visibleCards()).toHaveLength(1));
    expect(document.querySelector('[data-tag-search]').value).toBe(query);
    expect(record.tags).toEqual(['كيميا']);
    expect(window.DB.getAllNotes).toHaveBeenCalledTimes(2);
    expect(typeof window.DB.saveSetting).toBe('undefined');
  });
});
