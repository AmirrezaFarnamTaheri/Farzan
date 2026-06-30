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
});
