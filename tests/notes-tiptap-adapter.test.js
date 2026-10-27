import { describe, expect, it, vi } from 'vitest';
import { createTiptapNoteEditor } from '../src/features/notesTiptapAdapter.js';

describe('Tiptap StarterKit edit adapter', () => {
  it('edits compatible HTML and retains rich content and Unicode text', () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const onUpdate = vi.fn();
    const instance = createTiptapNoteEditor({
      element,
      html: '<h2>فیزیولوژی قلب</h2><p><strong>Heart</strong> 你好世界</p>',
      onUpdate,
    });
    try {
      expect(instance.editor.getHTML()).toContain('فیزیولوژی قلب');
      expect(instance.editor.getHTML()).toContain('<strong>Heart</strong>');
      expect(instance.editor.getHTML()).toContain('你好世界');
      expect(instance.run('bold')).toBe(true);
      expect(typeof instance.isActive('bold')).toBe('boolean');
      expect(instance.run('h3')).toBe(true);
      expect(instance.editor.getHTML()).toContain('<h3>فیزیولوژی قلب</h3>');
      instance.editor.commands.insertContent('<p>مراجعه</p>');
      expect(onUpdate).toHaveBeenCalled();
      expect(instance.getHTML()).toContain('مراجعه');
    } finally {
      instance.destroy();
      element.remove();
    }
  });

  it('refuses lossy HTML before touching the provided DOM or mounting an editor', () => {
    const element = document.createElement('div');
    element.innerHTML = '<p>Existing untouched draft</p>';
    expect(() => createTiptapNoteEditor({
      element,
      html: '<p>Important</p><table><tr><td>Saved value</td></tr></table>',
    })).toThrow(/incompatible/i);
    expect(element.innerHTML).toBe('<p>Existing untouched draft</p>');
  });

  it('supports core formatting commands and reuses ProseMirror undo/redo', () => {
    const element = document.createElement('div');
    const instance = createTiptapNoteEditor({ element, html: '<p>Initial</p>' });
    try {
      for (const name of ['bold','italic','underline','strikethrough','h1','h2','h3','paragraph',
        'ul','ol','blockquote','code','codeblock','hr','undo','redo','clearFormat']) {
        expect(instance.supports(name)).toBe(true);
      }
      expect(instance.supports('table')).toBe(false);
      expect(instance.supports('image')).toBe(false);
      expect(instance.getHTML()).toContain('Initial');
    } finally { instance.destroy(); }
  });

  it('silences content-change notifications when initializing or restoring content', () => {
    const listener = vi.fn();
    const instance = createTiptapNoteEditor({ element: document.createElement('div'), html: '<p>A</p>', onUpdate: listener });
    try {
      instance.setContent('<p>B</p>');
      expect(instance.getHTML()).toContain('<p>B</p>');
      expect(listener).not.toHaveBeenCalled();
    } finally { instance.destroy(); }
  });
});
