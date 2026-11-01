/**
 * Squire compatibility preflight built on a strict HTML structural gate.
 * The stored HTML is never converted as part of selecting an editor.
 *
 * Squire uses HTML as canonical content and supports safe inline typography.
 * Unknown metadata is routed to the classic editor instead of being dropped.
 */
import { assessSupportedNoteStructure } from './notesHtmlStructuralGate.js';
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
  // Squire-only metadata for validation against the strict HTML structural gate.
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
  // Squire represents an item with a nested list as
  // <li><div>label</div><ul>...</ul></li>. The original strict gate supports
  // inline text within <li>, so unwrap ONLY an attribute-free direct <div>
  // containing inline text/marks in this inert validation copy. Never accept
  // arbitrary divs, event attributes or nested custom blocks.
  for (const wrapper of [...template.content.querySelectorAll('li > div')]) {
    if (wrapper.attributes.length || [...wrapper.childNodes].some(child =>
      child.nodeType !== Node.TEXT_NODE
      && !(child.nodeType === Node.ELEMENT_NODE && MARKS.has(child.localName)))) {
      return reject('unsupported-list-text-wrapper');
    }
    wrapper.replaceWith(...wrapper.childNodes);
  }
  // A span with approved style/dir is a purely visual inline wrapper. Its
  // contents still need to pass the strict structural and link checks.
  for (const span of [...template.content.querySelectorAll('span')].reverse()) {
    span.replaceWith(...span.childNodes);
  }
  // Squire can leave browser-generated root text and standalone <br> caret
  // markers after heading conversions. Wrap them only in the inert validation
  // copy; never mutate saved canonical HTML or allow attributed root breaks.
  let paragraph = null;
  for (const node of [...template.content.childNodes]) {
    const inline = (node.nodeType === Node.TEXT_NODE && Boolean(node.textContent.trim()))
      || (node.nodeType === Node.ELEMENT_NODE
        && (MARKS.has(node.localName) || node.localName === 'br'));
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
  return assessSupportedNoteStructure(template.innerHTML);
}
