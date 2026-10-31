/**
 * Aggregate a read-only compatibility preflight for the saved Notes collection.
 *
 * The result deliberately has NO individual note IDs, titles or HTML, and
 * makes no write calls. Passing this gate is NOT proof of edit/reopen parity;
 * the classic editor must remain available until independent acceptance.
 */
import { assessNoteForSquire } from './notesSquireCompatibility.js';

export function auditSavedNotesForSquire(records) {
  if (!Array.isArray(records)) {
    throw new TypeError('Saved notes must be an array for compatibility assessment');
  }
  let compatible = 0;
  let classic = 0;
  for (const note of records) {
    if (!note || typeof note !== 'object' || Array.isArray(note)) {
      classic += 1;
      continue;
    }
    // Legacy "html" records exist; reject truly absent/non-string content
    // instead of inventing compatibility from a synthetic empty document.
    const html = typeof note.content === 'string'
      ? note.content : typeof note.html === 'string' ? note.html : null;
    if (html == null) {
      classic += 1;
      continue;
    }
    const result = assessNoteForSquire(html);
    if (result.compatible) compatible += 1;
    else classic += 1;
  }
  return Object.freeze({ total: records.length, compatible, classic });
}
