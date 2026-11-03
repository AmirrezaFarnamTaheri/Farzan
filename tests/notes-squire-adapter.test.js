import { describe, expect, it, vi } from 'vitest';
import { createSquireNoteEditor } from '../src/features/notesSquireAdapter.js';
import { assessNoteForSquire } from '../src/features/notesSquireCompatibility.js';

describe('Squire HTML-canonical edit adapter', () => {
  it.each([
    [{ content: '<p>Rich</p>' }],
    [['<p>Rich</p>']],
    [42],
  ])('rejects a non-HTML canonical payload before replacing saved editor state (%j)', value => {
    const host = document.createElement('div');
    host.innerHTML = '<p>Existing saved body</p>';
    const originalHost = host.innerHTML;
    expect(() => createSquireNoteEditor({ element: host, html: value })).toThrow(/html|content|type/i);
    expect(host.innerHTML).toBe(originalHost);

    const onUpdate = vi.fn();
    const editor = createSquireNoteEditor({
      element: host, html: '<p>Original intact</p>', onUpdate,
    });
    try {
      const before = editor.getHTML();
      expect(() => editor.setContent(value)).toThrow(/html|content|type/i);
      expect(editor.getHTML()).toBe(before);
      expect(() => editor.editor.commands.insertContent(value)).toThrow(/html|content|type/i);
      expect(editor.getHTML()).toBe(before);
      expect(onUpdate).not.toHaveBeenCalled();
    } finally { editor.destroy(); }
  });

  it('exports only the Squire editor entrypoint', () => {
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
    const instance = createSquireNoteEditor({
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
    const instance = createSquireNoteEditor({
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
    const instance = createSquireNoteEditor({
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
    const instance = createSquireNoteEditor({ element, html: '<p>عنوان فارسی</p>' });
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
    const instance = createSquireNoteEditor({
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
    const instance = createSquireNoteEditor({ element, html: original, onUpdate });
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
    const first = createSquireNoteEditor({ element: parent, html });
    try {
      expect(first.getHTML()).toContain('عنوان فارسی');
      expect(first.run('alignRight')).toBe(true);
      const edited = first.getHTML();
      const second = createSquireNoteEditor({ element: document.createElement('div'), html: edited });
      try {
        expect(second.getHTML()).toContain('عنوان فارسی');
        expect(second.getHTML()).toMatch(/dir=["']rtl["']/);
      } finally { second.destroy(); }
    } finally { first.destroy(); }
  });

  it('rejects unsafe link destinations rather than inserting executable URLs', () => {
    const element = document.createElement('div');
    const instance = createSquireNoteEditor({ element, html: '<p>Reference</p>' });
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
    const instance = createSquireNoteEditor({
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

  it('returns the committed live DOM after a native edit before the delayed input observer fires', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const updates = vi.fn();
    const editor = createSquireNoteEditor({
      element: host, html: '<p>Previous saved note</p>', onUpdate: updates,
    });
    try {
      // Real contenteditable engines can mutate a paragraph before their
      // MutationObserver/input callback. A save caller reading getHTML()
      // must never receive the stale original HTML.
      const paragraph = host.querySelector('.notes-modern-editor p');
      paragraph.append(document.createTextNode(' نوشته تازه'));
      const saved = editor.getHTML();
      expect(saved).toContain('Previous saved note');
      expect(saved).toContain('نوشته تازه');
      expect(updates).toHaveBeenCalledExactlyOnceWith(saved);
      expect(editor.getHTML()).toBe(saved);
      expect(updates).toHaveBeenCalledTimes(1);
    } finally { editor.destroy(); host.remove(); }
  });

  it('never exposes provisional Persian/Chinese composition text through a canonical read', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const editor = createSquireNoteEditor({ element: host, html: '<p>Saved body</p>' });
    const root = host.querySelector('.notes-modern-editor');
    try {
      const p = root.querySelector('p');
      p.append(document.createTextNode(' committed'));
      editor.syncChanges();
      const beforeIME = editor.getHTML();
      root.dispatchEvent(new Event('compositionstart', { bubbles: true }));
      p.append(document.createTextNode(' provisional فارسی 你好'));
      expect(editor.getHTML()).toBe(beforeIME);
      root.dispatchEvent(new Event('compositionend', { bubbles: true }));
      expect(editor.getHTML()).toContain('provisional فارسی 你好');
    } finally { editor.destroy(); host.remove(); }
  });

  it('round-trips inserted text through native undo and redo without losing content', () => {
    const instance = createSquireNoteEditor({
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

  it('allows a new saved revision after undo restores the untouched canonical note', () => {
    const element = document.createElement('div');
    const updates = vi.fn();
    const original = '<p>Previous saved note</p>';
    const instance = createSquireNoteEditor({ element, html: original, onUpdate: updates });
    try {
      instance.editor.commands.insertContent('<p>Local edit to undo</p>');
      expect(instance.getHTML()).toContain('Local edit to undo');
      expect(instance.run('undo')).toBe(true);
      expect(instance.getHTML()).toBe(original);
      expect(instance.setContent('<p>New version from the synced Notes store</p>')).not.toBe(false);
      expect(instance.getHTML()).toContain('New version from the synced Notes store');
      expect(element.textContent).not.toContain('Local edit to undo');
    } finally { instance.destroy(); }
  });

  it('still rejects an unrelated remote revision after redo reintroduces local note changes', () => {
    const element = document.createElement('div');
    const instance = createSquireNoteEditor({ element, html: '<p>Original</p>' });
    try {
      instance.editor.commands.insertContent('<p>Local revision</p>');
      expect(instance.run('undo')).toBe(true);
      expect(instance.run('redo')).toBe(true);
      expect(instance.getHTML()).toContain('Local revision');
      expect(() => instance.setContent('<p>Conflicting remote revision</p>'))
        .toThrow(/unsaved|stale|overwrite/i);
      expect(instance.getHTML()).toContain('Local revision');
      expect(instance.getHTML()).not.toContain('Conflicting remote revision');
    } finally { instance.destroy(); }
  });

  it('notifies only once composition is complete, never for unfinished IME text', () => {
    const updates = vi.fn();
    const element = document.createElement('div');
    const instance = createSquireNoteEditor({
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
      const instance = createSquireNoteEditor({
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
    const instance = createSquireNoteEditor({
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
    const instance = createSquireNoteEditor({
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
    const instance = createSquireNoteEditor({
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
    expect(() => createSquireNoteEditor({
      element,
      html: '<p>Important</p><table><tr><td>Saved value</td></tr></table>',
    })).toThrow(/incompatible/i);
    expect(element.innerHTML).toBe('<p>Existing untouched draft</p>');
  });

  it('supports core formatting commands and reuses ProseMirror undo/redo', () => {
    const element = document.createElement('div');
    const instance = createSquireNoteEditor({ element, html: '<p>Initial</p>' });
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

  it('refuses to overwrite a modified Squire draft with a stale remote refresh', () => {
    const element = document.createElement('div');
    const updates = vi.fn();
    const instance = createSquireNoteEditor({
      element, html: '<p>Original saved note</p>', onUpdate: updates,
    });
    try {
      element.querySelector('.notes-modern-editor p')
        .appendChild(document.createTextNode(' plus local draft'));
      expect(instance.syncChanges()).toBe(true);
      expect(updates).toHaveBeenCalledWith(expect.stringContaining('plus local draft'));
      const before = instance.getHTML();
      expect(() => instance.setContent('<p>Stale remote snapshot</p>'))
        .toThrow(/unsaved|pending|dirty/i);
      expect(instance.getHTML()).toBe(before);
      expect(instance.getHTML()).not.toContain('Stale remote snapshot');
    } finally { instance.destroy(); }
  });

  it('captures an unobserved native edit before rejecting a stale remote refresh', () => {
    const element = document.createElement('div');
    const updates = vi.fn();
    const instance = createSquireNoteEditor({
      element, html: '<p>قلب Heart 你好</p>', onUpdate: updates,
    });
    try {
      const root = element.querySelector('.notes-modern-editor');
      root.querySelector('p').append(document.createTextNode(' آخرین ویرایش'));
      // No Squire input event or MutationObserver delivery yet.
      expect(updates).not.toHaveBeenCalled();
      expect(() => instance.setContent('<p>Older remote revision</p>'))
        .toThrow(/unsaved|stale|overwrite/i);
      expect(updates).toHaveBeenCalledWith(expect.stringContaining('آخرین ویرایش'));
      expect(instance.getHTML()).toContain('آخرین ویرایش');
      expect(instance.getHTML()).not.toContain('Older remote revision');
    } finally { instance.destroy(); }
  });

  it('keeps the caret anchored when a clean note receives an identical saved refresh', () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const onUpdate = vi.fn();
    const instance = createSquireNoteEditor({
      element, html: '<p>قلب Heart 你好</p>', onUpdate,
    });
    try {
      const paragraph = element.querySelector('.notes-modern-editor p');
      const textNode = paragraph.firstChild;
      const caret = document.createRange();
      caret.setStart(textNode, 3);
      caret.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(caret);
      expect(selection.anchorNode).toBe(textNode);
      expect(selection.anchorOffset).toBe(3);

      const refreshResult = instance.setContent('<p>قلب Heart 你好</p>');
      expect(element.querySelector('.notes-modern-editor p')).toBe(paragraph);
      expect(selection.anchorNode).toBe(textNode);
      expect(selection.anchorOffset).toBe(3);
      expect(instance.getHTML()).toBe('<p>قلب Heart 你好</p>');
      expect(onUpdate).not.toHaveBeenCalled();
      expect(refreshResult).toBe(false);
      selection.removeAllRanges();
    } finally {
      instance.destroy();
      element.remove();
    }
  });

  it('does not reset selection/history when an unobserved edit matches an incoming refresh', () => {
    const element = document.createElement('div');
    const updates = vi.fn();
    const instance = createSquireNoteEditor({
      element, html: '<p>Before</p>', onUpdate: updates,
    });
    try {
      const root = element.querySelector('.notes-modern-editor');
      root.querySelector('p').append(document.createTextNode(' and latest'));
      const live = root.innerHTML;
      expect(instance.setContent(live)).toBe(false);
      expect(root.innerHTML).toBe(live);
      expect(instance.getHTML()).toContain('and latest');
      expect(updates).toHaveBeenCalledTimes(1);
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

  it('never inserts unsupported clipboard fallback into an active Persian/Chinese IME composition', async () => {
    const element = document.createElement('div');
    const onUpdate = vi.fn();
    const instance = createSquireNoteEditor({
      element, html: '<p>Prior note text</p>', onUpdate, onPasteFallback: vi.fn(),
    });
    try {
      const root = element.querySelector('.notes-modern-editor');
      root.dispatchEvent(new Event('compositionstart', { bubbles: true }));
      root.querySelector('p').textContent = 'ناتمام 中文';
      const paste = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(paste, 'clipboardData', { value: {
        items: null, types: ['text/html'],
        getData: type => type === 'text/html'
          ? '<table><tr><td>Unwanted clipboard fallback</td></tr></table>' : '',
      } });
      root.dispatchEvent(paste);
      expect(paste.defaultPrevented).toBe(true);
      await Promise.resolve();
      await Promise.resolve();
      expect(root.textContent).toBe('ناتمام 中文');
      expect(onUpdate).not.toHaveBeenCalled();
      root.dispatchEvent(new Event('compositionend', { bubbles: true }));
      expect(instance.getHTML()).toContain('ناتمام 中文');
      expect(instance.getHTML()).not.toContain('Unwanted clipboard fallback');
    } finally { instance.destroy(); }
  });

  it('invalidates a queued clipboard fallback if IME starts and ends before its microtask', async () => {
    const element = document.createElement('div');
    const onUpdate = vi.fn();
    const instance = createSquireNoteEditor({
      element, html: '<p>Prior note text</p>', onUpdate, onPasteFallback: vi.fn(),
    });
    try {
      const root = element.querySelector('.notes-modern-editor');
      const paste = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(paste, 'clipboardData', { value: {
        items: null, types: ['text/html'],
        getData: type => type === 'text/html'
          ? '<table><tr><td>Old queued clipboard text</td></tr></table>' : '',
      } });
      root.dispatchEvent(paste);
      expect(paste.defaultPrevented).toBe(true);
      root.dispatchEvent(new Event('compositionstart', { bubbles: true }));
      root.querySelector('p').textContent = '待确认 متن';
      root.dispatchEvent(new Event('compositionend', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      expect(root.textContent).toBe('待确认 متن');
      expect(instance.getHTML()).toContain('待确认 متن');
      expect(instance.getHTML()).not.toContain('Old queued clipboard text');
      expect(onUpdate).toHaveBeenCalledWith(expect.stringContaining('待确认 متن'));
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

  it('defers all rich-text commands until Persian/Chinese IME composition commits', () => {
    const element = document.createElement('div');
    const updates = vi.fn();
    const instance = createSquireNoteEditor({
      element, html: '<p>یادداشت 你好</p>', onUpdate: updates,
    });
    try {
      const root = element.querySelector('.notes-modern-editor');
      root.dispatchEvent(new Event('compositionstart', { bubbles: true }));
      root.querySelector('p').textContent = 'نیمه‌تمام 中文';
      const during = root.innerHTML;

      expect(instance.run('h2')).toBe(false);
      expect(instance.run('bold')).toBe(false);
      expect(instance.editor.commands.insertContent('<p>Unwanted toolbar insertion</p>')).toBe(false);
      expect(instance.editor.commands.focus('end')).toBe(false);
      expect(root.innerHTML).toBe(during);
      expect(instance.syncChanges()).toBe(false);
      expect(updates).not.toHaveBeenCalled();

      root.dispatchEvent(new Event('compositionend', { bubbles: true }));
      expect(instance.syncChanges()).toBe(true);
      expect(instance.getHTML()).toContain('نیمه‌تمام 中文');
      expect(instance.getHTML()).not.toContain('Unwanted toolbar insertion');
      expect(updates).toHaveBeenCalledWith(expect.stringContaining('نیمه‌تمام 中文'));

      expect(instance.editor.commands.insertContent('<p>Finished revision</p>')).toBe(true);
      expect(instance.getHTML()).toContain('Finished revision');
    } finally { instance.destroy(); }
  });

  it('does not allow a stale editor handle to mutate a destroyed note', () => {
    const element = document.createElement('div');
    const updates = vi.fn();
    const instance = createSquireNoteEditor({
      element, html: '<p>Original canonical note</p>', onUpdate: updates,
    });
    instance.destroy();
    expect(instance.run('h2')).toBe(false);
    expect(instance.editor.commands.insertContent('<p>Stale write</p>')).toBe(false);
    expect(instance.editor.commands.focus('end')).toBe(false);
    expect(element.textContent).toBe('');
    expect(updates).not.toHaveBeenCalled();
  });

  it('rejects stale canonical reads and save acknowledgments after note-session teardown', () => {
    const updates = vi.fn();
    const mount = document.createElement('div');
    const instance = createSquireNoteEditor({
      element: mount,
      html: '<p>Original persisted note</p>',
      onUpdate: updates,
    });
    const staleRead = instance.editor.getHTML;
    instance.destroy();

    // An async note switch or autosave must never treat an unmounted editor
    // as a successfully synchronized source of an old note revision.
    expect(instance.syncChanges()).toBe(false);
    expect(instance.supports('bold')).toBe(false);
    expect(instance.isActive('bold')).toBe(false);
    expect(() => instance.getHTML()).toThrow(/destroyed note editor/i);
    expect(() => staleRead()).toThrow(/destroyed note editor/i);
    expect(mount.textContent).toBe('');
    expect(updates).not.toHaveBeenCalled();
  });

  it('silences content-change notifications when initializing or restoring content', () => {
    const listener = vi.fn();
    const instance = createSquireNoteEditor({ element: document.createElement('div'), html: '<p>A</p>', onUpdate: listener });
    try {
      instance.setContent('<p>B</p>');
      expect(instance.getHTML()).toContain('<p>B</p>');
      expect(listener).not.toHaveBeenCalled();
    } finally { instance.destroy(); }
  });
});
