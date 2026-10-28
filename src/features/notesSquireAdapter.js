/**
 * HTML-canonical Notes editor experiment backed by Squire 2.
 *
 * Unlike a schema-bound editor this retains HTML as the document model. The
 * existing Notes editor remains the fallback until real-world parity and the
 * production bundle budget are verified. Never persist Squire-specific state.
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
    for (const child of [...fragment.childNodes]) {
      if (child.nodeType !== Node.ELEMENT_NODE || !/^(P|DIV|H[1-6])$/.test(child.tagName)) continue;
      const replacement = document.createElement(tag);
      while (child.firstChild) replacement.appendChild(child.firstChild);
      child.replaceWith(replacement);
    }
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
  bold: ['B', 'STRONG'], italic: ['I', 'EM'], underline: ['U'],
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

export function createTiptapNoteEditor({ element, html = '', onUpdate = () => {} } = {}) {
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
  let lastHTML = original;
  const notify = () => {
    if (suppress) return;
    const nextHTML = editorHTML(editor);
    if (nextHTML === lastHTML) return;
    dirty = true;
    lastHTML = nextHTML;
    onUpdate(nextHTML);
  };

  try {
    editor.setHTML(original);
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
    editor.addEventListener('willPaste', event => {
      const candidate = event.detail?.html;
      if (typeof candidate !== 'string') return;
      if (!assessNoteForSquire(candidate).compatible) {
        event.preventDefault();
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
    getHTML: () => dirty ? editorHTML(editor) : original,
    getText: () => root.textContent || '',
    commands: {
      insertContent(fragment) {
        editor.insertHTML(preflight(fragment));
        notify();
        return true;
      },
      focus(position) {
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
      const action = commands[command];
      if (!action) return false;
      action(value);
      notify();
      return true;
    },
    isActive: command => {
      const formats = inlineFormats[command] || blockFormats[command];
      return formats ? formats.some(tag => editor.hasFormat(tag)) : false;
    },
    getHTML: facade.getHTML,
    setContent(value) {
      const next = preflight(value);
      suppress = true;
      try {
        editor.setHTML(next);
        original = next;
        lastHTML = next;
        dirty = false;
      } finally {
        suppress = false;
      }
    },
    destroy() {
      editor.removeEventListener('input', notify);
      editor.destroy();
      root.remove();
    },
  };
}
