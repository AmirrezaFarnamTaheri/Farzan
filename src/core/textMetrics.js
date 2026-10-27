/**
 * Shared native word segmentation for Notes and knowledge-graph metrics.
 * Intl.Segmenter counts CJK and other languages without whitespace.
 * No external dependency and no changes to saved record schemas.
 */
const segmenters = new Map();
const BLOCKS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BR', 'DD', 'DIV', 'DL',
  'DT', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'LI', 'OL', 'P',
  'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'UL',
]);
const HIDDEN = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'SVG']);

/**
 * Read user HTML in a template, not the live document. This does not load
 * remote images or execute inline handlers, unlike detached live divs.
 * Preserve block boundaries rather than gluing successive words together.
 */
export function plainTextFromStoredHtml(html) {
  const source = String(html ?? '');
  if (!source) return '';
  if (!source.includes('<') && !source.includes('&')) return source;
  if (typeof document === 'undefined') return source.replace(/<[^>]*>/g, ' ').trim();
  const template = document.createElement('template');
  template.innerHTML = source;
  function read(node) {
    if (node.nodeType === 3) return node.nodeValue || '';
    if (node.nodeType === 1 && HIDDEN.has(node.tagName)) return '';
    const body = Array.from(node.childNodes || [], read).join('');
    return node.nodeType === 1 && BLOCKS.has(node.tagName) ? ' ' + body + ' ' : body;
  }
  return read(template.content).replace(/\s+/g, ' ').trim();
}

export function countWords(input, { html = false, locale } = {}) {
  const source = (html ? plainTextFromStoredHtml(input) : String(input ?? '')).trim();
  if (!source) return 0;
  if (typeof Intl.Segmenter !== 'function') return source.split(/\s+/).filter(Boolean).length;
  const language = locale || (typeof document !== 'undefined' ? document.documentElement.lang : '') ||
    (typeof navigator !== 'undefined' ? navigator.language : '') || 'en';
  let segmenter = segmenters.get(language);
  if (!segmenter) {
    try {
      segmenter = new Intl.Segmenter(language, { granularity: 'word' });
      segmenters.set(language, segmenter);
    } catch {
      return source.split(/\s+/).filter(Boolean).length;
    }
  }
  let count = 0;
  for (const part of segmenter.segment(source)) if (part.isWordLike) count += 1;
  return count;
}
