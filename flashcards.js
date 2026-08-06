/**
 * OpenCourseDeck — flashcards.js
 * SM-2 Spaced Repetition System & Interactive Study Studio
 */
(() => {
  'use strict';

  const STORE_NAME = 'plasma-flashcards-store';
  let memoryStore = [];

  /**
   * SM-2 Spaced Repetition Engine
   */
  function calculateSM2(grade, repetitions = 0, interval = 0, easeFactor = 2.5) {
    const validGrade = Math.max(0, Math.min(5, Math.floor(Number(grade) || 0)));
    let newRepetitions = repetitions;
    let newInterval = interval;
    let newEaseFactor = easeFactor;

    if (validGrade >= 3) {
      if (repetitions === 0) {
        newInterval = 1;
      } else if (repetitions === 1) {
        newInterval = 6;
      } else {
        newInterval = Math.max(1, Math.round(interval * easeFactor));
      }
      newRepetitions = repetitions + 1;
    } else {
      newRepetitions = 0;
      newInterval = 1;
    }

    newEaseFactor = easeFactor + (0.1 - (5 - validGrade) * (0.08 + (5 - validGrade) * 0.02));
    if (newEaseFactor < 1.3) newEaseFactor = 1.3;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextDate = new Date(today);
    nextDate.setDate(nextDate.getDate() + newInterval);
    const nextReviewDate = nextDate.toISOString().split('T')[0];

    return {
      repetitions: newRepetitions,
      interval: newInterval,
      easeFactor: Number(newEaseFactor.toFixed(2)),
      nextReviewDate,
    };
  }

  class FlashcardDeckManager {
    constructor() {
      this.cards = [];
    }

    getStorage() {
      try {
        if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.getItem === 'function') {
          const raw = window.localStorage.getItem(STORE_NAME);
          if (raw) return JSON.parse(raw);
        }
      } catch {}
      return memoryStore;
    }

    saveStorage(cards) {
      memoryStore = cards;
      try {
        if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.setItem === 'function') {
          window.localStorage.setItem(STORE_NAME, JSON.stringify(cards));
        }
      } catch {}
    }

    reset() {
      memoryStore = [];
      try {
        if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.removeItem === 'function') {
          window.localStorage.removeItem(STORE_NAME);
        }
      } catch {}
    }

    async getCards() {
      return this.getStorage();
    }

    async addCard({ front, back, deck = 'Default', sourceNoteId = null }) {
      if (!front || !back) throw new Error('Front and back text are required');
      const cards = this.getStorage();
      const newCard = {
        id: 'fc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        deck: deck.trim() || 'Default',
        front: front.trim(),
        back: back.trim(),
        sourceNoteId,
        repetitions: 0,
        interval: 0,
        easeFactor: 2.5,
        nextReviewDate: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
      };
      cards.push(newCard);
      this.saveStorage(cards);
      return newCard;
    }

    async reviewCard(cardId, grade) {
      const cards = this.getStorage();
      const index = cards.findIndex(c => c.id === cardId);
      if (index === -1) throw new Error('Flashcard not found');

      const card = cards[index];
      const sm2Result = calculateSM2(grade, card.repetitions, card.interval, card.easeFactor);

      const updatedCard = {
        ...card,
        ...sm2Result,
        lastReviewedAt: new Date().toISOString(),
      };

      cards[index] = updatedCard;
      this.saveStorage(cards);
      return updatedCard;
    }

    async getDueCards(deckName = null) {
      const cards = this.getStorage();
      const todayStr = new Date().toISOString().split('T')[0];
      return cards.filter(c => {
        const matchesDeck = !deckName || c.deck === deckName;
        const isDue = !c.nextReviewDate || c.nextReviewDate <= todayStr;
        return matchesDeck && isDue;
      });
    }

    async deleteCard(cardId) {
      let cards = this.getStorage();
      cards = cards.filter(c => c.id !== cardId);
      this.saveStorage(cards);
      return true;
    }

    async importAnkiDeck(ankiData) {
      if (!ankiData) throw new Error('Invalid Anki data');
      const deckName = ankiData.name || ankiData.deck || 'Imported Anki Deck';
      const rawCards = Array.isArray(ankiData) ? ankiData : (ankiData.cards || []);
      const imported = [];
      for (const item of rawCards) {
        const front = item.front || item.sfld || (item.flds ? item.flds.split('\x1f')[0] : '');
        const back = item.back || (item.flds ? item.flds.split('\x1f')[1] : '');
        if (front && back) {
          const card = await this.addCard({ front, back, deck: deckName });
          imported.push(card);
        }
      }
      return { deck: deckName, importedCount: imported.length, cards: imported };
    }

    async exportAnkiDeck(deckName = null) {
      const allCards = this.getStorage();
      const targetCards = deckName ? allCards.filter(c => c.deck === deckName) : allCards;
      return {
        name: deckName || 'All Decks',
        version: '1.1.2-anki-compat',
        exportedAt: new Date().toISOString(),
        cards: targetCards.map(c => ({
          sfld: c.front,
          flds: `${c.front}\x1f${c.back}`,
          deck: c.deck,
          easeFactor: c.easeFactor,
          interval: c.interval,
          repetitions: c.repetitions,
        })),
      };
    }
  }

  const manager = new FlashcardDeckManager();

  /**
   * Render Spaced Repetition Flashcards Studio UI
   */
  async function renderStudio(container) {
    if (!container) return;

    const cards = await manager.getCards();
    const dueCards = await manager.getDueCards();
    const decks = [...new Set(cards.map(c => c.deck))];

    container.innerHTML = `
      <div class="flashcard-studio-wrap p-6 max-w-5xl mx-auto space-y-6">
        <header class="flex items-center justify-between border-b border-border/40 pb-4">
          <div>
            <h1 class="text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400">
              ⚡ Spaced Repetition Studio
            </h1>
            <p class="text-sm text-muted-foreground mt-1">
              SuperMemo-2 (SM-2) memory consolidation engine
            </p>
          </div>
          <div class="flex gap-3">
            <button id="fc-add-btn" class="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg shadow-md hover:opacity-90 transition">
              + New Card
            </button>
          </div>
        </header>

        <!-- Stats Bar -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="stat-card p-4 bg-card/60 backdrop-blur border border-border/50 rounded-xl">
            <div class="text-xs font-semibold text-muted-foreground uppercase">Total Cards</div>
            <div class="text-2xl font-bold mt-1">${cards.length}</div>
          </div>
          <div class="stat-card p-4 bg-card/60 backdrop-blur border border-border/50 rounded-xl">
            <div class="text-xs font-semibold text-purple-400 uppercase">Due Today</div>
            <div class="text-2xl font-bold mt-1 text-purple-300">${dueCards.length}</div>
          </div>
          <div class="stat-card p-4 bg-card/60 backdrop-blur border border-border/50 rounded-xl">
            <div class="text-xs font-semibold text-cyan-400 uppercase">Decks</div>
            <div class="text-2xl font-bold mt-1 text-cyan-300">${decks.length || 1}</div>
          </div>
        </div>

        <!-- Review Deck Container -->
        <div id="fc-review-area" class="review-area bg-card/80 backdrop-blur border border-border/60 rounded-2xl p-8 text-center min-h-[320px] flex flex-col justify-center items-center shadow-xl">
          ${dueCards.length === 0 ? `
            <div class="text-center space-y-3">
              <div class="text-4xl">🎉</div>
              <h3 class="text-lg font-bold">All Due Cards Reviewed!</h3>
              <p class="text-sm text-muted-foreground">Great job! Check back tomorrow for your next memory review cycle.</p>
            </div>
          ` : `
            <div class="w-full max-w-xl space-y-6">
              <div class="text-xs font-semibold text-purple-400 uppercase tracking-widest">
                Card 1 of ${dueCards.length} • ${dueCards[0].deck}
              </div>
              <div id="fc-card-front" class="text-xl font-medium px-4 py-6 bg-background/50 rounded-xl border border-border/40 min-h-[120px] flex items-center justify-center">
                ${dueCards[0].front}
              </div>
              <div id="fc-card-back" class="hidden text-lg text-emerald-300 px-4 py-6 bg-emerald-950/20 rounded-xl border border-emerald-500/30 min-h-[100px] items-center justify-center">
                ${dueCards[0].back}
              </div>
              <div id="fc-action-row" class="pt-2">
                <button id="fc-flip-btn" class="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 font-bold text-white rounded-lg shadow-lg hover:scale-105 transition">
                  Show Answer (Space)
                </button>
                <div id="fc-grade-btns" class="hidden grid grid-cols-4 gap-2 mt-4">
                  <button data-grade="1" class="py-2 bg-red-950/60 border border-red-500/40 text-red-300 rounded font-semibold text-xs hover:bg-red-900/60">Again (1)</button>
                  <button data-grade="2" class="py-2 bg-amber-950/60 border border-amber-500/40 text-amber-300 rounded font-semibold text-xs hover:bg-amber-900/60">Hard (2)</button>
                  <button data-grade="4" class="py-2 bg-blue-950/60 border border-blue-500/40 text-blue-300 rounded font-semibold text-xs hover:bg-blue-900/60">Good (4)</button>
                  <button data-grade="5" class="py-2 bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 rounded font-semibold text-xs hover:bg-emerald-900/60">Easy (5)</button>
                </div>
              </div>
            </div>
          `}
        </div>
      </div>
    `;

    // Interactive event listeners
    const flipBtn = container.querySelector('#fc-flip-btn');
    const backEl = container.querySelector('#fc-card-back');
    const gradeRow = container.querySelector('#fc-grade-btns');

    if (flipBtn && backEl && gradeRow) {
      flipBtn.addEventListener('click', () => {
        backEl.classList.remove('hidden');
        backEl.classList.add('flex');
        flipBtn.classList.add('hidden');
        gradeRow.classList.remove('hidden');
      });

      gradeRow.querySelectorAll('button[data-grade]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const grade = parseInt(btn.getAttribute('data-grade'), 10);
          if (dueCards.length > 0) {
            await manager.reviewCard(dueCards[0].id, grade);
            renderStudio(container);
          }
        });
      });
    }

    const addBtn = container.querySelector('#fc-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        const front = prompt('Card Front (Question):');
        if (!front) return;
        const back = prompt('Card Back (Answer):');
        if (!back) return;
        const deck = prompt('Deck Name (default: General):', 'General') || 'General';
        await manager.addCard({ front, back, deck });
        renderStudio(container);
      });
    }
  }

  const pd = window.OpenCourseDeck = window.OpenCourseDeck || {};
  pd.Flashcards = {
    calculateSM2,
    manager,
    getCards: () => manager.getCards(),
    addCard: (data) => manager.addCard(data),
    reviewCard: (id, grade) => manager.reviewCard(id, grade),
    getDueCards: (deck) => manager.getDueCards(deck),
    deleteCard: (id) => manager.deleteCard(id),
    renderStudio,
  };
})();
