/**
 * Squire-specific compatibility preflight. Keep the stricter Tiptap gate in
 * notesEditorCompatibility.js for its historical compatibility contract.
 *
 * Squire uses HTML as canonical content and supports safe inline typography.
 * Unknown metadata is routed to the classic editor instead of being dropped.
 */
import { assessNoteForTiptap } from './notesEditorCompatibility.js';
import { filterNoteStyle } from './safeNoteStyles.js';

const SAFE_CLASSES = new Set(['color', 'font', 'size', 'highlight']);
const BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'li', 'pre']);
const MARKS = new Set(['span', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'code', 'a']);

function reject(reason) { return { compatible: false, reason }; }

export function assessNoteForSquire(html) {
  if (html == null || html === '') return { compatible: true, reason: null };
  if (typeof html !== 'string') return reject('invalid-content-type');
  const template = document.createElement('template');
  template.innerHTML = html;
  // Check every element, including root nodes, before removing approved
  // Squire-only metadata for validation against the existing lossless gate.
  for (const element of [...template.content.querySelectorAll('*')]) {
    const tag = element.localName;
    if (tag === 'span' || BLOCKS.has(tag) || MARKS.has(tag) || tag === 'hr' || tag === 'br') {
      for (const attr of [...element.attributes]) {
        const name = attr.name.toLowerCase();
        if (tag === 'a' && name === 'href') continue;
        if (name === 'dir') {
          if (!/^(?:ltr|rtl|auto)$/i.test(attr.value)) return reject('unsupported-direction');
          element.removeAttribute(name);
          continue;
        }
        if (name === 'style') {
          if (!filterNoteStyle(attr.value).valid) return reject('unsupported-style');
          element.removeAttribute(name);
          continue;
        }
        if (name === 'class') {
          const classes = attr.value.trim().split(/\s+/).filter(Boolean);
          const acceptable = classes.every(value =>
            (tag === 'span' && SAFE_CLASSES.has(value))
            || (BLOCKS.has(tag) && /^align-(?:left|right|center|justify|start|end)$/.test(value))
          );
          if (!classes.length || !acceptable) return reject('unsupported-class');
          element.removeAttribute(name);
          continue;
        }
        // All other attributes remain for the original strict gate.
      }
    }
  }
  // A span with approved style/dir is a purely visual inline wrapper. Its
  // contents still need to pass the strict structural and link checks.
  for (const span of [...template.content.querySelectorAll('span')].reverse()) {
    span.replaceWith(...span.childNodes);
  }
  // Squire can wrap browser-generated root text in paragraphs. Validate an
  // inert structural copy, keeping the stored HTML untouched.
  let paragraph = null;
  for (const node of [...template.content.childNodes]) {
    const inline = (node.nodeType === Node.TEXT_NODE && Boolean(node.textContent.trim()))
      || (node.nodeType === Node.ELEMENT_NODE && MARKS.has(node.localName));
    if (inline) {
      if (!paragraph) {
        paragraph = document.createElement('p');
        template.content.insertBefore(paragraph, node);
      }
      paragraph.appendChild(node);
    } else if (paragraph && node.nodeType === Node.TEXT_NODE) {
      paragraph.appendChild(node);
    } else {
      paragraph = null;
    }
  }
  return assessNoteForTiptap(template.innerHTML);
}
