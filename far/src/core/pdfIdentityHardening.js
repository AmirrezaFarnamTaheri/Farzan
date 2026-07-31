function copyView(source) {
  if (source instanceof ArrayBuffer) return new Uint8Array(source.slice(0));
  if (ArrayBuffer.isView(source)) {
    return new Uint8Array(source.buffer, source.byteOffset, source.byteLength).slice();
  }
  return null;
}

export function installPdfIdentityHardening(root = window) {
  const viewer = root.PlasmaPDFViewer;
  if (!viewer || viewer.__identityHardeningInstalled) return viewer;

  const originalLoad = viewer.load?.bind(viewer);
  const originalDeriveCanonical = viewer._deriveCanonicalDocId?.bind(viewer);
  if (typeof originalLoad !== 'function' || typeof originalDeriveCanonical !== 'function') {
    throw new Error('PDF identity hardening requires the public PDF loader and canonical identity helper');
  }

  let preservedBytes = null;

  viewer._deriveLegacyDocIds = (source) => {
    if (typeof source === 'string') return [source, `url:${source}`];
    if (typeof File === 'function' && source instanceof File) {
      return [`file:${source.name}:${source.size}:${source.lastModified || 0}`];
    }
    // ArrayBuffer and typed-array aliases based on a constant or byte length
    // are shared by unrelated documents and are therefore not safe to migrate.
    return [];
  };

  viewer._deriveCanonicalDocId = (source, pdfDocument, sourceData) => (
    originalDeriveCanonical(source, pdfDocument, preservedBytes || copyView(sourceData) || sourceData)
  );

  viewer.load = async (source) => {
    let transportSource = source;
    preservedBytes = copyView(source);

    if (source instanceof ArrayBuffer) transportSource = source.slice(0);
    else if (ArrayBuffer.isView(source)) transportSource = copyView(source).buffer;
    else if (typeof File === 'function' && source instanceof File) {
      preservedBytes = new Uint8Array(await source.arrayBuffer());
    }

    try {
      return await originalLoad(transportSource);
    } finally {
      preservedBytes = null;
    }
  };

  Object.defineProperty(viewer, '__identityHardeningInstalled', { value: true });
  root.OpenCourseDeck = root.OpenCourseDeck || {};
  root.OpenCourseDeck.PdfIdentityHardening = Object.freeze({
    bufferAliasesAllowed: false,
    preservesTransportBytes: true,
  });
  return viewer;
}
