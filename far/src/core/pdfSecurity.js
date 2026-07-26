const MAX_PDF_BYTES = 250 * 1024 * 1024;

export function installPdfSecurity(root = window) {
  const library = root.pdfjsLib;
  if (!library?.getDocument || library.__openCourseDeckSecurityInstalled) return library;

  const originalGetDocument = library.getDocument.bind(library);
  library.getDocument = (source) => {
    let options;
    if (typeof source === 'string' || source instanceof URL) options = { url: String(source) };
    else if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) options = { data: source };
    else options = { ...(source || {}) };

    const dataBytes = options.data?.byteLength ?? options.data?.length ?? 0;
    if (dataBytes > MAX_PDF_BYTES) {
      throw new RangeError(`PDF exceeds the ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB safety limit`);
    }

    return originalGetDocument({
      ...options,
      isEvalSupported: false,
      stopAtErrors: true,
      useSystemFonts: false,
    });
  };

  Object.defineProperty(library, '__openCourseDeckSecurityInstalled', { value: true });
  root.OpenCourseDeck = root.OpenCourseDeck || {};
  root.OpenCourseDeck.PdfSecurity = Object.freeze({
    evalDisabled: true,
    maxBytes: MAX_PDF_BYTES,
  });
  return library;
}
