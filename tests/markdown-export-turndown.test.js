import { describe, expect, it, vi } from 'vitest';
import { noteHtmlToMarkdown } from '../src/features/markdownExport.js';

describe('portable note HTML -> Markdown with Turndown', () => {
  it('preserves nested headings, emphasis, lists, and HTML entities without regex flattening', () => {
    const html = '<h2>Cardiology &amp; physiology</h2>'
      + '<p>Read <strong>important <em>nested</em> findings</strong>.</p>'
      + '<ul><li>Alpha</li><li>Beta<ul><li>Nested item</li></ul></li></ul>';
    const markdown = noteHtmlToMarkdown(html);
    expect(markdown).toContain('## Cardiology & physiology');
    expect(markdown).toContain('**important *nested* findings**');
    expect(markdown).toMatch(/- Alpha/);
    expect(markdown).toContain('Nested item');
    expect(markdown).not.toContain('<ul>');
    expect(markdown).not.toContain('&amp;');
  });

  it('preserves Persian and Chinese text, valid links and code content', () => {
    const markdown = noteHtmlToMarkdown(
      '<h3>فیزیولوژی قلب 你好世界</h3>'
      + '<p><a href="https://example.org/source?q=cardio&amp;lang=fa">منبع</a> و '
      + '<a href="mailto:professor@example.org">Email</a></p>'
      + '<pre><code>const x = 2;\nconsole.log(x);</code></pre>',
    );
    expect(markdown).toContain('### فیزیولوژی قلب 你好世界');
    expect(markdown).toContain('[منبع](https://example.org/source?q=cardio&lang=fa)');
    expect(markdown).toContain('[Email](mailto:professor@example.org)');
    expect(markdown).toContain('const x = 2;');
    expect(markdown).not.toMatch(/<script|<pre|<h3/);
  });

  it('keeps study tables and task-list checkboxes in GitHub-flavored Markdown', () => {
    const html = '<table><thead><tr><th>Concept</th><th>Meaning</th></tr></thead>'
      + '<tbody><tr><td>Cardiac output</td><td>Heart flow</td></tr></tbody></table>'
      + '<ul><li><input type="checkbox" checked> Review</li>'
      + '<li><input type="checkbox"> Practice</li></ul>'
      + '<p><del>Outdated</del> Updated</p>';
    const markdown = noteHtmlToMarkdown(html);
    expect(markdown).toMatch(/\\| Concept\\s+\\| Meaning\\s+\\|/);
    expect(markdown).toContain('| Cardiac output | Heart flow |');
    expect(markdown).toMatch(/- \\[x\\] Review/);
    expect(markdown).toMatch(/- \\[ \\] Practice/);
    expect(markdown).toContain('~~Outdated~~');
  });

  it('never exports remote images, scripts, SVG requests or dangerous hyperlink schemes', () => {
    const html = '<p>Safe sentence <a href="javascript:alert(1)">Unsafe link</a></p>'
      + '<img src="https://tracker.example/pixel.png" onerror="window.__exportXss = true">'
      + '<svg><image href="https://tracker.example/foreign.png"/></svg>'
      + '<iframe src="https://tracker.example/frame"></iframe>'
      + '<script>window.__exportXss = true</script>';
    const markdown = noteHtmlToMarkdown(html);
    expect(markdown).toContain('Safe sentence');
    expect(markdown).toContain('Unsafe link');
    expect(markdown).not.toContain('javascript:');
    expect(markdown).not.toContain('tracker.example');
    expect(markdown).not.toMatch(/!\[|<iframe|<svg|<script|onerror|__exportXss/);
    expect(window.__exportXss).toBeUndefined();
  });

  it('parses untrusted input only inside an inert template', () => {
    const create = vi.spyOn(document, 'createElement');
    noteHtmlToMarkdown('<img src="https://tracker.example/hidden.png">Text');
    const contexts = create.mock.calls.map(([tag]) => String(tag).toLowerCase());
    expect(contexts).toContain('template');
    create.mockRestore();
  });

  it('keeps empty or missing note content safely empty', () => {
    expect(noteHtmlToMarkdown(null)).toBe('');
    expect(noteHtmlToMarkdown('')).toBe('');
  });
});
