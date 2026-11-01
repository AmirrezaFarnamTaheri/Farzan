/**
 * PDF deep-links must name the document content, not a transport URL, local
 * filename or serialized buffer length. Unstable IDs remain discoverable in
 * the user's library but must never be applied to a different open PDF.
 */
export function isStablePdfDocumentId(value) {
  if (typeof value !== 'string') return false;
  return /^fingerprint:[A-Za-z0-9:_-]+$/.test(value)
    || /^sha256:[a-fA-F0-9]{64}$/.test(value);
}
