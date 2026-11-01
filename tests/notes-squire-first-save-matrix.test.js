import { describe, expect, it, vi } from 'vitest';
import { assessNoteForSquire } from '../src/features/notesSquireCompatibility.js';
import { createSquireNoteEditor } from '../src/features/notesSquireAdapter.js';

// Synthetic *first-party* fixtures model the supported boundary; they are
// not a substitute for consented user content or physical Windows IME tests.
const supported = [
  ['mixed RTL', '<p dir="rtl" style="text-align:right">فیزیولوژی قلب <strong>Heart</strong> 你好世界</p>', ['فیزیولوژی قلب', 'Heart', '你好世界']],
  ['structured list', '<ul><li>Cardiology</li><li>Review <strong>ECG</strong></li></ul>', ['Cardiology', 'Review', 'ECG']],
  ['quote', '<blockquote><p>Clinical summary</p></blockquote>', ['Clinical summary']],
  ['source link', '<p><a href="https://example.org/reading">Read source</a> and <code>CO2</code></p>', ['Read source', 'CO2']],
  ['preformatted code', '<pre>rate = 72\nunit = bpm</pre>', ['rate = 72', 'unit = bpm']],
];

describe('pre-release Squire first edit/save/reopen fixture matrix', () => {
  it.each(supported)('preserves %s content and semantics after the first real DOM edit', (_name, original, labels) => {
    expect(assessNoteForSquire(original).compatible).toBe(true);
    const element = document.createElement('div');
    const saved = [];
    const editor = createSquireNoteEditor({ element, html: original, onUpdate: html => saved.push(html) });
    let firstEdit;
    try {
      const root = element.querySelector('.notes-modern-editor');
      const target = root.querySelector('p, li, pre');
      expect(target).not.toBeNull();
      target.append(document.createTextNode(' added محفوظ'));
      expect(editor.syncChanges()).toBe(true);
      firstEdit = editor.getHTML();
      expect(saved.at(-1)).toBe(firstEdit);
      for (const token of [...labels, 'added محفوظ']) expect(firstEdit).toContain(token);
      // The editor's post-first-edit output must itself be safely reopenable.
      expect(assessNoteForSquire(firstEdit).compatible).toBe(true);
    } finally { editor.destroy(); }
    const reopened = createSquireNoteEditor({ element: document.createElement('div'), html: firstEdit });
    try {
      const html = reopened.getHTML();
      for (const token of [...labels, 'added محفوظ']) expect(html).toContain(token);
      if (original.includes('<ul>')) expect(html).toContain('<li');
      if (original.includes('<blockquote>')) expect(html).toContain('<blockquote');
      if (original.includes('href=')) expect(html).toContain('https://example.org/reading');
      if (original.includes('dir="rtl"')) expect(html).toContain('dir="rtl"');
    } finally { reopened.destroy(); }
  });

  it.each([
    ['table', '<table><tr><td>Clinical values</td></tr></table>'],
    ['image', '<p>Before</p><img src="https://example.org/scan.png" alt="Scan">'],
    ['AI metadata', '<p data-ai-summary="original">Signed summary</p>'],
    ['event attribute', '<p onclick="alert(1)">Untrusted data</p>'],
    ['nonstandard list start', '<ol start="9"><li>Reference 9</li></ol>'],
    ['styled horizontal rule', '<p>Rule</p><hr style="color: red">'],
    ['attributed break', '<p>Line<br dir="rtl">Two</p>'],
    ['styled link', '<p><a href="https://example.org" style="color: red">A</a></p>'],
  ])('rejects unsupported %s without replacing an existing classic draft', (_name, original) => {
    expect(assessNoteForSquire(original).compatible).toBe(false);
    const host = document.createElement('div');
    host.innerHTML = '<p>Existing safe draft</p>';
    const current = host.innerHTML;
    expect(() => createSquireNoteEditor({ element: host, html: original, onUpdate: vi.fn() }))
      .toThrow(/incompatible/i);
    expect(host.innerHTML).toBe(current);
  });
});
