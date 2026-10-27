/**
 * Lossless-compatible subset of the existing Notes editor, backed by Tiptap 3.
 *
 * This is a separate integration seam. Legacy HTML remains canonical and the
 * existing editor remains in charge until both content compatibility and
 * feature parity are proven. Never serialize ProseMirror JSON into a note.
 */
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { assessNoteForTiptap } from './notesEditorCompatibility.js';

const COMMANDS = Object.freeze({
  bold: editor => editor.chain().focus().toggleBold().run(),
  italic: editor => editor.chain().focus().toggleItalic().run(),
  underline: editor => editor.chain().focus().toggleUnderline().run(),
  strikethrough: editor => editor.chain().focus().toggleStrike().run(),
  h1: editor => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  h2: editor => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  h3: editor => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  paragraph: editor => editor.chain().focus().setParagraph().run(),
  ul: editor => editor.chain().focus().toggleBulletList().run(),
  ol: editor => editor.chain().focus().toggleOrderedList().run(),
  blockquote: editor => editor.chain().focus().toggleBlockquote().run(),
  code: editor => editor.chain().focus().toggleCode().run(),
  codeblock: editor => editor.chain().focus().toggleCodeBlock().run(),
  hr: editor => editor.chain().focus().setHorizontalRule().run(),
  undo: editor => editor.chain().focus().undo().run(),
  redo: editor => editor.chain().focus().redo().run(),
  clearFormat: editor => editor.chain().focus().unsetAllMarks().clearNodes().run(),
});

export function createTiptapNoteEditor({ element, html = '', onUpdate = () => {} } = {}) {
  if (!element) throw new TypeError('Tiptap requires an editor container');
  const check = assessNoteForTiptap(html);
  if (!check.compatible) {
    throw new Error('Incompatible note HTML for Tiptap: ' + check.reason);
  }

  let invalidContent = null;
  const editor = new Editor({
    element,
    extensions: [StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: false },
    })],
    content: String(html ?? ''),
    enableContentCheck: true,
    onContentError: ({ editor: instance, error }) => {
      invalidContent = error || new Error('Unsupported note content');
      instance.setEditable(false, false);
    },
    onUpdate: ({ editor: instance }) => {
      if (!invalidContent) onUpdate(instance.getHTML());
    },
  });
  if (invalidContent) {
    editor.destroy();
    throw new Error('Incompatible note HTML for Tiptap: ' + invalidContent.message);
  }

  return {
    editor,
    supports: command => Object.hasOwn(COMMANDS, command),
    run: (command, payload) => COMMANDS[command]?.(editor, payload) ?? false,
    isActive: command => {
      const mapped = {
        h1: ['heading', { level: 1 }], h2: ['heading', { level: 2 }],
        h3: ['heading', { level: 3 }], ul: ['bulletList'],
        ol: ['orderedList'], strikethrough: ['strike'], codeblock: ['codeBlock'],
      }[command];
      return mapped
        ? editor.isActive(...mapped)
        : editor.isActive(command);
    },
    getHTML: () => editor.getHTML(),
    setContent: content => {
      const candidate = assessNoteForTiptap(content);
      if (!candidate.compatible) throw new Error('Incompatible note HTML for Tiptap: ' + candidate.reason);
      editor.commands.setContent(String(content ?? ''), {
        emitUpdate: false,
        errorOnInvalidContent: true,
        parseOptions: { preserveWhitespace: 'full' },
      });
    },
    destroy: () => editor.destroy(),
  };
}
