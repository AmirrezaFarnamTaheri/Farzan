export async function replaceDocumentAnnotations(idb, docId, annotations) {
  if (!idb || typeof idb.open !== 'function') {
    throw new TypeError('Atomic annotation replacement requires an IndexedDB adapter with open()');
  }

  const records = Array.isArray(annotations) ? annotations : [];
  for (const record of records) {
    if (record?.docId !== docId) {
      throw new TypeError(`Annotation ${String(record?.id ?? '(missing id)')} does not belong to document ${docId}`);
    }
  }

  const database = await idb.open();
  const transaction = database.transaction('annotations', 'readwrite');
  const store = transaction.objectStore('annotations');
  const keep = new Set(records.map(record => record.id));
  const cursorRequest = store.index('docId').openCursor(docId);

  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    if (!keep.has(cursor.value?.id)) cursor.delete();
    cursor.continue();
  };

  for (const record of records) store.put(record);

  return new Promise((resolve, reject) => {
    cursorRequest.onerror = () => reject(cursorRequest.error || new Error('Annotation replacement cursor failed'));
    transaction.oncomplete = () => resolve(records);
    transaction.onerror = () => reject(transaction.error || new Error('Annotation replacement transaction failed'));
    transaction.onabort = () => reject(transaction.error || new Error('Annotation replacement transaction aborted'));
  });
}
