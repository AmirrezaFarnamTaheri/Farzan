// Catalog layout follows course/source language, not the title of an
// individual English-language medical lesson. Only the first strong letter
// in each label participates; numbers and punctuation cannot force LTR.
const LETTER = /\p{Letter}/u;
const RTL_LETTER = /[\p{Script=Arabic}\p{Script=Hebrew}]/u;

/**
 * Pick one direction for an entire source section or material row. When a
 * Persian/Arabic/Hebrew course or source is mixed with English lesson titles,
 * keep the UI's column ordering RTL and isolate the title text separately.
 */
export function catalogReadingDirection(...labels) {
  for (const label of labels) {
    for (const char of String(label ?? '')) {
      if (!LETTER.test(char)) continue;
      if (RTL_LETTER.test(char)) return 'rtl';
      break; // The first strong letter determines this label's direction.
    }
  }
  return 'ltr';
}
