import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountTagsView } from '../src/views/tagsRoute.js';
import {
  TAG_TAXONOMY_KEY, parseTagTaxonomy, createTaxonomyTag,
  mergeTaxonomyTags, unmergeTaxonomyTag, resolveTaxonomyKey,
  persistTagTaxonomy,
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
      compareAndSwapSetting: vi.fn(async (key, expected, next) => {
        expect(key).toBe(TAG_TAXONOMY_KEY);
        if (JSON.stringify(saved) !== JSON.stringify(expected)) return false;
        saved = structuredClone(next);
        return true;
      }),
    };
    window.DataStore = { init: vi.fn(async () => {}), allTopics: () => structuredClone(topics) };
  });

  it('does not enable tag changes with a non-atomic saveSetting-only adapter', async () => {
    // The pre-release route must not present an unsafe writer as durable.
    const oldWriter = vi.fn(async () => { throw new Error('Obsolete writer must not run'); });
    window.DB.saveSetting = oldWriter;
    delete window.DB.compareAndSwapSetting;
    mount();
    await vi.waitFor(() => expect(cards()).toHaveLength(2));
    const create = document.querySelector('[data-tag-create-form] button');
    const merge = document.querySelector('[data-tag-merge-form] button');
    expect(create.disabled).toBe(true);
    expect(merge.disabled).toBe(true);
    fill('[data-tag-create-name]', 'Anatomy');
    create.click();
    expect(oldWriter).not.toHaveBeenCalled();
    expect(saved).toBeNull();
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

  it('unmerges a previously combined facet after acknowledged durable storage and reload', async () => {
    mount();
    await vi.waitFor(() => expect(cards()).toHaveLength(2));
    const before = structuredClone({ notes, topics });
    fill('[data-tag-merge-from]', 'review');
    fill('[data-tag-merge-to]', 'کلیه');
    submit('[data-tag-merge-form]');
    await vi.waitFor(() => expect(cards()).toHaveLength(1));
    const unmerge = document.querySelector('[data-tag-unmerge-form]');
    expect(unmerge).not.toBeNull();
    expect(fill('[data-tag-unmerge-source]', 'review').value).toBe('review');
    submit('[data-tag-unmerge-form]');
    await vi.waitFor(() => expect(cards()).toHaveLength(2));
    expect(saved.aliases).toEqual({});
    expect({ notes, topics }).toEqual(before);
    expect(document.querySelector('[data-tag-name="review"]')).not.toBeNull();
    mount();
    await vi.waitFor(() => expect(cards()).toHaveLength(2));
  });

  it('retains the merged facet when unmerge storage is rejected without claiming success', async () => {
    mount();
    await vi.waitFor(() => expect(cards()).toHaveLength(2));
    fill('[data-tag-merge-from]', 'review');
    fill('[data-tag-merge-to]', 'کلیه');
    submit('[data-tag-merge-form]');
    await vi.waitFor(() => expect(cards()).toHaveLength(1));
    window.DB.compareAndSwapSetting.mockRejectedValueOnce(new Error('quota'));
    submit('[data-tag-unmerge-form]');
    await vi.waitFor(() => expect(document.querySelector('[data-tag-mutation-error]')?.textContent)
      .toContain('not saved'));
    expect(saved.aliases).toEqual({ review: 'کلیه' });
    expect(cards()).toHaveLength(1);
  });

  it('does not pretend a rejected taxonomy write completed and retains source facets', async () => {
    window.DB.compareAndSwapSetting.mockRejectedValue(new Error('storage quota exceeded'));
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
    expect(window.DB.compareAndSwapSetting).not.toHaveBeenCalled();
  });
});

describe('tag taxonomy validation and aliases', () => {
  it('rejects unknown revisions, cycles, malformed labels, and unsafe control text', () => {
    expect(() => parseTagTaxonomy({version:2,labels:[],aliases:{}})).toThrow(/version/i);
    expect(() => parseTagTaxonomy({version:1,labels:[],aliases:{a:'b',b:'a'}})).toThrow(/cycle/i);
    expect(() => createTaxonomyTag(parseTagTaxonomy(null),'x' + String.fromCharCode(0) + 'tag')).toThrow(/control/i);
  });
  it('removes only a directly selected alias while preserving transitive aliases and labels', () => {
    const original = parseTagTaxonomy({
      version: 1,
      labels: [{ key:'renal',label:'Renal' }, { key:'heart',label:'Heart' }],
      aliases: { kidney:'renal', renal:'heart' },
    });
    const restored = unmergeTaxonomyTag(original, 'renal');
    expect(restored.aliases).toEqual({ kidney:'renal' });
    expect(resolveTaxonomyKey(restored, 'kidney')).toBe('renal');
    expect(resolveTaxonomyKey(restored, 'heart')).toBe('heart');
    expect(restored.labels).toEqual(original.labels);
    expect(original.aliases).toEqual({ kidney:'renal', renal:'heart' });
    expect(() => unmergeTaxonomyTag(original, 'heart')).toThrow(/merged|alias/i);
    expect(() => unmergeTaxonomyTag(original, '__proto__')).toThrow();
  });

  it('reassigns transitive aliases when merging without losing a pre-existing destination', () => {
    const original=parseTagTaxonomy({version:1,labels:[{key:'renal',label:'Renal'}],aliases:{kidney:'renal'}});
    const next=mergeTaxonomyTags(original,'renal','فیزیک');
    expect(resolveTaxonomyKey(next,'kidney')).toBe('فیزیک');
    expect(resolveTaxonomyKey(next,'renal')).toBe('فیزیک');
    expect(original.aliases).toEqual({kidney:'renal'});
  });
});

describe('atomic taxonomy persistence across tabs', () => {
  const makeDB = () => {
    let saved = null;
    const db = {
      getSetting: vi.fn(async key => {
        expect(key).toBe(TAG_TAXONOMY_KEY);
        return structuredClone(saved);
      }),
      saveSetting: vi.fn(async () => { throw new Error('Non-atomic writer must not run'); }),
      compareAndSwapSetting: vi.fn(async (key, expected, next) => {
        expect(key).toBe(TAG_TAXONOMY_KEY);
        if (JSON.stringify(saved) !== JSON.stringify(expected)) return false;
        saved = structuredClone(next);
        return true;
      }),
    };
    return { db, read: () => structuredClone(saved) };
  };

  it('rejects non-atomic legacy writers before they can modify stored taxonomy', async () => {
    const db = {
      getSetting: vi.fn(async () => null),
      saveSetting: vi.fn(async () => true),
    };
    await expect(persistTagTaxonomy(db, current => createTaxonomyTag(current, 'Anatomy')))
      .rejects.toThrow(/atomic|compareAndSwap|unavailable/);
    expect(db.saveSetting).not.toHaveBeenCalled();
  });

  it('preserves the winning mutation when two tabs try to create tags from the same revision', async () => {
    const { db, read } = makeDB();
    const results = await Promise.allSettled([
      persistTagTaxonomy(db, current => createTaxonomyTag(current, 'Anatomy')),
      persistTagTaxonomy(db, current => createTaxonomyTag(current, 'Physiology')),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected').reason.message)
      .toMatch(/changed elsewhere|concurrent|conflict|reload/i);
    expect(read().labels).toHaveLength(1);
    expect(db.compareAndSwapSetting).toHaveBeenCalledTimes(2);
    expect(db.saveSetting).not.toHaveBeenCalled();
  });

  it('fails closed on missing or false atomic write receipts, never falling back to saveSetting', async () => {
    const { db, read } = makeDB();
    db.compareAndSwapSetting.mockResolvedValue(undefined);
    await expect(persistTagTaxonomy(db, current => createTaxonomyTag(current, 'Cardiology')))
      .rejects.toThrow(/not acknowledged|changed|failed|atomic/i);
    expect(read()).toBeNull();
    expect(db.saveSetting).not.toHaveBeenCalled();
  });

  it('rejects a contradictory post-write readback even when atomic writer claims success', async () => {
    const { db } = makeDB();
    db.compareAndSwapSetting.mockResolvedValue(true);
    await expect(persistTagTaxonomy(db, current => createTaxonomyTag(current, 'Renal')))
      .rejects.toThrow(/not saved|durab|verified/i);
    expect(db.saveSetting).not.toHaveBeenCalled();
  });
});
