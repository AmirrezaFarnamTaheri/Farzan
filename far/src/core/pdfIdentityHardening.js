const LEGACY_ANNOTATION_KEY = 'plasma-pdf-annotations';
const PAGE_ANNOTATION_KEY = 'plasma-pdf-annotations-by-page';

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
    const pageShaped = entries.every(([page, records]) => (
      Number.isFinite(Number(page))
      && Array.isArray(records)
      && records.every(record => !record?.docId)
    ));
    return pageShaped ? value : null;
  } catch {
    return null;
  }
}

function readPageFallback(root) {
  const storage = root.localStorage;
  const current = storage?.getItem?.(PAGE_ANNOTATION_KEY);
  if (current) return parsePageMap(current) || {};

  const legacyRaw = storage?.getItem?.(LEGACY_ANNOTATION_KEY);
  const legacyPages = parsePageMap(legacyRaw);
  if (!legacyPages) return {};
  storage.setItem(PAGE_ANNOTATION_KEY, JSON.stringify(legacyPages));
  storage.removeItem(LEGACY_ANNOTATION_KEY);
  return legacyPages;
}

function installPageFallbackHardening(root, viewer) {
  const state = root.PlasmaPDFState;
  if (!state) return;

  viewer._loadAnnotations = async () => {
    if (root.DB?.getAnnotations) {
      try {
        const canonicalId = state.annotationDocId;
        const aliases = Array.from(new Set(state.annotationAliases || []));
        const results = await Promise.all([
          root.DB.getAnnotations(canonicalId),
          ...aliases.map(alias => root.DB.getAnnotations(alias)),
        ]);
        const merged = new Map();
        results.flat().forEach((annotation) => {
          const next = { ...annotation, docId: canonicalId };
          const current = merged.get(next.id);
          if (!current || Number(next.updatedAt || 0) >= Number(current.updatedAt || 0)) {
            merged.set(next.id, next);
          }
        });
        const records = [...merged.values()];
        state.annotations = records.reduce((pages, annotation) => {
          const page = annotation.page ?? 1;
          (pages[page] = pages[page] || []).push(annotation);
          return pages;
        }, {});
        const migratedAliases = aliases.filter((_, index) => (results[index + 1] || []).length > 0);
        if (migratedAliases.length && root.DB?.saveAnnotations) {
          await root.DB.saveAnnotations(canonicalId, state.annotations);
          await Promise.all(migratedAliases.map(alias => root.DB.saveAnnotations(alias, {})));
          root.OpenCourseDeck?.bus?.emit?.('pdf:identity-migrated', {
            docId: canonicalId,
            aliases: migratedAliases,
            annotations: records.length,
          });
        }
        return;
      } catch {
        // Fall back to the page-only local store below.
      }
    }
    state.annotations = readPageFallback(root);
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
