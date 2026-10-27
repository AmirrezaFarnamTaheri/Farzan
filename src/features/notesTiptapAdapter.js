/**
 * Experimental Notes adapter built directly on ProseMirror's maintained core.
 *
 * This module remains opt-in and draft-only. Legacy sanitized HTML is canonical;
 * unsupported structures must be rejected before parsing, never silently
 * rewritten. The adapter owns only a small compatible subset of editing.
 */
import { Schema, DOMParser as PMDOMParser, DOMSerializer } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { EditorView } from '@tiptap/pm/view';
import { keymap } from '@tiptap/pm/keymap';
import { history, undo, redo } from '@tiptap/pm/history';
import { baseKeymap, setBlockType, toggleMark, wrapIn, lift } from '@tiptap/pm/commands';
import { wrapInList, liftListItem } from '@tiptap/pm/schema-list';
import { assessNoteForTiptap } from './notesEditorCompatibility.js';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', parseDOM: [{ tag: 'p' }], toDOM: () => ['p', 0] },
    blockquote: { content: 'block+', group: 'block', defining: true, parseDOM: [{ tag: 'blockquote' }], toDOM: () => ['blockquote', 0] },
    horizontal_rule: { group: 'block', parseDOM: [{ tag: 'hr' }], toDOM: () => ['hr'] },
    heading: {
      attrs: { level: { default: 1 } },
      content: 'inline*', group: 'block', defining: true,
      parseDOM: [1, 2, 3].map(level => ({ tag: 'h' + level, attrs: { level } })),
      toDOM: node => ['h' + node.attrs.level, 0],
    },
    code_block: {
      content: 'text*', marks: '', group: 'block', code: true,
      parseDOM: [{ tag: 'pre' }], toDOM: () => ['pre', ['code', 0]],
    },
    bullet_list: { content: 'list_item+', group: 'block', parseDOM: [{ tag: 'ul' }], toDOM: () => ['ul', 0] },
    ordered_list: {
      content: 'list_item+', group: 'block',
      attrs: { order: { default: 1 } },
      parseDOM: [{ tag: 'ol', getAttrs: node => ({ order: Number(node.getAttribute('start')) || 1 }) }],
      toDOM: node => node.attrs.order === 1 ? ['ol', 0] : ['ol', { start: node.attrs.order }, 0],
    },
    list_item: { content: 'paragraph block*', defining: true, parseDOM: [{ tag: 'li' }], toDOM: () => ['li', 0] },
    text: { group: 'inline' },
    hard_break: { inline: true, group: 'inline', selectable: false, parseDOM: [{ tag: 'br' }], toDOM: () => ['br'] },
  },
  marks: {
    strong: { parseDOM: [{ tag: 'strong' }, { tag: 'b' }], toDOM: () => ['strong', 0] },
    em: { parseDOM: [{ tag: 'em' }, { tag: 'i' }], toDOM: () => ['em', 0] },
    underline: { parseDOM: [{ tag: 'u' }], toDOM: () => ['u', 0] },
    strike: { parseDOM: [{ tag: 's' }, { tag: 'strike' }, { tag: 'del' }], toDOM: () => ['s', 0] },
    code: { code: true, parseDOM: [{ tag: 'code' }], toDOM: () => ['code', 0] },
    link: {
      attrs: { href: {} }, inclusive: false,
      parseDOM: [{ tag: 'a[href]', getAttrs: element => ({ href: element.getAttribute('href') }) }],
      toDOM: mark => ['a', { href: mark.attrs.href }, 0],
    },
  },
});

function compatibleDocument(html) {
  const result = assessNoteForTiptap(html);
  if (!result.compatible) throw new Error('Incompatible note HTML for ProseMirror: ' + result.reason);
  const template = document.createElement('template');
  template.innerHTML = String(html ?? '');
  const doc = PMDOMParser.fromSchema(schema).parse(template.content);
  // This is intentionally conservative: if a future schema silently drops
  // text, never mount it over the existing editable or allow it to be saved.
  if (doc.textContent !== template.content.textContent) {
    throw new Error('Incompatible note HTML for ProseMirror: text-normalization');
  }
  return doc;
}

function htmlFromDocument(doc) {
  const container = document.createElement('div');
  container.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(doc.content));
  return container.innerHTML;
}

function insideType(state, name) {
  for (let depth = state.selection.$from.depth; depth >= 0; depth -= 1) {
    if (state.selection.$from.node(depth).type === schema.nodes[name]) return true;
  }
  return false;
}

function toggleList(name) {
  return (state, dispatch, view) => insideType(state, name)
    ? liftListItem(schema.nodes.list_item)(state, dispatch, view)
    : wrapInList(schema.nodes[name])(state, dispatch, view);
}

const COMMANDS = Object.freeze({
  bold: toggleMark(schema.marks.strong),
  italic: toggleMark(schema.marks.em),
  underline: toggleMark(schema.marks.underline),
  strikethrough: toggleMark(schema.marks.strike),
  code: toggleMark(schema.marks.code),
  h1: setBlockType(schema.nodes.heading, { level: 1 }),
  h2: setBlockType(schema.nodes.heading, { level: 2 }),
  h3: setBlockType(schema.nodes.heading, { level: 3 }),
  paragraph: setBlockType(schema.nodes.paragraph),
  ul: toggleList('bullet_list'),
  ol: toggleList('ordered_list'),
  blockquote: (state, dispatch, view) => insideType(state, 'blockquote')
    ? lift(state, dispatch, view) : wrapIn(schema.nodes.blockquote)(state, dispatch, view),
  codeblock: setBlockType(schema.nodes.code_block),
  hr: (state, dispatch) => {
    if (dispatch) dispatch(state.tr.replaceSelectionWith(schema.nodes.horizontal_rule.create()));
    return true;
  },
  undo,
  redo,
  clearFormat: (state, dispatch) => {
    const { from, to, empty } = state.selection;
    let transaction = state.tr.removeMark(from, to);
    if (empty) transaction = transaction.setStoredMarks([]);
    transaction = transaction.setBlockType(from, to, schema.nodes.paragraph);
    if (dispatch) dispatch(transaction);
    return true;
  },
});

function stateFor(doc) {
  return EditorState.create({
    schema, doc,
    plugins: [
      history(),
      keymap({
        'Mod-z': undo, 'Shift-Mod-z': redo, 'Mod-y': redo,
        'Mod-b': COMMANDS.bold, 'Mod-i': COMMANDS.italic, 'Mod-u': COMMANDS.underline,
      }),
      keymap(baseKeymap),
    ],
  });
}

export function createTiptapNoteEditor({ element, html = '', onUpdate = () => {} } = {}) {
  if (!element) throw new TypeError('ProseMirror requires an editor container');
  const initial = compatibleDocument(html);
  let view;
  view = new EditorView(element, {
    state: stateFor(initial),
    dispatchTransaction(transaction) {
      view.updateState(view.state.apply(transaction));
      if (transaction.docChanged) onUpdate(htmlFromDocument(view.state.doc));
    },
  });

  const facade = {
    getHTML: () => htmlFromDocument(view.state.doc),
    getText: () => view.state.doc.textBetween(0, view.state.doc.content.size, '\n'),
    commands: {
      insertContent(fragment) {
        const candidate = compatibleDocument(fragment);
        view.dispatch(view.state.tr.replaceSelectionWith(candidate.content.firstChild || schema.nodes.paragraph.create()));
        return true;
      },
      focus(position) {
        if (position === 'end') {
          view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
        }
        view.focus();
        return true;
      },
    },
  };

  return {
    editor: facade,
    supports: command => Object.hasOwn(COMMANDS, command),
    run: command => {
      const action = COMMANDS[command];
      return action ? action(view.state, view.dispatch, view) : false;
    },
    isActive: command => {
      const headings = { h1: 1, h2: 2, h3: 3 };
      if (Object.hasOwn(headings, command)) {
        return view.state.selection.$from.parent.type === schema.nodes.heading
          && view.state.selection.$from.parent.attrs.level === headings[command];
      }
      const lists = { ul: 'bullet_list', ol: 'ordered_list', blockquote: 'blockquote', codeblock: 'code_block' };
      if (Object.hasOwn(lists, command)) return insideType(view.state, lists[command]);
      const marks = { bold: 'strong', italic: 'em', underline: 'underline', strikethrough: 'strike', code: 'code' };
      if (!Object.hasOwn(marks, command)) return false;
      const type = schema.marks[marks[command]];
      const { from, to, empty } = view.state.selection;
      return empty
        ? !!(view.state.storedMarks || view.state.selection.$from.marks()).some(mark => mark.type === type)
        : view.state.doc.rangeHasMark(from, to, type);
    },
    getHTML: facade.getHTML,
    setContent: content => {
      const candidate = compatibleDocument(content);
      view.updateState(stateFor(candidate));
    },
    destroy: () => view.destroy(),
  };
}
