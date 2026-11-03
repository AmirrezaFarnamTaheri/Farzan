function recoveryError(summary, cause) {
  const detail = cause?.message ? `: ${cause.message}` : '';
  const error = new Error(`${summary}${detail}. Close other OpenCourseDeck tabs, reload the app, verify browser storage permissions, and retry.`);
  if (cause) error.cause = cause;
  return error;
}

export async function replaceDocumentAnnotations(idb, docId, annotations) {
  const records = Array.isArray(annotations) ? annotations : [];
  for (const record of records) {
    if (record?.id == null || (typeof record.id === 'number' && !Number.isFinite(record.id)) || (typeof record.id !== 'string' && typeof record.id !== 'number')) {
      throw new TypeError('Every annotation must have a valid string or numeric key');
    }
    if (record?.docId !== docId) {
      throw new TypeError(`Annotation ${String(record?.id ?? '(missing id)')} does not belong to document ${docId}`);
    }
  }

  if (typeof idb?.open !== 'function') {
    throw new TypeError('Annotation replacement requires open() for an atomic IndexedDB transaction');
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

  try {
    for (const record of records) store.put(record);
  } catch (error) {
    try { transaction.abort(); } catch { /* transaction may already have aborted */ }
    throw error;
  }

  return new Promise((resolve, reject) => {
    cursorRequest.onerror = () => reject(recoveryError('Annotation replacement cursor failed', cursorRequest.error));
    transaction.oncomplete = () => resolve(records);
    transaction.onerror = () => reject(recoveryError('Annotation replacement transaction failed', transaction.error));
    transaction.onabort = () => reject(recoveryError('Annotation replacement transaction aborted', transaction.error));
  });

}
