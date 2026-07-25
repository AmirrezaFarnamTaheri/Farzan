import { describe, it, expect } from 'vitest';
import { createAIClient } from '../src/features/aiClient.js';

describe('aiClient extended offline capabilities', () => {
  const client = createAIClient({
    DB: {},
    sessionStorage: { getItem: () => '' },
    indexedDB: null,
  });

  it('generates offline flashcards from text', async () => {
    const text = 'SuperMemo SM-2 is a spaced repetition algorithm for flashcards. WebGL provides hardware accelerated graphics for canvas.';
    const cards = await client.generateFlashcardsFromText(text, { limit: 2 });
    expect(cards).toHaveLength(2);
    expect(cards[0].front).toContain('SuperMemo SM-2');
    expect(cards[0].tags).toContain('auto-generated');
  });

  it('extracts top keywords from text', async () => {
    const text = 'IndexedDB query optimization uses index ranges. IndexedDB ensures persistent offline storage. Storage uses IndexedDB.';
    const keywords = await client.extractKeywords(text, { limit: 3 });
    expect(keywords).toContain('indexeddb');
  });
});
