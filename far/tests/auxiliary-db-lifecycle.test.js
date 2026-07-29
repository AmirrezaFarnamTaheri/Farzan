import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  AUXILIARY_DATABASES,
  installAuxiliaryDbLifecycle,
} from '../src/core/auxiliaryDbLifecycle.js';

function openPopulatedDatabase(factory, name) {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('records')) {
        request.result.createObjectStore('records');
      }
    };
    request.onerror = () => reject(request.error || new Error(`Unable to open ${name}`));
    request.onblocked = () => reject(new Error(`Open blocked for ${name}`));
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('records', 'readwrite');
      transaction.objectStore('records').put({ name }, 'record');
      transaction.onerror = () => reject(transaction.error || new Error(`Write failed for ${name}`));
      transaction.onabort = () => reject(transaction.error || new Error(`Write aborted for ${name}`));
      transaction.oncomplete = () => resolve(db);
    };
  });
}

function deleteDatabase(factory, name) {
  return new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error(`Unable to delete ${name}`));
    request.onblocked = () => reject(new Error(`Delete blocked for ${name}`));
  });
}

function reopenFromZero(factory, name) {
  return new Promise((resolve, reject) => {
    let oldVersion = null;
    const request = factory.open(name, 1);
    request.onupgradeneeded = event => {
      oldVersion = event.oldVersion;
      request.result.createObjectStore('verification');
    };
    request.onerror = () => reject(request.error || new Error(`Unable to reopen ${name}`));
    request.onblocked = () => reject(new Error(`Reopen blocked for ${name}`));
    request.onsuccess = () => resolve({ db: request.result, oldVersion });
  });
}

describe('auxiliary database lifecycle', () => {
  it('closes every opened and populated auxiliary database before deletion', async () => {
    const root = { indexedDB: new IDBFactory(), OpenCourseDeck: {} };
    const lifecycle = installAuxiliaryDbLifecycle(root);

    for (const name of AUXILIARY_DATABASES) {
      await openPopulatedDatabase(root.indexedDB, name);
    }

    expect(lifecycle.status()).toEqual(Object.fromEntries(
      AUXILIARY_DATABASES.map(name => [name, 1]),
    ));

    const receipt = await lifecycle.requestClose(AUXILIARY_DATABASES, { reason: 'full-wipe-test' });
    expect(receipt.committed).toBe(true);
    expect(receipt.local.committed).toBe(true);
    expect(receipt.local.failures).toEqual([]);
    expect(receipt.local.remaining).toEqual(Object.fromEntries(
      AUXILIARY_DATABASES.map(name => [name, 0]),
    ));

    for (const name of AUXILIARY_DATABASES) {
      await deleteDatabase(root.indexedDB, name);
      const reopened = await reopenFromZero(root.indexedDB, name);
      expect(reopened.oldVersion).toBe(0);
      reopened.db.close();
      await deleteDatabase(root.indexedDB, name);
    }
  });

  it('returns an uncommitted receipt and preserves close failures', async () => {
    const root = { indexedDB: new IDBFactory(), OpenCourseDeck: {} };
    const lifecycle = installAuxiliaryDbLifecycle(root);
    const closeError = Object.assign(new Error('close denied'), { code: 'EACCES' });
    const connection = {
      addEventListener() {},
      close() { throw closeError; },
    };

    lifecycle.track('opencoursedeck-media', connection);
    const receipt = await lifecycle.requestClose(['opencoursedeck-media'], { reason: 'failure-test' });

    expect(receipt.committed).toBe(false);
    expect(receipt.local.committed).toBe(false);
    expect(receipt.local.remaining['opencoursedeck-media']).toBe(1);
    expect(receipt.local.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'opencoursedeck-media',
        phase: 'explicit-close',
        message: 'close denied',
      }),
    ]));
    expect(lifecycle.failures()['opencoursedeck-media']).toEqual(expect.arrayContaining([
      expect.objectContaining({ phase: 'explicit-close', message: 'close denied' }),
    ]));
  });
});
