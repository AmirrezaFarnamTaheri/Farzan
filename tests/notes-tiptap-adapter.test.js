import { describe, expect, it, vi } from 'vitest';
import { createSquireNoteEditor, createTiptapNoteEditor } from '../src/features/notesSquireAdapter.js';
import { assessNoteForSquire } from '../src/features/notesSquireCompatibility.js';

describe('Squire HTML-canonical edit adapter', () => {
  it('exports a Squire-named entrypoint without breaking the legacy adapter API', () => {
    expect(createSquireNoteEditor).toBe(createTiptapNoteEditor);
    const instance = createSquireNoteEditor({
      element: document.createElement('div'), html: '<p>Safe rich text</p>',
    });
    try {
      expect(instance.getHTML()).toContain('Safe rich text');
    } finally { instance.destroy(); }
  });

  it('accepts ordinary browser root text but still rejects unsupported tables', () => {
    for (const value of ['فیزیولوژی قلب 你好世界', '<strong>Important</strong> plain text', '<p>Intro</p> trailing words']) {
      expect(assessNoteForSquire(value).compatible).toBe(true);
    }
    expect(assessNoteForSquire('<table><tr><td>70 mL</td></tr></table>').compatible).toBe(false);
  });

  it('does not rewrite a saved root-text note when switching editors without edits', () => {
    const original = 'فیزیولوژی قلب 你好世界';
    const listener = vi.fn();
    const instance = createTiptapNoteEditor({
      element: document.createElement('div'), html: original, onUpdate: listener,
    });
    try {
      expect(instance.syncChanges()).toBe(true);
      expect(listener).not.toHaveBeenCalled();
      expect(instance.getHTML()).toBe(original);
    } finally { instance.destroy(); }
  });
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

  it('inserts all blocks in a compatible multi-paragraph paste without silently truncating content', () => {
    const element = document.createElement('div');
    const updates = vi.fn();
    const instance = createTiptapNoteEditor({
      element, html: '<p>Original note</p>', onUpdate: updates,
    });
    try {
      instance.editor.commands.insertContent('<p>First inserted paragraph</p><p>Second inserted paragraph</p>');
      const html = instance.getHTML();
      expect(html).toContain('First inserted paragraph');
      expect(html).toContain('Second inserted paragraph');
      expect(updates).toHaveBeenCalledWith(expect.stringContaining('Second inserted paragraph'));
    } finally { instance.destroy(); }
  });

  it('supports native rich text direction and typography commands without discarding HTML', () => {
    const element = document.createElement('div');
    const instance = createTiptapNoteEditor({ element, html: '<p>عنوان فارسی</p>' });
    try {
      for (const command of ['rtl', 'ltr', 'fontSize', 'fontFamily', 'textColor', 'highlightColor', 'alignRight']) {
        expect(instance.supports(command)).toBe(true);
      }
      expect(instance.run('rtl')).toBe(true);
      expect(instance.getHTML()).toContain('عنوان فارسی');
      expect(instance.getHTML()).toMatch(/dir=["']rtl["']/);
    } finally { instance.destroy(); }
  });

  it('does not save empty formatting marks as user content', () => {
    const element = document.createElement('div');
    const instance = createTiptapNoteEditor({
      element, html: '<h2>فیزیولوژی قلب</h2><p><strong>Heart</strong></p>',
    });
    try {
      expect(instance.run('bold')).toBe(true);
      expect(instance.run('h3')).toBe(true);
      expect(instance.getHTML()).toContain('<h3>فیزیولوژی قلب</h3>');
      expect(instance.getHTML()).not.toMatch(/<(?:b|strong|i|em|u|span)>\s*<\/(?:b|strong|i|em|u|span)>/i);
      expect(instance.getHTML()).toContain('Heart');
    } finally { instance.destroy(); }
  });

  it('preserves RTL, alignment, color and font size on the first persisted edit', () => {
    const original = '<p dir="rtl" style="text-align:right">'
      + '<span style="font-size:18px;color:#ff0000">عنوان فارسی</span></p>';
    const element = document.createElement('div');
    const onUpdate = vi.fn();
    const instance = createTiptapNoteEditor({ element, html: original, onUpdate });
    try {
      // Simulate a real browser contenteditable mutation before Squire's
      // queued observer fires. A first save must retain legacy rich formatting.
      const paragraph = element.querySelector('.notes-modern-editor p');
      expect(paragraph).not.toBeNull();
      paragraph.append(document.createTextNode(' و یادداشت تازه'));
      expect(instance.syncChanges()).toBe(true);
      const html = instance.getHTML();
      expect(onUpdate).toHaveBeenCalledWith(html);
      const inert = document.createElement('template');
      inert.innerHTML = html;
      const block = inert.content.querySelector('p[dir="rtl"]');
      expect(block).not.toBeNull();
      expect(block.style.textAlign).toBe('right');
      // Squire may split one styled span into nested color/size wrappers.
      // Check the effective inherited styling of the text, not wrapper shape.
      const candidates = [...block.querySelectorAll('span')]
        .filter(node => node.textContent.includes('عنوان فارسی'));
      const leaf = candidates.find(node => !candidates.some(other => other !== node && node.contains(other)));
      expect(leaf).toBeDefined();
      const effective = { fontSize: '', color: '' };
      for (let node = leaf; node; node = node.parentElement) {
        effective.fontSize ||= node.style?.fontSize || '';
        effective.color ||= node.style?.color || '';
      }
      expect(effective.fontSize).toBe('18px');
      expect(effective.color).toBe('rgb(255, 0, 0)');
      expect(block.textContent).toContain('یادداشت تازه');
    } finally { instance.destroy(); }
  });

  it('reopens supported direction and typography without silently losing styled text', () => {
    const html = '<p dir="rtl" style="text-align:right"><span style="font-size:18px;color:#ff0000">عنوان فارسی</span></p>';
    const parent = document.createElement('div');
    const first = createTiptapNoteEditor({ element: parent, html });
    try {
      expect(first.getHTML()).toContain('عنوان فارسی');
      expect(first.run('alignRight')).toBe(true);
      const edited = first.getHTML();
      const second = createTiptapNoteEditor({ element: document.createElement('div'), html: edited });
      try {
        expect(second.getHTML()).toContain('عنوان فارسی');
        expect(second.getHTML()).toMatch(/dir=["']rtl["']/);
      } finally { second.destroy(); }
    } finally { first.destroy(); }
  });

  it('rejects unsafe link destinations rather than inserting executable URLs', () => {
    const element = document.createElement('div');
    const instance = createTiptapNoteEditor({ element, html: '<p>Reference</p>' });
    try {
      expect(instance.supports('link')).toBe(true);
      expect(instance.run('link', 'javascript:alert(1)')).toBe(false);
      expect(instance.getHTML()).not.toContain('javascript:');
      expect(instance.getHTML()).toContain('Reference');
    } finally { instance.destroy(); }
  });

  it('preserves pasted text when incompatible rich HTML is rejected', async () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const onUpdate = vi.fn();
    const onPasteFallback = vi.fn();
    const instance = createTiptapNoteEditor({
      element, html: '<p>Before</p>', onUpdate, onPasteFallback,
    });
    try {
      const paste = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(paste, 'clipboardData', { value: {
        items: null, types: ['text/html'],
        getData: type => type === 'text/html'
          ? '<table><tbody><tr><td>Kept plaintext</td></tr></tbody></table>' : '',
      } });
      element.querySelector('.notes-modern-editor').dispatchEvent(paste);
      await Promise.resolve();
      await Promise.resolve();
      expect(paste.defaultPrevented).toBe(true);
      expect(instance.getHTML()).toContain('Kept plaintext');
      expect(onUpdate).toHaveBeenCalled();
      expect(onPasteFallback).toHaveBeenCalled();
    } finally {
      instance.destroy();
      element.remove();
    }
  });

  it('round-trips inserted text through native undo and redo without losing content', () => {
    const instance = createTiptapNoteEditor({
      element: document.createElement('div'), html: '<p>Before editing</p>',
    });
    try {
      instance.editor.commands.insertContent('<p>Inserted after selection</p>');
      expect(instance.getHTML()).toContain('Inserted after selection');
      expect(instance.run('undo')).toBe(true);
      expect(instance.getHTML()).not.toContain('Inserted after selection');
      expect(instance.run('redo')).toBe(true);
      expect(instance.getHTML()).toContain('Inserted after selection');
    } finally { instance.destroy(); }
  });

  it('notifies only once composition is complete, never for unfinished IME text', () => {
    const updates = vi.fn();
    const element = document.createElement('div');
    const instance = createTiptapNoteEditor({
      element, html: '<p>Original</p>', onUpdate: updates,
    });
    try {
      const root = element.querySelector('.notes-modern-editor');
      root.dispatchEvent(new Event('compositionstart', { bubbles: true }));
      root.querySelector('p').textContent = 'متن ناتمام';
      root.dispatchEvent(new Event('input', { bubbles: true }));
      expect(updates).not.toHaveBeenCalled();

      root.querySelector('p').textContent = 'متن کامل';
      root.dispatchEvent(new Event('compositionend', { bubbles: true }));
      expect(updates).toHaveBeenCalledWith(expect.stringContaining('متن کامل'));
      expect(updates).toHaveBeenCalledTimes(1);
    } finally { instance.destroy(); }
  });

  it('does not notify about Squire normalization of untouched initial HTML', () => {
    for (const html of ['', '<p></p>', '<p><br></p>']) {
      const updates = vi.fn();
      const instance = createTiptapNoteEditor({
        element: document.createElement('div'), html, onUpdate: updates,
      });
      try {
        expect(instance.syncChanges()).toBe(true);
        expect(updates).not.toHaveBeenCalled();
        expect(instance.getHTML()).toBe(html);
      } finally { instance.destroy(); }
    }
  });

  it('uses the rendered baseline after setContent without treating normalization as editing', () => {
    const updates = vi.fn();
    const instance = createTiptapNoteEditor({
      element: document.createElement('div'), html: '<p>Before</p>', onUpdate: updates,
    });
    try {
      instance.setContent('<p></p>');
      expect(instance.syncChanges()).toBe(true);
      expect(instance.getHTML()).toBe('<p></p>');
      expect(updates).not.toHaveBeenCalled();
    } finally { instance.destroy(); }
  });

  it('flushes an unobserved native edit before an editor handoff', () => {
    const updates = vi.fn();
    const el = document.createElement('div');
    const instance = createTiptapNoteEditor({
      element: el, html: '<p>Previous text</p>', onUpdate: updates,
    });
    try {
      el.querySelector('.notes-modern-editor p').textContent = 'Latest text';
      expect(instance.syncChanges()).toBe(true);
      expect(instance.getHTML()).toContain('Latest text');
      expect(updates).toHaveBeenCalledWith(expect.stringContaining('Latest text'));
    } finally { instance.destroy(); }
  });

  it('refuses an editor handoff during unfinished IME composition', () => {
    const el = document.createElement('div');
    const instance = createTiptapNoteEditor({
      element: el, html: '<p>Previous text</p>',
    });
    try {
      const root = el.querySelector('.notes-modern-editor');
      root.dispatchEvent(new Event('compositionstart', { bubbles: true }));
      root.querySelector('p').textContent = '中间输入';
      expect(instance.syncChanges()).toBe(false);
      root.dispatchEvent(new Event('compositionend', { bubbles: true }));
      expect(instance.syncChanges()).toBe(true);
      expect(instance.getHTML()).toContain('中间输入');
    } finally { instance.destroy(); }
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

  it('refuses a stale remote setContent while an IME composition is unfinished', () => {
    const element = document.createElement('div');
    const onUpdate = vi.fn();
    const instance = createSquireNoteEditor({
      element, html: '<p>Original saved note</p>', onUpdate,
    });
    try {
      const root = element.querySelector('.notes-modern-editor');
      root.dispatchEvent(new Event('compositionstart', { bubbles: true }));
      root.querySelector('p').textContent = '未提交 متن فارسی';
      expect(() => instance.setContent('<p>Stale remote snapshot</p>'))
        .toThrow(/composition/i);
      expect(root.textContent).toContain('未提交 متن فارسی');
      expect(onUpdate).not.toHaveBeenCalled();
      root.dispatchEvent(new Event('compositionend', { bubbles: true }));
      expect(instance.syncChanges()).toBe(true);
      expect(instance.getHTML()).toContain('未提交 متن فارسی');
      expect(instance.getHTML()).not.toContain('Stale remote snapshot');
    } finally { instance.destroy(); }
  });

  it('cancels a queued plain-text paste after the editor is destroyed', async () => {
    const element = document.createElement('div');
    const onUpdate = vi.fn();
    const instance = createSquireNoteEditor({
      element, html: '<p>Before</p>', onUpdate, onPasteFallback: vi.fn(),
    });
    const root = element.querySelector('.notes-modern-editor');
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: {
      items: null, types: ['text/html'],
      getData: type => type === 'text/html'
        ? '<table><tr><td>Cannot commit to a closed note</td></tr></table>' : '',
    } });
    root.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(true);
    instance.destroy();
    await Promise.resolve();
    await Promise.resolve();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(element.textContent).not.toContain('Cannot commit to a closed note');
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
