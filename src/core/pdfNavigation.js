// Hand off the requested PDF to its route rather than betting on a timer.
// The pending source is transient (blob: URLs are not portable across sessions).
export function openPdfSource(source, { root = window, router = root.OpenCourseDeck?.Router } = {}) {
  if (!source) throw new TypeError('A PDF source is required');
  const pd = root.OpenCourseDeck = root.OpenCourseDeck || {};
  const request = { source };
  pd.pendingPdfOpen = request;
  const route = String(root.location?.hash || '').split('?')[0];
  if (route === '#/pdf' && typeof pd.consumePdfOpen === 'function') {
    return pd.consumePdfOpen();
  }
  router?.navigate?.('#/pdf');
  return request;
}

// Called only after the PDF route mounted the viewer. A later request
// replaces an earlier one before mount. A failed availability check retains
// the request so a subsequent mount or retry can still consume it.
export async function consumePdfSource(root = window) {
  const pd = root.OpenCourseDeck || {};
  const request = pd.pendingPdfOpen;
  if (!request) return false;
  const loader = root.PlasmaPDFViewer?.load;
  if (typeof loader !== 'function') throw new Error('PDF viewer is unavailable');
  pd.pendingPdfOpen = null;
  await loader.call(root.PlasmaPDFViewer, request.source);
  return true;
}
