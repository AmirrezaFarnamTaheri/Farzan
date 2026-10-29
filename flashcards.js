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
  let canonicalDeckKnown = false;
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
      // An explicitly empty canonical deck is still authoritative. Falling
      // back to an older localStorage mirror would resurrect deleted cards.
      if (canonicalDeckKnown) return memoryStore;
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

    async saveStorage(cards) {
      const snapshot = cards.map(card => ({ ...card }));
      const hasCanonicalWriter = typeof window.DB?.saveSetting === 'function';

      // A local mirror is not an acceptable fallback when the canonical IDB
      // writer rejects: the next hydration would prefer the old IDB deck and
      // silently overwrite the purportedly saved cards.
      if (hasCanonicalWriter) {
        const receipt = await window.DB.saveSetting(STORE_NAME, snapshot);
        if (receipt === false) throw new Error('Flashcard write was not acknowledged by canonical storage');
      }
      let localSaved = false;
      let localError;
      try {
        if (typeof window.localStorage?.setItem === 'function') {
          window.localStorage.setItem(STORE_NAME, JSON.stringify(snapshot));
          localSaved = true;
        }
      } catch (error) { localError = error; }
      if (!hasCanonicalWriter && !localSaved) {
        throw localError || new Error('Flashcards could not be saved');
      }
      memoryStore = snapshot;
      canonicalDeckKnown = hasCanonicalWriter;
      return snapshot;
    }

    async hydrate() {
      if (hydratePromise) return hydratePromise;
      const pending = (async () => {
        if (canonicalDeckKnown || (Array.isArray(memoryStore) && memoryStore.length)) return memoryStore;
        if (typeof window.DB?.getSetting === 'function') {
          // A read error is not proof that the canonical deck is absent.
          // Falling back to a stale mirror would resurrect deleted cards and
          // allow the next mutation to overwrite newer persisted state.
          const fromDb = await window.DB.getSetting(STORE_NAME);
          if (Array.isArray(fromDb)) {
            memoryStore = fromDb;
            canonicalDeckKnown = true;
            try { window.localStorage?.setItem?.(STORE_NAME, JSON.stringify(fromDb)); } catch {}
            return memoryStore;
          }
          if (fromDb != null) throw new TypeError('Canonical flashcard deck has an invalid format');
        }
        return this.getStorage();
      })();
      // A transient database outage should not permanently poison the deck
      // with a cached rejected hydration promise.
      hydratePromise = pending.catch(error => {
        hydratePromise = null;
        throw error;
      });
      return hydratePromise;
    }

    reset() {
      memoryStore = [];
      hydratePromise = null;
      canonicalDeckKnown = false;
      try {
        if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.removeItem === 'function') {
          window.localStorage.removeItem(STORE_NAME);
          window.localStorage.removeItem(LEGACY_STORE_NAME);
        }
      } catch {}
      try { window.DB?.saveSetting?.(STORE_NAME, []); } catch {}
    }

    // Drop the in-memory cache without touching persisted data. An external
    // writer (a backup import) can replace the persisted deck out from under an
    // already-hydrated manager; without this the next read serves the stale
    // cache and the next add/review persists that stale deck over the restored
    // one. reset() cannot be used here because it also wipes persistence.
    invalidateCache() {
      memoryStore = [];
      hydratePromise = null;
      canonicalDeckKnown = false;
    }

    async getCards() {
      await this.hydrate();
      return this.getStorage();
    }

    async addCard({ front, back, deck = 'Default', sourceNoteId = null }) {
      if (!front || !back) throw new Error('Front and back text are required');
      const cards = [...await this.getCards()];
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
      await this.saveStorage(cards);
      return newCard;
    }

    async reviewCard(cardId, grade) {
      const cards = [...await this.getCards()];
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
      await this.saveStorage(cards);
      return updatedCard;
    }

    async updateCard(cardId, { front, back, deck } = {}) {
      const cards = [...await this.getCards()];
      const index = cards.findIndex(card => card.id === cardId);
      if (index < 0) throw new Error('Flashcard not found');
      const nextFront = String(front || '').trim();
      const nextBack = String(back || '').trim();
      if (!nextFront || !nextBack) throw new Error('Front and back text are required');
      const updated = {
        ...cards[index],
        front: nextFront,
        back: nextBack,
        deck: String(deck || cards[index].deck || 'General').trim() || 'General',
        updatedAt: new Date().toISOString(),
      };
      cards[index] = updated;
      await this.saveStorage(cards);
      return updated;
    }

    async getDueCards(deckName = null) {
      const cards = await this.getCards();
      const todayStr = new Date().toISOString().split('T')[0];
      return cards.filter(c => {
        const matchesDeck = !deckName || c.deck === deckName;
        const isDue = !c.nextReviewDate || c.nextReviewDate <= todayStr;
        return matchesDeck && isDue;
      });
    }

    async deleteCard(cardId) {
      let cards = [...await this.getCards()];
      cards = cards.filter(c => c.id !== cardId);
      await this.saveStorage(cards);
      return true;
    }

    async importAnkiDeck(ankiData) {
      if (!ankiData) throw new Error('Invalid Anki data');
      const deckName = String(ankiData.name || ankiData.deck || 'Imported Anki Deck').trim()
        || 'Imported Anki Deck';
      const rawCards = Array.isArray(ankiData) ? ankiData : ankiData.cards ?? [];
      if (!Array.isArray(rawCards)) throw new TypeError('Anki cards must be an array');

      // Importing cards individually used to persist the whole growing deck
      // after every insertion (quadratic writes and partial-failure risks).
      // Parse, validate and deduplicate the full batch before a single write.
      const existing = [...await this.getCards()];
      const seen = new Set(existing.map(card => JSON.stringify([
        card.deck, card.front, card.back,
      ])));
      const imported = [];
      const createdAt = new Date().toISOString();
      for (const item of rawCards) {
        if (!item || typeof item !== 'object') continue;
        const fields = typeof item.flds === 'string' ? item.flds.split('\x1f') : [];
        const front = String(item.front ?? item.sfld ?? fields[0] ?? '').trim();
        const back = String(item.back ?? fields[1] ?? '').trim();
        if (!front || !back) continue;
        const key = JSON.stringify([deckName, front, back]);
        if (seen.has(key)) continue;
        seen.add(key);
        imported.push({
          id: 'fc_' + Date.now() + '_' + imported.length.toString(36)
            + '_' + Math.random().toString(36).slice(2, 7),
          deck: deckName,
          front,
          back,
          sourceNoteId: null,
          repetitions: 0,
          interval: 0,
          easeFactor: 2.5,
          nextReviewDate: createdAt.slice(0, 10),
          createdAt,
        });
      }
      // No-op reimports must not write or mutate persistent storage.
      if (imported.length) await this.saveStorage([...existing, ...imported]);
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

  function announce(message) {
    const region = document.getElementById('aria-announcer');
    if (region) region.textContent = message;
  }

  async function renderStudio(container) {
    if (!container) return;

    const cards = await manager.getCards();
    const dueCards = await manager.getDueCards();
    const decks = [...new Set(cards.map((c) => c.deck))];
    const due = dueCards[0];

    const reviewArea = dueCards.length === 0 ? `
          <div class="fc-empty">
            <div class="fc-empty-icon" aria-hidden="true"><svg class="icon"><use href="#i-verified"/></svg></div>
            <h2 class="fc-empty-title">${cards.length ? 'All due cards reviewed' : 'No cards yet'}</h2>
            <p class="fc-sub">${cards.length
              ? 'Nice work. Check back tomorrow for your next memory review cycle.'
              : 'Create your first card and OpenCourseDeck will schedule reviews for you with SM-2.'}</p>
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
      <section class="view view-flashcards fc-wrap">
        <header class="page-header fc-header">
          <div>
            <span class="eyebrow">Spaced repetition</span>
            <h1 class="page-title fc-title">Flashcards</h1>
            <p class="page-subtitle fc-sub">SM-2 scheduling keeps every card coming back right before you would forget it.</p>
          </div>
          <button id="fc-add-btn" class="btn btn-primary" type="button">
            <svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg>
            New card
          </button>
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
          <div class="fc-stat"><span class="fc-stat-label">Total cards</span><span class="fc-stat-value">${cards.length}</span></div>
          <div class="fc-stat fc-stat-accent"><span class="fc-stat-label">Due today</span><span class="fc-stat-value">${dueCards.length}</span></div>
          <div class="fc-stat"><span class="fc-stat-label">Decks</span><span class="fc-stat-value">${decks.length}</span></div>
        </div>

        <div id="fc-review-area" class="fc-review">
          ${reviewArea}
        </div>
        <details class="card card-filled" id="fc-manage-cards">
          <summary class="btn btn-ghost">Manage saved cards (${cards.length})</summary>
          <div class="card-body" style="display:grid;gap:10px;max-height:360px;overflow-y:auto;">
            ${cards.length ? cards.map(card => `
              <div class="button-row" style="justify-content:space-between;gap:8px;flex-wrap:wrap" data-fc-manage-row="${esc(card.id)}">
                <span class="text-sm"><strong>${esc(card.front)}</strong> · ${esc(card.deck)}</span>
                <span class="button-row">
                  <button class="btn btn-ghost btn-sm" type="button" data-fc-edit="${esc(card.id)}">Edit</button>
                  <button class="btn btn-danger-ghost btn-sm" type="button" data-fc-delete="${esc(card.id)}">Delete</button>
                </span>
              </div>`).join('') : '<p class="text-muted">No saved cards yet.</p>'}
          </div>
        </details>
      </section>
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
      if ((event.key === ' ' || event.key === 'Enter') && flipBtnLive) {
        // Enter/Space on a focused button or link must activate that control,
        // not be reinterpreted as a card flip; otherwise keyboard users cannot
        // open the create-card form (or operate any button) while a due card
        // is showing.
        if (target?.closest?.('button, a, [role="button"], [role="link"]')) return;
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
    let editingCardId = null;
    container.querySelector('#fc-manage-cards')?.addEventListener('click', async (event) => {
      const edit = event.target.closest('[data-fc-edit]');
      const remove = event.target.closest('[data-fc-delete]');
      if (edit) {
        const card = cards.find(record => record.id === edit.dataset.fcEdit);
        if (!card || !newForm) return;
        editingCardId = card.id;
        newForm.querySelector('#fc-new-front').value = card.front;
        newForm.querySelector('#fc-new-back').value = card.back;
        newForm.querySelector('#fc-new-deck').value = card.deck;
        newForm.hidden = false;
        newForm.querySelector('#fc-new-save').textContent = 'Save changes';
        newForm.querySelector('#fc-new-front').focus();
      } else if (remove) {
        const card = cards.find(record => record.id === remove.dataset.fcDelete);
        if (!card) return;
        const confirmed = window.OpenCourseDeck?.UI?.confirm
          ? await window.OpenCourseDeck.UI.confirm({
            title: 'Delete flashcard',
            message: `Delete the card "${card.front}"?`,
            confirmLabel: 'Delete', cancelLabel: 'Cancel',
          })
          : window.confirm('Delete this flashcard?');
        if (!confirmed) return;
        try {
          await manager.deleteCard(card.id);
          announce('Flashcard deleted.');
          await renderStudio(container);
        } catch (error) {
          announce(error?.message || 'Could not delete flashcard');
        }
      }
    });
    if (addBtn && newForm) {
      const frontInput = newForm.querySelector('#fc-new-front');
      const backInput = newForm.querySelector('#fc-new-back');
      const deckInput = newForm.querySelector('#fc-new-deck');
      addBtn.addEventListener('click', () => {
        editingCardId = null;
        frontInput.value = '';
        backInput.value = '';
        deckInput.value = 'General';
        newForm.querySelector('#fc-new-save').textContent = 'Save card';
        newForm.hidden = !newForm.hidden;
        if (!newForm.hidden) frontInput.focus();
      });
      newForm.querySelector('#fc-new-cancel').addEventListener('click', () => {
        editingCardId = null;
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
        try {
          if (editingCardId) {
            await manager.updateCard(editingCardId, { front, back, deck });
            announce('Flashcard updated.');
          } else {
            await manager.addCard({ front, back, deck });
            announce('Card added to deck ' + deck + '.');
          }
          await renderStudio(container);
        } catch (error) {
          // Preserve the editable form and its draft when persistence fails.
          announce(error?.message || 'Flashcard was not saved.');
        }
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
    updateCard: (id, fields) => manager.updateCard(id, fields),
    getDueCards: (deck) => manager.getDueCards(deck),
    deleteCard: (id) => manager.deleteCard(id),
    invalidateCache: () => manager.invalidateCache(),
    renderStudio,
  };
})();
