import { describe, expect, it, vi } from 'vitest';
import { countWords, plainTextFromStoredHtml } from '../src/core/textMetrics.js';

describe('shared browser-native word boundaries', () => {
  it('recognizes languages without whitespace separators', () => {
    expect(countWords('你好世界')).toBeGreaterThan(1);
    expect(countWords('学習する')).toBeGreaterThan(1);
    expect(countWords('Cardiology و فیزیولوژی')).toBe(3);
  });

  it('does not count whitespace, punctuation or emoji as whole words', () => {
    expect(countWords('  ')).toBe(0);
    expect(countWords('🤍!…')).toBe(0);
    expect(countWords('Two   words')).toBe(2);
  });

  it('extracts only visible stored-note content inside an inert template', () => {
    const observer = vi.spyOn(document, 'createElement');
    const raw = '<h2>心臓 anatomy</h2><p>قلب و عروق</p>'
      + '<script>maliciousText</script><style>.tracking{color:red}</style>'
      + '<iframe src="https://tracker.example"></iframe>'
      + '<img src="https://tracker.example/pixel.png" alt="remote">';
    const plain = plainTextFromStoredHtml(raw);
    expect(plain).toContain('心臓 anatomy');
    expect(plain).toContain('قلب و عروق');
    expect(plain).not.toContain('maliciousText');
    expect(plain).not.toContain('tracking');
    expect(plain).not.toContain('tracker.example');
    expect(countWords(raw, { html: true })).toBeGreaterThan(3);
    expect(observer.mock.calls.some(([tag]) => String(tag).toLowerCase() === 'template')).toBe(true);
    observer.mockRestore();
  });

  it('keeps HTML character entities as single decoded text words', () => {
    expect(plainTextFromStoredHtml('<p>Cardiology &amp; physiology</p>'))
      .toContain('Cardiology & physiology');
    expect(countWords('<p>Cardiology &amp; physiology</p>', { html: true })).toBe(2);
  });

  it('retains whitespace fallback on browsers without Intl.Segmenter', () => {
    const original = Intl.Segmenter;
    try {
      Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: undefined });
      expect(countWords('One two  three')).toBe(3);
    } finally {
      Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: original });
    }
  });
});
