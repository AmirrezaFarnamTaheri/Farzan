/**
 * HTML-canonical Notes editor backed by Squire 2.
 *
 * Unlike a schema-bound editor this retains HTML as the document model. The
 * classic Notes editor remains a fallback for content Squire cannot safely represent. Never persist Squire-specific state.
 */
import Squire from 'squire-rte';
import DOMPurify from 'dompurify';
import { assessNoteForSquire } from './notesSquireCompatibility.js';
import { sanitizeNoteStyles } from './safeNoteStyles.js';

const purifier = typeof DOMPurify.sanitize === 'function' ? DOMPurify : DOMPurify(window);

function preflight(html) {
  const value = String(html ?? '');
  const result = assessNoteForSquire(value);
  if (!result.compatible) throw new Error('Incompatible note HTML for modern editor: ' + result.reason);
  return value;
}

function inertSanitize(html) {
  // Squire requires an explicit sanitizer; never depend on a script-global
  // DOMPurify or parse untrusted HTML directly into the live document.
  const cleaned = purifier.sanitize(String(html ?? ''), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['iframe', 'object', 'embed', 'svg', 'math'],
    ADD_ATTR: ['data-remote-src', 'data-ai-summary-block'],
  });
  const template = document.createElement('template');
  template.innerHTML = sanitizeNoteStyles(cleaned);
  return template.content;
}

function replaceSelectedBlocks(editor, tag) {
  editor.modifyBlocks(fragment => {
    const blocks = [...fragment.childNodes].filter(child =>
      child.nodeType === Node.ELEMENT_NODE && /^(P|DIV|H[1-6])$/.test(child.tagName));
    // Plan/validate every replacement before moving any live content. A
    // heading toolbar click must not erase the saved block's RTL direction
    // or approved alignment paint, nor propagate unsupported attributes.
    const replacements = blocks.map(child => {
      const replacement = document.createElement(tag);
      for (const attr of child.attributes) {
        if (!['dir', 'style', 'class'].includes(attr.name.toLowerCase())) {
          throw new Error('Unsupported block attribute in Squire formatting');
        }
        replacement.setAttribute(attr.name, attr.value);
      }
      if (!assessNoteForSquire(replacement.outerHTML).compatible) {
        throw new Error('Unsupported block formatting in Squire conversion');
      }
      return replacement;
    });
    blocks.forEach((child, index) => {
      const replacement = replacements[index];
      while (child.firstChild) replacement.appendChild(child.firstChild);
      child.replaceWith(replacement);
    });
    return fragment;
  });
  return true;
}

function withEditor(editor) {
  return {
    bold: () => editor.hasFormat('B') || editor.hasFormat('STRONG') ? editor.removeBold() : editor.bold(),
    italic: () => editor.hasFormat('I') || editor.hasFormat('EM') ? editor.removeItalic() : editor.italic(),
    underline: () => editor.hasFormat('U') ? editor.removeUnderline() : editor.underline(),
    strikethrough: () => editor.hasFormat('S') || editor.hasFormat('STRIKE') ? editor.removeStrikethrough() : editor.strikethrough(),
    code: () => editor.toggleCode(),
    codeblock: () => editor.code(),
    h1: () => replaceSelectedBlocks(editor, 'h1'),
    h2: () => replaceSelectedBlocks(editor, 'h2'),
    h3: () => replaceSelectedBlocks(editor, 'h3'),
    paragraph: () => replaceSelectedBlocks(editor, 'p'),
    ul: () => editor.hasFormat('UL') ? editor.removeList() : editor.makeUnorderedList(),
    ol: () => editor.hasFormat('OL') ? editor.removeList() : editor.makeOrderedList(),
    blockquote: () => editor.hasFormat('BLOCKQUOTE') ? editor.decreaseQuoteLevel() : editor.increaseQuoteLevel(),
    hr: () => editor.insertElement(document.createElement('hr')),
    undo: () => editor.undo(),
    redo: () => editor.redo(),
    clearFormat: () => editor.removeAllFormatting(),
    link: input => {
      const raw = input ?? window.prompt('Enter URL:', 'https://');
      if (!raw) return false;
      const href = String(raw).trim();
      if (!/^(?:https?:\/\/|mailto:|tel:)/i.test(href)) return false;
      try {
        if (!['http:', 'https:', 'mailto:', 'tel:'].includes(new URL(href).protocol)) return false;
      } catch { return false; }
      editor.makeLink(href);
      return true;
    },
    rtl: () => editor.setTextDirection('rtl'),
    ltr: () => editor.setTextDirection('ltr'),
    alignRight: () => editor.setTextAlignment('right'),
    alignLeft: () => editor.setTextAlignment('left'),
    alignCenter: () => editor.setTextAlignment('center'),
    fontSize: value => editor.setFontSize(value),
    fontFamily: value => editor.setFontFace(value),
    textColor: value => editor.setTextColor(value),
    highlightColor: value => editor.setHighlightColor(value),
  };
}

const inlineFormats = {
  bold: ['B', 'STRONG'], italic: ['I', 'EM'], underline: ['U'], link: ['A'],
  strikethrough: ['S', 'STRIKE', 'DEL'], code: ['CODE'],
};
const blockFormats = {
  h1: ['H1'], h2: ['H2'], h3: ['H3'], ul: ['UL'], ol: ['OL'],
  blockquote: ['BLOCKQUOTE'], codeblock: ['PRE'],
};

function editorHTML(editor) {
  const template = document.createElement('template');
  template.innerHTML = editor.getHTML();
  // Squire may create empty inline marks as caret placeholders when a format
  // is toggled with a collapsed selection. They are not saved note content.
  // Work on an inert copy only: the live editor needs its own selection state.
  for (const mark of template.content.querySelectorAll('b,strong,i,em,u,s,strike,del,span')) {
    if (!mark.childNodes.length) mark.remove();
  }
  return template.innerHTML;
}

export function createSquireNoteEditor({
  element, html = '', onUpdate = () => {},
  onPasteFallback = message => window.OpenCourseDeck?.Toast?.info?.(message),
} = {}) {
  if (!element) throw new TypeError('A modern Notes editor container is required');
  let original = preflight(html);
  const root = document.createElement('div');
  root.className = 'notes-modern-editor';
  root.setAttribute('dir', 'auto');
  root.setAttribute('role', 'textbox');
  root.setAttribute('aria-multiline', 'true');
  root.setAttribute('aria-label', 'Note content');
  root.setAttribute('spellcheck', 'true');
  const editor = new Squire(root, {
    blockTag: 'P',
    addLinks: false,
    sanitizeToDOMFragment: inertSanitize,
  });
  let dirty = false;
  let suppress = false;
  let composing = false;
  // Increment for both IME edges so queued clipboard work cannot revive
  // after a whole composition cycle that completed before its microtask.
  let compositionGeneration = 0;
  let disposed = false;
  let lastHTML = original;
  // The normalized stored document, not a one-way dirty flag, owns conflict
  // detection: native Undo can restore this exact baseline after an edit.
  let cleanBaselineHTML = original;
  const notify = () => {
    if (disposed || suppress || composing) return;
    const nextHTML = editorHTML(editor);
    if (nextHTML === lastHTML) return;
    dirty = nextHTML !== cleanBaselineHTML;
    lastHTML = nextHTML;
    onUpdate(nextHTML);
  };

  const onCompositionStart = () => {
    composing = true;
    compositionGeneration++;
  };
  const onCompositionEnd = () => {
    if (disposed) return;
    composing = false;
    compositionGeneration++;
    // Publish the final value after IME commit; a subsequent input event is
    // deduplicated by notify(), so this is safe across browser event orders.
    notify();
  };

  try {
    editor.setHTML(original);
    // Squire normalizes empty blocks and other inert HTML on mount. Compare
    // subsequent DOM changes with its rendered baseline, not the raw source,
    // or an untouched note is falsely reported as edited during handoff.
    lastHTML = editorHTML(editor);
    cleanBaselineHTML = lastHTML;
    // Fail closed if initialization loses textual information.
    const input = document.createElement('template');
    input.innerHTML = original;
    const output = document.createElement('template');
    output.innerHTML = editorHTML(editor);
    const text = value => (value?.textContent ?? '').replace(/\u200b/g, '');
    if (text(input.content) !== text(output.content)) {
      throw new Error('Editor changed initial note text during import');
    }
    editor.addEventListener('input', notify);
    root.addEventListener('compositionstart', onCompositionStart);
    root.addEventListener('compositionend', onCompositionEnd);
    editor.addEventListener('willPaste', event => {
      const candidate = event.detail?.html;
      if (typeof candidate !== 'string') return;
      if (!assessNoteForSquire(candidate).compatible) {
        // Reject unsafe/unsupported formatting without losing the clipboard's
        // meaningful text or silently pretending the paste was successful.
        // Squire's willPaste fires before it commits the HTML fragment.
        event.preventDefault();
        const clean = purifier.sanitize(candidate, {
          USE_PROFILES: { html: true },
          FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math'],
        });
        const template = document.createElement('template');
        template.innerHTML = clean;
        const plain = template.content.textContent ?? '';
        const inform = () => {
          try {
            onPasteFallback(plain
              ? 'Pasted as plain text; unsupported formatting was removed.'
              : 'This clipboard content cannot be pasted as text. Use the classic editor for images or tables.');
          } catch { /* Keep clipboard preservation independent from notifications. */ }
        };
        if (!plain) {
          inform();
        } else {
          const pasteGeneration = compositionGeneration;
          queueMicrotask(() => {
            // A stale paste must never be inserted after a note switch or
            // during/after any intervening IME composition. Do not claim a
            // paste succeeded unless the actual text insertion occurred.
            if (disposed || composing || pasteGeneration !== compositionGeneration) return;
            editor.insertPlainText(plain);
            notify();
            inform();
          });
        }
      }
    });
    element.appendChild(root);
  } catch (error) {
    editor.destroy();
    root.remove();
    throw error;
  }

  const commands = withEditor(editor);
  const facade = {
    getHTML: () => {
      // Browser contenteditable DOM can contain a committed keystroke before
      // Squire's queued input observer runs. Publish it before handing HTML to
      // any save caller. During IME, return only the last completed document,
      // never the provisional composition DOM (or a destroyed editor's DOM).
      if (!disposed && !composing) notify();
      return dirty ? lastHTML : original;
    },
    getText: () => root.textContent || '',
    commands: {
      insertContent(fragment) {
        // Neither stale asynchronous callers nor toolbar actions may alter
        // an active IME composition or a previously destroyed note session.
        if (disposed || composing) return false;
        editor.insertHTML(preflight(fragment));
        notify();
        return true;
      },
      focus(position) {
        if (disposed || composing) return false;
        if (position === 'end') editor.moveCursorToEnd();
        editor.focus();
        return true;
      },
    },
  };

  return {
    editor: facade,
    supports: command => Object.hasOwn(commands, command),
    run: (command, value) => {
      if (disposed || composing) return false;
      const action = commands[command];
      if (!action) return false;
      if (action(value) === false) return false;
      notify();
      return true;
    },
    isActive: command => {
      const formats = inlineFormats[command] || blockFormats[command];
      return formats ? formats.some(tag => editor.hasFormat(tag)) : false;
    },
    getHTML: facade.getHTML,
    // An immediate mode switch may occur before Squire's MutationObserver
    // delivers the final edit. Publish that live DOM change synchronously.
    // Never commit an unfinished IME composition during a mode switch.
    syncChanges() {
      if (composing) return false;
      notify();
      return true;
    },
    setContent(value) {
      if (disposed) throw new Error('Cannot replace a destroyed note editor');
      // Squire is HTML-canonical; a remote refresh cannot overwrite the
      // intermediate text held by an active Chinese/Persian IME session.
      if (composing) throw new Error('Cannot replace note during IME composition');
      const next = preflight(value);
      // The native DOM can already hold a committed keystroke before Squire's
      // MutationObserver or input listener reports it. Inspect that live DOM
      // synchronously, and publish the local edit before allowing a remote
      // refresh to replace any content. This is not safe mid-IME (blocked above).
      notify();
      // A remote refresh, restore or note switch cannot silently discard
      // changes the Squire editor has already surfaced to its save pipeline.
      // A clean initial editor is still replaceable, and an identical refresh
      // leaves the current selection/history intact.
      if (dirty) {
        if (next === editorHTML(editor)) return false;
        throw new Error('Cannot overwrite unsaved note edits with a stale refresh');
      }
      // An identical canonical refresh of a clean note is not a replacement.
      // Reinitializing Squire here destroys the user's live DOM range/caret
      // and can reset undo history even though saved content did not change.
      if (next === original) return false;
      suppress = true;
      try {
        editor.setHTML(next);
        original = next;
        lastHTML = editorHTML(editor);
        cleanBaselineHTML = lastHTML;
        dirty = false;
      } finally {
        suppress = false;
      }
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      editor.removeEventListener('input', notify);
      root.removeEventListener('compositionstart', onCompositionStart);
      root.removeEventListener('compositionend', onCompositionEnd);
      editor.destroy();
      root.remove();
    },
  };
}

