/**
 * Regression for combining first-use UX (#150) with canonical receipts (#156).
 * This file runs in Farzan's actual Vitest/jsdom suite.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../flashcards.js';

const flashcards = () => window.OpenCourseDeck.Flashcards;
const host = () => document.getElementById('flashcards-cross-flow-host');
const status = () => document.getElementById('aria-announcer').textContent;

function installCanonicalStore({ failFirst = false } = {}) {
  let records = [];
  let writes = 0;
  let releaseFirst;
  let firstWriteStarted;
  const firstStarted = new Promise(resolve => { firstWriteStarted = resolve; });
  const firstBarrier = new Promise(resolve => { releaseFirst = resolve; });
  window.DB = {
    getSetting: vi.fn(async () => records.map(card => ({ ...card }))),
    saveSetting: vi.fn(async (_key, snapshot) => {
      writes += 1;
      if (writes === 1) {
        firstWriteStarted();
        await firstBarrier;
        if (failFirst) throw new Error('Canonical card save failed');
      }
      records = snapshot.map(card => ({ ...card }));
      return true;
    }),
  };
  flashcards().invalidateCache();
  return {
    firstStarted,
    releaseFirst: () => releaseFirst(),
    records: () => records,
    writes: () => writes,
  };
}

function fillAndSubmit() {
  const firstUse = host().querySelector('#fc-empty-create');
  expect(firstUse).not.toBeNull();
  firstUse.click();
  const form = host().querySelector('#fc-new-form');
  expect(form.hidden).toBe(false);
  form.querySelector('#fc-new-front').value = '  What is a transition?  ';
  form.querySelector('#fc-new-back').value = 'A change of state';
  form.querySelector('#fc-new-deck').value = 'Engineering';
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  return form;
}

describe('Flashcards integrated first-use and canonical writes', () => {
  beforeEach(() => {
    try { delete window.DB; } catch { window.DB = undefined; }
    flashcards().manager.reset();
    localStorage.removeItem('ocd_flashcards');
    document.body.innerHTML = '<div id="aria-announcer" aria-live="polite"></div>'
      + '<main id="flashcards-cross-flow-host"></main>';
  });

  it('does not transition from first-use until the first canonical card is saved, then can review it', async () => {
    const store = installCanonicalStore();
    await flashcards().renderStudio(host());
    fillAndSubmit();
    await store.firstStarted;

    // Submit must not imply a saved card before the canonical DB receipt.
    expect(store.records()).toHaveLength(0);
    expect(host().querySelector('.view-flashcards')?.dataset.firstUse).toBe('true');
    expect(host().querySelector('.fc-stats')).toBeNull();

    store.releaseFirst();
    await vi.waitFor(() => {
      expect(store.records()).toHaveLength(1);
      expect(host().querySelector('.view-flashcards')?.dataset.firstUse).toBe('false');
    });
    expect(store.records()[0]).toEqual(expect.objectContaining({
      front: 'What is a transition?', back: 'A change of state',
      deck: 'Engineering', repetitions: 0, interval: 0, easeFactor: 2.5,
    }));
    expect(host().querySelector('#fc-empty-create')).toBeNull();
    expect(host().querySelector('.fc-stats')).not.toBeNull();
    host().querySelector('#fc-flip-btn').click();
    host().querySelector('button[data-grade="4"]').click();
    await vi.waitFor(() => expect(store.records()[0].repetitions).toBe(1));
    await vi.waitFor(() => expect(status()).toContain('Card rated'));
    expect(store.writes()).toBe(2);
  });

  it('keeps the first-use form and draft editable if the canonical first save is rejected', async () => {
    const store = installCanonicalStore({ failFirst: true });
    await flashcards().renderStudio(host());
    const form = fillAndSubmit();
    await store.firstStarted;
    store.releaseFirst();
    await vi.waitFor(() => expect(status()).toContain('Canonical card save failed'));

    expect(store.records()).toHaveLength(0);
    expect(host().querySelector('.view-flashcards')?.dataset.firstUse).toBe('true');
    expect(form.hidden).toBe(false);
    expect(form.querySelector('#fc-new-front').value).toContain('transition');
    expect(host().querySelector('#fc-empty-create')).not.toBeNull();
  });
});
