export async function replaceDocumentAnnotations(idb, docId, annotations) {
  if (typeof idb?.replaceByIndex !== 'function') {
    throw new TypeError('Atomic annotation replacement requires idb.replaceByIndex');
  }
  return idb.replaceByIndex('annotations', 'docId', docId, annotations);
}
