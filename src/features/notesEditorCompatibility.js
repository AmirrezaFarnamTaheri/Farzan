/**
 * Strict, lossless legacy-HTML gate for the StarterKit editor migration.
 *
 * Tiptap/ProseMirror discards unknown HTML elements and marks. Unlike JSON
 * content validation, checking HTML through the editor is not enough to
 * guarantee round-trip preservation. Reject anything StarterKit cannot
 * represent before creating an editable document. Rejected notes stay in the
 * existing sanitized HTML editor; their saved bytes are never overwritten by
 * a partially parsed ProseMirror document.
 */
const ALLOWED_BLOCKS = new Set([
  'p', 'h1', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'li', 'pre', 'hr',
]);
const ALLOWED_INLINE = new Set([
  'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'code', 'br', 'a',
]);

function invalid(reason) { return { compatible: false, reason }; }

export function assessNoteForTiptap(html) {
  if (html == null || html === '') return { compatible: true, reason: null };
  if (typeof html !== 'string') return invalid('invalid-content-type');
  const template = document.createElement('template');
  template.innerHTML = html;
  // ProseMirror's doc accepts block nodes at root, not loose inline nodes.
  for (const node of template.content.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) return invalid('root-text');
    if (node.nodeType === Node.ELEMENT_NODE && (!ALLOWED_BLOCKS.has(node.localName) || node.localName === 'li')) {
      return invalid('unsupported-root-' + node.localName);
    }
  }
  // Comments and non-list children would disappear or be restructured by an editor parse.
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_COMMENT);
  if (walker.nextNode()) return invalid('unsupported-html-comment');
  for (const element of template.content.querySelectorAll('*')) {
    const tag = element.localName;
    if (tag === 'ul' || tag === 'ol') {
      for (const child of element.childNodes) {
        if (child.nodeType === Node.TEXT_NODE && !child.textContent.trim()) continue;
        if (child.nodeType !== Node.ELEMENT_NODE || child.localName !== 'li') {
          return invalid('unsupported-list-child');
        }
      }
    }
    if (!ALLOWED_BLOCKS.has(tag) && !ALLOWED_INLINE.has(tag)) {
      return invalid('unsupported-element-' + tag);
    }
    for (const attribute of element.attributes) {
      const name = attribute.name.toLowerCase();
      if (tag !== 'a' || name !== 'href') return invalid('unsupported-attribute-' + name);
      // A scheme-shaped relative href (for example "https:chapter") can
      // resolve against the current app origin and be silently rewritten on
      // first save. Require an actual absolute HTTP(S) destination; keep
      // ambiguous legacy links byte-for-byte in the classic editor.
      const href = attribute.value;
      if (/^https?:\/\//i.test(href)) {
        try {
          const parsed = new URL(href);
          if (!parsed.hostname || !['http:', 'https:'].includes(parsed.protocol)) {
            return invalid('unsupported-link');
          }
        } catch { return invalid('unsupported-link'); }
      } else if (!/^(?:mailto:|tel:)/i.test(href)) {
        return invalid('unsupported-link');
      }
    }
  }
  return { compatible: true, reason: null };
}
