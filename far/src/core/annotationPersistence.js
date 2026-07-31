export async function replaceDocumentAnnotations(idb, docId, annotations) {
  const existing = await idb.getAllByIndex('annotations', 'docId', docId);
  const nextIds = new Set(annotations.map(annotation => annotation.id));
  await Promise.all(existing
    .filter(annotation => !nextIds.has(annotation.id))
    .map(annotation => idb.delete('annotations', annotation.id)));
  for (const annotation of annotations) await idb.put('annotations', annotation);
}