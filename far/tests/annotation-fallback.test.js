import { describe, expect, it, vi } from 'vitest';
import { installBridgeHardening } from '../src/core/bridgeHardening.js';

function createStorage() {
  const values = new Map();
  return {
    getItem: vi.fn(key => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, String(value))),
    removeItem: vi.fn(key => values.delete(key)),
  };
}

describe('annotation fallback hardening', () => {
  it('keeps document fallbacks separate from page-keyed legacy data', async () => {
    const localStorage = createStorage();
    localStorage.setItem('plasma-pdf-annotations', JSON.stringify({
      1: [{ id: 'page-only', page: 1, text: 'legacy page annotation' }],
    }));
    const db = {
      async getAllAnnotations() {
        return [{ id: 'page-only', page: 1, docId: 'global' }];
      },
      async getAnnotations(docId) {
        return (await this.getAllAnnotations()).filter(record => record.docId === docId);
      },
      async saveAnnotations(docId, pages) {
        const records = Object.entries(pages).flatMap(([page, list]) => list.map(record => ({
          ...record,
          docId,
          page: Number(page),
        })));
        const legacy = JSON.parse(localStorage.getItem('plasma-pdf-annotations') || '{}');
        legacy[docId] = records;
        localStorage.setItem('plasma-pdf-annotations', JSON.stringify(legacy));
        return records;
      },
    };
    const root = { document, DB: db, OpenCourseDeck: {}, localStorage };

    installBridgeHardening(root);
    await db.saveAnnotations('doc-a', { 2: [{ id: 'doc-a-note', text: 'owned' }] });

    const legacy = JSON.parse(localStorage.getItem('plasma-pdf-annotations') || '{}');
    const documents = JSON.parse(localStorage.getItem('plasma-pdf-annotations-by-document') || '{}');
    expect(legacy['1']).toHaveLength(1);
    expect(legacy['doc-a']).toBeUndefined();
    expect(documents['doc-a']).toEqual([
      expect.objectContaining({ id: 'doc-a-note', docId: 'doc-a', page: 2 }),
    ]);
    await expect(db.getAllAnnotations()).resolves.toEqual([
      expect.objectContaining({ id: 'doc-a-note', docId: 'doc-a' }),
    ]);
    await expect(db.getAnnotations('global')).resolves.toEqual([]);
  });
});
