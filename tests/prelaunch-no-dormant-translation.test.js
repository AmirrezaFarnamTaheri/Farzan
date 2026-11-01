import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('greenfield translation scope (#174)', () => {
  it('does not initialize any unused remote translation provider or cache database', () => {
    const index = fs.readFileSync('src/index.js', 'utf8');
    const app = fs.readFileSync('app.js', 'utf8');
    for (const retired of [
      'src/features/translator.js',
      'src/features/translationCache.js',
    ]) expect(fs.existsSync(retired), retired).toBe(false);
    expect(index).not.toMatch(/TranslationCache|TranslatorRegistry|GoogleTranslator|CustomAPITranslator/);
    expect(index).not.toContain("name: 'translator'");
    expect(index).not.toContain("name: 'translation-cache'");
    expect(app).not.toMatch(/TranslatorRegistry|TranslationCache|GoogleTranslator/);
    // Notes templates and locally cached PDF annotations are still live.
    expect(index).toContain("name: 'note-templates'");
    expect(index).toContain("name: 'command-palette'");
  });
});
