function recoveryError(summary, cause) {
  const detail = cause?.message ? `: ${cause.message}` : '';
  const error = new Error(`${summary}${detail}. Close other OpenCourseDeck tabs, reload the app, verify browser storage permissions, and retry.`);
  if (cause) error.cause = cause;
  return error;
}

export async function replaceDocumentAnnotations(idb, docId, annotations) {
  const records = Array.isArray(annotations) ? annotations : [];
  for (const record of records) {
    if (record?.docId !== docId) {
      throw new TypeError(`Annotation ${String(record?.id ?? '(missing id)')} does not belong to document ${docId}`);
    }
  }

  if (typeof idb?.open === 'function') {
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
      cursorRequest.onerror = () => reject(recoveryError('Annotation replacement cursor failed', cursorRequest.error));
      transaction.oncomplete = () => resolve(records);
      transaction.onerror = () => reject(recoveryError('Annotation replacement transaction failed', transaction.error));
      transaction.onabort = () => reject(recoveryError('Annotation replacement transaction aborted', transaction.error));
    });
  }

  if (
    typeof idb?.getAllByIndex !== 'function'
    || typeof idb?.put !== 'function'
    || typeof idb?.delete !== 'function'
  ) {
    throw new TypeError('Annotation replacement requires open() or getAllByIndex()/put()/delete()');
  }

  // Compatibility path for narrow adapters and test doubles. Write every
  // replacement before deleting stale records so an interrupted operation
  // cannot lose annotations that were meant to remain.
  const existing = await idb.getAllByIndex('annotations', 'docId', docId);
  const keep = new Set(records.map(record => record.id));
  for (const record of records) await idb.put('annotations', record);
  for (const record of existing) {
    if (!keep.has(record?.id)) await idb.delete('annotations', record.id);
  }
  return records;
}
