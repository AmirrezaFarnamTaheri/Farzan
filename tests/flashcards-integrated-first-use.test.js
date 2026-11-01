import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../flashcards.js';
import { createFsrsV5State } from '../src/features/flashcardsFsrsAdapter.js';

const flashcards = () => window.OpenCourseDeck.Flashcards;
const host = () => document.getElementById('flashcards-integration-host');
const status = () => document.getElementById('aria-announcer').textContent;

async function render() {
  await flashcards().renderStudio(host());
  return host();
}

function restoreCanonical(initial) {
  let persisted = initial.map(card => ({ ...card }));
  window.DB = {
    getSetting: vi.fn(async () => persisted.map(card => ({ ...card }))),
    saveSetting: vi.fn(async (_key, cards) => {
      persisted = cards.map(card => ({ ...card }));
      return true;
    }),
  };
  flashcards().invalidateCache();
  return () => persisted;
}

describe('Integrated first-use flashcards and persistent review acknowledgments', () => {
  beforeEach(() => {
    try { delete window.DB; } catch { window.DB = undefined; }
    flashcards().manager.reset();
    document.body.innerHTML = '<div id="aria-announcer" aria-live="polite"></div>'
      + '<main id="flashcards-integration-host"></main>';
  });

  it('gives a new learner one clear action and restores focus when they cancel', async () => {
    const container = await render();
    const page = container.querySelector('.view-flashcards');
    const begin = container.querySelector('#fc-empty-create');
    const headerAdd = container.querySelector('#fc-add-btn');

    expect(page.dataset.firstUse).toBe('true');
    expect(begin).not.toBeNull();
    expect(headerAdd.hidden).toBe(true);
    expect(container.querySelector('.fc-stats')).toBeNull();
    expect(container.querySelector('#fc-manage-cards').hidden).toBe(true);

    begin.click();
    expect(container.querySelector('#fc-new-form').hidden).toBe(false);
    container.querySelector('#fc-new-cancel').click();
    expect(container.querySelector('#fc-new-form').hidden).toBe(true);
    expect(document.activeElement).toBe(begin);
  });

  it('creates the first FSRS card without blocking later review', async () => {
    const records = restoreCanonical([]);
    const container = await render();
    container.querySelector('#fc-empty-create').click();
    const form = container.querySelector('#fc-new-form');
    form.querySelector('#fc-new-front').value = '  What is a state machine? ';
    form.querySelector('#fc-new-back').value = 'A model with explicit transitions';
    form.querySelector('#fc-new-deck').value = 'Engineering';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(records()).toHaveLength(1);
      expect(host().querySelector('.view-flashcards')?.dataset.firstUse).toBe('false');
    });
    expect(records()[0]).toEqual(expect.objectContaining({
      front: 'What is a state machine?',
      back: 'A model with explicit transitions',
      scheduler: 'fsrs-v5',
      fsrsState: expect.objectContaining({
        reviewLog: [], card: expect.objectContaining({ reps: 0 }),
      }),
    }));
    expect(host().querySelector('#fc-add-btn').hidden).toBe(false);
    expect(host().querySelector('.fc-stats')).not.toBeNull();
    expect(host().querySelector('#fc-manage-cards').hidden).toBe(false);
  });

  it('allows one rating only, announcing success after the canonical DB write commits', async () => {
    const today = new Date().toISOString().slice(0, 10);
    let records = [{
      id: 'fc_integrated', deck: 'Engineering', front: 'Front', back: 'Back',
      scheduler: 'fsrs-v5', fsrsState: createFsrsV5State(new Date()),
      nextReviewDate: today, createdAt: new Date().toISOString(),
    }];
    let releaseGrade;
    let gradeStarted;
    const started = new Promise(resolve => { gradeStarted = resolve; });
    const blocked = new Promise(resolve => { releaseGrade = resolve; });
    window.DB = {
      getSetting: vi.fn(async () => records.map(card => ({ ...card }))),
      saveSetting: vi.fn(async (_key, snapshot) => {
        gradeStarted();
        await blocked;
        records = snapshot.map(card => ({ ...card }));
        return true;
      }),
    };
    flashcards().invalidateCache();
    const container = await render();
    container.querySelector('#fc-flip-btn').click();
    const good = container.querySelector('button[data-grade="4"]');
    good.click();
    good.click();
    await started;

    expect(good.disabled).toBe(true);
    expect(status()).not.toContain('Card rated');
    expect(records[0].fsrsState.reviewLog).toHaveLength(0);

    releaseGrade();
    await vi.waitFor(() => expect(status()).toContain('Card rated'));
    expect(records[0].fsrsState.reviewLog).toHaveLength(1);
    expect(window.DB.saveSetting).toHaveBeenCalledTimes(1);
  });

  it('does not imply a grade succeeded after a failed canonical write', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const records = [{
      id: 'fc_rejected', deck: 'Engineering', front: 'Front', back: 'Back',
      scheduler: 'fsrs-v5', fsrsState: createFsrsV5State(new Date()),
      nextReviewDate: today, createdAt: new Date().toISOString(),
    }];
    window.DB = {
      getSetting: vi.fn(async () => records),
      saveSetting: vi.fn(async () => { throw new Error('Storage unavailable'); }),
    };
    flashcards().invalidateCache();
    const container = await render();
    container.querySelector('#fc-flip-btn').click();
    const good = container.querySelector('button[data-grade="4"]');
    good.click();

    await vi.waitFor(() => expect(status()).toContain('Storage unavailable'));
    expect(status()).not.toContain('Card rated');
    expect(records[0].fsrsState.reviewLog).toHaveLength(0);
    expect(good.disabled).toBe(false);
  });
});
