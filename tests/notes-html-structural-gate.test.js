import { describe, expect, it } from 'vitest';
import { assessSupportedNoteStructure } from '../src/features/notesHtmlStructuralGate.js';

describe('Safe HTML structural gate (Squire remains HTML-canonical)', () => {
  it('accepts the simple rich text supported by the strict safe-HTML subset, including Persian and Chinese', () => {
    expect(assessSupportedNoteStructure(
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
    const result = assessSupportedNoteStructure(html);
    expect(result.compatible).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('rejects root-level list items and code tags that are not canonical blocks', () => {
    for (const html of [
      '<li>Detached list item</li>',
      '<code>Loose code mark</code>',
      '<ul><li>Valid</li></ul><li>Stray item</li>',
    ]) {
      const result = assessSupportedNoteStructure(html);
      expect(result).toMatchObject({ compatible: false });
    }
  });

  it('does not rewrite or execute input while performing compatibility checks', () => {
    const original = '<p>منبع &amp; 你好世界</p><a href="https://example.org">Source</a>';
    const before = original;
    expect(assessSupportedNoteStructure(original).compatible).toBe(false); // root-level inline is not a canonical block
    expect(original).toBe(before);
    expect(window.__notesMigrationXss).toBeUndefined();
  });

  it('treats missing or non-string content as safely empty', () => {
    expect(assessSupportedNoteStructure(null)).toEqual({ compatible: true, reason: null });
    expect(assessSupportedNoteStructure('')).toEqual({ compatible: true, reason: null });
  });
  it.each([
    ['discarded HTML comment', '<p>Before<!-- preserve me -->After</p>'],
    ['orphan text inside list', '<ul>orphan<li>Valid</li></ul>'],
    ['unsupported list child block', '<ul><p>Orphan paragraph</p><li>Valid</li></ul>'],
    ['orphan text in ordered list', '<ol><li>Valid</li>tail</ol>'],
  ])('refuses lossy DOM structures: %s', (_label, html) => {
    expect(assessSupportedNoteStructure(html).compatible).toBe(false);
  });

});
