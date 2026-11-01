import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountTagsView } from '../src/views/tagsRoute.js';
import {
  TAG_TAXONOMY_KEY, parseTagTaxonomy, createTaxonomyTag,
  mergeTaxonomyTags, resolveTaxonomyKey,
} from '../src/features/tagTaxonomy.js';

const mount = () => mountTagsView({
  setView: html => { document.getElementById('tag-taxonomy-host').innerHTML = html; },
});
const cards = () => [...document.querySelectorAll('[data-tag-list] [data-tag-name]')];
const fill = (selector, value) => {
  const element = document.querySelector(selector);
  expect(element).not.toBeNull();
  element.value = value;
  return element;
};
const submit = selector => document.querySelector(selector + ' button').click();

describe('persistent, non-destructive tag taxonomy', () => {
  let saved;
  let notes;
  let topics;
  beforeEach(() => {
    document.body.innerHTML = '<main id="tag-taxonomy-host"></main>';
    window.OpenCourseDeck = {};
    saved = null;
    notes = [{ id:'note-1', title:'Physiology', tags:['كليه','Review'] }];
    topics = [{ topicId:'topic-1', title:'Kidney', keywords:'کلیه' }];
    window.DB = {
      getAllNotes: vi.fn(async () => structuredClone(notes)),
      getSetting: vi.fn(async key => {
        expect(key).toBe(TAG_TAXONOMY_KEY);
        return structuredClone(saved);
      }),
      saveSetting: vi.fn(async (key, value) => {
        expect(key).toBe(TAG_TAXONOMY_KEY);
        saved = structuredClone(value);
        return structuredClone(value);
      }),
    };
    window.DataStore = { init: vi.fn(async () => {}), allTopics: () => structuredClone(topics) };
  });

  it('creates and reloads an empty taxonomy label without inventing tagged notes', async () => {
    mount();
    await vi.waitFor(() => expect(cards()).toHaveLength(2));
    fill('[data-tag-create-name]', '  آناتومی  ');
    submit('[data-tag-create-form]');
    await vi.waitFor(() => expect(cards().some(card => card.dataset.tagName === 'آناتومی')).toBe(true));
    expect(saved).toMatchObject({ version: 1, labels: [{ key: 'آناتومی', label: 'آناتومی' }], aliases: {} });
    expect(document.querySelector('[data-tag-name="آناتومی"]').textContent).toContain('0 notes and 0 catalog topics');
    mount();
    await vi.waitFor(() => expect(cards().some(card => card.dataset.tagName === 'آناتومی')).toBe(true));
    expect(notes[0].tags).toEqual(['كليه','Review']);
  });

  it('merges a note/catalog label using a durable alias without rewriting either source', async () => {
    mount();
    await vi.waitFor(() => expect(cards()).toHaveLength(2));
    const before = structuredClone({ notes, topics });
    fill('[data-tag-merge-from]', 'كلیه');
    fill('[data-tag-merge-to]', 'كلیه');
    // The two normalized equivalents already form one facet; merging them
    // must be rejected instead of creating a self-referencing alias.
    submit('[data-tag-merge-form]');
    await vi.waitFor(() => expect(document.querySelector('[data-tag-mutation-error]')).not.toBeNull());
    expect(saved).toBeNull();

    fill('[data-tag-merge-from]', 'review');
    fill('[data-tag-merge-to]', 'کلیه');
    submit('[data-tag-merge-form]');
    await vi.waitFor(() => expect(cards()).toHaveLength(1));
    expect(cards()[0].dataset.tagName).toBe('کلیه');
    expect(cards()[0].textContent).toContain('1 note and 1 catalog topic');
    expect(saved.aliases).toEqual({ review:'کلیه' });
    expect({ notes, topics }).toEqual(before);
    mount();
    await vi.waitFor(() => expect(cards()).toHaveLength(1));
  });

  it('does not pretend a rejected taxonomy write completed and retains source facets', async () => {
    window.DB.saveSetting.mockRejectedValue(new Error('storage quota exceeded'));
    mount();
    await vi.waitFor(() => expect(cards()).toHaveLength(2));
    fill('[data-tag-create-name]', 'New topic');
    submit('[data-tag-create-form]');
    await vi.waitFor(() => expect(document.querySelector('[data-tag-mutation-error]')?.textContent)
      .toContain('not saved'));
    expect(saved).toBeNull();
    expect(cards()).toHaveLength(2);
  });

  it('fails closed on unreadable canonical taxonomy data rather than fabricating an empty registry', async () => {
    window.DB.getSetting.mockRejectedValue(new Error('canonical store locked'));
    mount();
    await vi.waitFor(() => expect(document.querySelector('[data-tag-retry]')).not.toBeNull());
    expect(cards()).toHaveLength(0);
    expect(document.querySelector('[data-tag-create-form] button').disabled).toBe(true);
    expect(window.DB.saveSetting).not.toHaveBeenCalled();
  });
});

describe('tag taxonomy validation and aliases', () => {
  it('rejects unknown revisions, cycles, malformed labels, and unsafe control text', () => {
    expect(() => parseTagTaxonomy({version:2,labels:[],aliases:{}})).toThrow(/version/i);
    expect(() => parseTagTaxonomy({version:1,labels:[],aliases:{a:'b',b:'a'}})).toThrow(/cycle/i);
    expect(() => createTaxonomyTag(parseTagTaxonomy(null),'x' + String.fromCharCode(0) + 'tag')).toThrow(/control/i);
  });
  it('reassigns transitive aliases when merging without losing a pre-existing destination', () => {
    const original=parseTagTaxonomy({version:1,labels:[{key:'renal',label:'Renal'}],aliases:{kidney:'renal'}});
    const next=mergeTaxonomyTags(original,'renal','فیزیک');
    expect(resolveTaxonomyKey(next,'kidney')).toBe('فیزیک');
    expect(resolveTaxonomyKey(next,'renal')).toBe('فیزیک');
    expect(original.aliases).toEqual({kidney:'renal'});
  });
});
