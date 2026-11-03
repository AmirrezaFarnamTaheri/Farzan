import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { OpenCourseDB } from '../db.js';
import { replaceDocumentAnnotations } from '../src/core/annotationPersistence.js';

describe('annotation persistence', () => {
  beforeEach(async () => {
    await indexedDB.deleteDatabase('annotation-persistence-test');
  });

  it('replaces one document annotation set in exactly one read-write transaction', async () => {
    const idb = new OpenCourseDB('annotation-persistence-test', 1, [
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

  it('adds actionable recovery guidance to transaction failures', async () => {
    const cursorRequest = {};
    const transaction = {
      error: new Error('quota exceeded'),
      objectStore: () => ({
        index: () => ({ openCursor: () => cursorRequest }),
        put: vi.fn(),
      }),
    };
    const pending = replaceDocumentAnnotations({
      open: async () => ({ transaction: () => transaction }),
    }, 'doc-a', []);

    await vi.waitFor(() => expect(transaction.onerror).toBeTypeOf('function'));
    transaction.onerror();

    await expect(pending).rejects.toThrow(/quota exceeded.*Close other OpenCourseDeck tabs.*retry/i);
  });

  it('rejects non-transactional annotation adapters without reading or modifying saved records', async () => {
    const adapter = {
      getAllByIndex: vi.fn(async () => [{ id: 'saved', docId: 'doc-a' }]),
      put: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    };
    await expect(replaceDocumentAnnotations(adapter, 'doc-a', [
      { id: 'replacement', docId: 'doc-a' },
    ])).rejects.toThrow(/atomic.*transaction|open\(\)/i);
    expect(adapter.getAllByIndex).not.toHaveBeenCalled();
    expect(adapter.put).not.toHaveBeenCalled();
    expect(adapter.delete).not.toHaveBeenCalled();
  });

  it('rejects records from another document before opening a transaction', async () => {
    const open = () => Promise.reject(new Error('must not open'));
    await expect(replaceDocumentAnnotations({ open }, 'doc-a', [
      { id: 'wrong', docId: 'doc-b' },
    ])).rejects.toThrow(/does not belong to document doc-a/);
  });
});

describe('annotation transaction failure isolation', () => {
  it('aborts a partially queued replacement when a later key is invalid', async () => {
    const idb = new OpenCourseDB('annotation-persistence-test', 1, [
      { name: 'annotations', key: 'id', autoIncrement: false, indexes: [{ field: 'docId' }] },
    ]);
    await idb.put('annotations', { id: 'original', docId: 'doc-a', text: 'important' });
    await expect(replaceDocumentAnnotations(idb, 'doc-a', [
      { id: 'new-valid', docId: 'doc-a', text: 'new' },
      { id: undefined, docId: 'doc-a', text: 'invalid key' },
    ])).rejects.toThrow();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(await idb.getAllByIndex('annotations', 'docId', 'doc-a')).toEqual([
      expect.objectContaining({ id: 'original', text: 'important' }),
    ]);
  });
});
