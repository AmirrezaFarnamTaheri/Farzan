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
  // Concurrent requests share one drain. Starting a new PDF load before the
  // previous one settles allows a slow older document to overwrite its
  // replacement in view implementations without generation checks.
  if (pd.pdfOpenInFlight) return pd.pdfOpenInFlight;
  const viewer = root.PlasmaPDFViewer;
  const loader = viewer?.load;
  if (typeof loader !== 'function') throw new Error('PDF viewer is unavailable');

  const task = (async () => {
    let loaded = false;
    while (pd.pendingPdfOpen) {
      const request = pd.pendingPdfOpen;
      pd.pendingPdfOpen = null;
      try {
        const result = await loader.call(viewer, request.source);
        // The PDF viewer displays its own diagnostic for unsuccessful loads,
        // but a false receipt must remain retryable at the route boundary.
        if (result === false) throw new Error('PDF viewer could not load the document');
        loaded = true;
      } catch (error) {
        // A newer request supersedes an older failed one; do not replace it
        // with a stale source or send an erroneous duplicate retry.
        if (pd.pendingPdfOpen) continue;
        pd.pendingPdfOpen = request;
        throw error;
      }
    }
    return loaded;
  })();

  pd.pdfOpenInFlight = task;
  try {
    return await task;
  } finally {
    if (pd.pdfOpenInFlight === task) pd.pdfOpenInFlight = null;
  }
}
