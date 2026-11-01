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
      // The first edit inserts text within a paragraph, so the original
      // document's *whole* text is not necessarily one contiguous substring.
      // Every original nonempty text node must still survive independently.
      const walker = document.createTreeWalker(before.content, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const originalSegment = cleanText(node);
        if (originalSegment) expect(cleanText(after.content)).toContain(originalSegment);
      }
      for (const tag of ['h2', 'ul', 'ol', 'li', 'blockquote', 'pre', 'a']) {
        expect(after.content.querySelectorAll(tag).length)
          .toBeGreaterThanOrEqual(before.content.querySelectorAll(tag).length);
      }
      for (const originalLink of before.content.querySelectorAll('a[href]')) {
        expect([...after.content.querySelectorAll('a[href]')].some(link =>
          link.getAttribute('href') === originalLink.getAttribute('href'))).toBe(true);
      }
      const compatibility = assessNoteForSquire(saved);
      if (!compatibility.compatible) {
        throw new Error('Squire first-edit HTML not safe for reopening: '
          + compatibility.reason + ' — ' + saved);
      }
      // Verify an actual attached editable DOM, not just the original-html
      // cache returned by getHTML for an unmodified detached editor.
      const reopenHost = document.createElement('div');
      document.body.appendChild(reopenHost);
      const reopened = createSquireNoteEditor({ element: reopenHost, html: saved });
      try {
        expect(reopened.getHTML()).toContain('new review note');
        expect(cleanText(reopenHost)).toContain('new review note');
      } finally { reopened.destroy(); reopenHost.remove(); }
    } finally { editor.destroy(); }
  });

  it('retains approved RTL, alignment, font and color metadata on the first edit and reopen', () => {
    const html = '<h2 dir="rtl">فیزیولوژی قلب 你好</h2>'
      + '<p dir="rtl" style="text-align:right">'
      + '<span style="font-size:18px;color:#123456">انقباض Heart</span></p>'
      + '<p><strong>Review</strong> 72 bpm</p>';
    const host = document.createElement('div');
    document.body.appendChild(host);
    const editor = createSquireNoteEditor({ element: host, html });
    let saved;
    try {
      const paragraph = host.querySelectorAll('.notes-modern-editor p')[1];
      paragraph.append(document.createTextNode(' next review'));
      expect(editor.syncChanges()).toBe(true);
      saved = editor.getHTML();
      expect(assessNoteForSquire(saved).compatible).toBe(true);
    } finally { editor.destroy(); host.remove(); }

    const original = document.createElement('template');
    const result = document.createElement('template');
    original.innerHTML = html;
    result.innerHTML = saved;
    expect(result.content.querySelector('h2').getAttribute('dir'))
      .toBe(original.content.querySelector('h2').getAttribute('dir'));
    const first = original.content.querySelector('p[dir="rtl"]');
    const after = result.content.querySelector('p[dir="rtl"]');
    expect(after).not.toBeNull();
    expect(after.style.textAlign).toBe(first.style.textAlign);
    // Squire may split a styled span into nested font-size and color marks.
    // Compare effective inherited styling on the actual saved text leaf.
    const effectiveStyle = (root) => {
      const matches = [...root.querySelectorAll('span')]
        .filter(node => node.textContent.includes('انقباض Heart'));
      const leaf = matches.find(node =>
        !matches.some(other => other !== node && node.contains(other)));
      expect(leaf).toBeDefined();
      const found = { fontSize: '', color: '' };
      for (let node = leaf; node; node = node.parentElement) {
        found.fontSize ||= node.style?.fontSize || '';
        found.color ||= node.style?.color || '';
      }
      return found;
    };
    expect(effectiveStyle(result.content.querySelector('p[dir="rtl"]'))).toEqual({
      fontSize: '18px',
      color: first.querySelector('span').style.color,
    });
    expect(result.content.textContent).toContain('next review');

    const reopenedHost = document.createElement('div');
    const reopened = createSquireNoteEditor({ element: reopenedHost, html: saved });
    try {
      expect(reopened.getHTML()).toBe(saved);
      expect(reopenedHost.querySelector('h2').getAttribute('dir')).toBe('rtl');
      expect(effectiveStyle(reopenedHost)).toEqual({
        fontSize: '18px',
        color: first.querySelector('span').style.color,
      });
    } finally { reopened.destroy(); }
  });

  it('retains safe RTL, text alignment and class metadata when toolbar converts paragraph to heading', () => {
    const html = '<p dir="rtl" class="align-right" style="text-align:right">فیزیولوژی 你好 Heart</p>';
    expect(assessNoteForSquire(html).compatible).toBe(true);
    const root = document.createElement('div');
    document.body.appendChild(root);
    const editor = createSquireNoteEditor({ element: root, html });
    let saved;
    try {
      expect(editor.run('h2')).toBe(true);
      saved = editor.getHTML();
      const inert = document.createElement('template');
      inert.innerHTML = saved;
      const heading = inert.content.querySelector('h2');
      expect(heading).not.toBeNull();
      expect(heading?.getAttribute('dir')).toBe('rtl');
      expect(heading?.classList.contains('align-right')).toBe(true);
      expect(heading?.style.textAlign).toBe('right');
      expect(heading?.textContent).toContain('فیزیولوژی 你好 Heart');
      expect(assessNoteForSquire(saved)).toEqual({ compatible: true, reason: null });
    } finally { editor.destroy(); root.remove(); }
    const reopenHost = document.createElement('div');
    const reopened = createSquireNoteEditor({ element: reopenHost, html: saved });
    try {
      const h = reopenHost.querySelector('h2');
      expect(h?.getAttribute('dir')).toBe('rtl');
      expect(h?.style.textAlign).toBe('right');
      expect(h?.classList.contains('align-right')).toBe(true);
    } finally { reopened.destroy(); }
  });

  it('admits only Squire list-text wrappers, never arbitrary divs or attached attributes', () => {
    const safe = '<ul><li><div>Blood pressure</div><ul><li>Renal</li></ul></li></ul>';
    expect(assessNoteForSquire(safe)).toEqual({ compatible: true, reason: null });
    for (const unsafe of [
      '<p>Intro</p><div>Arbitrary new block</div>',
      '<ul><li><div class="handwritten">Hidden metadata</div></li></ul>',
      '<ul><li><div onclick="alert(1)">Event metadata</div></li></ul>',
      '<ul><li><div><p>Separate block</p></div></li></ul>',
      '<ul><li><div><img src="https://example.org/x">External image</div></li></ul>',
    ]) {
      expect(assessNoteForSquire(unsafe).compatible).toBe(false);
    }
  });

  it('rejects ambiguous HTTP link syntax that would be rebased and silently change saved note destinations', () => {
    const before = '<p>Stay with the original editor</p>';
    for (const href of ['https:chapter-one', 'http:lesson-two']) {
      const html = '<p><a href="' + href + '">Clinical reference</a></p>';
      expect(assessNoteForSquire(html)).toEqual({ compatible: false, reason: 'unsupported-link' });
      const holder = document.createElement('div');
      holder.innerHTML = before;
      expect(() => createSquireNoteEditor({ element: holder, html })).toThrow();
      expect(holder.innerHTML).toBe(before);
    }
    expect(assessNoteForSquire('<p><a href="https://example.org/clinical">Valid</a></p>').compatible)
      .toBe(true);
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
