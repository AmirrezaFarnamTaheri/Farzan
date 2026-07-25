import { beforeEach, describe, expect, it } from 'vitest';
import '../flashcards.js';

describe('SM-2 Spaced Repetition & Flashcards Engine', () => {
  beforeEach(() => {
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
