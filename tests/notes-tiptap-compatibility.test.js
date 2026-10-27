import { describe, expect, it } from 'vitest';
import { assessNoteForTiptap } from '../src/features/notesEditorCompatibility.js';

describe('Tiptap migration preflight (HTML remains the source of truth)', () => {
  it('accepts the simple rich text supported by StarterKit, including Persian and Chinese', () => {
    expect(assessNoteForTiptap(
      '<h2>فیزیولوژی قلب</h2><p><strong>Cardiology</strong> <em>标题</em></p>'
      + '<ul><li>Alpha</li><li>Beta</li></ul>',
    )).toEqual({ compatible: true, reason: null });
  });

  it.each([
    ['tables', '<p>Before</p><table><tbody><tr><td>70 mL</td></tr></tbody></table>'],
    ['remote image placeholder', '<p>Before</p><img data-remote-src="https://example.org/heart.png">'],
    ['local image', '<p>Before</p><img src="/heart.png" alt="Heart">'],
    ['AI summary metadata', '<section data-ai-summary-block="true"><p>Summary</p></section>'],
    ['right-to-left attributes', '<p dir="rtl">عنوان فارسی</p>'],
    ['custom colors', '<p><span style="color:red">Red</span></p>'],
    ['custom font', '<font face="Inter" size="5">large</font>'],
    ['code language', '<pre data-language="python"><code>print(1)</code></pre>'],
    ['unsupported custom block', '<div class="handwritten">Preserve</div>'],
    ['untrusted script', '<p>Safe</p><script>alert(1)</script>'],
    ['event handler', '<p onclick="alert(1)">Unsafe</p>'],
    ['SVG external reference', '<svg><image href="https://tracker.example/x.svg"></image></svg>'],
  ])('rejects %s without attempting a lossy conversion', (_name, html) => {
    const result = assessNoteForTiptap(html);
    expect(result.compatible).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('rejects root-level list items and code tags that a ProseMirror document cannot represent', () => {
    for (const html of [
      '<li>Detached list item</li>',
      '<code>Loose code mark</code>',
      '<ul><li>Valid</li></ul><li>Stray item</li>',
    ]) {
      const result = assessNoteForTiptap(html);
      expect(result).toMatchObject({ compatible: false });
    }
  });

  it('does not rewrite or execute input while performing compatibility checks', () => {
    const original = '<p>منبع &amp; 你好世界</p><a href="https://example.org">Source</a>';
    const before = original;
    expect(assessNoteForTiptap(original).compatible).toBe(false); // root-level inline is not a StarterKit block
    expect(original).toBe(before);
    expect(window.__notesMigrationXss).toBeUndefined();
  });

  it('treats missing or non-string content as safely empty', () => {
    expect(assessNoteForTiptap(null)).toEqual({ compatible: true, reason: null });
    expect(assessNoteForTiptap('')).toEqual({ compatible: true, reason: null });
  });
});
