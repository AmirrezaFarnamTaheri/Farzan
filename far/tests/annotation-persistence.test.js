import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import '../db.js';
import { replaceDocumentAnnotations } from '../src/core/annotationPersistence.js';

describe('annotation persistence', () => {
  beforeEach(async () => {
    await indexedDB.deleteDatabase('annotation-persistence-test');
  });

  it('replaces one document annotation set in exactly one read-write transaction', async () => {
    const { PlasmaDB } = window.OpenCourseDeck.DB;
    const idb = new PlasmaDB('annotation-persistence-test', 1, [
      { name: 'annotations', key: 'id', autoIncrement: false, indexes: [{ field: 'docId' }] },
    ]);
    await idb.bulkPut('annotations', [
      { id: 'keep', docId: 'doc-a', value: 1 },
      { id: 'remove', docId: 'doc-a', value: 2 },
      { id: 'other', docId: 'doc-b', value: 3 },
    ]);

    const database = await idb.open();
    const originalTransaction = database.transaction.bind(database);
    let transactionCount = 0;
    const adapter = {
      open: async () => ({
        transaction(...args) {
          transactionCount += 1;
          return originalTransaction(...args);
        },
      }),
    };

    await replaceDocumentAnnotations(adapter, 'doc-a', [
      { id: 'keep', docId: 'doc-a', value: 4 },
      { id: 'add', docId: 'doc-a', value: 5 },
    ]);

    expect(transactionCount).toBe(1);
    const docA = await idb.getAllByIndex('annotations', 'docId', 'doc-a');
    expect(docA).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'keep', value: 4 }),
      expect.objectContaining({ id: 'add', value: 5 }),
    ]));
    expect(docA).toHaveLength(2);
    await expect(idb.getAllByIndex('annotations', 'docId', 'doc-b')).resolves.toEqual([
      expect.objectContaining({ id: 'other', value: 3 }),
    ]);
  });

  it('writes replacements before deleting stale records on compatibility adapters', async () => {
    const order = [];
    const adapter = {
      getAllByIndex: vi.fn(async () => [
        { id: 'keep', docId: 'doc-a' },
        { id: 'remove', docId: 'doc-a' },
      ]),
      put: vi.fn(async (_store, record) => order.push(`put:${record.id}`)),
      delete: vi.fn(async (_store, id) => order.push(`delete:${id}`)),
    };

    await replaceDocumentAnnotations(adapter, 'doc-a', [
      { id: 'keep', docId: 'doc-a' },
      { id: 'add', docId: 'doc-a' },
    ]);

    expect(order).toEqual(['put:keep', 'put:add', 'delete:remove']);
  });

  it('propagates compatibility write failures before deleting prior data', async () => {
    const adapter = {
      getAllByIndex: vi.fn(async () => [{ id: 'remove', docId: 'doc-a' }]),
      put: vi.fn(async () => { throw new Error('annotation canonical failed'); }),
      delete: vi.fn(),
    };

    await expect(replaceDocumentAnnotations(adapter, 'doc-a', [
      { id: 'add', docId: 'doc-a' },
    ])).rejects.toThrow('annotation canonical failed');
    expect(adapter.delete).not.toHaveBeenCalled();
  });

  it('rejects records from another document before opening a transaction', async () => {
    const open = () => Promise.reject(new Error('must not open'));
    await expect(replaceDocumentAnnotations({ open }, 'doc-a', [
      { id: 'wrong', docId: 'doc-b' },
    ])).rejects.toThrow(/does not belong to document doc-a/);
  });
});
