/**
 * OpenCourseDeck — flashcards.js
 * SM-2 Spaced Repetition System & Interactive Study Studio
 */
(() => {
  'use strict';

  const STORE_NAME = 'ocd_flashcards';
  const LEGACY_STORE_NAME = 'plasma-flashcards-store';
  let memoryStore = [];
  let hydratePromise = null;
// Keyboard handling re-attaches on every studio render; this controller
// tears down the previous listener so re-renders never stack handlers.
let studioKeyController = null;

  /**
   * SM-2 Spaced Repetition Engine
   */
  function calculateSM2(grade, repetitions = 0, interval = 0, easeFactor = 2.5) {
    const validGrade = Math.max(0, Math.min(5, Math.floor(Number(grade) || 0)));
    let newRepetitions;
    let newInterval;
    let newEaseFactor;

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

    // Pure UTC day arithmetic: getDueCards() compares against the UTC calendar
    // date, so scheduling must not mix a local midnight into a UTC string.
    const nextReviewDate = new Date(Date.now() + newInterval * 86400000).toISOString().split('T')[0];

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
      if (Array.isArray(memoryStore) && memoryStore.length) return memoryStore;
      try {
        if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.getItem === 'function') {
          const raw = window.localStorage.getItem(STORE_NAME)
            ?? window.localStorage.getItem(LEGACY_STORE_NAME);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              memoryStore = parsed;
              return memoryStore;
            }
          }
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
      try { window.DB?.saveSetting?.(STORE_NAME, cards); } catch {}
    }

    async hydrate() {
      if (hydratePromise) return hydratePromise;
      hydratePromise = (async () => {
        if (Array.isArray(memoryStore) && memoryStore.length) return memoryStore;
        try {
          const fromDb = await window.DB?.getSetting?.(STORE_NAME);
          if (Array.isArray(fromDb) && fromDb.length) {
            memoryStore = fromDb;
            try { window.localStorage?.setItem?.(STORE_NAME, JSON.stringify(fromDb)); } catch {}
            return memoryStore;
          }
        } catch {}
        return this.getStorage();
      })();
      return hydratePromise;
    }

    reset() {
      memoryStore = [];
      hydratePromise = null;
      try {
        if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.removeItem === 'function') {
          window.localStorage.removeItem(STORE_NAME);
          window.localStorage.removeItem(LEGACY_STORE_NAME);
        }
      } catch {}
      try { window.DB?.saveSetting?.(STORE_NAME, []); } catch {}
    }

    async getCards() {
      await this.hydrate();
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
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);

  async function renderStudio(container) {
    if (!container) return;

    const cards = await manager.getCards();
    const dueCards = await manager.getDueCards();
    const decks = [...new Set(cards.map((c) => c.deck))];
    const due = dueCards[0];

    const reviewArea = dueCards.length === 0 ? `
          <div class="fc-empty">
            <div class="fc-empty-icon" aria-hidden="true">🎉</div>
            <h2 class="fc-empty-title">All Due Cards Reviewed!</h2>
            <p class="fc-sub">Great job! Check back tomorrow for your next memory review cycle.</p>
          </div>
        ` : `
          <div class="fc-progress-line">Card 1 of ${dueCards.length} · ${esc(due.deck)}</div>
          <div id="fc-card-front" class="fc-card fc-card-front">${esc(due.front)}</div>
          <div id="fc-card-back" class="fc-card fc-card-back" hidden>${esc(due.back)}</div>
          <div class="fc-flip-row">
            <button id="fc-flip-btn" class="btn btn-primary fc-flip-btn" type="button">Show Answer <span class="fc-kbd">Space</span></button>
          </div>
          <div id="fc-grade-btns" class="fc-grade-row" hidden>
            <button data-grade="1" class="fc-grade fc-grade-again" type="button">Again <span class="fc-kbd">1</span></button>
            <button data-grade="2" class="fc-grade fc-grade-hard" type="button">Hard <span class="fc-kbd">2</span></button>
            <button data-grade="4" class="fc-grade fc-grade-good" type="button">Good <span class="fc-kbd">4</span></button>
            <button data-grade="5" class="fc-grade fc-grade-easy" type="button">Easy <span class="fc-kbd">5</span></button>
          </div>
        `;

    container.innerHTML = `
      <div class="fc-wrap">
        <header class="fc-header">
          <div>
            <h1 class="fc-title"><span class="fc-title-icon" aria-hidden="true">⚡</span> Spaced Repetition Studio</h1>
            <p class="fc-sub">SuperMemo-2 (SM-2) memory consolidation engine</p>
          </div>
          <button id="fc-add-btn" class="btn btn-primary" type="button">+ New Card</button>
        </header>

        <form id="fc-new-form" class="fc-form" hidden novalidate>
          <div class="fc-field">
            <label for="fc-new-front">Front — question</label>
            <input id="fc-new-front" name="front" autocomplete="off" placeholder="What are you asking?" />
          </div>
          <div class="fc-field">
            <label for="fc-new-back">Back — answer</label>
            <textarea id="fc-new-back" name="back" rows="2" placeholder="The answer to recall"></textarea>
          </div>
          <div class="fc-field fc-field-deck">
            <label for="fc-new-deck">Deck</label>
            <input id="fc-new-deck" name="deck" autocomplete="off" value="General" />
          </div>
          <div class="fc-actions">
            <button id="fc-new-save" class="btn btn-primary" type="submit">Save card</button>
            <button id="fc-new-cancel" class="btn btn-ghost" type="button">Cancel</button>
          </div>
        </form>

        <div class="fc-stats">
          <div class="fc-stat"><span class="fc-stat-label">Total Cards</span><span class="fc-stat-value">${cards.length}</span></div>
          <div class="fc-stat fc-stat-accent"><span class="fc-stat-label">Due Today</span><span class="fc-stat-value">${dueCards.length}</span></div>
          <div class="fc-stat"><span class="fc-stat-label">Decks</span><span class="fc-stat-value">${decks.length || 1}</span></div>
        </div>

        <div id="fc-review-area" class="fc-review">
          ${reviewArea}
        </div>
      </div>
    `;

    const flipBtn = container.querySelector('#fc-flip-btn');
    const backEl = container.querySelector('#fc-card-back');
    const gradeRow = container.querySelector('#fc-grade-btns');

    if (flipBtn && backEl && gradeRow) {
      flipBtn.addEventListener('click', () => {
        backEl.hidden = false;
        flipBtn.hidden = true;
        gradeRow.hidden = false;
      });

      gradeRow.querySelectorAll('button[data-grade]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const grade = parseInt(btn.getAttribute('data-grade'), 10);
          if (dueCards.length > 0) {
            await manager.reviewCard(dueCards[0].id, grade);
            renderStudio(container);
          }
        });
      });
    }

    // Keyboard: the action buttons advertise Space / 1 / 2 / 4 / 5; honor it.
    if (studioKeyController) studioKeyController.abort();
    studioKeyController = new AbortController();
    container.addEventListener('keydown', (event) => {
      const target = event.target;
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      const flipBtnLive = container.querySelector('#fc-flip-btn:not([hidden])');
      const gradeRowLive = container.querySelector('#fc-grade-btns:not([hidden])');
      const announce = (message) => {
        const region = document.getElementById('aria-announcer');
        if (region) region.textContent = message;
      };
      if ((event.key === ' ' || event.key === 'Enter') && flipBtnLive) {
        event.preventDefault();
        announce('Answer shown. Rate the card with keys 1, 2, 4, or 5.');
        flipBtnLive.click();
        return;
      }
      if (gradeRowLive && ['1', '2', '4', '5'].includes(event.key)) {
        const btn = gradeRowLive.querySelector('button[data-grade="' + event.key + '"]');
        if (!btn) return;
        event.preventDefault();
        announce('Card rated: ' + btn.textContent.replace(/\s*\(\d\)\s*/, ' ').trim());
        btn.click();
      }
    }, { signal: studioKeyController.signal });

    const addBtn = container.querySelector('#fc-add-btn');
    const newForm = container.querySelector('#fc-new-form');
    if (addBtn && newForm) {
      const frontInput = newForm.querySelector('#fc-new-front');
      const backInput = newForm.querySelector('#fc-new-back');
      const deckInput = newForm.querySelector('#fc-new-deck');
      const announce = (message) => {
        const region = document.getElementById('aria-announcer');
        if (region) region.textContent = message;
      };
      addBtn.addEventListener('click', () => {
        newForm.hidden = !newForm.hidden;
        if (!newForm.hidden) frontInput.focus();
      });
      newForm.querySelector('#fc-new-cancel').addEventListener('click', () => {
        newForm.hidden = true;
        announce('Card creation cancelled.');
        addBtn.focus();
      });
      newForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const front = frontInput.value.trim();
        const back = backInput.value.trim();
        const deck = deckInput.value.trim() || 'General';
        if (!front || !back) {
          announce('Front and back are both required.');
          (!front ? frontInput : backInput).focus();
          return;
        }
        await manager.addCard({ front, back, deck });
        announce('Card added to deck ' + deck + '.');
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
