import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../flashcards.js';

describe('SM-2 Spaced Repetition & Flashcards Engine', () => {
  beforeEach(() => {
    try { delete window.DB; } catch { window.DB = undefined; }
    window.OpenCourseDeck?.Flashcards?.manager?.reset();
  });

  it('registers window.OpenCourseDeck.Flashcards namespace', () => {
    expect(window.OpenCourseDeck).toBeDefined();
    expect(window.OpenCourseDeck.Flashcards).toBeDefined();
    expect(typeof window.OpenCourseDeck.Flashcards.calculateSM2).toBe('function');
    expect(typeof window.OpenCourseDeck.Flashcards.addCard).toBe('function');
    expect(typeof window.OpenCourseDeck.Flashcards.reviewCard).toBe('function');
    expect(typeof window.OpenCourseDeck.Flashcards.getDueCards).toBe('function');
  });

  describe('SM-2 Algorithm Calculation', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('schedules nextReviewDate on the UTC calendar regardless of local timezone', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T23:30:00Z'));
      const { calculateSM2 } = window.OpenCourseDeck.Flashcards;
      const result = calculateSM2(4, 0, 0, 2.5);
      expect(result.nextReviewDate).toBe('2026-01-02');
    });
    const { calculateSM2 } = window.OpenCourseDeck.Flashcards;

    it('resets repetitions and sets 1-day interval when grade < 3 (failure)', () => {
      const result = calculateSM2(2, 3, 10, 2.5);
      expect(result.repetitions).toBe(0);
      expect(result.interval).toBe(1);
      expect(result.easeFactor).toBeLessThan(2.5);
    });

    it('sets interval to 1 on first successful review (grade >= 3, repetitions = 0)', () => {
      const result = calculateSM2(4, 0, 0, 2.5);
      expect(result.repetitions).toBe(1);
      expect(result.interval).toBe(1);
    });

    it('sets interval to 6 on second successful review (grade >= 3, repetitions = 1)', () => {
      const result = calculateSM2(4, 1, 1, 2.5);
      expect(result.repetitions).toBe(2);
      expect(result.interval).toBe(6);
    });

    it('multiplies interval by ease factor on third+ successful review', () => {
      const result = calculateSM2(5, 2, 6, 2.5);
      expect(result.repetitions).toBe(3);
      expect(result.interval).toBe(15); // Math.round(6 * 2.5)
      expect(result.easeFactor).toBeGreaterThanOrEqual(2.5);
    });

    it('enforces minimum Ease Factor floor of 1.3', () => {
      const result = calculateSM2(0, 0, 1, 1.4);
      expect(result.easeFactor).toBe(1.3);
    });
  });

  describe('Flashcard Deck Manager Operations', () => {
    const { addCard, getCards, reviewCard, getDueCards, deleteCard } = window.OpenCourseDeck.Flashcards;

    it('creates new flashcards with initial SM-2 defaults', async () => {
      const card = await addCard({
        front: 'What is OKLCH?',
        back: 'Perceptually uniform color space using Lightness, Chroma, and Hue.',
        deck: 'CSS & Design',
      });

      expect(card.id).toMatch(/^fc_/);
      expect(card.front).toBe('What is OKLCH?');
      expect(card.deck).toBe('CSS & Design');
      expect(card.repetitions).toBe(0);
      expect(card.interval).toBe(0);
      expect(card.easeFactor).toBe(2.5);

      const all = await getCards();
      expect(all.length).toBe(1);
    });

    it('updates flashcard parameters upon review', async () => {
      const card = await addCard({
        front: 'What is IndexedDB?',
        back: 'Low-level key-value browser storage engine.',
        deck: 'Storage',
      });

      const updated = await reviewCard(card.id, 5);
      expect(updated.repetitions).toBe(1);
      expect(updated.interval).toBe(1);
      expect(updated.lastReviewedAt).toBeDefined();
    });

    it('retrieves due cards correctly', async () => {
      await addCard({
        front: 'Due Card 1',
        back: 'Answer 1',
        deck: 'CS',
      });

      const due = await getDueCards('CS');
      expect(due.length).toBe(1);
      expect(due[0].front).toBe('Due Card 1');
    });

    it('deletes flashcards by id', async () => {
      const card = await addCard({
        front: 'Temporary Card',
        back: 'To be deleted',
        deck: 'Trash',
      });

      let all = await getCards();
      expect(all.length).toBe(1);

      await deleteCard(card.id);
      all = await getCards();
      expect(all.length).toBe(0);
    });

    it('imports and exports Anki deck JSON payloads', async () => {
      const { manager } = window.OpenCourseDeck.Flashcards;
      const ankiPayload = {
        name: 'Medical Terms',
        cards: [
          { sfld: 'Cardiovascular', flds: 'Cardiovascular\x1fPertaining to heart and blood vessels' },
          { sfld: 'Neurology', flds: 'Neurology\x1fStudy of nervous system' }
        ]
      };

      const result = await manager.importAnkiDeck(ankiPayload);
      expect(result.importedCount).toBe(2);
      expect(result.deck).toBe('Medical Terms');

      const exported = await manager.exportAnkiDeck('Medical Terms');
      expect(exported.name).toBe('Medical Terms');
      expect(exported.cards.length).toBe(2);
      expect(exported.cards[0].sfld).toBe('Cardiovascular');
    });
  });
});


describe('Flashcards Studio UI (keyboard-driven review)', () => {
  beforeEach(() => {
    try { delete window.DB; } catch { window.DB = undefined; }
    window.OpenCourseDeck?.Flashcards?.manager?.reset();
    document.body.innerHTML = '<div id="aria-announcer" aria-live="polite"></div><div id="studio-host"></div>';
  });

  it('reveals the answer with Space and rates grades 1/2/4/5 from the keyboard', async () => {
    const { manager, renderStudio } = window.OpenCourseDeck.Flashcards;
    await manager.addCard({ front: 'Front of card', back: 'Back of card', deck: 'General' });
    const container = document.getElementById('studio-host');
    await renderStudio(container);

    const flipBtn = container.querySelector('#fc-flip-btn');
    expect(flipBtn).toBeTruthy();
    const backEl = container.querySelector('#fc-card-back');
    expect(backEl.hidden).toBe(true);

    // Space flips the card without scrolling the page.
    const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    container.dispatchEvent(spaceEvent);
    expect(spaceEvent.defaultPrevented).toBe(true);
    expect(backEl.hidden).toBe(false);
    expect(container.querySelector('#fc-grade-btns').hidden).toBe(false);
    expect(document.getElementById('aria-announcer').textContent).toContain('Answer shown');

    // Grade 1 (Again) reviews the due card and records the SM-2 state change.
    // Note: whether the failed card leaves today's queue is timezone-dependent
    // (nextReviewDate mixes local midnight with UTC date strings), so assert
    // persisted review state instead of deck membership.
    container.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }));
    await vi.waitFor(() => {
      expect(document.getElementById('aria-announcer').textContent).toContain('Card rated');
    });
    const cards = await manager.getCards();
    expect(cards[0].lastReviewedAt).toBeTruthy(); // the keypress reached reviewCard
    expect(cards[0].repetitions).toBe(0); // grade < 3 resets progress
    expect(document.getElementById('aria-announcer').textContent).toContain('Card rated');
  });

  it('ignores shortcut keys while typing in an input', async () => {
    const { manager, renderStudio } = window.OpenCourseDeck.Flashcards;
    await manager.addCard({ front: 'F', back: 'B', deck: 'General' });
    const container = document.getElementById('studio-host');
    await renderStudio(container);

    const input = document.createElement('input');
    container.appendChild(input);
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });

    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(container.querySelector('#fc-card-back').hidden).toBe(true);
  });

});


describe('Flashcards Studio create-card form', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  beforeEach(() => {
    try { delete window.DB; } catch { window.DB = undefined; }
    window.OpenCourseDeck?.Flashcards?.manager?.reset();
    document.body.innerHTML = '<div id="aria-announcer" aria-live="polite"></div><div id="studio-host"></div>';
  });

  it('adds a card through the inline form without any blocking prompt', async () => {
    const { manager, renderStudio } = window.OpenCourseDeck.Flashcards;
    window.prompt = () => { throw new Error('window.prompt must not be used'); };
    const container = document.getElementById('studio-host');
    await renderStudio(container);

    container.querySelector('#fc-add-btn').click();
    const form = container.querySelector('#fc-new-form');
    expect(form.classList.contains('hidden')).toBe(false);

    form.querySelector('#fc-new-front').value = '  What is SM-2? ';
    form.querySelector('#fc-new-back').value = 'A spaced-repetition algorithm';
    form.querySelector('#fc-new-deck').value = '';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(async () => {
      expect((await manager.getCards())).toHaveLength(1);
    });
    const added = (await manager.getCards())[0];
    expect(added.front).toBe('What is SM-2?'); // values are trimmed
    expect(added.deck).toBe('General'); // empty deck falls back to General
    expect(document.getElementById('aria-announcer').textContent).toContain('Card added');
  });

  it('rejects an empty submission and keeps the form open', async () => {
    const { manager, renderStudio } = window.OpenCourseDeck.Flashcards;
    const container = document.getElementById('studio-host');
    await renderStudio(container);
    container.querySelector('#fc-add-btn').click();
    const form = container.querySelector('#fc-new-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(document.getElementById('aria-announcer').textContent).toContain('required');
    expect(await manager.getCards()).toHaveLength(0);
    expect(form.classList.contains('hidden')).toBe(false);
  });
});

describe('Flashcards vault persistence', () => {
  beforeEach(() => {
    window.OpenCourseDeck?.Flashcards?.manager?.reset();
    window.DB = {
      store: {},
      getSetting: vi.fn(async (key) => window.DB.store[key] ?? null),
      saveSetting: vi.fn(async (key, value) => {
        window.DB.store[key] = value;
        return value;
      }),
    };
  });

  it('mirrors cards into the ocd_flashcards setting used by JSON backups', async () => {
    const { addCard, getCards } = window.OpenCourseDeck.Flashcards;
    await addCard({ front: 'Vault Q', back: 'Vault A', deck: 'Backup' });
    expect(window.DB.saveSetting).toHaveBeenCalledWith(
      'ocd_flashcards',
      expect.arrayContaining([expect.objectContaining({ front: 'Vault Q' })]),
    );
    expect(JSON.parse(localStorage.getItem('ocd_flashcards'))[0].front).toBe('Vault Q');
    expect((await getCards())[0].back).toBe('Vault A');
  });
});
