import { describe, expect, it, vi } from 'vitest';
import { assessNoteForSquire } from '../src/features/notesSquireCompatibility.js';
import { createSquireNoteEditor } from '../src/features/notesSquireAdapter.js';

const representative = [
  {
    name: 'RTL mixed-script styled note',
    html: '<h2 dir="rtl">فیزیولوژی قلب 你好</h2>'
      + '<p dir="rtl" style="text-align:right"><span style="font-size:18px;color:#123456">انقباض Heart</span></p>'
      + '<p><strong>Output:</strong> 72 bpm</p>',
  },
  {
    name: 'nested learning outline',
    html: '<h2>Study outline</h2><ul><li>Blood pressure<ul><li>Renal autoregulation</li>'
      + '<li>فشار خون</li></ul></li><li>Heart rate</li></ul>'
      + '<p>Review later.</p>',
  },
  {
    name: 'blockquote and safe link',
    html: '<blockquote><p>Clinical interpretation</p></blockquote>'
      + '<p><a href="https://example.org/clinical?chapter=1&amp;lang=fa">Source reference</a> is saved.</p>',
  },
  {
    name: 'code and numbered steps',
    html: '<pre><code>F = m * a</code></pre><ol><li>Read</li><li>Apply</li></ol>'
      + '<p>نتیجه گیری</p>',
  },
];

describe('Squire saved-HTML compatibility and first-save fidelity fixtures', () => {
  it.each(representative)('preflights supported %s without mutating the saved source', ({ html }) => {
    const original = html;
    expect(assessNoteForSquire(html)).toEqual({ compatible: true, reason: null });
    expect(html).toBe(original);
  });

  it.each(representative)('does not rewrite untouched canonical HTML: %s', ({ html }) => {
    const mount = document.createElement('div'), onUpdate = vi.fn();
    const editor = createSquireNoteEditor({ element: mount, html, onUpdate });
    try {
      expect(editor.syncChanges()).toBe(true);
      expect(editor.getHTML()).toBe(html);
      expect(onUpdate).not.toHaveBeenCalled();
    } finally { editor.destroy(); }
  });

  it.each(representative)('retains content and meaningful structures across an actual first edit: %s', ({ html }) => {
    const host = document.createElement('div'), changes = vi.fn();
    const editor = createSquireNoteEditor({ element: host, html, onUpdate: changes });
    try {
      // A native contenteditable mutation before Squire's queued observer.
      const firstParagraph = host.querySelector('.notes-modern-editor p');
      expect(firstParagraph).not.toBeNull();
      firstParagraph.appendChild(document.createTextNode(' new review note'));
      expect(editor.syncChanges()).toBe(true);
      const saved = editor.getHTML();
      expect(changes).toHaveBeenCalledWith(saved);

      const before = document.createElement('template');
      before.innerHTML = html;
      const after = document.createElement('template');
      after.innerHTML = saved;
      const cleanText = node => (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      expect(cleanText(after.content)).toContain(cleanText(before.content));
      for (const tag of ['h2', 'ul', 'ol', 'li', 'blockquote', 'pre', 'a']) {
        expect(after.content.querySelectorAll(tag).length)
          .toBeGreaterThanOrEqual(before.content.querySelectorAll(tag).length);
      }
      for (const originalLink of before.content.querySelectorAll('a[href]')) {
        expect([...after.content.querySelectorAll('a[href]')].some(link =>
          link.getAttribute('href') === originalLink.getAttribute('href'))).toBe(true);
      }
      const reopened = createSquireNoteEditor({
        element: document.createElement('div'), html: saved,
      });
      try {
        expect(reopened.getHTML()).toContain('new review note');
        expect(cleanText(reopened.editor.getText())).toContain('new review note');
      } finally { reopened.destroy(); }
    } finally { editor.destroy(); }
  });

  it.each([
    ['legacy table', '<p>Intro</p><table><tr><td>Preserve cells</td></tr></table>'],
    ['image with alt', '<p>Intro</p><img src="blob:original" alt="Anatomy">'],
    ['AI summary metadata', '<section data-ai-summary-block="true"><p>Summary</p></section>'],
    ['untrusted event handler', '<p onmouseover="alert(1)">Unsafe</p>'],
    ['unknown data metadata', '<p data-course-event="23">Protected</p>'],
  ])('refuses unsupported %s without modifying the existing classic editor surface', (_name, html) => {
    const holder = document.createElement('div');
    holder.innerHTML = '<p>Original draft remains editable</p>';
    const before = holder.innerHTML;
    expect(assessNoteForSquire(html).compatible).toBe(false);
    expect(() => createSquireNoteEditor({ element: holder, html })).toThrow();
    expect(holder.innerHTML).toBe(before);
  });
});
