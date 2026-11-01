const PAGE_ANNOTATION_KEY = 'ocd_pdf_annotations_by_page';

function copyView(source) {
  if (source instanceof ArrayBuffer) return new Uint8Array(source.slice(0));
  if (ArrayBuffer.isView(source)) {
    return new Uint8Array(source.buffer, source.byteOffset, source.byteLength).slice();
  }
  return null;
}

function parsePageMap(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || Array.isArray(value) || typeof value !== 'object') return null;
    const entries = Object.entries(value);
    const pageShaped = entries.every(([page, records]) => {
      const pageNumber = Number(page);
      return Number.isInteger(pageNumber)
        && pageNumber > 0
        && Array.isArray(records)
        && records.every(record => (
          record
          && typeof record === 'object'
          && (record.page == null || Number(record.page) === pageNumber)
        ));
    });
    return pageShaped ? value : null;
  } catch {
    return null;
  }
}

function readPageFallback(root, docId) {
  const raw = root.localStorage?.getItem?.(PAGE_ANNOTATION_KEY);
  return scopedPageMap(parsePageMap(raw), docId);
}

function scopedPageMap(pages, docId) {
  // Only explicitly document-scoped records may appear in this PDF.
  if (!pages || !docId) return {};
  const scoped = {};
  for (const [page, records] of Object.entries(pages)) {
    const owned = records.filter(record => record?.docId === docId);
    if (owned.length) scoped[page] = owned;
  }
  return scoped;
}

function installPageFallbackHardening(root, viewer) {
  const state = root.PlasmaPDFState;
  if (!state) return;

  viewer._loadAnnotations = async () => {
    const docId = state.annotationDocId;
    if (root.DB?.getAnnotations) {
      try {
        const records = await root.DB.getAnnotations(docId);
        if (!Array.isArray(records)) throw new TypeError('Invalid annotation records');
        // Never merge URL, filename, byte-length or other document identities.
        state.annotations = records
          .filter(row => row && row.docId === docId
            && Number.isInteger(Number(row.page ?? 1)) && Number(row.page ?? 1) > 0)
          .reduce((pages, annotation) => {
            const page = annotation.page ?? 1;
            (pages[page] = pages[page] || []).push(annotation);
            return pages;
          }, {});
        return;
      } catch {
        // A rejected canonical read may only use a local document-scoped copy.
      }
    }
    state.annotations = readPageFallback(root, docId);
  };

  viewer._saveAnnotations = () => {
    const saveFallback = () => root.localStorage?.setItem?.(
      PAGE_ANNOTATION_KEY,
      JSON.stringify(state.annotations || {}),
    );
    if (root.DB?.saveAnnotations) {
      try {
        Promise.resolve(root.DB.saveAnnotations(state.annotationDocId, state.annotations || {}))
          .catch(saveFallback);
        return;
      } catch {
        saveFallback();
        return;
      }
    }
    saveFallback();
  };
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

  installPageFallbackHardening(root, viewer);
  Object.defineProperty(viewer, '__identityHardeningInstalled', { value: true });
  root.OpenCourseDeck = root.OpenCourseDeck || {};
  root.OpenCourseDeck.PdfIdentityHardening = Object.freeze({
    bufferAliasesAllowed: false,
    preservesTransportBytes: true,
    pageAnnotationKey: PAGE_ANNOTATION_KEY,
  });
  return viewer;
}
