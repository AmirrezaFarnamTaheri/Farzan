import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import '../db.js';

describe('PlasmaDB helper', () => {
  beforeEach(async () => {
    await indexedDB.deleteDatabase('plasma-test-db');
  });

  it('rejects failed bulk transactions instead of hanging', async () => {
    const { PlasmaDB } = window.OpenCourseDeck.DB;
    const db = new PlasmaDB('plasma-test-db', 1, [
      { name: 'items', key: 'id', autoIncrement: false },
    ]);

    await expect(db.bulkAdd('items', [{ id: 'a' }, { id: 'a' }])).rejects.toBeTruthy();
  });

  it('can read records by an IndexedDB index', async () => {
    const { PlasmaDB } = window.OpenCourseDeck.DB;
    const db = new PlasmaDB('plasma-test-db', 1, [
      { name: 'items', key: 'id', autoIncrement: false, indexes: [{ field: 'kind' }] },
    ]);

    await db.bulkPut('items', [
      { id: 'a', kind: 'note' },
      { id: 'b', kind: 'task' },
      { id: 'c', kind: 'note' },
    ]);

    const notes = await db.getAllByIndex('items', 'kind', 'note');
    expect(notes.map((item) => item.id).sort()).toEqual(['a', 'c']);
  });

  it('returns only after a single-record write is durably readable', async () => {
    const { PlasmaDB } = window.OpenCourseDeck.DB;
    const db = new PlasmaDB('plasma-test-db', 1, [
      { name: 'items', key: 'id', autoIncrement: false },
    ]);

    await db.put('items', { id: 'saved', value: 42 });
    db.db.close();
    db.db = null;

    await expect(db.get('items', 'saved')).resolves.toEqual({ id: 'saved', value: 42 });
  });

  it('honors descending cursor direction through both supported call shapes', async () => {
    const { PlasmaDB } = window.OpenCourseDeck.DB;
    const db = new PlasmaDB('plasma-test-db', 1, [
      { name: 'items', key: 'id', autoIncrement: false, indexes: [{ field: 'updatedAt' }] },
    ]);
    await db.bulkPut('items', [
      { id: 'old', updatedAt: 10 },
      { id: 'middle', updatedAt: 20 },
      { id: 'new', updatedAt: 30 },
    ]);

    const objectShape = await db.queryIndex('items', 'updatedAt', null, { limit: 2, direction: 'prev' });
    const legacyShape = await db.queryIndex('items', 'updatedAt', null, 2, { direction: 'prev' });

    expect(objectShape.map(item => item.id)).toEqual(['new', 'middle']);
    expect(legacyShape.map(item => item.id)).toEqual(['new', 'middle']);
  });
});
