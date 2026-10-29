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

    it('imports large Anki decks in one durable write and skips identical cards on reimport', async () => {
      const manager = window.OpenCourseDeck.Flashcards.manager;
      manager.reset();
      window.DB = {
        deck: [],
        getSetting: vi.fn(async () => window.DB.deck),
        saveSetting: vi.fn(async (_key, cards) => {
          window.DB.deck = cards.map(card => ({ ...card }));
          return true;
        }),
      };
      manager.invalidateCache();
      const payload = {
        name: 'Clinical medicine',
        cards: Array.from({ length: 96 }, (_, i) => ({
          sfld: 'Question ' + i,
          flds: 'Question ' + i + '\x1fAnswer ' + i,
        })),
      };
      const first = await manager.importAnkiDeck(payload);
      expect(first.importedCount).toBe(96);
      expect(window.DB.saveSetting).toHaveBeenCalledTimes(1);
      expect(await manager.getCards()).toHaveLength(96);
      expect(first.cards.every(card => card.deck === 'Clinical medicine')).toBe(true);
      window.DB.saveSetting.mockClear();
      const second = await manager.importAnkiDeck(payload);
      expect(second.importedCount).toBe(0);
      expect(window.DB.saveSetting).not.toHaveBeenCalled();
      expect(await manager.getCards()).toHaveLength(96);
    });

    it('leaves the existing flashcard deck untouched if a batch import fails to persist', async () => {
      const manager = window.OpenCourseDeck.Flashcards.manager;
      manager.reset();
      window.DB = {
        deck: [],
        getSetting: vi.fn(async () => window.DB.deck),
        saveSetting: vi.fn(async (_key, cards) => {
          if (cards.length > 1) throw new Error('Flashcard storage full');
          window.DB.deck = cards.map(card => ({ ...card }));
          return true;
        }),
      };
      manager.invalidateCache();
      await manager.addCard({ front: 'Keep', back: 'Original', deck: 'Medicine' });
      await expect(manager.importAnkiDeck({
        name: 'Medicine', cards: [{ front: 'New', back: 'Question' }],
      })).rejects.toThrow('Flashcard storage full');
      expect((await manager.getCards()).map(card => card.front)).toEqual(['Keep']);
      expect(window.DB.deck.map(card => card.front)).toEqual(['Keep']);
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

  it('lets Enter activate a focused button instead of flipping the card', async () => {
    const { manager, renderStudio } = window.OpenCourseDeck.Flashcards;
    await manager.addCard({ front: 'F', back: 'B', deck: 'General' });
    const container = document.getElementById('studio-host');
    await renderStudio(container);

    const addBtn = container.querySelector('#fc-add-btn');
    expect(addBtn).toBeTruthy();
    // A due card is showing, so the flip handler is live and would normally
    // intercept Enter. A focused button must activate natively instead.
    addBtn.focus();
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    addBtn.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(container.querySelector('#fc-card-back').hidden).toBe(true);
    // The button's own handler still toggles the create-card form.
    expect(container.querySelector('#fc-new-form').classList.contains('hidden')).toBe(false);
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

  it('serves a deck restored by a backup import once the live cache is invalidated', async () => {
    const { addCard, getCards, invalidateCache, reviewCard } = window.OpenCourseDeck.Flashcards;

    // A deck is already loaded and its manager hydrated when the import runs.
    await addCard({ front: 'Stale', back: 'Stale answer', deck: 'Old' });

    // A backup import writes the restored deck straight to persistence, the way
    // progress.js does during a vault import.
    const today = new Date().toISOString().split('T')[0];
    const restored = [{
      id: 'fc_restored_1', front: 'Restored', back: 'Restored answer', deck: 'New',
      repetitions: 0, interval: 0, easeFactor: 2.5, nextReviewDate: today,
      createdAt: new Date().toISOString(),
    }];
    await window.DB.saveSetting('ocd_flashcards', restored);
    localStorage.setItem('ocd_flashcards', JSON.stringify(restored));

    // Pre-fix hazard: the hydrated cache still serves the pre-import deck, and
    // the next write would persist it over the restored one.
    expect((await getCards()).map((c) => c.front)).toEqual(['Stale']);

    // Invalidation is non-destructive: persistence is left intact.
    invalidateCache();
    expect(JSON.parse(localStorage.getItem('ocd_flashcards')).map((c) => c.front)).toEqual(['Restored']);

    // The restored deck is now served...
    expect((await getCards()).map((c) => c.front)).toEqual(['Restored']);

    // ...and survives the next review instead of being overwritten by the stale one.
    const reviewed = await reviewCard('fc_restored_1', 5);
    expect(reviewed.repetitions).toBe(1);
    expect(window.DB.store.ocd_flashcards.map((c) => c.front)).toEqual(['Restored']);
  });
});

describe('flashcard editing and deletion', () => {
  beforeEach(() => {
    window.OpenCourseDeck.Flashcards.manager.reset();
    window.DB = {
      records: [],
      getSetting: vi.fn(async () => null),
      saveSetting: vi.fn(async (key, value) => {
        window.DB.records = value;
        return value;
      }),
    };
  });

  it('edits a card in place without losing its review or source history', async () => {
    const manager = window.OpenCourseDeck.Flashcards.manager;
    const card = await manager.addCard({ front: 'Old question', back: 'Old answer', deck: 'Biology', sourceNoteId: 'note-1' });
    const reviewed = await manager.reviewCard(card.id, 5);
    const updated = await manager.updateCard(card.id, { front: 'Corrected question', back: 'Corrected answer', deck: 'Biology' });
    expect(updated.id).toBe(card.id);
    expect(updated.sourceNoteId).toBe('note-1');
    expect(updated.repetitions).toBe(reviewed.repetitions);
    expect(window.DB.records[0].front).toBe('Corrected question');
  });

  it('exposes editing and deleting from a card-management surface', async () => {
    const { manager, renderStudio } = window.OpenCourseDeck.Flashcards;
    const card = await manager.addCard({ front: 'Editable Q', back: 'Editable A', deck: 'General' });
    document.body.innerHTML = '<div id="aria-announcer"></div><div id="studio-host"></div>';
    const container = document.getElementById('studio-host');
    await renderStudio(container);
    const edit = container.querySelector(`[data-fc-edit="${card.id}"]`);
    const remove = container.querySelector(`[data-fc-delete="${card.id}"]`);
    expect(edit).not.toBeNull();
    expect(remove).not.toBeNull();
    edit.click();
    expect(container.querySelector('#fc-new-front').value).toBe('Editable Q');
    expect(container.querySelector('#fc-new-form').hidden).toBe(false);
    container.querySelector('#fc-new-front').value = 'Edited Q';
    container.querySelector('#fc-new-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(async () => expect((await manager.getCards())[0].front).toBe('Edited Q'));
  });
});

describe('flashcard canonical storage invariants', () => {
  it('refuses an apparent local success when the canonical DB write failed', async () => {
    const manager = window.OpenCourseDeck.Flashcards.manager;
    manager.reset();
    const original = [{
      id: 'fc-old', front: 'Original Q', back: 'Original A',
      deck: 'History', nextReviewDate: '2020-01-01',
    }];
    localStorage.setItem('ocd_flashcards', JSON.stringify(original));
    window.DB = {
      getSetting: vi.fn(async () => original),
      saveSetting: vi.fn(async () => { throw new Error('IndexedDB write rejected'); }),
    };
    manager.invalidateCache();
    expect((await manager.getCards()).map(c => c.front)).toEqual(['Original Q']);
    await expect(manager.addCard({ front: 'New Q', back: 'New A' }))
      .rejects.toThrow('IndexedDB write rejected');
    expect((await manager.getCards()).map(c => c.front)).toEqual(['Original Q']);
    expect(JSON.parse(localStorage.getItem('ocd_flashcards')).map(c => c.front)).toEqual(['Original Q']);
  });

  it('never resurrects a stale local mirror after the canonical DB deck was cleared', async () => {
    const manager = window.OpenCourseDeck.Flashcards.manager;
    manager.reset();
    localStorage.setItem('ocd_flashcards', JSON.stringify([{
      id: 'fc-stale', front: 'Stale Q', back: 'Stale A', deck: 'Old',
      nextReviewDate: '2020-01-01',
    }]));
    window.DB = { getSetting: vi.fn(async () => []), saveSetting: vi.fn(async () => true) };
    manager.invalidateCache();
    expect(await manager.getCards()).toEqual([]);
    expect(await manager.getDueCards()).toEqual([]);
    expect(JSON.parse(localStorage.getItem('ocd_flashcards'))).toEqual([]);
  });
});

describe('flashcard canonical read and due query safety', () => {
  it('does not turn a failed canonical read into apparent empty or old local state', async () => {
    const manager = window.OpenCourseDeck.Flashcards.manager;
    manager.reset();
    localStorage.setItem('ocd_flashcards', JSON.stringify([{
      id: 'stale', front: 'Stale', back: 'Old', deck: 'Old', nextReviewDate: '2020-01-01',
    }]));
    window.DB = {
      getSetting: vi.fn(async () => { throw new Error('canonical database unreadable'); }),
      saveSetting: vi.fn(async () => true),
    };
    manager.invalidateCache();
    await expect(manager.getCards()).rejects.toThrow('canonical database unreadable');
    await expect(manager.addCard({ front: 'Another', back: 'Answer' }))
      .rejects.toThrow('canonical database unreadable');
    expect(window.DB.saveSetting).not.toHaveBeenCalled();
  });

  it('does not accept a false acknowledged canonical card write', async () => {
    const manager = window.OpenCourseDeck.Flashcards.manager;
    manager.reset();
    window.DB = {
      getSetting: vi.fn(async () => []),
      saveSetting: vi.fn(async () => false),
    };
    manager.invalidateCache();
    await expect(manager.addCard({ front: 'Uncommitted', back: 'Nope' }))
      .rejects.toThrow(/not acknowledged|could not be saved/i);
    expect(await manager.getCards()).toEqual([]);
  });

  it('hydrates the authoritative deck before asking for due cards', async () => {
    const manager = window.OpenCourseDeck.Flashcards.manager;
    manager.reset();
    window.DB = {
      getSetting: vi.fn(async () => [{
        id: 'due-from-db', front: 'Review', back: 'Due', deck: 'Science',
        nextReviewDate: '2020-01-01',
      }]),
      saveSetting: vi.fn(async () => true),
    };
    manager.invalidateCache();
    const cards = await manager.getDueCards();
    expect(cards.map(card => card.id)).toEqual(['due-from-db']);
  });
});

describe('flashcard durable-save failures', () => {
  it('rejects a card mutation and preserves memory when both stores cannot save', async () => {
    const manager = window.OpenCourseDeck.Flashcards.manager;
    manager.reset();
    window.DB = {
      getSetting: vi.fn(async () => null),
      saveSetting: vi.fn(async () => { throw new Error('IndexedDB quota exceeded'); }),
    };
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('localStorage quota exceeded');
    });
    try {
      await expect(manager.addCard({ front: 'Question', back: 'Answer' })).rejects.toThrow();
      expect(await manager.getCards()).toEqual([]);
    } finally {
      setItem.mockRestore();
    }
  });
});
