import { test, expect } from '@playwright/test';

test.use({ channel: 'chrome' });

test('reads native IndexedDB v1 media Blob through Dexie without changing file identity', async ({ page }) => {
  await page.goto('/#/home', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.OpenCourseDeck?.UserLibrary?.resolve === 'function');

  const result = await page.evaluate(async () => {
    const id = 'native-v1-media-compat-test';
    const name = 'opencoursedeck-library-files';
    const storeName = 'files';
    const req = indexedDB.open(name, 1);
    const db = await new Promise((resolve, reject) => {
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(storeName)) {
          req.result.createObjectStore(storeName, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(storeName, 'readwrite');
    const fileData = 'real-browser-blob-contents';
    tx.objectStore(storeName).put({
      id, name: 'lecture.txt', type: 'text/plain', kind: 'file',
      size: fileData.length, blob: new Blob([fileData], { type: 'text/plain' }),
    });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    const url = await window.OpenCourseDeck.UserLibrary.resolve('library-file:' + id);
    const contents = url.startsWith('blob:') ? await fetch(url).then(response => response.text()) : null;
    const checkReq = indexedDB.open(name);
    const schema = await new Promise((resolve, reject) => {
      checkReq.onerror = () => reject(checkReq.error);
      checkReq.onsuccess = () => {
        const connection = checkReq.result;
        const objectStore = connection.transaction(storeName, 'readonly').objectStore(storeName);
        const result = { version: connection.version, keyPath: objectStore.keyPath, indexes: [...objectStore.indexNames] };
        connection.close();
        resolve(result);
      };
    });
    await window.OpenCourseDeck.UserLibrary.clearLibraryFiles();
    return { urlWasBlob: url.startsWith('blob:'), contents, schema };
  });
  expect(result).toEqual({
    urlWasBlob: true,
    contents: 'real-browser-blob-contents',
    schema: { version: 1, keyPath: 'id', indexes: [] },
  });
});
